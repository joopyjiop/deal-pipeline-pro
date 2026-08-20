"use node";

import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
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

const DEFAULT_AI_BASE_URL = "https://localhost:20128/v1";
const AI_BASE_URL = process.env.AI_BASE_URL?.trim() || DEFAULT_AI_BASE_URL;
const AI_API_KEY = process.env.AI_API_KEY?.trim() || "";

/** True when AI_BASE_URL is set to a real gateway (not the localhost default). */
export function isAiGatewayConfigured(): boolean {
  const base = process.env.AI_BASE_URL?.trim();
  return Boolean(base && base !== DEFAULT_AI_BASE_URL);
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

// OpenAI-compatible request against the gateway. Supports both http:// and https:// URLs.
async function aiRequest(
  path: string,
  options: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<Record<string, unknown>> {
  const url = new URL(`${AI_BASE_URL.replace(/\/+$/, "")}${path}`);
  const payload = options.body ? JSON.stringify(options.body) : undefined;
  const requestFn = url.protocol === "http:" ? httpRequest : httpsRequest;

  return new Promise((resolve, reject) => {
    const req = requestFn(
      url,
      {
        method: options.method ?? (payload ? "POST" : "GET"),
        headers: {
          ...(payload ? { "content-type": "application/json" } : {}),
          ...(AI_API_KEY ? { authorization: `Bearer ${AI_API_KEY}` } : {}),
        },
        ...(url.protocol === "https:" ? { rejectUnauthorized: !isPrivateHost(url.hostname) } : {}),
        timeout: 120_000,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(data || "{}"); } catch { return resolve({ rawText: data }); }
          if (res.statusCode && res.statusCode >= 400) {
            const errMsg = (parsed as { error?: { message?: string } }).error?.message ?? data;
            return reject(new Error(`AI gateway ${res.statusCode}: ${errMsg}`));
          }
          resolve(parsed);
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("AI gateway request timed out (120s)")); });
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Plain function exports — called directly by threadResponder.ts and mongodb.ts
// ---------------------------------------------------------------------------

/** Run a chat-completion against the AI gateway. Supports two calling patterns:
 *  - chatCompletion(ctx, args) — with Convex ActionCtx for AI usage tracking
 *  - chatCompletion(args) — without ctx (skips usage tracking, e.g. court model calls)
 */
export async function chatCompletion(
  ...params: [
    ActionCtx,
    { model: string; messages: Array<{ role: string; content: string }>; temperature?: number; maxTokens?: number },
  ] | [
    { model: string; messages: Array<{ role: string; content: string }>; temperature?: number; maxTokens?: number },
  ]
): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number } }> {
  if (!isAiGatewayConfigured()) throw new Error("AI gateway (AI_BASE_URL) is not configured");

  const [first, second] = params.length === 2 ? params : [null, params[0]];
  const ctx: ActionCtx | null = (first && typeof first === "object" && typeof (first as unknown as Record<string, unknown>).runMutation === "function") ? first as ActionCtx : null;
  const args = (params.length === 2 ? second : first) as { model: string; messages: Array<{ role: string; content: string }>; temperature?: number; maxTokens?: number };

  if (ctx) {
    const inputText = args.messages.map((m) => m.content).join("\n");
    const inputChars = inputText.length;
    const inputTokens = estimateChatTokens(inputChars, args.maxTokens ?? clampOutputTokens(HARD_MAX_OUTPUT_TOKENS));

    const outputBudget = args.maxTokens ?? clampOutputTokens(HARD_MAX_OUTPUT_TOKENS);
    const charge = await ctx.runMutation(internal.aiUsage.consumeAiUsage, {
      actor: "agent",
      day: dayKey(Date.now()),
      estimatedTokens: inputTokens + outputBudget,
      limits: getAiLimits(),
    });
    if (!charge.ok) {
      const retry = charge.retryAfterMs && charge.retryAfterMs > 0
        ? ` Try again in ${Math.ceil(charge.retryAfterMs / 1000)} seconds.` : "";
      throw new Error(`${charge.reason}.${retry}`);
    }
  }

  const result = await aiRequest("/chat/completions", {
    method: "POST",
    body: {
      model: args.model,
      messages: args.messages,
      temperature: args.temperature ?? 0.7,
      max_tokens: args.maxTokens ?? clampOutputTokens(HARD_MAX_OUTPUT_TOKENS),
    },
  });

  const choice = (result as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0];
  const content = choice?.message?.content ?? "";
  const usage = (result as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;

  return {
    content,
    usage: usage ? { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 } : undefined,
  };
}

/** Run an embedding request against the AI gateway. Returns number[]. */
export async function embedText(
  ctx: ActionCtx,
  args: { model: string; input: string },
): Promise<number[]> {
  if (!isAiGatewayConfigured()) throw new Error("AI gateway (AI_BASE_URL) is not configured");

  const inputChars = args.input.length;
  const inputTokens = estimateEmbeddingTokens(inputChars);

  const charge = await ctx.runMutation(internal.aiUsage.consumeAiUsage, {
    actor: "indexing",
    day: dayKey(Date.now()),
    estimatedTokens: inputTokens,
    limits: getAiLimits(),
  });
  if (!charge.ok) {
    const retry = charge.retryAfterMs && charge.retryAfterMs > 0
      ? ` Try again in ${Math.ceil(charge.retryAfterMs / 1000)} seconds.` : "";
    throw new Error(`${charge.reason}.${retry}`);
  }

  const result = await aiRequest("/embeddings", {
    method: "POST",
    body: { model: args.model, input: args.input },
  });

  const data = (result as { data?: Array<{ embedding?: number[] }> }).data;
  const vec = data?.[0]?.embedding;
  if (!vec || !isFiniteVector(vec)) throw new Error("AI gateway returned an invalid embedding vector");
  return vec;
}

/** List available models from the gateway. */
async function listModelsFn(): Promise<string[]> {
  if (!isAiGatewayConfigured()) return [];
  try {
    const result = await aiRequest("/models");
    const models = (result as { data?: Array<{ id?: string }> }).data;
    return (models ?? []).map((m) => m.id ?? "").filter(Boolean);
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// internalAction wrappers — for callers using ctx.runAction(internal.ollama.xxx)
// ---------------------------------------------------------------------------

export const chatCompletionAction = internalAction({
  args: {
    model: v.string(),
    messages: v.array(v.object({ role: v.string(), content: v.string() })),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => chatCompletion(ctx, args),
});

export const embedTextAction = internalAction({
  args: { model: v.string(), input: v.string() },
  handler: async (ctx, args) => embedText(ctx, args),
});

export const listModelsAction = internalAction({
  args: {},
  handler: async () => listModelsFn(),
});

// ---------------------------------------------------------------------------
// Client-callable actions — for useAction(api.ollama.*) on the frontend
// ---------------------------------------------------------------------------

export const listModels = action({
  args: {},
  handler: async () => ({ models: await listModelsFn() }),
});

export const chat = action({
  args: {
    model: v.string(),
    messages: v.array(v.object({ role: v.string(), content: v.string() })),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const result = await chatCompletion(ctx, args);
    // Return in OpenAI-compatible format so extractContent in LocalAgents works
    return {
      choices: [{ message: { content: result.content } }],
      usage: result.usage,
    };
  },
});
