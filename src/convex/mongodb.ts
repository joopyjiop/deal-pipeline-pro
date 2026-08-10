"use node";

import { Document, MongoClient, ObjectId } from "mongodb";
import { v } from "convex/values";
import { action } from "./_generated/server";

const OWNER_EMAIL = "jacobvierra8@gmail.com";
const LEADS = "leads";
const HOT_DEALS = "hot_deals";
const BUYERS = "buyers";
const MATCHES = "property_matches";
const IMPORT_STAGING = "import_staging";

let clientPromise: Promise<MongoClient> | null = null;

const sourceTypeValidator = v.union(
  v.literal("SHERIFF_SALE"),
  v.literal("TAX_SALE"),
  v.literal("ASSESSOR"),
  v.literal("RECORDER"),
  v.literal("PROPSTREAM"),
  v.literal("BATCHLEADS"),
  v.literal("DEALMACHINE"),
  v.literal("MANUAL"),
  v.literal("SEED"),
);

const verificationStatusValidator = v.union(
  v.literal("UNVERIFIED"),
  v.literal("PARTIAL"),
  v.literal("VERIFIED"),
);

const pipelineStatusValidator = v.union(
  v.literal("SOURCED"),
  v.literal("CRITIQUED"),
  v.literal("VERIFIED"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
);

const distressSignalValidator = v.object({
  type: v.string(),
  weight: v.number(),
  evidence: v.string(),
  verified: v.boolean(),
  sourceUrl: v.string(),
  sourceDate: v.string(),
});

const leadValidator = v.object({
  propertyAddress: v.string(),
  city: v.string(),
  state: v.string(),
  zip: v.string(),
  county: v.string(),
  parcelId: v.optional(v.string()),
  ownerMailingAddress: v.optional(v.string()),
  sourceType: sourceTypeValidator,
  sourceUrl: v.string(),
  sourceRef: v.string(),
  sourceDate: v.string(),
  distressScore: v.number(),
  distressSignals: v.array(distressSignalValidator),
  verificationStatus: verificationStatusValidator,
  pipelineStatus: pipelineStatusValidator,
  absenteeOwner: v.boolean(),
  needsSkipTrace: v.boolean(),
  listedPhone: v.boolean(),
  arv: v.optional(v.number()),
  repairs: v.optional(v.number()),
  mao: v.optional(v.number()),
  acquisitionPrice: v.optional(v.number()),
  notes: v.optional(v.string()),
});

const leadPatchValidator = v.object({
  propertyAddress: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  zip: v.optional(v.string()),
  county: v.optional(v.string()),
  parcelId: v.optional(v.string()),
  ownerMailingAddress: v.optional(v.string()),
  sourceType: v.optional(sourceTypeValidator),
  sourceUrl: v.optional(v.string()),
  sourceRef: v.optional(v.string()),
  sourceDate: v.optional(v.string()),
  distressScore: v.optional(v.number()),
  distressSignals: v.optional(v.array(distressSignalValidator)),
  verificationStatus: v.optional(verificationStatusValidator),
  pipelineStatus: v.optional(pipelineStatusValidator),
  absenteeOwner: v.optional(v.boolean()),
  needsSkipTrace: v.optional(v.boolean()),
  listedPhone: v.optional(v.boolean()),
  arv: v.optional(v.number()),
  repairs: v.optional(v.number()),
  mao: v.optional(v.number()),
  acquisitionPrice: v.optional(v.number()),
  notes: v.optional(v.string()),
});

const hotDealValidator = v.object({
  propertyAddress: v.string(),
  city: v.string(),
  state: v.string(),
  zip: v.string(),
  county: v.string(),
  sourceType: sourceTypeValidator,
  sourceUrl: v.string(),
  sourceRef: v.string(),
  sourceDate: v.string(),
  distressScore: v.number(),
  verificationStatus: verificationStatusValidator,
  arv: v.optional(v.number()),
  repairs: v.optional(v.number()),
  mao: v.optional(v.number()),
  acquisitionPrice: v.optional(v.number()),
  notes: v.optional(v.string()),
});

const hotDealPatchValidator = v.object({
  propertyAddress: v.optional(v.string()),
  city: v.optional(v.string()),
  state: v.optional(v.string()),
  zip: v.optional(v.string()),
  county: v.optional(v.string()),
  sourceType: v.optional(sourceTypeValidator),
  sourceUrl: v.optional(v.string()),
  sourceRef: v.optional(v.string()),
  sourceDate: v.optional(v.string()),
  distressScore: v.optional(v.number()),
  verificationStatus: v.optional(verificationStatusValidator),
  arv: v.optional(v.number()),
  repairs: v.optional(v.number()),
  mao: v.optional(v.number()),
  acquisitionPrice: v.optional(v.number()),
  notes: v.optional(v.string()),
});

const exitTypeValidator = v.union(
  v.literal("ASSIGN"),
  v.literal("FLIP"),
  v.literal("BUY_HOLD"),
);

const proofOfFundsStatusValidator = v.union(
  v.literal("NONE"),
  v.literal("SELF_REPORTED"),
  v.literal("VERIFIED"),
);

const buyerValidator = v.object({
  name: v.string(),
  phone: v.string(),
  email: v.string(),
  budgetMin: v.number(),
  budgetMax: v.number(),
  targetAreas: v.array(v.string()),
  exitType: exitTypeValidator,
  proofOfFundsStatus: proofOfFundsStatusValidator,
  pofEvidenceRef: v.optional(v.string()),
  purchaseHistory: v.any(),
  listSource: v.string(),
  intakeStatus: v.union(
    v.literal("PENDING"),
    v.literal("APPROVED"),
    v.literal("REJECTED"),
  ),
  verificationStatus: verificationStatusValidator,
});

const buyerPatchValidator = v.object({
  name: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  budgetMin: v.optional(v.number()),
  budgetMax: v.optional(v.number()),
  targetAreas: v.optional(v.array(v.string())),
  exitType: v.optional(exitTypeValidator),
  proofOfFundsStatus: v.optional(proofOfFundsStatusValidator),
  pofEvidenceRef: v.optional(v.string()),
  purchaseHistory: v.optional(v.any()),
  listSource: v.optional(v.string()),
  intakeStatus: v.optional(
    v.union(
      v.literal("PENDING"),
      v.literal("APPROVED"),
      v.literal("REJECTED"),
    ),
  ),
  verificationStatus: v.optional(verificationStatusValidator),
});

const matchConfidenceValidator = v.union(
  v.literal("LOW"),
  v.literal("MEDIUM"),
  v.literal("HIGH"),
);

const matchStatusValidator = v.union(
  v.literal("CANDIDATE"),
  v.literal("APPROVED"),
  v.literal("REJECTED"),
  v.literal("CONTACTED"),
  v.literal("CLOSED"),
);

const matchValidator = v.object({
  leadId: v.string(),
  buyerId: v.string(),
  matchScore: v.number(),
  buyBoxSummary: v.string(),
  confidence: matchConfidenceValidator,
  status: matchStatusValidator,
  rejectReason: v.optional(v.string()),
});

const matchPatchValidator = v.object({
  matchScore: v.optional(v.number()),
  buyBoxSummary: v.optional(v.string()),
  confidence: v.optional(matchConfidenceValidator),
  status: v.optional(matchStatusValidator),
  rejectReason: v.optional(v.string()),
});

const importStagingValidator = v.object({
  sourceType: sourceTypeValidator,
  rawJson: v.any(),
  status: v.union(
    v.literal("NEW"),
    v.literal("DUPLICATE"),
    v.literal("REJECTED"),
  ),
  rejectReason: v.optional(v.string()),
});

function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (!clientPromise) {
    const client = new MongoClient(uri);
    clientPromise = client.connect().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  return clientPromise;
}

async function getDatabase() {
  const client = await getMongoClient();
  return client.db();
}

async function requireOwner(ctx: { auth: { getUserIdentity: () => Promise<{ email?: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email?.trim().toLowerCase() !== OWNER_EMAIL) {
    throw new Error("Owner access required");
  }
}

async function requireSignedIn(ctx: { auth: { getUserIdentity: () => Promise<{ email?: string } | null> } }) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Authentication required");
  }
}

function withoutUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  ) as Partial<T>;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof ObjectId) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, serializeValue(item)]),
    );
  }
  return value;
}

