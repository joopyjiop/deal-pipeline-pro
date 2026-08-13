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
    embeddings?: Array<Array<number>>;
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

// Embeddings provider note: this action previously called Ollama Cloud, but
// Ollama Cloud is chat-only — it never serves /api/embed or /v1/embeddings
// (both return 404), so no model name can make it embed. OpenAI embeddings are
// used instead so semantic search actually returns vectors. Ollama remains the
// provider for chat (consultant court / local agents).
const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

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
    // The model is pinned exactly: semantic search only works if the indexed
    // vectors and the query vector come from the same embedding model.
    const model = OPENAI_EMBEDDING_MODEL;
    const key = process.env.OPENAI_API_KEY?.trim();
    if (!key) throw new Error("OPENAI_API_KEY is not configured on the Convex deployment — add it in the Keys panel");
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, input: text }),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: { message?: string } | string;
      data?: Array<{ embedding?: unknown }>;
    };
    if (!response.ok) {
      const detail = typeof payload.error === "string" ? payload.error : payload.error?.message;
      throw new Error(`OpenAI embeddings returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    const embedding = Array.isArray(payload.data) ? payload.data[0]?.embedding : undefined;
    if (!isFiniteVector(embedding)) {
      throw new Error(`OpenAI returned no usable embedding vector for model "${model}"`);
    }
    return { embedding: embedding as number[], model, dimensions: (embedding as number[]).length };
  },
});
