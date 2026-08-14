"use node";

import { request as httpsRequest } from "node:https";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { isFiniteVector } from "./embeddings";

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

// OpenAI-compatible chat completion against the gateway. Shared by the public
// `chat` action (local agents) and the consultant court in mongodb.ts, so every
// chat-shaped model call routes through the same OmniRoute transport.
export async function chatCompletion(options: {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  maxTokens?: number;
  temperature?: number;
}): Promise<{ content: string; model: string }> {
  const payload = await aiRequest("/chat/completions", {
    body: {
      model: options.model,
      messages: options.messages,
      stream: false,
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
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

    const { content } = await chatCompletion({ model, messages: args.messages });
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
  },
  // Access is enforced by the callers (all internal): indexLeadEmbeddings and
  // semanticSearchLeads require a signed-in owner (or verified-approved lead
  // visibility) and mcpSemanticSearch requires MCP AI access. An internal
  // action cannot be invoked directly from the browser.
  handler: async (_, args) => {
    const text = args.text.trim();
    if (!text || text.length > 12_000) throw new Error("Embedding text must be between 1 and 12,000 characters");
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