function serialize<T extends Document>(document: T) {
  return serializeValue(document) as Record<string, unknown>;
}

function objectId(id: string) {
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid MongoDB document id");
  }
  return new ObjectId(id);
}

function calculateEstimatedProfit(value: { mao?: unknown; acquisitionPrice?: unknown }) {
  return typeof value.mao === "number" && typeof value.acquisitionPrice === "number"
    ? value.mao - value.acquisitionPrice
    : undefined;
}

function validateBuyer(buyer: {
  budgetMin: number;
  budgetMax: number;
  proofOfFundsStatus: string;
  pofEvidenceRef?: string;
}) {
  if (buyer.budgetMin < 0 || buyer.budgetMax < buyer.budgetMin) {
    throw new Error("Buyer budget range is invalid");
  }
  if (buyer.proofOfFundsStatus === "VERIFIED" && !buyer.pofEvidenceRef?.trim()) {
    throw new Error("Verified proof of funds requires an evidence reference");
  }
}

async function validateMatch(
  database: Awaited<ReturnType<typeof getDatabase>>,
  match: { leadId: string; buyerId: string; matchScore: number; confidence: string },
) {
  if (match.matchScore < 0 || match.matchScore > 100) {
    throw new Error("Match score must be between 0 and 100");
  }
  const [lead, buyer] = await Promise.all([
    database.collection(LEADS).findOne({ _id: objectId(match.leadId) }),
    database.collection(BUYERS).findOne({ _id: objectId(match.buyerId) }),
  ]);
  if (!lead || lead.fabricated === true || lead.pipelineStatus !== "APPROVED" || lead.verificationStatus !== "VERIFIED") {
    throw new Error("Matches require a verified, approved, non-fabricated lead");
  }
  if (!buyer || buyer.intakeStatus !== "APPROVED") {
    throw new Error("Matches require an approved buyer");
  }
  if (match.confidence === "HIGH" && buyer.proofOfFundsStatus !== "VERIFIED") {
    throw new Error("High-confidence matches require verified proof of funds");
  }
}

