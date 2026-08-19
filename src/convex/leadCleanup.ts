"use node";

import { MongoClient, ObjectId } from "mongodb";
import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { mongoIdLookups } from "./mongoIdCore";

const LEADS = "leads";
const MONGO_URI_SETTING_KEY = "mongoUri";
const OWNER_EMAIL = "jacobvierra8@gmail.com";
const URI_WITH_CREDENTIALS = /^mongodb(\+srv)?:\/\/[^/@]+@/;

let clientState: { uri: string; promise: Promise<MongoClient> } | null = null;

async function resolveMongoUri(ctx: ActionCtx): Promise<string> {
  const envUri = process.env.MONGODB_URI;
  const envUsable = envUri && URI_WITH_CREDENTIALS.test(envUri) ? envUri : null;
  if (envUsable) return envUsable;
  const stored = (await ctx.runQuery(internal.settings.getByKey, { key: MONGO_URI_SETTING_KEY })) as string | null;
  if (stored) return stored;
  if (envUri) return envUri;
  throw new Error("MONGODB_URI is not configured");
}

async function getDatabase(ctx: ActionCtx) {
  const uri = await resolveMongoUri(ctx);
  if (!clientState || clientState.uri !== uri) {
    clientState = {
      uri,
      promise: new MongoClient(uri).connect().catch((error) => {
        clientState = null;
        throw error;
      }),
    };
  }
  return (await clientState.promise).db();
}

async function requireOwner(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email?.trim().toLowerCase() === OWNER_EMAIL) return;
  const [userId] = (identity?.subject ?? "").split("|");
  if (!userId) throw new Error("Owner access required");
  const user = await ctx.runQuery(internal.users.getUserBySubject, { subject: userId });
  if (user && (user.role === "admin" || user.email?.trim().toLowerCase() === OWNER_EMAIL)) return;
  throw new Error("Owner access required");
}

/**
 * Delete one non-fabricated lead. The UI serializes Mongo ObjectIds as strings,
 * while a few legacy/admin rows may have literal string _ids. Query both forms
 * so the owner action does not report "Lead not found" for a valid record.
 */
export const deleteLeadRecord = action({
  args: { id: v.string() },
  handler: async (ctx, args): Promise<{ id: string }> => {
    await requireOwner(ctx);
    const collection = (await getDatabase(ctx)).collection(LEADS);
    let deleted = false;
    for (const lookup of mongoIdLookups(args.id)) {
      const mongoId = lookup.kind === "objectId" ? new ObjectId(lookup.value) : (lookup.value as unknown as ObjectId);
      const result = await collection.deleteOne({ _id: mongoId, fabricated: { $ne: true } });
      if (result.deletedCount === 1) {
        deleted = true;
        break;
      }
    }
    if (!deleted) throw new Error("Lead not found");
    return { id: args.id };
  },
});
