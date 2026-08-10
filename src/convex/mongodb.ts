"use node";

import { Document, MongoClient, ObjectId } from "mongodb";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";

const OWNER_EMAIL = "jacobvierra8@gmail.com";
const LEADS = "leads";
const HOT_DEALS = "hot_deals";
const BUYERS = "buyers";
const MATCHES = "property_matches";
const IMPORT_STAGING = "import_staging";
const TOOL_ACCESS = "tool_access";
const AUTOMATION_TASKS = "automation_tasks";

type AutomationMode = "DETERMINISTIC" | "BOTH";

type ToolAccessDocument = {
  _id: string;
  scraperEnabled?: boolean;
  estimatorEnabled?: boolean;
  aiEnabled?: boolean;
  automationEnabled?: boolean;
  automationMode?: AutomationMode;
  dailyRunLimit?: number;
  maxTasksPerRun?: number;
  runsToday?: number;
  usageDay?: string;
  createdAt?: number;
  updatedAt?: number;
};

const toolNameValidator = v.union(v.literal("SCRAPER"), v.literal("ESTIMATOR"));
const repairTierValidator = v.union(v.literal("BASE"), v.literal("MEDIUM"), v.literal("GUT"));
const automationModeValidator = v.union(v.literal("DETERMINISTIC"), v.literal("BOTH"));
const automationTaskKindValidator = v.union(v.literal("SCRAPE"), v.literal("ESTIMATE"));
const automationTaskStatusValidator = v.union(v.literal("PENDING"), v.literal("RUNNING"), v.literal("COMPLETED"), v.literal("FAILED"));
const estimateCompValidator = v.object({ salePrice: v.number() });
const estimateInputValidator = v.object({
  leadId: v.optional(v.string()),
  squareFeet: v.number(),
  yearBuilt: v.optional(v.number()),
  repairTier: repairTierValidator,
  soldComps: v.array(estimateCompValidator),
  compSourceUrl: v.optional(v.string()),
  compSourceDate: v.optional(v.string()),
  targetPct: v.number(),
  wholesaleFee: v.number(),
  closingCosts: v.number(),
  holdingCosts: v.number(),
  acquisitionPrice: v.optional(v.number()),
});
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

const automationTaskValidator = v.object({
  kind: automationTaskKindValidator,
  url: v.optional(v.string()),
  sourceType: v.optional(sourceTypeValidator),
  estimate: v.optional(estimateInputValidator),
});

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

function assertPublicHttpUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a valid public http(s) URL");
  }
  const hostname = parsed.hostname.toLowerCase();
  const blocked =
    parsed.protocol !== "http:" && parsed.protocol !== "https:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("169.254.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname);
  if (blocked) throw new Error("Only public http(s) source URLs are allowed");
  return parsed;
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function htmlToText(value: string) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return undefined;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function calculateRepairEstimate(squareFeet: number, tier: "BASE" | "MEDIUM" | "GUT", yearBuilt?: number) {
  const tierRate = { BASE: 15, MEDIUM: 30, GUT: 50 }[tier];
  const ageAdjustment = yearBuilt !== undefined && yearBuilt < 1960 ? 1.1 : 1;
  const base = squareFeet * tierRate * ageAdjustment;
  const items = {
    roof: Math.round(base * 0.2),
    hvac: Math.round(base * 0.15),
    kitchen: Math.round(base * 0.2),
    bath: Math.round(base * 0.1),
    flooring: Math.round(base * 0.12),
    paint: Math.round(base * 0.08),
    electrical: Math.round(base * 0.05),
  };
  const subtotal = Object.values(items).reduce((total, value) => total + value, 0);
  const contingency = Math.round(subtotal * 0.1);
  return { items, subtotal, contingency, total: subtotal + contingency, ratePerSquareFoot: tierRate * ageAdjustment };
}

type EstimateInput = {
  leadId?: string;
  squareFeet: number;
  yearBuilt?: number;
  repairTier: "BASE" | "MEDIUM" | "GUT";
  soldComps: Array<{ salePrice: number }>;
  compSourceUrl?: string;
  compSourceDate?: string;
  targetPct: number;
  wholesaleFee: number;
  closingCosts: number;
  holdingCosts: number;
  acquisitionPrice?: number;
};

