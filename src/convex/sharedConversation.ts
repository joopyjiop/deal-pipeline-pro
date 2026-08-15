// Shared conversation threads between the website and the external Odysseus
// AI harness (and its worker agents). See docs/odysseus-briefing.md →
// "Shared conversation" for the operator contract.
//
// COLLABORATION PROTOCOL (both sides)
// -----------------------------------
// This table exists so the website and Odysseus can collaborate *mid-task*
// instead of handing off one-way requests. Either side MUST post into the
// relevant thread whenever it hits something outside its own strengths and
// needs the other side, rather than trying to handle everything alone:
//
//   * Data it cannot reach from its side — e.g. the website needs a county
//     assessor/recorder check, a comp pull, or skip-trace the agent already
//     has; the agent needs a RentCast pull, staging evidence, or a stored
//     lead/buyer document it cannot read.
//   * A blocked readiness gate — any category of the due-diligence panel
//     (title/liens, sale history + comps, condition, occupancy) that one side
//     cannot verify is posted as an ESCALATION with the exact gap named.
//   * Unknown or untrusted sources — never push a deal forward from a source
//     neither side can verify; post REQUEST for a second pair of eyes.
//   * Rate limits / provider failures (RentCast, gateway, scraper quota) —
//     post so the other side knows why a stage stalled instead of silently
//     retrying.
//   * Owner-judgment steps — approvals, dialing, offers, PII handling. Post a
//     REQUEST for owner review; threads never approve anything themselves.
//   * Ambiguous instructions — ask instead of guessing. Guessing is how
//     fabricated data starts.
//
// Kinds: MESSAGE (general note), REQUEST (please do X), ESCALATION (I hit a
// wall, need help/owner), RESOLUTION (the issue is closed; summarize what
// happened). Never paste secrets (API keys, webhook secrets) or unnecessary
// PII into threads — both sides read the whole thread. Never fabricate: a
// thread message claiming something is verified is not verification.
//
// Thread naming: "deal:<leadId>", "task:<stagedId>", "buyer:<buyerId>",
// "ops:<topic>". Both sides must use the same threadId to see each other.

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, QueryCtx, MutationCtx } from "./_generated/server";

const OWNER_EMAIL = "jacobvierra8@gmail.com";

const senderValidator = v.union(v.literal("website"), v.literal("odysseus"));
const kindValidator = v.union(
  v.literal("MESSAGE"),
  v.literal("REQUEST"),
  v.literal("ESCALATION"),
  v.literal("RESOLUTION"),
);

const THREAD_ID_MAX = 120;
const CONTENT_MAX = 8000;
const REFS_MAX = 10;
const REF_MAX = 200;
const THREADS_LIST_MAX = 100;

// Pure helpers (unit-testable, no Convex imports at call time).

export function normalizeThreadId(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, THREAD_ID_MAX);
}

export function sanitizeRefs(value: string[] | undefined): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const ref of value) {
    const trimmed = typeof ref === "string" ? ref.trim() : "";
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed.slice(0, REF_MAX));
    if (cleaned.length >= REFS_MAX) break;
  }
  return cleaned.length > 0 ? cleaned : undefined;
}

export function messageContent(value: string): string {
  return value.trim().replace(/\r\n/g, "\n").slice(0, CONTENT_MAX);
}

// Owner check shared by the website-facing query/mutation functions. Same
// convention as the rest of the app: role "admin" OR the permanent owner
// email, resolved through the users table so backend and frontend agree.
async function requireOwner(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) throw new Error("Authentication required");
  const user = await ctx.db.get(userId);
  const isOwner = Boolean(
    user && (user.role === "admin" || user.email?.trim().toLowerCase() === OWNER_EMAIL),
  );
  if (!isOwner) throw new Error("Owner access required");
  return user;
}

export type MessageDoc = {
  _id: string;
  _creationTime: number;
  threadId: string;
  sender: "website" | "odysseus";
  kind: "MESSAGE" | "REQUEST" | "ESCALATION" | "RESOLUTION";
  content: string;
  refs?: string[];
  metadata?: Record<string, unknown>;
  sentAt: number;
};

// A thread is "open" for the website auto-responder when its latest message is
// an Odysseus REQUEST/ESCALATION, a question, or a message explicitly marked
// expectReply, and no auto-reply has been generated for it yet.
export function isUnansweredThreadMessage(last: MessageDoc): boolean {
  if (last.sender !== "odysseus") return false;
  if (last.kind === "RESOLUTION") return false;
  const metadata = last.metadata ?? {};
  if (typeof metadata.autoRepliedAt === "number") return false;
  const asks =
    last.kind === "REQUEST" ||
    last.kind === "ESCALATION" ||
    /\?\s*$/.test(last.content.trim()) ||
    metadata.expectReply === true;
  return asks;
}

