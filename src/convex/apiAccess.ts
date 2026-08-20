"use node";

import { v } from "convex/values";
import { MongoClient, ObjectId } from "mongodb";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  API_CREDENTIALS_COLLECTION,
  generateApiToken,
  hashApiToken,
  isApiScope,
  normalizeScopes,
  mongoUriHasCredentials,
  selectMongoUri,
  sanitizeName,
  sanitizeNote,
  toPublicCredential,
  type ApiScope,
  type CredentialStatus,
} from "./apiAccessCore";

/**
 * API access registry — the "whoever I gave permission to" half of API auth.
 *
 * The owner's master keys (ADMIN_API_KEY, MCP_TOOL_SERVER_SECRET,
 * CONVEX_N8N_WEBHOOK_SECRET) remain the "me" half and are checked first in
 * http.ts. This registry adds per-agent, scoped, revocable credentials so the
 * owner can grant (and instantly revoke) access to specific agents/integrations
 * — e.g. Odysseus — without sharing or rotating a master key.
 *
 * Every management action here is owner-gated server-side (requireOwner), and
 * tokens are stored only as SHA-256 hashes. The plaintext token is returned
 * exactly once, at issue/rotate time.
 */

const OWNER_EMAIL = "jacobvierra8@gmail.com";

let clientPromise: Promise<MongoClient> | null = null;
let cachedMongoUri: string | null = null;
const MONGO_URI_SETTING_KEY = "mongoUri";

async function getStoredMongoUri(ctx: ActionCtx): Promise<string | null> {
  return (await ctx.runQuery(internal.settings.getByKey, { key: MONGO_URI_SETTING_KEY })) ?? null;
}

async function connectWithUri(uri: string): Promise<MongoClient> {
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    return client;
  } catch (error) {
    clientPromise = null;
    if (cachedMongoUri && cachedMongoUri !== uri) {
      const fallback = new MongoClient(cachedMongoUri, { serverSelectionTimeoutMS: 10_000 });
      await fallback.connect();
      return fallback;
    }
    throw error;
  }
}

async function getMongoClient(ctx: ActionCtx) {
  const envUri = process.env.MONGODB_URI?.trim();
  if (!envUri || !mongoUriHasCredentials(envUri)) {
    cachedMongoUri ??= await getStoredMongoUri(ctx);
  }
  const uri = selectMongoUri(envUri, cachedMongoUri ?? undefined);
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) clientPromise = connectWithUri(uri);
  return clientPromise;
}

async function getDatabase(ctx: ActionCtx) {
  return (await getMongoClient(ctx)).db();
}

function objectId(value: string) {
  if (!ObjectId.isValid(value)) throw new Error("Invalid credential id");
  return new ObjectId(value);
}

// Same owner convention as the rest of the app (role "admin" OR the permanent
// owner email), resolved the way actions must (auth identity + users query,
// since actions have no ctx.db).
async function requireOwner(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email?.trim().toLowerCase() === OWNER_EMAIL) return;
  const [userId] = (identity?.subject ?? "").split("|");
  if (!userId) throw new Error("Owner access required");
  const user = await ctx.runQuery(internal.users.getUserBySubject, { subject: userId });
  if (user && (user.role === "admin" || user.email?.trim().toLowerCase() === OWNER_EMAIL)) return;
  throw new Error("Owner access required");
}

/** Create a new ACTIVE credential. Returns the plaintext token exactly once. */
export const createApiCredential = action({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const name = sanitizeName(args.name);
    const scopes = normalizeScopes(args.scopes);
    const { token, tokenHash, tokenPrefix } = generateApiToken();
    const identity = await ctx.auth.getUserIdentity();
    const doc = {
      name,
      scopes,
      tokenHash,
      tokenPrefix,
      status: "ACTIVE" as CredentialStatus,
      createdBy: identity?.email ?? "owner",
      createdAt: Date.now(),
      note: sanitizeNote(args.note),
    };
    const result = await (await getDatabase(ctx)).collection(API_CREDENTIALS_COLLECTION).insertOne(doc);
    return { id: String(result.insertedId), token, tokenPrefix, name, scopes, status: "ACTIVE" };
  },
});

/** List all credentials (token-free view). Owner-only. */
export const listApiCredentials = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const rows = await (await getDatabase(ctx))
      .collection(API_CREDENTIALS_COLLECTION)
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    return rows.map((row) => toPublicCredential(row));
  },
});