function validateApprovedLead(lead: {
  sourceType: string;
  sourceUrl: string;
  sourceRef: string;
  sourceDate: string;
  distressScore: number;
  distressSignals: Array<{
    evidence: string;
    verified: boolean;
    sourceUrl: string;
    sourceDate: string;
  }>;
  verificationStatus: string;
  pipelineStatus: string;
}) {
  if (lead.sourceType === "SEED") {
    throw new Error("Seed rows cannot enter the verified lead workspace");
  }
  if (!lead.sourceUrl.trim() || !lead.sourceRef.trim() || !lead.sourceDate.trim()) {
    throw new Error("A source URL, source reference, and source date are required");
  }
  if (lead.distressScore < 0 || lead.distressScore > 100) {
    throw new Error("Distress score must be between 0 and 100");
  }
  if (lead.verificationStatus !== "VERIFIED" || lead.pipelineStatus !== "APPROVED") {
    throw new Error("Only verified and approved leads can be surfaced");
  }
  if (
    lead.distressSignals.some(
      (signal) =>
        !signal.verified ||
        !signal.evidence.trim() ||
        !signal.sourceUrl.trim() ||
        !signal.sourceDate.trim(),
    )
  ) {
    throw new Error("Every distress signal needs verified, dated source evidence");
  }
}