export function serializeMessage(doc: MessageDoc) {
  return {
    _id: doc._id,
    _creationTime: doc._creationTime,
    threadId: doc.threadId,
    sender: doc.sender,
    kind: doc.kind,
    content: doc.content,
    refs: doc.refs ?? [],
    metadata: doc.metadata ?? undefined,
    sentAt: doc.sentAt,
  };
}

// ---- Website side: owner-gated insert + read -------------------------------

// Post a message as the website. The sender is forced to "website"
// server-side — a client can never impersonate Odysseus. Odysseus posts via
// the MCP tools instead (shared_thread_post), which force "odysseus".
export const postSharedMessage = mutation({
  args: {
    threadId: v.string(),
    content: v.string(),
    kind: v.optional(kindValidator),
    refs: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const threadId = normalizeThreadId(args.threadId);
    if (!threadId) throw new Error("A thread id is required");
    const content = messageContent(args.content);
    if (!content) throw new Error("Message content cannot be empty");
    const refs = sanitizeRefs(args.refs);
    const sentAt = Date.now();
    const id = await ctx.db.insert("sharedConversations", {
      threadId,
      sender: "website",
      kind: args.kind ?? "MESSAGE",
      content,
      refs,
      sentAt,
      ...(args.metadata !== undefined && args.metadata !== null ? { metadata: args.metadata } : {}),
    });
    const doc = await ctx.db.get(id);
    return serializeMessage(doc as unknown as MessageDoc);
  },
});

// Read the full thread, oldest first, so both sides share one timeline.
export const getSharedThread = query({
  args: { threadId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const threadId = normalizeThreadId(args.threadId);
    if (!threadId) throw new Error("A thread id is required");
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 500)));
    const docs = await ctx.db
      .query("sharedConversations")
      .withIndex("by_thread_time", (q) => q.eq("threadId", threadId))
      .order("asc")
      .take(limit);
    return {
      threadId,
      count: docs.length,
      messages: docs.map((doc) => serializeMessage(doc as unknown as MessageDoc)),
    };
  },
});

// List all threads with the latest message and message count, newest first.
export const listSharedThreads = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const limit = Math.max(1, Math.min(THREADS_LIST_MAX, Math.floor(args.limit ?? THREADS_LIST_MAX)));
    const docs = await ctx.db.query("sharedConversations").order("desc").take(500);
    const byThread = new Map<string, MessageDoc[]>();
    for (const doc of docs) {
      const threadId = (doc as unknown as MessageDoc).threadId;
      const list = byThread.get(threadId) ?? [];
      list.push(doc as unknown as MessageDoc);
      byThread.set(threadId, list);
    }
    const threads = [...byThread.entries()]
      .map(([threadId, messages]) => {
        messages.sort((a, b) => a.sentAt - b.sentAt);
        const last = messages[messages.length - 1];
        return {
          threadId,
          messageCount: messages.length,
          lastSender: last.sender,
          lastKind: last.kind,
          lastContent: last.content.slice(0, 160),
          lastSentAt: last.sentAt,
          needsAttention: isUnansweredThreadMessage(last),
        };
      })
      .sort((a, b) => b.lastSentAt - a.lastSentAt)
      .slice(0, limit);
    return { count: threads.length, threads };
  },
});

// ---- Storage helpers used by the MCP layer (src/convex/http.ts) ------------
// The HTTP layer authenticates with MCP_TOOL_SERVER_SECRET and runs
// mcpAssertAiAccess on every tool call, then calls these directly — Odysseus
// posts with sender "odysseus", which a website client can never spoof.

export const insertMessage = internalMutation({
  args: {
    threadId: v.string(),
    sender: senderValidator,
    kind: kindValidator,
    content: v.string(),
    refs: v.optional(v.array(v.string())),
    metadata: v.optional(v.any()),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("sharedConversations", {
      threadId: args.threadId,
      sender: args.sender,
      kind: args.kind,
      content: args.content,
      ...(args.refs && args.refs.length > 0 ? { refs: args.refs } : {}),
      ...(args.metadata !== undefined && args.metadata !== null ? { metadata: args.metadata } : {}),
      sentAt: args.sentAt,
    });
    return String(id);
  },
});

// ---- Auto-responder claims ------------------------------------------------
// The website-side auto-responder (src/convex/threadResponder.ts) answers
// open Odysseus questions/requests on a cron. Before generating a reply it
// claims the Odysseus message atomically so two overlapping responder runs
// cannot both reply to the same message; the claim is released if generation
// fails. `metadata.autoRepliedAt` on an Odysseus message also lets the UI and
// the scan see that a reply was already generated for it.

