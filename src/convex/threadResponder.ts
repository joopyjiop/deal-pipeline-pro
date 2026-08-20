"use node";

// Website-side auto-responder for the shared conversation threads
// (docs/odysseus-briefing.md → "Shared conversation"). When Odysseus posts a
// REQUEST, an ESCALATION, or a question, the website answers it on a cron —
// actively helping mid-task instead of leaving the thread to the owner.
//
// Rules it obeys (same non-negotiables as the rest of the app):
//   * It answers ONLY from real app data (the thread itself, the referenced
//     lead/staged-source/buyer document, and the live pipeline picture).
//     It never invents PII, prices, comps, distress, or verification status.
//   * It never approves a deal, never claims verification, and never touches
//     owner-only decisions — those replies name the owner step explicitly.
//   * Replies are posted as sender "website" with metadata.auto: true so the
//     UI and Odysseus can tell an automated reply from a human one.
//   * It respects the owner's Toolkit "AI access" switch (the same gate the
//     MCP tools and the consultant court use): when AI access is disabled, the
//     responder skips entirely.
//   * When AI access is on but the AI gateway (AI_BASE_URL) is not configured
//     or reachable, it falls back to a DETERMINISTIC reply built only from real
//     app data — so Odysseus still gets a grounded answer on every cron run
//     without any model call. When the gateway is configured, the LLM is used.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { chatCompletion, isAiGatewayConfigured } from "./ollama";
import { isUnansweredThreadMessage, messageContent, normalizeThreadId } from "./sharedConversation";
import type { MessageDoc } from "./sharedConversation";

const OWNER_EMAIL = "jacobvierra8@gmail.com";
const MODEL = process.env.OLLAMA_MODEL?.trim() || "gpt-oss:20b";

type ThreadResponse = {
  threadId: string;
  status: string;
  reason?: string;
  messageId?: string;
};
type ThreadResponseList = Array<ThreadResponse>;

const REPLY_SYSTEM_PROMPT = `You are the website side of "DealForge", a wholesale real-estate pipeline, collaborating with Odysseus — the owner's external AI agent — in a shared conversation thread. Your job is to actively answer Odysseus's questions and requests using ONLY the app context included below.

Hard rules:
- Never invent or guess PII (names, addresses, phones, emails), ownership, distress signals, prices, comps, verification status, or evidence. Missing data is missing — say it is missing.
- Only cite facts that appear in the provided context (thread history or live app context). If the context does not contain the answer, say you cannot see that data and say exactly what would be needed (owner review, a provider key such as RentCast, a county record pull, a staging review, an owner action in the Toolkit).
- You never approve a deal, never claim verification, and never fabricate. Approvals, dialing, offers, and PII handling are owner decisions: if the request needs one, say the owner must decide and what the owner needs to review.
- If you can act on the request with app data (summarize a status, compare leads, explain a gate, compute from the given numbers), do it directly.
- If the request needs Odysseus to do something you cannot, end with a single "ASK BACK TO ODYSSEUS:" line naming exactly what it should do.

Format: concise short bullets, plain text (no markdown headers), under ~350 words.`;

async function requireOwner(ctx: ActionCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email?.trim().toLowerCase() === OWNER_EMAIL) return;

  const [userId] = (identity?.subject ?? "").split("|");
  if (userId) {
    const user = await ctx.runQuery(internal.users.getUserBySubject, { subject: userId });
    if (user?.role === "admin" || user?.email?.trim().toLowerCase() === OWNER_EMAIL) return;
  }

  throw new Error("Owner access required");
}

// ---- Context: turn a threadId into bounded, real app data ------------------

type AdminGetResult = { data?: Record<string, unknown> } | undefined;

