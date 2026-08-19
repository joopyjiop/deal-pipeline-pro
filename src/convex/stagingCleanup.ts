"use node";

import { MongoClient, ObjectId } from "mongodb";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { isEmptyStagingRow, type StagedRowLike } from "./stagingCleanupCore";
import { mongoIdLookups } from "./mongoIdCore";

// Mirrors mongodb.ts's URI resolution: prefer the MONGODB_URI env var only
// when it carries credentials; otherwise use the owner-saved fallback URI
// stored in Convex appSettings (the Toolkit's "MongoDB Atlas" panel), which is
// the effective connection on managed deployments where the env value is a
// credential-less Atlas SQL endpoint.
const MONGO_URI_SETTING_KEY = "mongoUri";
const URI_WITH_CREDENTIALS = /^mongodb(\+srv)?:\/\/[^/@]+@/;

/**
 * Staged-source cleanup — removes the "untitled empty garbage" rows from the
 * import-staging review queue.
 *
 * Root cause of the noise: fetch/crawl paths (scrapeSource, ScrapeGraphAI,
 * Camofox, sitemap, automation) store their evidence nested inside `rawJson`
 * (url/title/excerpt) with no top-level sourceUrl/sourceRef/sourceDate, so the
 * queue used to show them as "Untitled staged source". Rows that are TRULY
 * empty — no source URL anywhere and no readable content at all — are pure
 * garbage: there is nothing to review, fill in, or promote. Those are what
 * this module deletes (on demand from Operations, and automatically via a
 * daily cron sweep).
 */

const IMPORT_STAGING = "import_staging";
const OWNER_EMAIL = "jacobvierra8@gmail.com";

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

async function getMongoClient(ctx: ActionCtx) {
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
  return clientState.promise;
}

async function getDatabase(ctx: ActionCtx) {
  return (await getMongoClient(ctx)).db();
}

// Same owner convention as the rest of the app (role "admin" OR the permanent
// owner email), resolved the way actions must (auth identity + users query).
async function requireOwner(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email?.trim().toLowerCase() === OWNER_EMAIL) return;
  const [userId] = (identity?.subject ?? "").split("|");
  if (!userId) throw new Error("Owner access required");
  const user = await ctx.runQuery(internal.users.getUserBySubject, { subject: userId });
  if (user && (user.role === "admin" || user.email?.trim().toLowerCase() === OWNER_EMAIL)) return;
  throw new Error("Owner access required");
}

async function purgeEmptyStagedSourcesImpl(ctx: ActionCtx): Promise<{ deleted: number }> {
  const database = await getDatabase(ctx);
  // Narrow with Mongo first (rows with no top-level sourceUrl), then finish
  // the emptiness check in JS where rawJson nesting is visible.
  const candidates = await database
    .collection(IMPORT_STAGING)
    .find({
      $or: [{ sourceUrl: { $exists: false } }, { sourceUrl: null }, { sourceUrl: "" }],
    })
    .sort({ updatedAt: -1 })
    .limit(5000)
    .toArray();

  let deleted = 0;
  for (const row of candidates) {
    if (isEmptyStagingRow(row as unknown as StagedRowLike)) {
      await database.collection(IMPORT_STAGING).deleteOne({ _id: row._id });
      deleted += 1;
    }
  }
  return { deleted };
}

/** Owner-only: delete every empty/garbage staged source. */
export const purgeEmptyStagedSources = action({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    await requireOwner(ctx);
    return purgeEmptyStagedSourcesImpl(ctx);
  },
});

/** Owner-only: delete one staged source by id (per-row Remove button). */
export const deleteStagedSource = action({
  args: { stagedId: v.string() },
  handler: async (ctx, args): Promise<{ deleted: boolean }> => {
    await requireOwner(ctx);
    const database = await getDatabase(ctx);
    // Most rows have ObjectId _ids; a few (admin/manual imports) may carry a
    // string id. Match whichever shape the stored row actually uses.
    const collection = database.collection(IMPORT_STAGING);
    for (const lookup of mongoIdLookups(args.stagedId)) {
      const mongoId = lookup.kind === "objectId" ? new ObjectId(lookup.value) : (lookup.value as unknown as ObjectId);
      const result = await collection.deleteOne({ _id: mongoId });
      if (result.deletedCount === 1) return { deleted: true };
    }
    return { deleted: false };
  },
});

/** Cron wrapper (daily sweep) — no owner gate; runs server-side. */
export const sweepEmptyStagedSources = internalAction({
  args: {},
  handler: async (ctx): Promise<{ deleted: number }> => {
    return purgeEmptyStagedSourcesImpl(ctx);
  },
});
