"use node";

import { MongoClient } from "mongodb";
import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { toBuyerCard, toMatchCard, toSellerCard, type BuyerCard, type MatchCard, type SellerCard } from "./marketplaceCore";

/**
 * Read-only marketplace — the ONLY data surface non-owner signed-in users see.
 *
 * Access model (enforced here, never just in the UI):
 *  - Anonymous / guest identities: rejected outright — guests see nothing.
 *  - Owner: technically allowed (returns the same scrubbed view), but the
 *    owner's real workspace lives in the dashboard's owner actions.
 *  - Any other signed-in user: approved sellers (verified, non-fabricated
 *    leads), approved buyers (contact PII stripped), and matches (resolved to
 *    lead address + buyer name). No write path exists on this surface.
 */

const LEADS = "leads";
const BUYERS = "buyers";
const MATCHES = "matches";

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

/** Guest (anonymous) identities have zero marketplace access. */
async function rejectGuests(ctx: ActionCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in required to view the marketplace");
  const [userId] = (identity.subject ?? "").split("|");
  if (!userId) throw new Error("Sign in required to view the marketplace");
  const user = await ctx.runQuery(internal.users.getUserBySubject, { subject: userId });
  if (user?.isAnonymous) throw new Error("Guest accounts cannot view marketplace data");
}

export interface MarketplaceOverview {
  sellers: SellerCard[];
  buyers: BuyerCard[];
  matches: MatchCard[];
}

export const marketplaceOverview = action({
  args: {},
  handler: async (ctx): Promise<MarketplaceOverview> => {
    await rejectGuests(ctx);
    const db = await getDatabase();
    const [leadDocs, buyerDocs, matchDocs] = await Promise.all([
      db
        .collection(LEADS)
        .find({ fabricated: { $ne: true }, pipelineStatus: "APPROVED", verificationStatus: "VERIFIED" })
        .sort({ distressScore: -1, updatedAt: -1 })
        .limit(100)
        .toArray(),
      db
        .collection(BUYERS)
        .find({ intakeStatus: "APPROVED" })
        .sort({ updatedAt: -1 })
        .limit(200)
        .toArray(),
      db
        .collection(MATCHES)
        .find({})
        .sort({ matchScore: -1, updatedAt: -1 })
        .limit(200)
        .toArray(),
    ]);

    const sellers = leadDocs
      .map((doc) => toSellerCard(doc as unknown as Record<string, unknown>))
      .filter((card): card is SellerCard => card !== null);
    const buyers = buyerDocs
      .map((doc) => toBuyerCard(doc as unknown as Record<string, unknown>))
      .filter((card): card is BuyerCard => card !== null);
    const matches = matchDocs
      .map((doc) => toMatchCard(doc as unknown as Record<string, unknown>, sellers, buyers))
      .filter((card): card is MatchCard => card !== null);

    return { sellers, buyers, matches };
  },
});