function summarizeLead(data: Record<string, unknown>): string {
  const money = (value: unknown) =>
    typeof value === "number" ? `$${Math.round(value).toLocaleString()}` : "not modeled";
  const lines = [
    `LEAD ${String(data._id ?? "")}`,
    `Property: ${data.propertyAddress ?? "?"}, ${data.city ?? ""} ${data.state ?? ""} ${data.zip ?? ""} (${data.county ?? ""} County)`,
    `Source: ${data.sourceType ?? "?"} | ref ${data.sourceRef ?? "?"} | ${data.sourceDate ?? "?"} | ${data.sourceUrl ?? "?"}`,
    `Pipeline: ${data.pipelineStatus ?? "?"} | Verification: ${data.verificationStatus ?? "?"} | Distress: ${data.distressScore ?? "?"}/100 | Fabricated: ${data.fabricated === true ? "YES (tombstoned)" : "no"}`,
  ];
  if (Array.isArray(data.distressSignals)) {
    const signals = (data.distressSignals as Array<Record<string, unknown>>)
      .slice(0, 6)
      .map((signal) => `${signal.type} +${signal.weight}${signal.verified ? " (verified)" : ""}: ${String(signal.evidence ?? "").slice(0, 200)}`);
    if (signals.length > 0) lines.push(`Signals: ${signals.join(" | ")}`);
  }
  lines.push(`Underwriting: ARV ${money(data.arv)} | repairs ${money(data.repairs)} | MAO ${money(data.mao)} | est. spread ${money(data.estimatedProfit)}`);

  const record = data.dueDiligence && typeof data.dueDiligence === "object"
    ? data.dueDiligence as Record<string, unknown>
    : undefined;
  if (record) {
    const entries: string[] = [];
    for (const [key, label] of [
      ["titleAndLiens", "title/liens"],
      ["saleHistory", "sale history+comps"],
      ["condition", "condition"],
      ["occupancy", "occupancy"],
    ] as const) {
      const entry = record[key] && typeof record[key] === "object"
        ? record[key] as Record<string, unknown>
        : undefined;
      entries.push(`${label}: ${String(entry?.status ?? "UNCHECKED")}`);
    }
    lines.push(`Due diligence: ${entries.join(" | ")}`);
  }

  const team = data.agentTeam && typeof data.agentTeam === "object"
    ? data.agentTeam as Record<string, unknown>
    : undefined;
  const readiness = team?.readiness && typeof team.readiness === "object"
    ? team.readiness as Record<string, unknown>
    : undefined;
  if (readiness) {
    lines.push(`Readiness: ${readiness.ready === true ? "READY" : "NOT READY"}${readiness.ranAt ? ` (team ran ${new Date(readiness.ranAt as number).toISOString()})` : ""}`);
    if (Array.isArray(readiness.gaps) && (readiness.gaps as unknown[]).length > 0) {
      lines.push(`Gaps: ${(readiness.gaps as Array<{ category?: unknown; blocksReady?: unknown; detail?: unknown }>).slice(0, 6).map((gap) => `${gap.category ?? "?"}${gap.blocksReady ? " (blocks)" : ""}: ${String(gap.detail ?? "").slice(0, 120)}`).join(" | ")}`);
    }
  }
  if (data.notes) lines.push(`Owner notes: ${String(data.notes).slice(0, 400)}`);
  return lines.join("\n");
}

function summarizeStaged(data: Record<string, unknown>): string {
  const raw = data.rawJson && typeof data.rawJson === "object"
    ? data.rawJson as Record<string, unknown>
    : undefined;
  const lines = [
    `STAGED SOURCE ${String(data._id ?? "")}`,
    `Type: ${data.sourceType ?? "?"} | Status: ${data.status ?? "?"} | url: ${raw?.url ?? "?"}`,
  ];
  if (typeof raw?.title === "string") lines.push(`Title: ${raw.title.slice(0, 200)}`);
  if (typeof raw?.excerpt === "string") lines.push(`Excerpt: ${raw.excerpt.slice(0, 400)}`);
  const verdict = data.aiCourtVerdict && typeof data.aiCourtVerdict === "object"
    ? data.aiCourtVerdict as Record<string, unknown>
    : undefined;
  if (verdict) {
    lines.push(`AI court verdict: status ${String(verdict.status ?? "?")} | recommendation ${String(verdict.recommendation ?? verdict.verdict ?? "?")}`);
  }
  if (data.candidateLeadId) lines.push(`Candidate lead: ${String(data.candidateLeadId)}`);
  if (data.rejectReason) lines.push(`Reject reason: ${String(data.rejectReason).slice(0, 300)}`);
  return lines.join("\n");
}

