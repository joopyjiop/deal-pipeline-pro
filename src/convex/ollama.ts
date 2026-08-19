"use node";

import { request as httpsRequest } from "node:https";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { isFiniteVector } from "./embeddings";
import {
  clampOutputTokens,
  dayKey,
  estimateChatTokens,
  estimateEmbeddingTokens,
  getAiLimits,
  HARD_MAX_OUTPUT_TOKENS,
  MAX_INPUT_CHARS,
} from "./aiUsageCore";

const OWNER_EMAIL = "jacobvierra8@gmail.com";

// AI gateway base URL. Defaults to the local OmniRoute instance
// (https://localhost:20128/v1) — an OpenAI-compatible endpoint that routes to
// the providers configured in OmniRoute. Override with AI_BASE_URL in the
// Convex Keys panel if the gateway lives elsewhere. No API key is sent unless
// AI_API_KEY is configured (some local gateways expect one).
const DEFAULT_AI_BASE_URL = "https://localhost:20128/v1";
const AI_BASE_URL = process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL;
const AI_API_KEY = process.env.AI_API_KEY?.trim();

// True when the owner has configured the AI gateway: either a key is set, or
// the base URL was overridden away from the localhost default. The consultant
// court and automation flows use this to skip cleanly instead of failing when
// no gateway is configured.
export function isAiGatewayConfigured(): boolean {
  if (AI_API_KEY) return true;
  const base = process.env.AI_BASE_URL?.trim();
  return Boolean(base && base !== DEFAULT_AI_BASE_URL);
}

// ── AI token guard: owner-configurable parameters ──────────────────────────
// Every model call is charged against the aiUsage budget BEFORE it is sent
// (see aiUsageCore.ts / aiUsage.ts). The owner tunes the limits from the
// Convex Keys panel (getAiLimits in aiUsageCore.ts); sane defaults apply when
// unset. Nothing here can be lowered by a caller — these caps are server-side
// floors/ceilings.

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * Hard ceiling on output tokens for every chat call. Defaults to the
 * absolute ceiling (8,000); the owner can lower it (e.g. 1,000) to cap every
 * model's output regardless of what a caller requests.
 */
function maxOutputCap(): number {
  return clampOutputTokens(envInt("AI_MAX_OUTPUT_TOKENS", HARD_MAX_OUTPUT_TOKENS, 64, HARD_MAX_OUTPUT_TOKENS));
}

/** Charge an actor's budget; throws with a clear reason when the budget is exhausted. */
async function chargeAiUsage(ctx: ActionCtx, actor: string, estimatedTokens: number): Promise<void> {
  const result = await ctx.runMutation(internal.aiUsage.consumeAiUsage, {
    actor,
    day: dayKey(Date.now()),
    estimatedTokens,
    limits: getAiLimits(),
  });
  if (!result.ok) {
    const retry =
      result.retryAfterMs && result.retryAfterMs > 0
        ? ` Try again in ${Math.ceil(result.retryAfterMs / 1000)} seconds.`
        : "";
    throw new Error(`${result.reason}.${retry}`);
  }
}

const messageValidator = v.object({
  role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant")),
  content: v.string(),
});

// Owner-only proxy: the AI gateway key (when used) never reaches the browser.
async function requireOwner(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email?.trim().toLowerCase() === OWNER_EMAIL) return;

  const [userId] = (identity?.subject ?? "").split("|");
  if (userId) {
    const user = await ctx.runQuery(internal.users.getUserBySubject, { subject: userId });
    if (user?.role === "admin" || user?.email?.trim().toLowerCase() === OWNER_EMAIL) return;
  }

  throw new Error("Owner access required");
}

function isPrivateHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  );
}

// OpenAI-compatible request against the gateway. Local/private hosts (like the
// default https://localhost:20128) typically serve a self-signed certificate,
// so TLS verification is relaxed for those hosts only — public hosts keep full
// verification.
async function aiRequest(
  path: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> {
  const url = new URL(`${AI_BASE_URL.replace(/\/+$/, "")}${path}`);
  const payload = options.body ? JSON.stringify(options.body) : undefined;
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: options.method ?? (payload ? "POST" : "GET"),
        headers: {
          ...(payload ? { "content-type": "application/json" } : {}),
          ...(AI_API_KEY ? { authorization: `Bearer ${AI_API_KEY}` } : {}),
        },
        rejectUnauthorized: !isPrivateHost(url.hostname),
        timeout: 120_000,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = data ? (JSON.parse(data) as Record<string, unknown>) : {};
          } catch {
            parsed = {};
          }
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            const rawError = parsed.error;
            const detail =
              typeof rawError === "string"
                ? rawError
                : (rawError as { message?: string } | undefined)?.message ?? "";
            reject(new Error(`AI gateway returned HTTP ${status}${detail ? `: ${detail}` : ""}`));
            return;
          }
          resolve(parsed);
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error(`AI gateway request timed out (${url.host})`)));
    req.on("error", (error) => {
      reject(
        new Error(
          `Could not reach the AI gateway at ${url.host} — is OmniRoute running and reachable from the Convex runtime? (${error.message})`,
        ),
      );
    });
    if (payload) req.write(payload);
    req.end();
  });
}

export interface ChatCompletionOptions {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
  /** Who is paying ("user:<subject>" or a system actor like "court"/"thread-responder"). */
  actor?: string;
}

