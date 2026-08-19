"use node";

import { MongoClient, ObjectId } from "mongodb";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { isEmptyStagingRow, type StagedRowLike } from "./stagingCleanupCore";

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

let clientPromise: Promise<MongoClient> | null = null;

function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

async function getDatabase() {
  return (await getMongoClient()).db();
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

async function purgeEmptyStagedSourcesImpl(): Promise<{ deleted: number }> {
  const database = await getDatabase();
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
    return purgeEmptyStagedSourcesImpl();
  },
});

/** Owner-only: delete one staged source by id (per-row Remove button). */
export const deleteStagedSource = action({
  args: { stagedId: v.string() },
  handler: async (ctx, args): Promise<{ deleted: boolean }> => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const id = ObjectId.isValid(args.stagedId) ? new ObjectId(args.stagedId) : null;
    if (!id) throw new Error("Invalid staged source id");
    const result = await database.collection(IMPORT_STAGING).deleteOne({ _id: id });
    return { deleted: result.deletedCount > 0 };
  },
});

/** Cron wrapper (daily sweep) — no owner gate; runs server-side. */
export const sweepEmptyStagedSources = internalAction({
  args: {},
  handler: async (): Promise<{ deleted: number }> => {
    return purgeEmptyStagedSourcesImpl();
  },
});