function summarizeBuyer(data: Record<string, unknown>): string {
  // Deliberately PII-free: no name, phone, or email — the thread may be read by
  // both sides and buyer contact details are not needed to answer pipeline
  // questions.
  return [
    `BUYER ${String(data._id ?? "")}`,
    `Buy box: $${typeof data.budgetMin === "number" ? Math.round(data.budgetMin).toLocaleString() : "?"}–$${typeof data.budgetMax === "number" ? Math.round(data.budgetMax).toLocaleString() : "?"}`,
    `Target areas: ${Array.isArray(data.targetAreas) ? (data.targetAreas as unknown[]).join(", ") : "?"}`,
    `Exit: ${data.exitType ?? "?"} | PoF: ${data.proofOfFundsStatus ?? "?"} | Intake: ${data.intakeStatus ?? "?"} | Verification: ${data.verificationStatus ?? "?"}`,
  ].join("\n");
}

async function loadDocContext(ctx: ActionCtx, threadId: string): Promise<string | null> {
  const separator = threadId.indexOf(":");
  const prefix = separator > 0 ? threadId.slice(0, separator).trim().toLowerCase() : "";
  const ref = separator > 0 ? threadId.slice(separator + 1).trim() : "";
  if (!ref) return null;
  const resource = prefix === "deal" ? "leads" : prefix === "task" ? "import-staging" : prefix === "buyer" ? "buyers" : null;
  if (!resource) return null;
  try {
    const result = (await ctx.runAction(internal.admin.adminCrud, {
      resource,
      operation: "GET",
      id: ref,
      payload: {},
      filters: {},
    })) as AdminGetResult;
    if (!result?.data) return `${resource} ${ref}: not found in the app.`;
    if (resource === "leads") return summarizeLead(result.data);
    if (resource === "import-staging") return summarizeStaged(result.data);
    return summarizeBuyer(result.data);
  } catch (error) {
    return `${resource} ${ref}: could not be loaded (${error instanceof Error ? error.message : "invalid id"})`;
  }
}

async function buildOpsContext(ctx: ActionCtx): Promise<string[]> {
  const parts: string[] = [];
  try {
    const brief = (await ctx.runAction(internal.mongodb.mcpListPipelineBrief, {
      limit: 30,
    })) as {
      total?: number;
      readyCount?: number;
      incompleteCount?: number;
      notRunCount?: number;
      leads?: Array<{
        _id: string;
        propertyAddress?: string;
        city?: string;
        state?: string;
        pipelineStatus?: string;
        verificationStatus?: string;
        ready?: boolean;
        gapCount?: number;
      }>;
    };
    if (typeof brief.total === "number") {
      const ready = brief.leads?.filter((lead) => lead.ready === true).slice(0, 5) ?? [];
      const blocked = brief.leads?.filter((lead) => lead.ready !== true && lead.gapCount !== undefined && lead.gapCount > 0).slice(0, 8) ?? [];
      const lines = [
        `PIPELINE BRIEF: ${brief.total} non-fabricated leads, ${brief.readyCount ?? "?"} ready, ${brief.incompleteCount ?? "?"} incomplete, ${brief.notRunCount ?? "?"} not yet run.`,
      ];
      if (ready.length > 0) {
        lines.push(`Ready now: ${ready.map((lead) => `${lead.propertyAddress}, ${lead.city} ${lead.state ?? ""} (${lead.pipelineStatus ?? "?"}/${lead.verificationStatus ?? "?"})`).join(" | ")}`);
      }
      if (blocked.length > 0) {
        lines.push(`Blocked sample: ${blocked.map((lead) => `${lead.propertyAddress}, ${lead.city} ${lead.state ?? ""} (${lead.gapCount} gap${lead.gapCount === 1 ? "" : "s"})`).join(" | ")}`);
      }
      parts.push(lines.join("\n"));
    }
  } catch {
    parts.push("PIPELINE BRIEF: unavailable (AI access disabled or MongoDB unreachable).");
  }
  try {
    const staged = (await ctx.runAction(internal.mongodb.mcpListStagedSources, {
      status: "NEW",
      limit: 5,
    })) as Array<{ sourceType?: string; sourceUrl?: string }>;
    if (Array.isArray(staged)) {
      parts.push(`STAGING QUEUE: ${staged.length} NEW source${staged.length === 1 ? "" : "s"} awaiting review${staged.length > 0 ? ` — ${staged.map((item) => `${item.sourceType ?? "?"} ${item.sourceUrl ?? ""}`).join(" | ")}` : ""}`);
    }
  } catch {
    // Staging queue is a nice-to-have; skip if unavailable.
  }
  try {
    const board = (await ctx.runAction(internal.mongodb.mcpListMatchBoard, {
      status: "CANDIDATE",
      limit: 5,
    })) as unknown[];
    if (Array.isArray(board)) {
      parts.push(`MATCH BOARD: ${board.length} CANDIDATE match${board.length === 1 ? "" : "es"} awaiting owner review.`);
    }
  } catch {
    // Match board is a nice-to-have; skip if unavailable.
  }
  return parts;
}