function calculateDealEstimate(args: EstimateInput) {
  if (args.squareFeet <= 0 || args.targetPct <= 0 || args.targetPct > 100) {
    throw new Error("Square feet and target percentage must be positive; target must be 100 or less");
  }
  if ([args.wholesaleFee, args.closingCosts, args.holdingCosts, args.acquisitionPrice].some((value) => value !== undefined && value < 0)) {
    throw new Error("Deal costs and price cannot be negative");
  }
  if (args.soldComps.length > 0 && (!args.compSourceUrl?.trim() || !args.compSourceDate?.trim())) {
    throw new Error("Sold comps require a source URL and source date");
  }
  const compValues = args.soldComps.map((comp) => comp.salePrice).filter((value) => value > 0);
  const compMedian = median(compValues);
  const repairs = calculateRepairEstimate(args.squareFeet, args.repairTier, args.yearBuilt);
  const arv = compMedian === undefined ? undefined : {
    conservative: Math.round(compMedian * 0.9),
    median: Math.round(compMedian),
    aggressive: Math.round(compMedian * 1.1),
  };
  const mao = arv === undefined ? undefined : {
    conservative: Math.round(arv.conservative * args.targetPct / 100 - repairs.total - args.wholesaleFee - args.closingCosts - args.holdingCosts),
    median: Math.round(arv.median * args.targetPct / 100 - repairs.total - args.wholesaleFee - args.closingCosts - args.holdingCosts),
    aggressive: Math.round(arv.aggressive * args.targetPct / 100 - repairs.total - args.wholesaleFee - args.closingCosts - args.holdingCosts),
  };
  const estimatedProfit = mao && args.acquisitionPrice !== undefined ? mao.median - args.acquisitionPrice : undefined;
  return {
    estimateStatus: arv ? "READY" as const : "NEEDS_APPRAISAL" as const,
    compCount: compValues.length,
    compMedian,
    arv,
    repairs,
    mao,
    estimatedProfit,
    inputs: {
      targetPct: args.targetPct,
      wholesaleFee: args.wholesaleFee,
      closingCosts: args.closingCosts,
      holdingCosts: args.holdingCosts,
      repairTier: args.repairTier,
      compSourceUrl: args.compSourceUrl,
      compSourceDate: args.compSourceDate,
    },
  };
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

export const getToolAccess = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const document = await (await getDatabase()).collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    return {
      scraperEnabled: document?.scraperEnabled !== false,
      estimatorEnabled: document?.estimatorEnabled !== false,
      aiEnabled: document?.aiEnabled === true,
    };
  },
});

export const setToolAccess = action({
  args: {
    tool: toolNameValidator,
    enabled: v.boolean(),
    aiEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const field = args.tool === "SCRAPER" ? "scraperEnabled" : "estimatorEnabled";
    const update: Record<string, unknown> = { [field]: args.enabled, updatedAt: Date.now() };
    if (args.aiEnabled !== undefined) update.aiEnabled = args.aiEnabled;
    const setOnInsert: Record<string, unknown> = { scraperEnabled: true, estimatorEnabled: true, aiEnabled: false, createdAt: Date.now() };
    for (const key of Object.keys(update)) delete setOnInsert[key];
    await (await getDatabase()).collection<ToolAccessDocument>(TOOL_ACCESS).updateOne(
      { _id: "admin_tools" },
      { $set: update, $setOnInsert: setOnInsert },
      { upsert: true },
    );
    return { tool: args.tool, enabled: args.enabled, aiEnabled: args.aiEnabled };
  },
});

export const getAiToolManifest = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const document = await (await getDatabase()).collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    const scraperEnabled = document?.scraperEnabled !== false;
    const estimatorEnabled = document?.estimatorEnabled !== false;
    const aiEnabled = document?.aiEnabled === true;
    return {
      version: "1.0",
      aiAccessEnabled: aiEnabled,
      tools: [
        {
          name: "scrape_source",
          enabled: aiEnabled && scraperEnabled,
          description: "Fetch a public source URL, return a bounded evidence preview, and stage the source for owner review. Never creates or invents PII.",
          permission: "owner",
          input: { url: "string (public http or https)", sourceType: "source type" },
        },
        {
          name: "estimate_deal",
          enabled: aiEnabled && estimatorEnabled,
          description: "Calculate sourced-comp ARV scenarios, repair tiers, MAO scenarios, and gross spread from explicit inputs. Missing comps produce NEEDS_APPRAISAL.",
          permission: "owner",
          input: { squareFeet: "number", soldComps: "number[]", repairTier: "BASE | MEDIUM | GUT", targetPct: "number" },
        },
      ],
    };
  },
});

type ScrapeInput = { url: string; sourceType: string };