export const healthCheck = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    if (!process.env.MONGODB_URI) {
      return { configured: false, connected: false, status: "MONGODB_URI is not configured" };
    }

    try {
      const database = await getDatabase();
      await database.command({ ping: 1 });
      return { configured: true, connected: true, status: "Connected successfully" };
    } catch (error) {
      console.error("MongoDB Atlas health check failed", error);
      return { configured: true, connected: false, status: "Connection failed" };
    }
  },
});

export const smokeTest = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const collection = database.collection("integration_checks");
    const marker = `groundwork-${Date.now()}`;
    const inserted = await collection.insertOne({ marker, createdAt: new Date() });
    const readBack = await collection.findOne({ _id: inserted.insertedId, marker });
    await collection.deleteOne({ _id: inserted.insertedId });

    return {
      ok: Boolean(readBack),
      operation: "insert-read-delete",
      collection: "integration_checks",
      readBack: Boolean(readBack),
    };
  },
});

export const insertLead = action({
  args: { lead: leadValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    validateApprovedLead(args.lead);
    const now = Date.now();
    const document = {
      ...args.lead,
      estimatedProfit: calculateEstimatedProfit(args.lead),
      fabricated: false,
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const result = await (await getDatabase()).collection(LEADS).insertOne(withoutUndefined(document));
    return { id: String(result.insertedId) };
  },
});

export const updateLead = action({
  args: { id: v.string(), patch: leadPatchValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const existing = await database.collection(LEADS).findOne({ _id: objectId(args.id) });
    if (!existing || existing.fabricated === true) throw new Error("Lead not found");

    const next = { ...existing, ...withoutUndefined(args.patch) } as typeof existing & {
      sourceType: string;
      sourceUrl: string;
      sourceRef: string;
      sourceDate: string;
      distressScore: number;
      distressSignals: Array<{ evidence: string; verified: boolean; sourceUrl: string; sourceDate: string }>;
      verificationStatus: string;
      pipelineStatus: string;
      mao?: number;
      acquisitionPrice?: number;
    };
    validateApprovedLead(next);
    await database.collection(LEADS).updateOne(
      { _id: existing._id },
      {
        $set: withoutUndefined({
          ...args.patch,
          estimatedProfit: calculateEstimatedProfit(next),
          fabricated: false,
          updatedAt: Date.now(),
        }),
      },
    );
    return { id: args.id };
  },
});

export const removeLead = action({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const result = await (await getDatabase()).collection(LEADS).deleteOne({ _id: objectId(args.id), fabricated: { $ne: true } });
    if (result.deletedCount !== 1) throw new Error("Lead not found");
    return { id: args.id };
  },
});

export const listLeads = action({
  args: {
    search: v.optional(v.string()),
    pipelineStatus: v.optional(pipelineStatusValidator),
    verificationStatus: v.optional(verificationStatusValidator),
    minDistressScore: v.optional(v.number()),
    maxDistressScore: v.optional(v.number()),
    sourceType: v.optional(sourceTypeValidator),
  },
  handler: async (ctx, args) => {
    await requireSignedIn(ctx);
    const filter: Document = { fabricated: { $ne: true } };
    if (args.pipelineStatus) filter.pipelineStatus = args.pipelineStatus;
    if (args.verificationStatus) filter.verificationStatus = args.verificationStatus;
    if (args.sourceType) filter.sourceType = args.sourceType;
    if (args.minDistressScore !== undefined || args.maxDistressScore !== undefined) {
      filter.distressScore = {
        ...(args.minDistressScore !== undefined ? { $gte: args.minDistressScore } : {}),
        ...(args.maxDistressScore !== undefined ? { $lte: args.maxDistressScore } : {}),
      };
    }
    if (args.search?.trim()) {
      const escaped = args.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { propertyAddress: { $regex: escaped, $options: "i" } },
        { city: { $regex: escaped, $options: "i" } },
        { county: { $regex: escaped, $options: "i" } },
        { parcelId: { $regex: escaped, $options: "i" } },
        { sourceRef: { $regex: escaped, $options: "i" } },
      ];
    }
    const documents = await (await getDatabase()).collection(LEADS).find(filter).sort({ distressScore: -1, updatedAt: -1 }).limit(100).toArray();
    return {
      meta: { dataOrigin: "verified" as const, live: false },
      leads: documents.map((document) => {
        const lead = serialize(document);
        return { ...lead, estimatedProfit: calculateEstimatedProfit(lead) };
      }),
    };
  },
});