function formatThread(messages: MessageDoc[], maxMessages = 12): string {
  const recent = messages.slice(-maxMessages);
  return recent
    .map((message) => {
      const time = new Date(message.sentAt).toISOString();
      const preview = message.content.slice(0, 2200);
      return `[${time}] ${message.sender} (${message.kind}): ${preview}`;
    })
    .join("\n");
}

// Deterministic fallback: builds a grounded, factual reply without any model
// call. It only ever restates real app context (the referenced document or the
// pipeline snapshot) and never invents, approves, or answers beyond the data.
async function generateDeterministicReply(
  ctx: ActionCtx,
  threadId: string,
  last: MessageDoc,
): Promise<{ content: string; model: string }> {
  const contextParts: string[] = [];
  const docContext = await loadDocContext(ctx, threadId);
  if (docContext) contextParts.push(docContext);
  if (!threadId.startsWith("deal:") && !threadId.startsWith("task:") && !threadId.startsWith("buyer:")) {
    contextParts.push(...(await buildOpsContext(ctx)));
  }
  const content = [
    "Auto-reply from the website (deterministic — grounded in live app data only, no AI model involved):",
    "",
    `In reply to your ${last.kind}: ${last.content.slice(0, 400)}`,
    "",
    "Live app context:",
    contextParts.length > 0 ? contextParts.join("\n\n") : "No live app context is available for this thread.",
    "",
    "Approvals, dialing, exports, and PII decisions remain owner-only — none have been performed here.",
  ].join("\n");
  return { content, model: "deterministic" };
}