export const claimAutoReply = internalMutation({
  args: { messageId: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.messageId as Id<"sharedConversations">);
    if (!doc) throw new Error("Message not found");
    const message = doc as unknown as MessageDoc;
    if (message.sender !== "odysseus") throw new Error("Only Odysseus messages can be claimed for an auto-reply");
    const metadata = message.metadata ?? {};
    if (typeof metadata.autoRepliedAt === "number") return { claimed: false, messageId: args.messageId, reason: "already_answered" };
    if (typeof metadata.autoReplyClaimId === "string") return { claimed: false, messageId: args.messageId, reason: "already_claimed" };
    await ctx.db.patch(args.messageId as Id<"sharedConversations">, { metadata: { ...metadata, autoReplyClaimId: args.claimId, autoReplyClaimedAt: Date.now() } });
    return { claimed: true, messageId: args.messageId };
  },
});

export const releaseAutoReply = internalMutation({
  args: { messageId: v.string(), claimId: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.messageId as Id<"sharedConversations">);
    if (!doc) return { released: false };
    const message = doc as unknown as MessageDoc;
    const metadata = message.metadata ?? {};
    if (metadata.autoReplyClaimId !== args.claimId) return { released: false };
    const next: Record<string, unknown> = { ...metadata };
    delete next.autoReplyClaimId;
    delete next.autoReplyClaimedAt;
    await ctx.db.patch(args.messageId as Id<"sharedConversations">, { metadata: next });
    return { released: true };
  },
});

export const markAutoReplied = internalMutation({
  args: { messageId: v.string(), claimId: v.string(), replyMessageId: v.string(), model: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.messageId as Id<"sharedConversations">);
    if (!doc) return { marked: false };
    const message = doc as unknown as MessageDoc;
    const metadata = message.metadata ?? {};
    if (metadata.autoReplyClaimId !== args.claimId) return { marked: false };
    const next: Record<string, unknown> = { ...metadata, autoRepliedAt: Date.now(), autoReplyMessageId: args.replyMessageId, autoReplyModel: args.model };
    delete next.autoReplyClaimId;
    delete next.autoReplyClaimedAt;
    await ctx.db.patch(args.messageId as Id<"sharedConversations">, { metadata: next });
    return { marked: true };
  },
});

// Scan for threads whose latest message is an unanswered Odysseus
// request/escalation/question — the auto-responder's work queue
// (src/convex/threadResponder.ts). Bounded: only the most recently active
// candidates are returned so one run never replies to a backlog flood.
export const unansweredThreads = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(10, Math.floor(args.limit ?? 5)));
    const now = Date.now();
    const docs = await ctx.db.query("sharedConversations").order("desc").take(500);
    const byThread = new Map<string, MessageDoc[]>();
    for (const doc of docs) {
      const message = doc as unknown as MessageDoc;
      const list = byThread.get(message.threadId) ?? [];
      list.push(message);
      byThread.set(message.threadId, list);
    }
    const candidates: Array<{ threadId: string; messageCount: number; last: MessageDoc }> = [];
    for (const [threadId, messages] of byThread) {
      messages.sort((a, b) => a.sentAt - b.sentAt);
      const last = messages[messages.length - 1];
      if (!isUnansweredThreadMessage(last)) continue;
      // Let bursts settle: do not answer a message posted in the last 20s.
      if (now - last.sentAt < 20_000) continue;
      candidates.push({ threadId, messageCount: messages.length, last });
    }
    candidates.sort((a, b) => b.last.sentAt - a.last.sentAt);
    return candidates.slice(0, limit).map(({ threadId, messageCount, last }) => ({
      threadId,
      messageCount,
      lastMessageId: last._id,
      lastKind: last.kind,
      lastContent: last.content.slice(0, 200),
      lastSentAt: last.sentAt,
    }));
  },
});

export const threadMessages = internalQuery({
  args: { threadId: v.string(), limit: v.number() },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("sharedConversations")
      .withIndex("by_thread_time", (q) => q.eq("threadId", args.threadId))
      .order("asc")
      .take(args.limit);
    return docs.map((doc) => serializeMessage(doc as unknown as MessageDoc));
  },
});

export const threadSummaries = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const docs = await ctx.db.query("sharedConversations").order("desc").take(500);
    const byThread = new Map<string, MessageDoc[]>();
    for (const doc of docs) {
      const threadId = (doc as unknown as MessageDoc).threadId;
      const list = byThread.get(threadId) ?? [];
      list.push(doc as unknown as MessageDoc);
      byThread.set(threadId, list);
    }
    const threads = [...byThread.entries()]
      .map(([threadId, messages]) => {
        messages.sort((a, b) => a.sentAt - b.sentAt);
        const last = messages[messages.length - 1];
        return {
          threadId,
          messageCount: messages.length,
          lastSender: last.sender,
          lastKind: last.kind,
          lastContent: last.content.slice(0, 160),
          lastSentAt: last.sentAt,
          needsAttention: isUnansweredThreadMessage(last),
        };
      })
      .sort((a, b) => b.lastSentAt - a.lastSentAt)
      .slice(0, args.limit);
    return { count: threads.length, threads };
  },
});