async function fetchAndStageSource(database: Awaited<ReturnType<typeof getDatabase>>, args: ScrapeInput) {
  const parsedUrl = assertPublicHttpUrl(args.url.trim());
  const response = await fetch(parsedUrl, { headers: { "user-agent": "Groundwork-source-review/1.0" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/") && !contentType.includes("json") && !contentType.includes("xml")) {
    throw new Error("This scraper currently supports text, HTML, XML, and JSON sources");
  }
  const body = (await response.text()).slice(0, 1_000_000);
  const title = decodeHtml(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? parsedUrl.hostname);
  const excerpt = htmlToText(body).slice(0, 2000);
  const links = [...body.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)].map((match) => match[1]).filter(Boolean).slice(0, 20);
  const fetchedAt = new Date().toISOString();
  const staged = await database.collection(IMPORT_STAGING).insertOne({
    sourceType: args.sourceType,
    rawJson: { url: parsedUrl.toString(), title, excerpt, links, contentType, fetchedAt },
    status: "NEW",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return { stagedId: String(staged.insertedId), url: parsedUrl.toString(), title, excerpt, links, contentType, fetchedAt, piiCreated: false };
}

export const scrapeSource = action({
  args: {
    url: v.string(),
    sourceType: sourceTypeValidator,
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const access = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.scraperEnabled === false) throw new Error("The scraper tool is disabled in Tool access settings");
    return fetchAndStageSource(database, args);
  },
});

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function automationSettings(document: ToolAccessDocument | null) {
  const usageDay = document?.usageDay === todayKey() ? document : null;
  return {
    enabled: document?.automationEnabled === true,
    mode: document?.automationMode ?? "BOTH" as AutomationMode,
    dailyRunLimit: Math.max(1, Math.min(1000, document?.dailyRunLimit ?? 24)),
    maxTasksPerRun: Math.max(1, Math.min(20, document?.maxTasksPerRun ?? 5)),
    runsToday: usageDay?.runsToday ?? 0,
    aiEnabled: document?.aiEnabled === true,
  };
}

async function reviewStagedSourceWithAi(source: { title: string; excerpt: string; url: string }) {
  const apiKey = process.env.SAMBANOVA_API_KEY;
  if (!apiKey) return { status: "SKIPPED_MISSING_KEY" as const };
  const response = await fetch("https://api.sambanova.ai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: process.env.SAMBANOVA_MODEL ?? "Meta-Llama-3.3-70B-Instruct",
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: `Review this public source excerpt for a real-estate owner. Return JSON only with keys: facts, distressSignals, candidateComps, warnings. Use only facts explicitly present in the excerpt. Never invent a person, address, phone, email, parcel, sale amount, comp, or distress fact. Every candidate comp must include its exact quoted evidence and the source URL. This is a review suggestion only, not an approved lead.\n\nSOURCE URL: ${source.url}\nTITLE: ${source.title}\nEXCERPT: ${source.excerpt.slice(0, 6000)}`,
      }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) return { status: "FAILED" as const, error: "Temporary AI review request failed" };
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) return { status: "FAILED" as const, error: "Temporary AI review returned no content" };
  try {
    return { status: "COMPLETED" as const, review: JSON.parse(content) as Record<string, unknown> };
  } catch {
    return { status: "FAILED" as const, error: "Temporary AI review returned invalid JSON" };
  }
}

async function runAutomationCycleImpl() {
  const database = await getDatabase();
  const accessDocument = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
  const settings = automationSettings(accessDocument);
  if (!settings.enabled) return { status: "PAUSED" as const, processed: 0, remaining: 0, ai: "not-run" as const };
  if (settings.runsToday >= settings.dailyRunLimit) return { status: "LIMIT_REACHED" as const, processed: 0, remaining: 0, ai: "not-run" as const };

  const tasks = await database.collection(AUTOMATION_TASKS).find({ status: "PENDING" }).sort({ createdAt: 1 }).limit(settings.maxTasksPerRun).toArray();
  let processed = 0;
  let failed = 0;
  let aiCompleted = 0;
  for (const task of tasks) {
    await database.collection(AUTOMATION_TASKS).updateOne({ _id: task._id }, { $set: { status: "RUNNING", startedAt: Date.now(), updatedAt: Date.now() } });
    try {
      let result: Record<string, unknown>;
      if (task.kind === "SCRAPE") {
        if (typeof task.url !== "string" || typeof task.sourceType !== "string") throw new Error("Scrape task is missing its URL or source type");
        const staged = await fetchAndStageSource(database, { url: task.url, sourceType: task.sourceType });
        let aiResult: Record<string, unknown> = { status: "NOT_REQUESTED" };
        if (settings.mode === "BOTH") {
          if (!settings.aiEnabled) aiResult = { status: "SKIPPED_AI_ACCESS_DISABLED" };
          else {
            const review = await reviewStagedSourceWithAi(staged);
            aiResult = review;
            if (review.status === "COMPLETED") aiCompleted += 1;
            await database.collection(IMPORT_STAGING).updateOne({ _id: objectId(staged.stagedId) }, { $set: { aiReview: review, updatedAt: Date.now() } });
          }
        }
        result = { kind: "SCRAPE", stagedId: staged.stagedId, sourceUrl: staged.url, ai: aiResult, piiCreated: false };
      } else {
        if (!task.estimate || typeof task.estimate !== "object") throw new Error("Estimate task is missing its explicit inputs");
        result = { kind: "ESTIMATE", estimate: calculateDealEstimate(task.estimate as EstimateInput) };
      }
      await database.collection(AUTOMATION_TASKS).updateOne({ _id: task._id }, { $set: { status: "COMPLETED", result, completedAt: Date.now(), updatedAt: Date.now() } });
      processed += 1;
    } catch (error) {
      failed += 1;
      await database.collection(AUTOMATION_TASKS).updateOne({ _id: task._id }, { $set: { status: "FAILED", error: error instanceof Error ? error.message : "Automation task failed", completedAt: Date.now(), updatedAt: Date.now() } });
    }
  }
  const nextRunsToday = settings.runsToday + 1;
  await database.collection<ToolAccessDocument>(TOOL_ACCESS).updateOne(
    { _id: "admin_tools" },
    { $set: { runsToday: nextRunsToday, usageDay: todayKey(), updatedAt: Date.now() }, $setOnInsert: { automationMode: "BOTH", automationEnabled: false } },
    { upsert: true },
  );
  const remaining = await database.collection(AUTOMATION_TASKS).countDocuments({ status: "PENDING" });
  return { status: "COMPLETED" as const, processed, failed, remaining, ai: settings.mode === "BOTH" ? { completed: aiCompleted, configured: Boolean(process.env.SAMBANOVA_API_KEY) && settings.aiEnabled } : "not-requested" as const };
}