async function generateReply(ctx: ActionCtx, threadId: string, messages: MessageDoc[], last: MessageDoc): Promise<{ content: string; model: string }> {
  const contextParts: string[] = [];
  const docContext = await loadDocContext(ctx, threadId);
  if (docContext) contextParts.push(docContext);
  if (!threadId.startsWith("deal:") && !threadId.startsWith("task:") && !threadId.startsWith("buyer:")) {
    contextParts.push(...(await buildOpsContext(ctx)));
  }
  const userPrompt = [
    `SHARED THREAD (${threadId}), oldest first:`,
    formatThread(messages),
    "",
    "LIVE APP CONTEXT:",
    contextParts.length > 0 ? contextParts.join("\n\n") : "None available — answer only from the thread itself.",
    "",
    `ODYSSEUS'S LAST MESSAGE TO ANSWER (${last.kind}):`,
    last.content,
  ].join("\n");

  const { content } = await chatCompletion(ctx, {
    model: MODEL,
    messages: [
      { role: "system", content: REPLY_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    maxTokens: 700,
    temperature: 0.2,
  });
  return { content, model: MODEL };
}

// Answer one thread. `claim` enables the idempotency guard used by the cron
// (two overlapping runs must not double-reply); owner-initiated manual calls
// pass claim = undefined to answer even if a previous run left a stale claim.
async function respondToThreadImpl(
  ctx: ActionCtx,
  threadId: string,
  options: { claim?: boolean } = {},
): Promise<ThreadResponse> {
  const normalized = normalizeThreadId(threadId);
  if (!normalized) return { threadId: normalized, status: "SKIPPED", reason: "empty thread id" };

  // Same AI-access gate the MCP tools and the consultant court use. This is the
  // owner's master switch for auto-replies; when it is off we skip entirely.
  try {
    await ctx.runAction(internal.mongodb.mcpAssertAiAccess, {});
  } catch (error) {
    return {
      threadId: normalized,
      status: "SKIPPED",
      reason: error instanceof Error ? error.message : "AI access is disabled in the owner Toolkit",
    };
  }
  // When the AI gateway is unreachable/unconfigured, answer deterministically
  // from real app data instead of going silent.
  const useDeterministic = !isAiGatewayConfigured();

  const messages = await ctx.runQuery(internal.sharedConversation.threadMessages, {
    threadId: normalized,
    limit: 100,
  });
  if (messages.length === 0) return { threadId: normalized, status: "SKIPPED", reason: "thread is empty" };

  const ordered = [...messages].sort((a, b) => a.sentAt - b.sentAt);
  const last = ordered[ordered.length - 1] as unknown as MessageDoc;
  if (!isUnansweredThreadMessage(last)) {
    return { threadId: normalized, status: "SKIPPED", reason: "nothing to answer (last message is not an open Odysseus request/question)" };
  }

  const claimId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  if (options.claim) {
    const claimed = await ctx.runMutation(internal.sharedConversation.claimAutoReply, {
      messageId: last._id,
      claimId,
    });
    if (!claimed.claimed) {
      return { threadId: normalized, status: "SKIPPED", reason: claimed.reason ?? "already claimed or answered" };
    }
  }

  try {
    const { content, model } = useDeterministic
      ? await generateDeterministicReply(ctx, normalized, last)
      : await generateReply(ctx, normalized, ordered, last);
    const replyId = await ctx.runMutation(internal.sharedConversation.insertMessage, {
      threadId: normalized,
      sender: "website",
      kind: "MESSAGE",
      content: messageContent(content),
      metadata: { auto: true, autoModel: model, respondedTo: last._id },
      sentAt: Date.now(),
    });
    if (options.claim) {
      await ctx.runMutation(internal.sharedConversation.markAutoReplied, {
        messageId: last._id,
        claimId,
        replyMessageId: replyId,
        model,
      });
    }
    return { threadId: normalized, status: "REPLIED", messageId: replyId };
  } catch (error) {
    if (options.claim) {
      await ctx.runMutation(internal.sharedConversation.releaseAutoReply, { messageId: last._id, claimId });
    }
    throw error;
  }
}

// Cron entry: answer every currently-open thread, newest first. Skips when the
// owner's "AI access" switch is off or the AI gateway is not configured.
export const respondToOpenThreads = internalAction({
  args: { maxThreads: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ status: string; reason?: string; model?: string; responded: ThreadResponseList }> => {
    try {
      await ctx.runAction(internal.mongodb.mcpAssertAiAccess, {});
    } catch (error) {
      return { status: "SKIPPED", reason: error instanceof Error ? error.message : "AI access is disabled", responded: [] };
    }

    const candidates = await ctx.runQuery(internal.sharedConversation.unansweredThreads, {
      limit: Math.max(1, Math.min(3, Math.floor(args.maxThreads ?? 3))),
    });
    const results = [];
    for (const candidate of candidates) {
      try {
        results.push(await respondToThreadImpl(ctx, candidate.threadId, { claim: true }));
      } catch (error) {
        results.push({
          threadId: candidate.threadId,
          status: "ERROR",
          reason: error instanceof Error ? error.message : "generation failed",
        });
      }
    }
    return { status: "COMPLETED", model: MODEL, responded: results };
  },
});

// Owner-triggered manual run (Toolkit / Shared-conversation page). Same work as
// the cron but the owner's click replaces the Automation toggle.
export const runThreadResponderNow = action({
  args: { maxThreads: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ model: string; responded: ThreadResponseList }> => {
    await requireOwner(ctx);
    const candidates = await ctx.runQuery(internal.sharedConversation.unansweredThreads, {
      limit: Math.max(1, Math.min(5, Math.floor(args.maxThreads ?? 5))),
    });
    const results = [];
    for (const candidate of candidates) {
      try {
        results.push(await respondToThreadImpl(ctx, candidate.threadId, { claim: true }));
      } catch (error) {
        results.push({
          threadId: candidate.threadId,
          status: "ERROR",
          reason: error instanceof Error ? error.message : "generation failed",
        });
      }
    }
    return { model: MODEL, responded: results };
  },
});

// Owner-triggered single-thread reply: answer the latest open Odysseus message
// in one specific thread (the "Ask the website to answer" button in the UI).
export const respondToThread = action({
  args: { threadId: v.string() },
  handler: async (ctx, args): Promise<ThreadResponse> => {
    await requireOwner(ctx);
    const result = await respondToThreadImpl(ctx, args.threadId, {});
    if (result.status !== "REPLIED") throw new Error(result.reason ?? "Nothing to answer");
    return result;
  },
});