export const insertHotDeal = action({
  args: { deal: hotDealValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    if (args.deal.sourceType === "SEED" || args.deal.verificationStatus !== "VERIFIED" || args.deal.distressScore < 80) {
      throw new Error("Hot deals require verified, non-seed records with distress score 80 or higher");
    }
    const now = Date.now();
    const result = await (await getDatabase()).collection(HOT_DEALS).insertOne(withoutUndefined({ ...args.deal, estimatedProfit: calculateEstimatedProfit(args.deal), fabricated: false, createdAt: now, updatedAt: now }));
    return { id: String(result.insertedId) };
  },
});

export const updateHotDeal = action({
  args: { id: v.string(), patch: hotDealPatchValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const existing = await database.collection(HOT_DEALS).findOne({ _id: objectId(args.id), fabricated: { $ne: true } });
    if (!existing) throw new Error("Hot deal not found");
    const next = { ...existing, ...withoutUndefined(args.patch) };
    if (next.sourceType === "SEED" || next.verificationStatus !== "VERIFIED" || typeof next.distressScore !== "number" || next.distressScore < 80) throw new Error("Hot deals require verified, non-seed records with distress score 80 or higher");
    await database.collection(HOT_DEALS).updateOne({ _id: existing._id }, { $set: withoutUndefined({ ...args.patch, estimatedProfit: calculateEstimatedProfit(next), fabricated: false, updatedAt: Date.now() }) });
    return { id: args.id };
  },
});

export const listHotDeals = action({
  args: { minDistressScore: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireSignedIn(ctx);
    const filter: Document = { fabricated: { $ne: true }, verificationStatus: "VERIFIED", distressScore: { $gte: args.minDistressScore ?? 80 } };
    const documents = await (await getDatabase()).collection(HOT_DEALS).find(filter).sort({ distressScore: -1 }).limit(100).toArray();
    return documents.map((document) => {
      const deal = serialize(document);
      return { ...deal, estimatedProfit: calculateEstimatedProfit(deal) };
    });
  },
});

export const insertBuyer = action({
  args: { buyer: buyerValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    validateBuyer(args.buyer);
    const now = Date.now();
    const result = await (await getDatabase()).collection(BUYERS).insertOne({ ...args.buyer, createdAt: now, updatedAt: now });
    return { id: String(result.insertedId) };
  },
});

export const submitBuyer = action({
  args: {
    name: v.string(),
    phone: v.string(),
    email: v.string(),
    budgetMin: v.number(),
    budgetMax: v.number(),
    targetAreas: v.array(v.string()),
    exitType: exitTypeValidator,
  },
  handler: async (ctx, args) => {
    if (args.budgetMin < 0 || args.budgetMax < args.budgetMin) {
      throw new Error("Buyer budget range is invalid");
    }
    if (args.targetAreas.length === 0) {
      throw new Error("At least one target area is required");
    }
    const now = Date.now();
    const result = await (await getDatabase()).collection(BUYERS).insertOne({
      ...args,
      proofOfFundsStatus: "NONE",
      purchaseHistory: [],
      listSource: "PUBLIC_INTAKE",
      intakeStatus: "PENDING",
      verificationStatus: "UNVERIFIED",
      createdAt: now,
      updatedAt: now,
    });
    return { id: String(result.insertedId), status: "PENDING", verificationStatus: "UNVERIFIED" };
  },
});