export const getAutomationConfig = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const document = await (await getDatabase()).collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    const settings = automationSettings(document);
    return { ...settings, providerConfigured: Boolean(process.env.SAMBANOVA_API_KEY) };
  },
});

export const setAutomationConfig = action({
  args: {
    enabled: v.boolean(),
    mode: automationModeValidator,
    dailyRunLimit: v.number(),
    maxTasksPerRun: v.number(),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    if (args.dailyRunLimit < 1 || args.dailyRunLimit > 1000 || args.maxTasksPerRun < 1 || args.maxTasksPerRun > 20) {
      throw new Error("Automation limits must be within the allowed range");
    }
    await (await getDatabase()).collection<ToolAccessDocument>(TOOL_ACCESS).updateOne(
      { _id: "admin_tools" },
      { $set: { automationEnabled: args.enabled, automationMode: args.mode, dailyRunLimit: args.dailyRunLimit, maxTasksPerRun: args.maxTasksPerRun, updatedAt: Date.now() }, $setOnInsert: { scraperEnabled: true, estimatorEnabled: true, aiEnabled: false, createdAt: Date.now() } },
      { upsert: true },
    );
    return { ...args, providerConfigured: Boolean(process.env.SAMBANOVA_API_KEY) };
  },
});

export const enqueueAutomationTask = action({
  args: { task: automationTaskValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    if (args.task.kind === "SCRAPE") {
      if (!args.task.url?.trim() || !args.task.sourceType) throw new Error("Scrape tasks require a URL and source type");
      assertPublicHttpUrl(args.task.url.trim());
    }
    if (args.task.kind === "ESTIMATE" && !args.task.estimate) throw new Error("Estimate tasks require explicit estimator inputs");
    const now = Date.now();
    const result = await (await getDatabase()).collection(AUTOMATION_TASKS).insertOne({ ...args.task, status: "PENDING", createdAt: now, updatedAt: now });
    return { id: String(result.insertedId), status: "PENDING" as const };
  },
});

export const listAutomationTasks = action({
  args: { status: v.optional(automationTaskStatusValidator) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const filter = args.status ? { status: args.status } : {};
    const documents = await (await getDatabase()).collection(AUTOMATION_TASKS).find(filter).sort({ createdAt: -1 }).limit(100).toArray();
    return documents.map(serialize);
  },
});

export const runAutomationNow = action({
  args: {},
  handler: async (ctx): Promise<unknown> => {
    await requireOwner(ctx);
    return ctx.runAction(internal.mongodb.runAutomationCycle, {});
  },
});

export const runAutomationCycle = internalAction({
  args: {},
  handler: async () => runAutomationCycleImpl(),
});

export const estimateDeal = action({
  args: estimateInputValidator,
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const access = await (await getDatabase()).collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.estimatorEnabled === false) throw new Error("The estimator tool is disabled in Tool access settings");
    const result = calculateDealEstimate(args);
    if (args.leadId) {
      const database = await getDatabase();
      const lead = await database.collection(LEADS).findOne({ _id: objectId(args.leadId), fabricated: { $ne: true } });
      if (!lead) throw new Error("Lead not found");
      await database.collection(LEADS).updateOne({ _id: lead._id }, { $set: withoutUndefined({ arv: result.arv?.median, repairs: result.repairs.total, mao: result.mao?.median, acquisitionPrice: args.acquisitionPrice, estimatedProfit: result.estimatedProfit, underwriting: result, updatedAt: Date.now() }) });
    }
    return result;
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