/** Revoke a credential — it stops working immediately. Owner-only. */
export const revokeApiCredential = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const result = await (await getDatabase(ctx))
      .collection(API_CREDENTIALS_COLLECTION)
      .updateOne({ _id: objectId(args.id) }, { $set: { status: "REVOKED" as CredentialStatus, updatedAt: Date.now() } });
    if (result.matchedCount === 0) throw new Error("Credential not found");
    return { ok: true, id: args.id, status: "REVOKED" };
  },
});

/** Re-enable a revoked credential. Owner-only. */
export const enableApiCredential = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const result = await (await getDatabase(ctx))
      .collection(API_CREDENTIALS_COLLECTION)
      .updateOne({ _id: objectId(args.id) }, { $set: { status: "ACTIVE" as CredentialStatus, updatedAt: Date.now() } });
    if (result.matchedCount === 0) throw new Error("Credential not found");
    return { ok: true, id: args.id, status: "ACTIVE" };
  },
});

/** Rotate a credential's token. The old token stops working; returns the new one once. */
export const renewApiCredential = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const { token, tokenHash, tokenPrefix } = generateApiToken();
    const result = await (await getDatabase(ctx))
      .collection(API_CREDENTIALS_COLLECTION)
      .updateOne({ _id: objectId(args.id) }, { $set: { tokenHash, tokenPrefix, status: "ACTIVE" as CredentialStatus, updatedAt: Date.now() } });
    if (result.matchedCount === 0) throw new Error("Credential not found");
    return { ok: true, id: args.id, token, tokenPrefix };
  },
});

/** Approve a PENDING access request: mint a fresh token (the request's token was never usable). */
export const approveApiCredential = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const { token, tokenHash, tokenPrefix } = generateApiToken();
    const result = await (await getDatabase(ctx))
      .collection(API_CREDENTIALS_COLLECTION)
      .updateOne(
        { _id: objectId(args.id), status: "PENDING" },
        { $set: { tokenHash, tokenPrefix, status: "ACTIVE" as CredentialStatus, updatedAt: Date.now() } },
      );
    if (result.matchedCount === 0) throw new Error("Pending request not found");
    return { ok: true, id: args.id, token, tokenPrefix, status: "ACTIVE" };
  },
});

/** Hard-delete a credential (e.g. an abandoned PENDING request). Owner-only. */
export const deleteApiCredential = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const result = await (await getDatabase(ctx)).collection(API_CREDENTIALS_COLLECTION).deleteOne({ _id: objectId(args.id) });
    if (result.deletedCount === 0) throw new Error("Credential not found");
    return { ok: true, id: args.id };
  },
});

/**
 * Validate a presented token against the registry for a specific scope. Called
 * by http.ts on every API request whose owner-key check did not match. Returns
 * { ok: false } for unknown/revoked/pending/out-of-scope tokens and records a
 * coarse lastUsedAt (rate-limited to ~once a minute) for audit.
 */
export const checkApiCredential = internalAction({
  args: { token: v.string(), scope: v.string() },
  handler: async (ctx, args) => {
    if (!args.token || !isApiScope(args.scope)) return { ok: false };
    const tokenHash = hashApiToken(args.token);
    const collection = (await getDatabase(ctx)).collection(API_CREDENTIALS_COLLECTION);
    const doc = await collection.findOne({ tokenHash });
    if (!doc || doc.status !== "ACTIVE" || !doc.scopes.includes(args.scope)) {
      return { ok: false };
    }
    const now = Date.now();
    if (typeof doc.lastUsedAt !== "number" || now - doc.lastUsedAt > 60_000) {
      await collection.updateOne({ _id: doc._id }, { $set: { lastUsedAt: now } });
    }
    return { ok: true, name: doc.name, scopes: doc.scopes };
  },
});

/**
 * Create a PENDING access request (called by the authenticated agent via the
 * `request_api_access` MCP tool). The request's token is minted and discarded —
 * a PENDING credential can never be used. Only the owner can approve it, which
 * mints a fresh token the owner hands to the agent.
 */
export const requestApiAccess = internalAction({
  args: {
    name: v.string(),
    scopes: v.array(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const name = sanitizeName(args.name);
    const scopes = normalizeScopes(args.scopes);
    const { tokenHash, tokenPrefix } = generateApiToken();
    const doc = {
      name: `${name} (requested)`,
      scopes,
      tokenHash,
      tokenPrefix,
      status: "PENDING" as CredentialStatus,
      createdBy: "agent-request",
      createdAt: Date.now(),
      note: sanitizeNote(args.note),
    };
    const result = await (await getDatabase(ctx)).collection(API_CREDENTIALS_COLLECTION).insertOne(doc);
    return {
      id: String(result.insertedId),
      status: "PENDING",
      message: "Access request created. The owner must approve it in the Dashboard before a token is issued.",
    };
  },
});