// OpenAI-compatible chat completion against the gateway. Shared by the public
// `chat` action (local agents), the consultant court, and the thread
// responder, so every chat-shaped model call routes through the same OmniRoute
// transport — and the same token guard. The guard charges the actor's budget
// (rate limit / daily caps, see aiUsageCore.ts) and clamps output tokens
// before anything is sent; `actor` identifies who is paying ("user:<subject>"
// or a system actor like "court"/"thread-responder").
//
// Two forms:
//  - chatCompletion(ctx, options) — full form: charges the budget via the
//    aiUsage mutation before the gateway is hit. Used by every reachable
//    caller (local-agent chat, thread responder).
//  - chatCompletion(options) — legacy form kept for the consultant-court chain
//    in mongodb.ts (a section of that file this repo's edit tooling cannot
//    reach). It still applies the hard parameters (input cap, output clamp)
//    but has no ctx to charge with, so court runs are instead charged at their
//    entry points (MCP dispatch in http.ts, automation trigger) — see
//    chargeCourtRun in aiUsageCore.ts.
export async function chatCompletion(
  ctx: ActionCtx,
  options: ChatCompletionOptions,
): Promise<{ content: string; model: string }>;
export async function chatCompletion(options: ChatCompletionOptions): Promise<{ content: string; model: string }>;
export async function chatCompletion(
  ctxOrOptions: ActionCtx | ChatCompletionOptions,
  maybeOptions?: ChatCompletionOptions,
): Promise<{ content: string; model: string }> {
  const hasCtx = maybeOptions !== undefined;
  const options = (hasCtx ? maybeOptions : ctxOrOptions) as ChatCompletionOptions;
  const totalInputChars = options.messages.reduce((sum, message) => sum + message.content.length, 0);
  if (totalInputChars > MAX_INPUT_CHARS) {
    throw new Error(
      `AI request is too large (${totalInputChars.toLocaleString()} input characters; limit is ${MAX_INPUT_CHARS.toLocaleString()})`,
    );
  }
  const maxOutput = Math.min(clampOutputTokens(options.maxTokens), maxOutputCap());
  if (hasCtx) {
    const estimatedTokens = estimateChatTokens(totalInputChars, maxOutput);
    await chargeAiUsage(ctxOrOptions as ActionCtx, options.actor ?? "owner", estimatedTokens);
  }

  const payload = await aiRequest("/chat/completions", {
    body: {
      model: options.model,
      messages: options.messages,
      stream: false,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      max_tokens: maxOutput,
    },
  });
  const choices = Array.isArray(payload.choices) ? (payload.choices as Array<{ message?: { content?: unknown } }>) : [];
  const fallback = payload.message as { content?: unknown } | undefined;
  const content = (choices[0]?.message?.content ?? fallback?.content) as string | undefined;
  if (!content?.trim()) throw new Error("AI gateway returned no text");
  return { content: content.trim(), model: options.model };
}

export const listModels = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const payload = await aiRequest("/models", { method: "GET" });
    // OpenAI shape: { data: [{ id }] }; some gateways use { models: [{ id | name }] }.
    const data = Array.isArray(payload.data) ? (payload.data as Array<{ id?: unknown }>) : [];
    const models = Array.isArray(payload.models)
      ? (payload.models as Array<{ id?: unknown; name?: unknown }>)
      : [];
    const names = data
      .map((model) => model.id)
      .concat(models.map((model) => model.id ?? model.name))
      .filter((name): name is string => typeof name === "string" && Boolean(name))
      .slice(0, 50);
    return { models: names };
  },
});

export const chat = action({
  args: {
    model: v.string(),
    messages: v.array(messageValidator),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const model = args.model.trim();
    if (!model || model.length > 120) throw new Error("A valid AI model is required");
    if (args.messages.length === 0 || args.messages.length > 12) throw new Error("The local agent message list is outside the allowed bound");
    if (args.messages.some((message) => message.content.length > 20_000)) throw new Error("The local agent prompt is too large");

    const identity = await ctx.auth.getUserIdentity();
    const actor = identity?.subject ? `user:${identity.subject}` : "owner";
    const { content } = await chatCompletion(ctx, { model, messages: args.messages, actor });
    return {
      choices: [{ message: { content } }],
    };
  },
});

// Embedding model pinned exactly: semantic search only works if the indexed
// vectors and the query vector come from the same model. The gateway routes
// this model name to whichever embedding provider is configured in OmniRoute.
const EMBEDDING_MODEL = "text-embedding-3-small";

export const embedText = internalAction({
  args: {
    text: v.string(),
    // Who is paying for this embedding ("user:<subject>" for signed-in calls,
    // "agent" for MCP semantic search, "indexing" for bulk lead indexing).
    actor: v.string(),
  },
  // Access is enforced by the callers (all internal): indexLeadEmbeddings and
  // semanticSearchLeads require a signed-in owner (or verified-approved lead
  // visibility) and mcpSemanticSearch requires MCP AI access. An internal
  // action cannot be invoked directly from the browser. The token guard runs
  // here so every embedding — including a customer's semantic search query —
  // is charged against the budget before the gateway is hit.
  handler: async (ctx, args) => {
    const text = args.text.trim();
    if (!text || text.length > 12_000) throw new Error("Embedding text must be between 1 and 12,000 characters");
    await chargeAiUsage(ctx, args.actor, estimateEmbeddingTokens(text.length));
    const payload = await aiRequest("/embeddings", {
      body: {
        model: EMBEDDING_MODEL,
        input: text,
      },
    });
    const data = Array.isArray(payload.data) ? (payload.data as Array<{ embedding?: unknown }>) : [];
    const embedding = data[0]?.embedding;
    if (!isFiniteVector(embedding)) {
      throw new Error(`AI gateway returned no usable embedding vector for model "${EMBEDDING_MODEL}"`);
    }
    return { embedding: embedding as number[], model: EMBEDDING_MODEL, dimensions: (embedding as number[]).length };
  },
});


