"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { isFiniteVector } from "./embeddings";

const OLLAMA_API_URL = "https://ollama.com/api";
const OWNER_EMAIL = "jacobvierra8@gmail.com";

const messageValidator = v.object({
  role: v.union(v.literal("system"), v.literal("user"), v.literal("assistant")),
  content: v.string(),
});

// Owner-only proxy: the Ollama Cloud key never reaches the browser.
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

function apiKey() {
  const key = process.env.OLLAMA_API_KEY?.trim();
  if (!key) throw new Error("OLLAMA_API_KEY is not configured on the Convex deployment");
  return key;
}

async function ollamaRequest(path: string, body?: Record<string, unknown>) {
  const response = await fetch(`${OLLAMA_API_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${apiKey()}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(120_000),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: { content?: string };
    models?: Array<{ name?: string }>;
  };
  if (!response.ok) {
    throw new Error(`Ollama Cloud returned HTTP ${response.status}${payload.error ? `: ${payload.error}` : ""}`);
  }
  return payload;
}

export const listModels = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const payload = await ollamaRequest("/tags");
    return {
      models: (payload.models ?? [])
        .map((model) => model.name)
        .filter((name): name is string => Boolean(name))
        .slice(0, 50),
    };
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
    if (!model || model.length > 120) throw new Error("A valid Ollama Cloud model is required");
    if (args.messages.length === 0 || args.messages.length > 12) throw new Error("The local agent message list is outside the allowed bound");
    if (args.messages.some((message) => message.content.length > 20_000)) throw new Error("The local agent prompt is too large");

    const payload = await ollamaRequest("/chat", {
      model,
      messages: args.messages,
      stream: false,
    });
    const content = payload.message?.content?.trim();
    if (!content) throw new Error("Ollama Cloud returned no text");
    return {
      choices: [{ message: { content } }],
    };
  },
});

export const embedText = internalAction({
  args: {
    text: v.string(),
    model: v.optional(v.string()),
  },
  // Access is enforced by the callers (all internal): indexLeadEmbeddings and
  // semanticSearchLeads require a signed-in owner (or verified-approved lead
  // visibility) and mcpSemanticSearch requires MCP AI access. An internal
  // action cannot be invoked directly from the browser.
  handler: async (_, args) => {
    const text = args.text.trim();
    if (!text || text.length > 12_000) throw new Error("Embedding text must be between 1 and 12,000 characters");
    const model = (args.model?.trim() || "nomic-embed-text").slice(0, 120);
    // OpenAI-compatible embeddings endpoint on Ollama Cloud. Handles both the
    // OpenAI response envelope (data[0].embedding) and the native embedding
    // shape for resilience across Ollama server versions.
    const payload = (await ollamaRequest("/v1/embeddings", { model, input: text })) as unknown as {
      data?: Array<{ embedding?: unknown }>;
      embedding?: unknown;
    };
    const embedding = Array.isArray(payload.data)
      ? payload.data[0]?.embedding
      : payload.embedding;
    if (!isFiniteVector(embedding)) {
      throw new Error(`Ollama Cloud returned no usable embedding vector for model "${model}" — confirm the model exists and is available on your plan`);
    }
    return { embedding: embedding as number[], model, dimensions: (embedding as number[]).length };
  },
});