export const updateBuyer = action({
  args: { id: v.string(), patch: buyerPatchValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const existing = await database.collection(BUYERS).findOne({ _id: objectId(args.id) });
    if (!existing) throw new Error("Buyer not found");
    validateBuyer({ ...existing, ...withoutUndefined(args.patch) } as {
      budgetMin: number;
      budgetMax: number;
      proofOfFundsStatus: string;
      pofEvidenceRef?: string;
    });
    await database.collection(BUYERS).updateOne(
      { _id: existing._id },
      { $set: { ...withoutUndefined(args.patch), updatedAt: Date.now() } },
    );
    return { id: args.id };
  },
});

export const listBuyers = action({
  args: { intakeStatus: v.optional(v.union(v.literal("PENDING"), v.literal("APPROVED"), v.literal("REJECTED"))), proofOfFundsStatus: v.optional(proofOfFundsStatusValidator) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const filter: Document = {};
    if (args.intakeStatus) filter.intakeStatus = args.intakeStatus;
    if (args.proofOfFundsStatus) filter.proofOfFundsStatus = args.proofOfFundsStatus;
    const documents = await (await getDatabase()).collection(BUYERS).find(filter).sort({ updatedAt: -1 }).limit(200).toArray();
    return documents.map(serialize);
  },
});

export const insertMatch = action({
  args: { match: matchValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    await validateMatch(database, args.match);
    const duplicate = await database.collection(MATCHES).findOne({ leadId: args.match.leadId, buyerId: args.match.buyerId });
    if (duplicate) throw new Error("This lead and buyer are already matched");
    const now = Date.now();
    const result = await database.collection(MATCHES).insertOne({ ...args.match, createdAt: now, updatedAt: now });
    return { id: String(result.insertedId) };
  },
});

export const updateMatch = action({
  args: { id: v.string(), patch: matchPatchValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const existing = await database.collection(MATCHES).findOne({ _id: objectId(args.id) });
    if (!existing) throw new Error("Match not found");
    await validateMatch(database, {
      leadId: String(existing.leadId),
      buyerId: String(existing.buyerId),
      matchScore: typeof args.patch.matchScore === "number" ? args.patch.matchScore : Number(existing.matchScore),
      confidence: args.patch.confidence ?? String(existing.confidence),
    });
    const result = await database.collection(MATCHES).updateOne(
      { _id: existing._id },
      { $set: { ...withoutUndefined(args.patch), updatedAt: Date.now() } },
    );
    if (result.matchedCount !== 1) throw new Error("Match not found");
    return { id: args.id };
  },
});

export const listMatches = action({
  args: { status: v.optional(matchStatusValidator), confidence: v.optional(matchConfidenceValidator), minMatchScore: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const filter: Document = {};
    if (args.status) filter.status = args.status;
    if (args.confidence) filter.confidence = args.confidence;
    if (args.minMatchScore !== undefined) filter.matchScore = { $gte: args.minMatchScore };
    const documents = await (await getDatabase()).collection(MATCHES).find(filter).sort({ matchScore: -1, updatedAt: -1 }).limit(200).toArray();
    return documents.map(serialize);
  },
});

export const insertImportStaging = action({
  args: { row: importStagingValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const result = await (await getDatabase()).collection(IMPORT_STAGING).insertOne({ ...args.row, createdAt: Date.now(), updatedAt: Date.now() });
    return { id: String(result.insertedId) };
  },
});

export const listImportStaging = action({
  args: { status: v.optional(v.union(v.literal("NEW"), v.literal("DUPLICATE"), v.literal("REJECTED"))) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const documents = await (await getDatabase()).collection(IMPORT_STAGING).find(args.status ? { status: args.status } : {}).sort({ updatedAt: -1 }).limit(500).toArray();
    return documents.map(serialize);
  },
});
