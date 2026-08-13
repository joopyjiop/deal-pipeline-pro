"use node";

import { Document, MongoClient, ObjectId } from "mongodb";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, ActionCtx, internalAction } from "./_generated/server";
import { rankLeads } from "./search";
import { scrapegraphExtract } from "./scrapegraph";
import { discoverSitemapUrls } from "./sitemap";
import type { SitemapFetch } from "./sitemap";
import { fetchPropertyData, latestAnnualPropertyTax } from "./rentcast";
import type { SearchableLead } from "./search";
import { median, rentalUnderwriting, repairEstimate } from "./underwriting";
import type { RentalUnderwritingInput, RentalUnderwritingResult } from "./underwriting";
import {
  arvRepairsAgent,
  buyerMatchingAgent,
  readinessReport,
  sourcingAgent,
  underwritingAgentFromModel,
  verificationAgent,
} from "./agents";
import type { AgentLead, AgentReport, BuyerLike, DueDiligenceLike, ReadinessReport, ScoredBuyerMatch } from "./agents";

const OWNER_EMAIL = "jacobvierra8@gmail.com";

// @codebuff-probe
const LEADS = "leads"; // Mongo collection name
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

const rentalUnderwritingInputValidator = v.object({
  purchasePrice: v.number(),
  rentComps: v.optional(v.array(v.number())),
  marketRentPerSqFt: v.optional(v.number()),
  squareFeet: v.optional(v.number()),
  annualPropertyTax: v.optional(v.number()),
  annualInsurance: v.optional(v.number()),
  managementPct: v.optional(v.number()),
  vacancyPct: v.optional(v.number()),
  maintenancePct: v.optional(v.number()),
  loanAmount: v.optional(v.number()),
  loanToValuePct: v.optional(v.number()),
  interestRatePct: v.optional(v.number()),
  loanTermYears: v.optional(v.number()),
});
let clientPromise: Promise<MongoClient> | null = null;
// Effective fallback URI resolved from the Convex-stored setting. Used when the
// deployment's MONGODB_URI env var is missing or rejected (e.g. Freebuff-managed
// deployments whose env cannot be edited). Populated by setMongoUriFallback and
// healthCheck, then reused by every Mongo action.
let cachedMongoUri: string | null = null;
const MONGO_URI_SETTING_KEY = "mongoUri";

const sourceTypeValidator = v.union(
  v.literal("SHERIFF_SALE"),
  v.literal("TAX_SALE"),
  v.literal("AUCTION_COM"),
  v.literal("PROBATE"),
  v.literal("OFF_MARKET"),
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

// Due-diligence gate: before a lead-linked ARV/profit estimate is computed, the
// owner must gather evidence for four categories (title/liens, sale history +
// comparables, condition, occupancy). Missing categories are recorded explicitly
// and the estimate is blocked rather than computed blindly.
const dueDiligenceCategoryValidator = v.union(
  v.literal("TITLE_AND_LIENS"),
  v.literal("SALE_HISTORY"),
  v.literal("CONDITION"),
  v.literal("OCCUPANCY"),
);

const dueDiligenceEntryValidator = v.object({
  status: v.union(v.literal("UNCHECKED"), v.literal("FOUND"), v.literal("MISSING")),
  sourceUrl: v.optional(v.string()),
  sourceDate: v.optional(v.string()),
  summary: v.optional(v.string()),
  data: v.optional(v.any()),
  checkedAt: v.optional(v.number()),
});

function uriHasCredentials(uri: string) {
  // A usable driver URI embeds userinfo (`user:pass@host`). The Atlas SQL
  // endpoint (no credentials) looks similar but contains no `@` and cannot be
  // authenticated against by the driver.
  return /^mongodb(\+srv)?:\/\/[^/@]+@/.test(uri);
}

function maskUriHost(uri: string) {
  try {
    return new URL(uri).host;
  } catch {
    return null;
  }
}

async function getStoredMongoUri(ctx: ActionCtx): Promise<string | null> {
  return (await ctx.runQuery(internal.settings.getByKey, { key: MONGO_URI_SETTING_KEY })) ?? null;
}

type MongoHealthResult = {
  configured: boolean;
  connected: boolean;
  status: string;
  fallbackConfigured: boolean;
  fallbackHost: string | null;
  usingFallback: boolean;
};

async function connectWithUri(uri: string): Promise<MongoClient> {
  try {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    return client;
  } catch (error) {
    clientPromise = null;
    // The env value can be stale or credential-less on managed deployments.
    // Retry against the owner-saved fallback before giving up.
    if (cachedMongoUri && cachedMongoUri !== uri) {
      const fallback = new MongoClient(cachedMongoUri, { serverSelectionTimeoutMS: 10000 });
      await fallback.connect();
      return fallback;
    }
    throw error;
  }
}

function getMongoClient() {
  const envUri = process.env.MONGODB_URI;
  // Prefer the env var when it carries credentials. A credential-less env value
  // (e.g. the Atlas SQL endpoint on managed deployments) is treated as absent
  // so the owner-saved fallback is used directly instead of failing first.
  const uri = envUri && uriHasCredentials(envUri) ? envUri : cachedMongoUri ?? envUri;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (!clientPromise) {
    clientPromise = connectWithUri(uri);
  }

  return clientPromise;
}

async function getDatabase() {
  const client = await getMongoClient();
  return client.db();
}

function isOwnerEmail(email: string | undefined) {
  return email?.trim().toLowerCase() === OWNER_EMAIL;
}

async function isOwnerIdentity(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (isOwnerEmail(identity?.email)) return true;
  // The identity subject is `<userId>|<sessionId>` (see @convex-dev/auth
  // getAuthUserId). Split off the userId before looking up the users table so
  // the backend matches the app's owner convention (role "admin" OR the
  // permanent owner email) against the same row the frontend reads.
  const [userId] = (identity?.subject ?? "").split("|");
  if (!userId) return false;
  const user = await ctx.runQuery(internal.users.getUserBySubject, {
    subject: userId,
  });
  return Boolean(user && (user.role === "admin" || isOwnerEmail(user.email)));
}

async function requireOwner(ctx: ActionCtx) {
  if (await isOwnerIdentity(ctx)) return;
  throw new Error("Owner access required");
}

async function requireSignedIn(ctx: ActionCtx) {
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
  // `_id` is always stringified by serializeValue, so declare it as a known
  // property. Without it, object-literal spreads like `{ ...lead, x }` drop the
  // index signature and TypeScript loses `_id` on the spread result.
  return serializeValue(document) as Record<string, unknown> & { _id: string };
}

function objectId(id: string) {
  if (!ObjectId.isValid(id)) {
    throw new Error("Invalid MongoDB document id");
  }
  return new ObjectId(id);
}

// Off-market source presets for the sourcing agent: probate filings, tax
// delinquency, and government-owned/seized property. Every preset is a real
// public site the owner can crawl in bounded batches; none of them generate
// leads automatically — they seed the review queue.
const OFF_MARKET_SOURCE_PRESETS = [
  {
    name: "Probate & trust property sales",
    url: "https://www.trustpropertiesusa.com/",
    sourceType: "PROBATE" as const,
  },
  {
    name: "Harris County delinquent tax sale listings",
    url: "https://www.hctax.net/Property/listings/taxsalelisting",
    sourceType: "TAX_SALE" as const,
  },
  {
    name: "Bid4Assets county tax & government-seized property auctions",
    url: "https://www.bid4assets.com/",
    sourceType: "OFF_MARKET" as const,
  },
] as const;

export const queueOffMarketSources = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const queued = await Promise.all(
      OFF_MARKET_SOURCE_PRESETS.map(async (source) => ({
        ...source,
        ...(await enqueueSourceTask(database, source.url, source.sourceType, `off-market:${source.sourceType}:2026`)),
      })),
    );
    return { queued, ownerApprovalRequired: true };
  },
});

// ---- Coordinated agent team (Tranchi-style pipeline) ----
//
// Run the sourcing, verification, underwriting, and ARV/repairs agents over one
// lead, then aggregate their blocking data gaps through the readiness gate. The
// team only reads data the lead already carries plus the owner-provided rental
// and comp inputs — nothing is invented, and an incomplete deal is flagged.

function leadText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function leadNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toAgentLead(document: Document): AgentLead {
  return {
    _id: String(document._id),
    propertyAddress: leadText(document.propertyAddress),
    city: leadText(document.city),
    state: leadText(document.state),
    zip: leadText(document.zip),
    county: leadText(document.county),
    parcelId: leadText(document.parcelId),
    sourceType: leadText(document.sourceType),
    sourceUrl: leadText(document.sourceUrl),
    sourceRef: leadText(document.sourceRef),
    sourceDate: leadText(document.sourceDate),
    distressScore: leadNumber(document.distressScore),
    distressSignals: Array.isArray(document.distressSignals)
      ? (document.distressSignals as Array<Record<string, unknown>>).map((signal) => ({
          type: leadText(signal.type),
          evidence: leadText(signal.evidence),
          verified: signal.verified === true,
          sourceUrl: leadText(signal.sourceUrl),
          sourceDate: leadText(signal.sourceDate),
        }))
      : [],
    dueDiligence: document.dueDiligence as DueDiligenceLike | undefined,
    fabricated: document.fabricated === true,
    squareFeet: leadNumber(document.squareFeet),
    arv: leadNumber(document.arv),
    repairs: leadNumber(document.repairs),
    mao: leadNumber(document.mao),
    acquisitionPrice: leadNumber(document.acquisitionPrice),
    estimatedProfit: leadNumber(document.estimatedProfit),
  };
}

type StoredAgentTeam = {
  reports?: AgentReport[];
  readiness?: ReadinessReport;
  ranAt?: number;
};

type RunAgentTeamInput = {
  leadId: string;
  rental?: RentalUnderwritingInput;
  compPrices?: number[];
  repairTier?: "BASE" | "MEDIUM" | "GUT";
};

async function runAgentTeamImpl(
  database: Awaited<ReturnType<typeof getDatabase>>,
  args: RunAgentTeamInput,
) {
  const document = await database.collection(LEADS).findOne({ _id: objectId(args.leadId), fabricated: { $ne: true } });
  if (!document) throw new Error("Lead not found");

  const lead = toAgentLead(document);
  const purchasePrice =
    args.rental?.purchasePrice ??
    leadNumber(document.acquisitionPrice) ??
    leadNumber(document.mao) ??
    0;
  const rentalInput: RentalUnderwritingInput = args.rental ?? { purchasePrice };
  const model = rentalUnderwriting(rentalInput);
  const rentalModel = model.dscr !== undefined || model.annualCashFlow !== undefined
    ? { dscr: model.dscr, annualCashFlow: model.annualCashFlow, monthlyCashFlow: model.monthlyCashFlow }
    : undefined;

  const reports: AgentReport[] = [
    sourcingAgent(lead),
    verificationAgent(lead.dueDiligence),
    arvRepairsAgent({
      squareFeet: lead.squareFeet,
      compPrices: args.compPrices ?? [],
      repairTier: args.repairTier,
    }),
    underwritingAgentFromModel(model),
  ];
  const readiness = readinessReport(reports);
  const ranAt = Date.now();
  await database.collection(LEADS).updateOne(
    { _id: document._id },
    {
      $set: withoutUndefined({
        agentTeam: { reports, readiness, ranAt },
        rentalModel: rentalModel ?? undefined,
        readinessStatus: readiness.status,
        updatedAt: ranAt,
      }),
    },
  );
  return { leadId: args.leadId, reports, readiness, rentalModel };
}

export const runAgentTeam = action({
  args: {
    leadId: v.string(),
    rental: v.optional(rentalUnderwritingInputValidator),
    compPrices: v.optional(v.array(v.number())),
    repairTier: v.optional(repairTierValidator),
    autoData: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    let rental = args.rental;
    let compPrices = args.compPrices;
    let source: { provider: "rentcast"; address: string; propertyId?: string; compsUsed: number; rentEstimate?: number } | undefined;
    // autoData: when the owner supplies no rental/comp inputs, pull real
    // market data (SF, rent, property tax, sold comps) from RentCast so the
    // readiness gate is evaluated on real data instead of surfacing gaps that
    // an official source can already fill. Best-effort: any RentCast failure
    // falls back to the explicit inputs and the gate flags what remains.
    if (args.autoData === true && rental === undefined && (!compPrices || compPrices.length === 0)) {
      const document = await database.collection(LEADS).findOne({ _id: objectId(args.leadId), fabricated: { $ne: true } });
      if (document) {
        try {
          const built = await rentcastInputsForLead(database, document);
          if (built) {
            rental = built.rental;
            compPrices = built.compPrices;
            source = { provider: "rentcast" as const, address: built.data.address, propertyId: built.data.property?.id, compsUsed: built.compPrices.length, rentEstimate: built.data.rentEstimate?.rent };
          }
        } catch {
          // RentCast unconfigured, no match, or quota exhausted: fall back to
          // the owner's explicit inputs; the readiness gate flags the gaps.
        }
      }
    }
    const team = await runAgentTeamImpl(database, { leadId: args.leadId, rental, compPrices, repairTier: args.repairTier });
    return source ? { ...team, source } : team;
  },
});

// Shared: builds the rental/comp inputs for a lead from its RentCast data and
// persists the sourced attributes (square footage, year built) to the lead.
// Returns null when no property record matches so callers decide how to react.
async function rentcastInputsForLead(
  database: Awaited<ReturnType<typeof getDatabase>>,
  document: Document,
  options?: { radius?: number; saleDateRange?: number },
): Promise<{ data: Awaited<ReturnType<typeof rentcastFetchImpl>>; rental: RentalUnderwritingInput; compPrices: number[] } | null> {
  const address = [document.propertyAddress, document.city, document.state, document.zip]
    .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
    .join(", ");
  const data = await rentcastFetchImpl({ address, radius: options?.radius, saleDateRange: options?.saleDateRange });
  if (!data.property) return null;
  const purchasePrice = leadNumber(document.acquisitionPrice) ?? leadNumber(document.mao) ?? 0;
  const squareFeet = data.property.squareFootage;
  const rentComps = data.rentEstimate?.rent ? [data.rentEstimate.rent] : [];
  const annualPropertyTax = data.summary.annualPropertyTax;
  const rental = {
    purchasePrice,
    rentComps,
    squareFeet,
    annualPropertyTax,
    loanToValuePct: 75,
    interestRatePct: 6.5,
    loanTermYears: 30,
  } as RentalUnderwritingInput;
  const compPrices = data.comps.soldPrices;
  await database.collection(LEADS).updateOne(
    { _id: document._id },
    { $set: withoutUndefined({ squareFeet, yearBuilt: data.property.yearBuilt, updatedAt: Date.now() }) },
  );
  return { data, rental, compPrices };
}

export const getAgentTeam = action({
  args: { leadId: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const document = await (await getDatabase()).collection(LEADS).findOne({ _id: objectId(args.leadId), fabricated: { $ne: true } });
    if (!document) throw new Error("Lead not found");
    const stored = document.agentTeam as StoredAgentTeam | undefined;
    return { leadId: args.leadId, agentTeam: stored ?? null };
  },
});

export const runBuyerMatches = action({
  args: {
    leadId: v.string(),
    minScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const document = await database.collection(LEADS).findOne({ _id: objectId(args.leadId), fabricated: { $ne: true } });
    if (!document) throw new Error("Lead not found");

    const rentalModel = document.rentalModel as { dscr?: number; annualCashFlow?: number; monthlyCashFlow?: number } | undefined;
    const leadForScoring = {
      city: leadText(document.city) ?? "",
      county: leadText(document.county) ?? "",
      state: leadText(document.state) ?? "",
      mao: leadNumber(document.mao),
      arv: leadNumber(document.arv),
      acquisitionPrice: leadNumber(document.acquisitionPrice),
      estimatedProfit: leadNumber(document.estimatedProfit),
      rentalModel,
    };

    const buyerDocuments = await database.collection(BUYERS).find({ intakeStatus: "APPROVED" }).limit(500).toArray();
    const buyerLikes: BuyerLike[] = buyerDocuments.map((buyer) => {
      const exitType = buyer.exitType;
      return {
        _id: String(buyer._id),
        budgetMin: leadNumber(buyer.budgetMin) ?? 0,
        budgetMax: leadNumber(buyer.budgetMax) ?? 0,
        targetAreas: Array.isArray(buyer.targetAreas) ? buyer.targetAreas.map((area: unknown) => String(area)) : [],
        exitType: exitType === "BUY_HOLD" || exitType === "FLIP" || exitType === "ASSIGN" ? exitType : "ASSIGN",
        proofOfFundsStatus: buyer.proofOfFundsStatus === "VERIFIED" || buyer.proofOfFundsStatus === "SELF_REPORTED" ? buyer.proofOfFundsStatus : "NONE",
      };
    });

    const scored = buyerMatchingAgent(leadForScoring, buyerLikes, args.minScore ?? 55);
    const matches: ScoredBuyerMatch[] = scored.matches;
    return {
      leadId: args.leadId,
      matches,
      skipped: scored.skipped,
      buyersScored: buyerLikes.length,
    };
  },
});

type PipelineBriefEntry = {
  _id: string;
  propertyAddress: string;
  city: string;
  state: string;
  sourceType: string;
  pipelineStatus: string;
  verificationStatus: string;
  readinessStatus: string;
  ready: boolean;
  gapCount: number;
  ranAt?: number;
};

async function listPipelineBriefImpl(database: Awaited<ReturnType<typeof getDatabase>>) {
  const documents = await database.collection(LEADS)
    .find({ fabricated: { $ne: true } })
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray();
  const leads: PipelineBriefEntry[] = documents.map((document) => {
    const lead = toAgentLead(document);
    const team = document.agentTeam as StoredAgentTeam | undefined;
    const gaps = team?.readiness?.gaps ?? team?.reports?.flatMap((report) => report.dataGaps) ?? [];
    return {
      _id: String(document._id),
      propertyAddress: lead.propertyAddress ?? "",
      city: lead.city ?? "",
      state: lead.state ?? "",
      sourceType: lead.sourceType ?? "",
      pipelineStatus: leadText(document.pipelineStatus) ?? "SOURCED",
      verificationStatus: leadText(document.verificationStatus) ?? "UNVERIFIED",
      readinessStatus: leadText(document.readinessStatus) ?? "NOT_RUN",
      ready: team?.readiness?.ready ?? false,
      gapCount: gaps.filter((gap) => gap.blocksReady).length,
      ranAt: team?.ranAt ?? undefined,
    };
  });
  const readyCount = leads.filter((lead) => lead.ready).length;
  return {
    total: leads.length,
    readyCount,
    incompleteCount: leads.length - readyCount,
    notRunCount: leads.filter((lead) => lead.readinessStatus === "NOT_RUN").length,
    leads,
  };
}

export const listPipelineBrief = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    return listPipelineBriefImpl(await getDatabase());
  },
});

// MCP-facing bridges for the agent team. They re-run the shared impls instead
// of delegating to the public actions because the MCP route authenticates with
// the server secret — there is no Convex user session, so the owner check on
// the public actions would always reject. The same requireMcpAiAccess gate used
// by the other MCP bridges applies.

export const mcpRunAgentTeam = internalAction({
  args: {
    leadId: v.string(),
    rental: v.optional(rentalUnderwritingInputValidator),
    compPrices: v.optional(v.array(v.number())),
    repairTier: v.optional(repairTierValidator),
  },
  handler: async (_, args) => {
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    return runAgentTeamImpl(database, args);
  },
});

export const mcpListPipelineBrief = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (_, args) => {
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 200)));
    const brief = await listPipelineBriefImpl(database);
    return { ...brief, leads: brief.leads.slice(0, limit) };
  },
});

function calculateEstimatedProfit(value: { mao?: unknown; acquisitionPrice?: unknown } | Record<string, unknown>) {
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

function assertAuctionComSourceUrl(parsed: URL, sourceType: string) {
  if (sourceType !== "AUCTION_COM") return;
  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== "auction.com" && !hostname.endsWith(".auction.com")) {
    throw new Error("Auction.com sources must use a public auction.com URL");
  }
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
  const repairs = repairEstimate(args.squareFeet, args.repairTier, args.yearBuilt);
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

type DueDiligenceEntry = {
  status: "UNCHECKED" | "FOUND" | "MISSING";
  sourceUrl?: string;
  sourceDate?: string;
  summary?: string;
  data?: unknown;
  checkedAt?: number;
};
type DueDiligenceRecord = {
  titleAndLiens: DueDiligenceEntry;
  saleHistory: DueDiligenceEntry;
  condition: DueDiligenceEntry;
  occupancy: DueDiligenceEntry;
  lastAssessedAt?: number;
};

const DUE_DILIGENCE_KEYS = {
  TITLE_AND_LIENS: "titleAndLiens",
  SALE_HISTORY: "saleHistory",
  CONDITION: "condition",
  OCCUPANCY: "occupancy",
} as const;

const DUE_DILIGENCE_CATEGORIES: Array<{ key: keyof typeof DUE_DILIGENCE_KEYS; label: string }> = [
  { key: "TITLE_AND_LIENS", label: "Title status & liens" },
  { key: "SALE_HISTORY", label: "Sale history & comparables" },
  { key: "CONDITION", label: "Property condition" },
  { key: "OCCUPANCY", label: "Occupancy status" },
];

function emptyDueDiligenceEntry(): DueDiligenceEntry {
  return { status: "UNCHECKED" };
}

function emptyDueDiligence(): DueDiligenceRecord {
  return {
    titleAndLiens: emptyDueDiligenceEntry(),
    saleHistory: emptyDueDiligenceEntry(),
    condition: emptyDueDiligenceEntry(),
    occupancy: emptyDueDiligenceEntry(),
  };
}

function dueDiligenceSummary(record: DueDiligenceRecord | undefined) {
  const missing: string[] = [];
  const found: string[] = [];
  for (const category of DUE_DILIGENCE_CATEGORIES) {
    const entry = record?.[DUE_DILIGENCE_KEYS[category.key]] as DueDiligenceEntry | undefined;
    if (entry?.status === "FOUND") found.push(category.label);
    else missing.push(category.label);
  }
  return { found, missing, complete: missing.length === 0 };
}

// Honest automated assessment: derive FOUND/MISSING flags only from evidence the
// lead already carries (its source packet). It never claims to have browsed the
// county assessor, Zillow, Redfin, or Realtor.com. Absent evidence is recorded
// as MISSING with the exact source the owner should check.
function assessDueDiligenceRecord(input: {
  sourceType: string;
  sourceUrl: string;
  sourceRef?: string;
  evidenceText?: string;
}): DueDiligenceRecord {
  const text = (input.evidenceText ?? "").toLowerCase();
  const sourceDate = new Date().toISOString().slice(0, 10);
  const checkedAt = Date.now();
  const evidenceEntry = (summary: string): DueDiligenceEntry => ({
    status: "FOUND",
    sourceUrl: input.sourceUrl,
    sourceDate,
    summary,
    checkedAt,
  });
  const missingEntry = (summary: string): DueDiligenceEntry => ({
    status: "MISSING",
    summary,
    checkedAt,
  });

  const saleSource = input.sourceType === "AUCTION_COM" || input.sourceType === "SHERIFF_SALE" || input.sourceType === "TAX_SALE";
  const titleEvidence =
    input.sourceType === "SHERIFF_SALE" || input.sourceType === "TAX_SALE"
      ? true
      : /\b(tax|lien|judgment|foreclos|sheriff|deed|title|mortgage|default|delinquent)\b/.test(text);
  const saleEvidence = /\$\s?\d|(?:opening bid|list price|sale price|market value|estimated value|sold for|comparable|recent sale|last sold)\b/.test(text);
  const compCount = (text.match(/\$\s?\d{3,}/g) ?? []).length;
  const conditionEvidence = /\b(condition|bedroom|bathroom|square feet|sq ft|renovat|repair|damage|inspection|year built|photos?|exterior|interior)\b/.test(text);
  const occupancyEvidence = /\b(vacant|occupied|tenant|renter|owner[- ]occupied|personal use|foreclosure status)\b/.test(text);

  const titleAndLiens = titleEvidence
    ? evidenceEntry("Source record documents the property's foreclosure/tax/lien status. Owner should confirm current ownership and recorded liens on the county assessor and recorder or clerk's website.")
    : missingEntry("No title, tax, or lien evidence in the source packet. Check the county assessor and county recorder/clerk website for current ownership, tax status, and recorded liens.");
  const saleHistory = saleEvidence
    ? evidenceEntry(`Price history or listing value found in the source packet (${compCount} price mention${compCount === 1 ? "" : "s"}). Owner should confirm 3-5 recent comparable sales nearby on Zillow, Redfin, or Realtor.com before using the ARV.`)
    : saleSource
      ? evidenceEntry("Auction/sale source carries an opening bid or sale record; owner should still confirm 3-5 comparable recent sales nearby before relying on ARV.")
      : missingEntry("No sale price or comparable evidence in the source packet. Pull the property's past sale prices and 3-5 recent comparable sales nearby from Zillow, Redfin, or Realtor.com.");
  const condition = conditionEvidence
    ? evidenceEntry("Condition evidence (description, size, photos, or age) appears in the source packet. Owner should confirm from listing photos or an inspection report.")
    : missingEntry("No condition evidence in the source packet. Check listing photos, descriptions, or inspection/condition reports; if none exist, keep condition flagged as unknown.");
  const occupancy = occupancyEvidence
    ? evidenceEntry("Occupancy evidence appears in the source packet. Owner should confirm whether the property is vacant, owner-occupied, or tenant-occupied.")
    : missingEntry("No occupancy evidence in the source packet. Check the listing description or public records for vacant, owner-occupied, or tenant-occupied status.");

  return {
    titleAndLiens,
    saleHistory,
    condition,
    occupancy,
    lastAssessedAt: checkedAt,
  };
}

export const healthCheck = action({
  args: {},
  handler: async (ctx): Promise<MongoHealthResult> => {
    await requireOwner(ctx);
    const envUri = process.env.MONGODB_URI;
    const storedUri = await getStoredMongoUri(ctx);
    const fallbackConfigured = Boolean(storedUri);
    const fallbackHost = storedUri ? maskUriHost(storedUri) : null;

    // Prefer the env var, but if it is missing or credential-less (the Atlas
    // SQL endpoint), use the owner-saved fallback instead. Cache whichever we
    // resolve so every Mongo action shares one effective connection.
    let candidate: string | null = null;
    if (envUri && uriHasCredentials(envUri)) candidate = envUri;
    else if (storedUri) candidate = storedUri;
    else if (envUri) candidate = envUri;
    if (candidate) cachedMongoUri = candidate;

    if (!candidate) {
      return {
        configured: false,
        connected: false,
        status: "MONGODB_URI is not configured",
        fallbackConfigured,
        fallbackHost,
        usingFallback: false,
      };
    }

    try {
      const database = await getDatabase();
      await database.command({ ping: 1 });
      return {
        configured: true,
        connected: true,
        status: "Connected successfully",
        fallbackConfigured,
        fallbackHost,
        usingFallback: candidate === storedUri,
      };
    } catch (error) {
      console.error("MongoDB Atlas health check failed", error);
      return {
        configured: true,
        connected: false,
        status: "Connection failed",
        fallbackConfigured,
        fallbackHost,
        usingFallback: false,
      };
    }
  },
});

export const setMongoUriFallback = action({
  args: { uri: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; host: string | null }> => {
    await requireOwner(ctx);
    const uri = args.uri.trim();
    if (!/^mongodb(\+srv)?:\/\//.test(uri)) {
      throw new Error("Not a valid MongoDB connection string (must start with mongodb:// or mongodb+srv://)");
    }

    // Validate by actually connecting before persisting anything.
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    try {
      await client.connect();
      await client.db().command({ ping: 1 });
    } catch (error) {
      throw new Error(`Connection test failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await client.close();
    }

    cachedMongoUri = uri;
    await ctx.runMutation(internal.settings.upsert, { key: MONGO_URI_SETTING_KEY, value: uri });
    return { ok: true, host: maskUriHost(uri) };
  },
});

export const clearMongoUriFallback = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    await ctx.runMutation(internal.settings.remove, { key: MONGO_URI_SETTING_KEY });
    cachedMongoUri = process.env.MONGODB_URI ?? null;
    clientPromise = null; // force a fresh connection against the new effective URI
    return { ok: true };
  },
});

export const smokeTest = action({
  // @codebuff-probe4
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
          name: "queue_source",
          enabled: aiEnabled && scraperEnabled,
          description: "Send a public source URL into the same pending automation queue used by the website and n8n; never approves a lead.",
          permission: "owner-service",
          input: { url: "string (public http or https)", sourceType: "source type", idempotencyKey: "optional string" },
        },
        {
          name: "list_pipeline",
          enabled: aiEnabled,
          description: "Read non-fabricated sourced and approved leads with source evidence and underwriting fields.",
          permission: "owner-service",
          input: { pipelineStatus: "optional pipeline status", minDistressScore: "optional number", limit: "optional number" },
        },
        {
          name: "list_staged_sources",
          enabled: aiEnabled && scraperEnabled,
          description: "Read bounded staged evidence and consultant-court results from the website queue.",
          permission: "owner-service",
          input: { status: "optional staging status", limit: "optional number" },
        },
        {
          name: "list_buyer_buy_boxes",
          enabled: aiEnabled,
          description: "Read approved verified buy-box constraints without returning buyer contact information.",
          permission: "owner-service",
          input: { limit: "optional number" },
        },
        {
          name: "list_match_board",
          enabled: aiEnabled,
          description: "Read match scores, confidence, status, and summaries without buyer contact information.",
          permission: "owner-service",
          input: { status: "optional match status", confidence: "optional confidence", limit: "optional number" },
        },
        {
          name: "scrape_source",
          enabled: aiEnabled && scraperEnabled,
          description: "Fetch a public source URL, return a bounded evidence preview, and stage probate, auction, or off-market evidence for owner review. Never creates or invents PII.",
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
        {
          name: "consultant_court",
          enabled: aiEnabled && scraperEnabled,
          description: "Run an evidence-only court with evidence, underwriting, and risk consultants plus a judge. Returns a recommendation; owner approval remains required.",
          permission: "owner",
          input: { stagedId: "string" },
        },
        {
          name: "run_agent_team",
          enabled: aiEnabled,
          description: "Run the sourcing, verification, rental underwriting, and ARV/repairs agents over one lead and return the aggregated readiness gate with every blocking data gap. Recommendations only; owner approval remains required.",
          permission: "owner-service",
          input: { leadId: "string", rental: "optional rental underwriting inputs", compPrices: "optional number[]", repairTier: "optional BASE | MEDIUM | GUT" },
        },
        {
          name: "list_pipeline_brief",
          enabled: aiEnabled,
          description: "Read the readiness gate across every eligible lead: which deals are ready and which are blocked by specific missing underwriting data.",
          permission: "owner-service",
          input: { limit: "optional number" },
        },
        {
          name: "scrapegraph_extract",
          enabled: aiEnabled && scraperEnabled,
          description: "Extract structured property facts from a public source URL with ScrapeGraphAI and stage them as bounded evidence for owner review. Never creates or invents PII and never approves a lead.",
          permission: "owner-service",
          input: { url: "string (public http or https)", sourceType: "source type", prompt: "string (10-2000 chars)", schema: "optional JSON-Schema object" },
        },
        {
          name: "sitemap_discover",
          enabled: aiEnabled && scraperEnabled,
          description: "Expand one public portal seed URL into a bounded batch of real listing URLs via its robots.txt sitemap refs and standard sitemap locations, then stage each page for owner review. Never invents data and never approves a lead.",
          permission: "owner-service",
          input: { url: "string (public http or https)", sourceType: "source type", maxUrls: "optional number (1-200)" },
        },
        {
          name: "property_data",
          enabled: aiEnabled,
          description: "Fetch official property attributes, rent estimate, and sold comparable prices for an address from RentCast to feed ARV and rental underwriting. Read-only; never creates or approves a lead.",
          permission: "owner-service",
          input: { address: "string (full property address)", radius: "optional number (0.5-25 miles)", saleDateRange: "optional number (days)", compsLimit: "optional number (1-50)" },
        },
      ],
    };
  },
});

// ScrapeGraphAI extraction: a second, AI-extraction path into the same
// owner-review staging queue. The extracted JSON is bounded evidence only — it
// never creates PII and never self-qualifies (qualifyStagedSourceImpl still
// requires explicit address, county, reference, and date on the page text).
async function scrapegraphExtractImpl(
  database: Awaited<ReturnType<typeof getDatabase>>,
  args: { url: string; sourceType: string; prompt: string; schema?: Record<string, unknown> },
) {
  const parsedUrl = assertPublicHttpUrl(args.url.trim());
  assertAuctionComSourceUrl(parsedUrl, args.sourceType);
  if (args.sourceType === "SEED" || args.sourceType === "MANUAL") {
    throw new Error("ScrapeGraphAI extraction requires a public, attributable source type");
  }
  const prompt = args.prompt.trim();
  if (prompt.length < 10 || prompt.length > 2000) {
    throw new Error("Extraction prompt must be between 10 and 2000 characters");
  }
  let schema: Record<string, unknown> | undefined;
  if (args.schema !== undefined) {
    if (typeof args.schema !== "object" || Array.isArray(args.schema) || args.schema === null) {
      throw new Error("schema must be a JSON object when provided");
    }
    if (JSON.stringify(args.schema).length > 4000) {
      throw new Error("schema is too large (max 4000 bytes)");
    }
    schema = args.schema;
  }
  const result = await scrapegraphExtract({ url: parsedUrl.toString(), prompt, mode: "normal", schema });
  const jsonText = result.json ? JSON.stringify(result.json) : "";
  const rawText = result.raw ?? "";
  const excerpt = (jsonText || rawText).slice(0, 8000);
  const fetchedAt = new Date().toISOString();
  const staged = await database.collection(IMPORT_STAGING).insertOne({
    sourceType: args.sourceType,
    rawJson: {
      url: parsedUrl.toString(),
      title: parsedUrl.hostname,
      excerpt,
      links: [],
      contentType: "scrapegraph-extract",
      fetchedAt,
      provider: "scrapegraph",
      extraction: { json: result.json, raw: rawText.slice(0, 8000), usage: result.usage, prompt },
    },
    status: "NEW",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return {
    stagedId: String(staged.insertedId),
    provider: "scrapegraph" as const,
    url: parsedUrl.toString(),
    json: result.json,
    usage: result.usage,
    excerpt: excerpt.slice(0, 2000),
    piiCreated: false,
  };
}

export const scrapegraphExtractSource = action({
  args: {
    url: v.string(),
    sourceType: sourceTypeValidator,
    prompt: v.string(),
    schema: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const access = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.scraperEnabled === false) throw new Error("The scraper tool is disabled in Tool access settings");
    return scrapegraphExtractImpl(database, { url: args.url, sourceType: args.sourceType, prompt: args.prompt, schema: args.schema as Record<string, unknown> | undefined });
  },
});

export const mcpScrapegraphExtract = internalAction({
  args: {
    url: v.string(),
    sourceType: sourceTypeValidator,
    prompt: v.string(),
    schema: v.optional(v.any()),
  },
  handler: async (_, args) => {
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    const access = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.scraperEnabled === false) throw new Error("The scraper tool is disabled in Tool access settings");
    return scrapegraphExtractImpl(database, { url: args.url, sourceType: args.sourceType, prompt: args.prompt, schema: args.schema as Record<string, unknown> | undefined });
  },
});

// Sitemap-driven discovery: one seed URL (a portal homepage) expands into a
// bounded batch of real listing URLs via robots.txt sitemap refs and standard
// sitemap locations. Discovery never invents data and never self-qualifies —
// every URL still passes the public-URL gates and the owner-review staging
// queue, exactly like the Firecrawl and ScrapeGraphAI paths.
async function sitemapDiscoverImpl(
  database: Awaited<ReturnType<typeof getDatabase>>,
  args: { urls: string[]; sourceType: string; maxUrls?: number },
) {
  const seeds = Array.from(new Set(args.urls.map((url) => url.trim()).filter(Boolean)));
  if (seeds.length === 0) throw new Error("At least one source URL is required");
  if (seeds.length > 10) throw new Error("You can submit at most 10 starting URLs");
  const parsedSeeds = seeds.map((url) => assertPublicHttpUrl(url));
  parsedSeeds.forEach((url) => assertAuctionComSourceUrl(url, args.sourceType));
  const maxUrls = Math.max(1, Math.min(200, Math.floor(args.maxUrls ?? 60)));

  const fetchWithAppUserAgent: SitemapFetch = async (url) => {
    const response = await fetch(url, {
      headers: { "user-agent": "Groundwork-source-review/1.0 (+public-source-review)" },
      signal: AbortSignal.timeout(15000),
    });
    return response;
  };

  const discovered: Array<{ seed: string; url: string }> = [];
  const sitemapsUsed: string[] = [];
  const errors: Array<{ url: string; error: string }> = [];
  const staged: Array<{ url: string; stagedId: string; qualification: { status: string; reason?: string; leadId?: string } }> = [];
  const stagingFailed: Array<{ url: string; error: string }> = [];
  const seen = new Set<string>();
  let truncated = false;

  for (const seed of parsedSeeds) {
    const budget = maxUrls - seen.size;
    if (budget <= 0) break;
    const result = await discoverSitemapUrls({
      seedUrl: seed.toString(),
      fetchFn: fetchWithAppUserAgent,
      maxSitemaps: 8,
      maxUrls: budget,
    });
    sitemapsUsed.push(...result.sitemapsUsed);
    errors.push(...result.errors);
    truncated = truncated || result.truncated;
    for (const url of result.discovered) {
      if (seen.has(url)) continue;
      seen.add(url);
      discovered.push({ seed: seed.toString(), url });
      try {
        const stagedRecord = await fetchAndStageSource(database, { url, sourceType: args.sourceType });
        const qualification = await qualifyStagedSourceImpl(database, stagedRecord.stagedId);
        staged.push({ url, stagedId: stagedRecord.stagedId, qualification });
      } catch (error) {
        stagingFailed.push({ url, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return {
    provider: "sitemap" as const,
    seeds: parsedSeeds.map((seed) => seed.toString()),
    maxUrls,
    truncated,
    sitemapsUsed,
    discovered,
    staged,
    stagingFailed,
    errors,
  };
}

export const sitemapDiscover = action({
  args: {
    urls: v.array(v.string()),
    sourceType: sourceTypeValidator,
    maxUrls: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const access = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.scraperEnabled === false) throw new Error("The scraper tool is disabled in Tool access settings");
    return sitemapDiscoverImpl(database, { urls: args.urls, sourceType: args.sourceType, maxUrls: args.maxUrls });
  },
});

export const mcpSitemapDiscover = internalAction({
  args: {
    url: v.string(),
    sourceType: sourceTypeValidator,
    maxUrls: v.optional(v.number()),
  },
  handler: async (_, args) => {
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    const access = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.scraperEnabled === false) throw new Error("The scraper tool is disabled in Tool access settings");
    return sitemapDiscoverImpl(database, { urls: [args.url], sourceType: args.sourceType, maxUrls: args.maxUrls });
  },
});

// RentCast property data: official, attributed comps, rent estimates, and
// property attributes that feed the readiness gate with real market data
// instead of manual entry. Read-only from the pipeline's perspective — it
// never creates or approves leads; the underwrite path only persists sourced
// attributes (square footage, year built) plus the agent-team reports.
async function rentcastFetchImpl(args: { address: string; radius?: number; saleDateRange?: number; compsLimit?: number }) {
  const address = args.address.trim();
  if (address.length < 10 || address.length > 300) {
    throw new Error("Enter a full property address (street, city, state)");
  }
  const data = await fetchPropertyData({ address, radius: args.radius, saleDateRange: args.saleDateRange, compsLimit: args.compsLimit });
  return {
    provider: "rentcast" as const,
    address,
    property: data.property,
    rentEstimate: data.rentEstimate,
    comps: data.comps,
    summary: {
      squareFeet: data.property?.squareFootage,
      yearBuilt: data.property?.yearBuilt,
      bedrooms: data.property?.bedrooms,
      bathrooms: data.property?.bathrooms,
      annualPropertyTax: latestAnnualPropertyTax(data.property),
      rentPerMonth: data.rentEstimate?.rent,
      rentRangeLow: data.rentEstimate?.rentRangeLow,
      rentRangeHigh: data.rentEstimate?.rentRangeHigh,
      soldCompsCount: data.comps.soldPrices.length,
      soldComps: data.comps.soldPrices,
    },
  };
}

export const rentcastPropertyData = action({
  args: {
    address: v.string(),
    radius: v.optional(v.number()),
    saleDateRange: v.optional(v.number()),
    compsLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    return rentcastFetchImpl(args);
  },
});

// Runs the agent team with RentCast-sourced attributes, rent, and sold comps
// so the readiness gate is evaluated on real market data. Sourced attributes
// are persisted to the lead (square footage, year built); reports stay
// owner-gated and are recommendations only.
export const rentcastUnderwrite = action({
  args: { leadId: v.string(), radius: v.optional(v.number()), saleDateRange: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const document = await database.collection(LEADS).findOne({ _id: objectId(args.leadId), fabricated: { $ne: true } });
    if (!document) throw new Error("Lead not found");
    const address = [document.propertyAddress, document.city, document.state, document.zip]
      .filter((part): part is string => typeof part === "string" && Boolean(part.trim()))
      .join(", ");
    const data = await rentcastFetchImpl({ address, radius: args.radius, saleDateRange: args.saleDateRange });
    if (!data.property) throw new Error("RentCast could not find a property record for this lead");
    const purchasePrice = leadNumber(document.acquisitionPrice) ?? leadNumber(document.mao) ?? 0;
    const annualPropertyTax = data.summary.annualPropertyTax;
    const squareFeet = data.property.squareFootage;
    const rentComps = data.rentEstimate?.rent ? [data.rentEstimate.rent] : [];
    const compPrices = data.comps.soldPrices;
    const rental = {
      purchasePrice,
      rentComps,
      squareFeet,
      annualPropertyTax,
      loanToValuePct: 75,
      interestRatePct: 6.5,
      loanTermYears: 30,
    } as RentalUnderwritingInput;
    await database.collection(LEADS).updateOne(
      { _id: document._id },
      { $set: withoutUndefined({ squareFeet, yearBuilt: data.property.yearBuilt, updatedAt: Date.now() }) },
    );
    const team = await runAgentTeamImpl(database, { leadId: args.leadId, rental, compPrices, repairTier: "MEDIUM" });
    return {
      ...team,
      source: { provider: "rentcast" as const, address, propertyId: data.property.id, compsUsed: compPrices.length, rentEstimate: data.rentEstimate?.rent },
    };
  },
});

export const mcpRentcastPropertyData = internalAction({
  args: { address: v.string(), radius: v.optional(v.number()), saleDateRange: v.optional(v.number()), compsLimit: v.optional(v.number()) },
  handler: async (_, args) => {
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    return rentcastFetchImpl(args);
  },
});

type ScrapeInput = { url: string; sourceType: string };

// @codebuff-probe5

async function fetchAndStageSource(database: Awaited<ReturnType<typeof getDatabase>>, args: ScrapeInput) {
  const parsedUrl = assertPublicHttpUrl(args.url.trim());
  assertAuctionComSourceUrl(parsedUrl, args.sourceType);
  const response = await fetch(parsedUrl, { headers: { "user-agent": "Groundwork-source-review/1.0 (+public-source-review)" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error(`Source declined automated access (HTTP ${response.status}); no login, CAPTCHA, or rate-limit bypass is attempted`);
    }
    throw new Error(`Source returned HTTP ${response.status}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/") && !contentType.includes("json") && !contentType.includes("xml")) {
    throw new Error("This scraper currently supports text, HTML, XML, and JSON sources");
  }
  const body = (await response.text()).slice(0, 1_000_000);
  let title = decodeHtml(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? parsedUrl.hostname);
  let evidenceText = htmlToText(body).slice(0, 8000);
  let stagedContentType = contentType;

  // Some portals (e.g. auction.com behind Incapsula) answer 200 with a JS
  // challenge shell that carries almost no text. When the page is effectively
  // empty, re-render it through the Firecrawl fallback so the staged evidence
  // contains the listing facts instead of the challenge stub. If Firecrawl is
  // unconfigured or fails, the original evidence is kept — staging never
  // fabricates and never blocks on the fallback.
  if (evidenceText.trim().length < 200) {
    try {
      const scraped = await firecrawlRequest<FirecrawlScrapeResponse>("/scrape", {
        url: parsedUrl.toString(),
        formats: ["markdown"],
        onlyMainContent: true,
        removeBase64Images: true,
      });
      const markdown = scraped.data?.markdown ?? "";
      if (markdown.trim().length >= 200) {
        evidenceText = markdown.slice(0, 8000);
        stagedContentType = "firecrawl-markdown";
        if (scraped.data?.metadata?.title) title = scraped.data.metadata.title;
      }
    } catch {
      // Fallback unavailable (missing FIRECRAWL_API_KEY, quota, or failure):
      // keep the plain evidence; the qualification gate rejects it safely.
    }
  }

  const excerpt = evidenceText.slice(0, 2000);
  const links = [...body.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)].map((match) => match[1]).filter(Boolean).slice(0, 20);
  const fetchedAt = new Date().toISOString();
  const staged = await database.collection(IMPORT_STAGING).insertOne({
    sourceType: args.sourceType,
    rawJson: {
      url: parsedUrl.toString(),
      title,
      excerpt: evidenceText,
      links,
      contentType: stagedContentType,
      fetchedAt,
      ...(stagedContentType === "firecrawl-markdown" ? { provider: "firecrawl-render" } : {}),
    },
    status: "NEW",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  return { stagedId: String(staged.insertedId), url: parsedUrl.toString(), title, excerpt, links, contentType: stagedContentType, fetchedAt, piiCreated: false };
}

type SourcedCandidate = {
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  sourceType: string;
  sourceUrl: string;
  sourceRef: string;
  sourceDate: string;
  distressScore: number;
  distressSignals: Array<{
    type: string;
    weight: number;
    evidence: string;
    verified: boolean;
    sourceUrl: string;
    sourceDate: string;
  }>;
};

function normalizeSourceDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function extractSourcedCandidate(staged: Document): SourcedCandidate | { reason: string } {
  const sourceType = typeof staged.sourceType === "string" ? staged.sourceType : "";
  const raw = staged.rawJson && typeof staged.rawJson === "object" ? staged.rawJson as Record<string, unknown> : {};
  const sourceUrl = typeof raw.url === "string" ? raw.url : "";
  const excerpt = typeof raw.excerpt === "string" ? raw.excerpt : "";
  const text = excerpt.replace(/\s+/g, " ").trim();
  const addressMatch = text.match(/\b\d{1,6}\s+[A-Za-z0-9.'#-]+(?:\s+[A-Za-z0-9.'#-]+){0,8}\s+(?:ST|STREET|AVE|AVENUE|RD|ROAD|DR|DRIVE|LN|LANE|BLVD|BOULEVARD|CT|COURT|PL|PLACE|WAY|PKWY|PARKWAY)\b(?:\s+(?:APT|UNIT|#)\s*[A-Za-z0-9-]+)?/i);
  const locationMatch = text.match(/([A-Za-z][A-Za-z .'-]{1,40}),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/i);
  const countyMatch = text.match(/\b([A-Za-z][A-Za-z .'-]{1,40})\s+County\b/i);
  const referenceMatch = text.match(/\b(?:case|parcel|sale|docket|reference|ref)\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./-]{2,})/i);
  const auctionListingId = sourceType === "AUCTION_COM" ? sourceUrl.match(/(?:-|\/)(\d{5,})(?:[/?#]|$)/i)?.[1] : undefined;
  const sourceReference = referenceMatch?.[1] ?? auctionListingId;
  const dateMatch = text.match(/\b(20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/]20\d{2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+20\d{2})\b/i);
  const sourceDate = dateMatch ? normalizeSourceDate(dateMatch[1]) : undefined;
  if (!sourceUrl || !sourceType) return { reason: "The staged record is missing its source URL or source type" };
  if (!addressMatch) return { reason: "No explicit property address was found in the source excerpt" };
  if (!locationMatch) return { reason: "No explicit city, state, and ZIP were found in the source excerpt" };
  if (!countyMatch) return { reason: "No explicit county was found in the source excerpt" };
  if (!sourceReference) return { reason: "No explicit case, parcel, sale, docket, reference number, or Auction.com listing ID was found" };
  if (!sourceDate) return { reason: "No explicit sale or record date was found in the source excerpt" };

  const signal = sourceType === "TAX_SALE"
    ? { type: "TAX_DELINQUENT", weight: 25 }
    : sourceType === "PROBATE"
      ? { type: "INHERITED", weight: 15 }
      : sourceType === "SHERIFF_SALE"
        ? { type: "PRE_FORECLOSURE", weight: 30 }
        : sourceType === "AUCTION_COM"
          ? { type: "AUCTION_LISTING", weight: 15 }
          : sourceType === "OFF_MARKET"
            ? { type: "OFF_MARKET_REFERRAL", weight: 10 }
            : { type: "PUBLIC_RECORD_DISTRESS", weight: 15 };
  return {
    propertyAddress: addressMatch[0].trim(),
    city: locationMatch[1].trim(),
    state: locationMatch[2].toUpperCase(),
    zip: locationMatch[3],
    county: countyMatch[1].trim(),
    sourceType,
    sourceUrl,
    sourceRef: sourceReference,
    sourceDate,
    distressScore: signal.weight,
    distressSignals: [{
      ...signal,
      evidence: `Candidate extracted from the official ${sourceType.replace(/_/g, " ").toLowerCase()} source. Owner must confirm this distress fact before approval.`,
      verified: false,
      sourceUrl,
      sourceDate,
    }],
  };
}

async function qualifyStagedSourceImpl(database: Awaited<ReturnType<typeof getDatabase>>, stagedId: string) {
  const stagingId = objectId(stagedId);
  const staging = await database.collection(IMPORT_STAGING).findOne({ _id: stagingId });
  if (!staging) throw new Error("Staged source not found");
  if (staging.status !== "NEW") return { status: "SKIPPED" as const, stagedId, reason: "This staged source was already processed" };

  const candidate = extractSourcedCandidate(staging);
  if ("reason" in candidate) {
    await database.collection(IMPORT_STAGING).updateOne({ _id: stagingId }, { $set: { status: "REJECTED", rejectReason: candidate.reason, updatedAt: Date.now() } });
    return { status: "REJECTED" as const, stagedId, reason: candidate.reason };
  }

  const duplicateFilter = candidate.sourceRef
    ? { $or: [{ parcelId: candidate.sourceRef }, { sourceType: candidate.sourceType, sourceUrl: candidate.sourceUrl, sourceRef: candidate.sourceRef }] }
    : { sourceType: candidate.sourceType, sourceUrl: candidate.sourceUrl, sourceRef: candidate.sourceRef };
  const duplicate = await database.collection(LEADS).findOne({ ...duplicateFilter, fabricated: { $ne: true } });
  if (duplicate) {
    await database.collection(IMPORT_STAGING).updateOne({ _id: stagingId }, { $set: { status: "DUPLICATE", rejectReason: "A non-fabricated lead with the same parcel or source reference already exists", updatedAt: Date.now() } });
    return { status: "DUPLICATE" as const, stagedId, reason: "A matching lead already exists" };
  }

  const now = Date.now();
  const stagedRaw = staging.rawJson && typeof staging.rawJson === "object" ? staging.rawJson as { excerpt?: unknown } : {};
  const stagedExcerpt = typeof stagedRaw.excerpt === "string" ? stagedRaw.excerpt : undefined;
  const lead = {
    ...candidate,
    ...(staging.aiCourtVerdict ? { aiCourtVerdict: staging.aiCourtVerdict } : {}),
    dueDiligence: assessDueDiligenceRecord({
      sourceType: candidate.sourceType,
      sourceUrl: candidate.sourceUrl,
      sourceRef: candidate.sourceRef,
      evidenceText: stagedExcerpt,
    }),
    verificationStatus: "UNVERIFIED",
    pipelineStatus: "SOURCED",
    absenteeOwner: false,
    needsSkipTrace: true,
    listedPhone: false,
    fabricated: false,
    stagingId,
    createdAt: now,
    updatedAt: now,
  };
  const inserted = await database.collection(LEADS).insertOne(lead);
  await database.collection(IMPORT_STAGING).updateOne({ _id: stagingId }, { $set: { status: "NEW", candidateLeadId: inserted.insertedId, updatedAt: now } });
  return { status: "CANDIDATE_CREATED" as const, stagedId, leadId: String(inserted.insertedId), distressScore: candidate.distressScore };
}

export const qualifyStagedSource = action({
  args: { stagedId: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    return qualifyStagedSourceImpl(await getDatabase(), args.stagedId);
  },
});

export const runConsultantCourt = action({
  // @probeA
  args: { stagedId: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const stagingId = objectId(args.stagedId);
    const staging = await database.collection(IMPORT_STAGING).findOne({ _id: stagingId });
    if (!staging) throw new Error("Staged source not found");
    const raw = staging.rawJson && typeof staging.rawJson === "object" ? staging.rawJson as Record<string, unknown> : {};
    const verdict = await runAiConsultantCourt({
      url: typeof raw.url === "string" ? raw.url : "",
      title: typeof raw.title === "string" ? raw.title : "Sourced deal",
      excerpt: typeof raw.excerpt === "string" ? raw.excerpt : "",
    });
    await database.collection(IMPORT_STAGING).updateOne({ _id: stagingId }, { $set: { aiCourtVerdict: verdict, updatedAt: Date.now() } });
    if (staging.candidateLeadId) {
      await database.collection(LEADS).updateOne({ _id: staging.candidateLeadId }, { $set: { aiCourtVerdict: verdict, updatedAt: Date.now() } });
    }
    return verdict;
  },
});

export const updateDueDiligence = action({
  // @probeB
  args: {
    id: v.string(),
    category: dueDiligenceCategoryValidator,
    patch: dueDiligenceEntryValidator,
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const lead = await database.collection(LEADS).findOne({ _id: objectId(args.id), fabricated: { $ne: true } });
    if (!lead) throw new Error("Lead not found");
    if (args.patch.status === "FOUND" && !args.patch.sourceUrl?.trim()) {
      throw new Error("A found due-diligence category requires a source URL");
    }
    const key = DUE_DILIGENCE_KEYS[args.category];
    const current = lead.dueDiligence && typeof lead.dueDiligence === "object"
      ? lead.dueDiligence as DueDiligenceRecord
      : emptyDueDiligence();
    const entry: DueDiligenceEntry = {
      ...(current[key] ?? {}),
      ...withoutUndefined({ ...args.patch, checkedAt: Date.now() }),
    };
    const next: DueDiligenceRecord = { ...current, [key]: entry, lastAssessedAt: Date.now() };
    await database.collection(LEADS).updateOne({ _id: lead._id }, { $set: { dueDiligence: next, updatedAt: Date.now() } });
    return { id: args.id, category: args.category, dueDiligence: next };
  },
});

export const assessDueDiligence = action({
  // @probeC
  args: { id: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const lead = await database.collection(LEADS).findOne({ _id: objectId(args.id), fabricated: { $ne: true } });
    if (!lead) throw new Error("Lead not found");
    const staging = lead.stagingId ? await database.collection(IMPORT_STAGING).findOne({ _id: objectId(String(lead.stagingId)) }) : null;
    const stagedRaw = staging?.rawJson && typeof staging.rawJson === "object" ? staging.rawJson as { excerpt?: unknown } : {};
    const record = assessDueDiligenceRecord({
      sourceType: String(lead.sourceType ?? ""),
      sourceUrl: String(lead.sourceUrl ?? ""),
      sourceRef: typeof lead.sourceRef === "string" ? lead.sourceRef : undefined,
      evidenceText: typeof stagedRaw.excerpt === "string" ? stagedRaw.excerpt : undefined,
    });
    await database.collection(LEADS).updateOne({ _id: lead._id }, { $set: { dueDiligence: record, updatedAt: Date.now() } });
    return { id: args.id, dueDiligence: record };
  },
});

export const approveLead = action({
  // @codebuff-probe6
  args: { id: v.string(), ownerConfirmation: v.literal("OWNER_REVIEWED_SOURCE") },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const existing = await database.collection(LEADS).findOne({ _id: objectId(args.id), fabricated: { $ne: true } });
    if (!existing) throw new Error("Lead candidate not found");
    if (existing.pipelineStatus !== "SOURCED" && existing.pipelineStatus !== "CRITIQUED") throw new Error("Only sourced candidates can be approved");
    if (!existing.aiCourtVerdict || existing.aiCourtVerdict.status !== "COMPLETED") {
      throw new Error("Run the AI consultant court before approving this candidate");
    }
    const signals = Array.isArray(existing.distressSignals) ? existing.distressSignals.map((signal) => ({ ...signal, verified: true })) : [];
    const next = { ...existing, distressSignals: signals, verificationStatus: "VERIFIED", pipelineStatus: "APPROVED" } as unknown as {
      sourceType: string;
      sourceUrl: string;
      sourceRef: string;
      sourceDate: string;
      distressScore: number;
      distressSignals: Array<{ evidence: string; verified: boolean; sourceUrl: string; sourceDate: string }>;
      verificationStatus: string;
      pipelineStatus: string;
    };
    validateApprovedLead(next);
    await database.collection(LEADS).updateOne({ _id: existing._id }, { $set: { distressSignals: signals, verificationStatus: "VERIFIED", pipelineStatus: "APPROVED", lastVerifiedAt: Date.now(), updatedAt: Date.now() } });
    return { id: args.id, status: "APPROVED" as const };
  },
});

export const rejectLead = action({
  // @codebuff-probe8
  args: { id: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    if (!args.reason.trim()) throw new Error("A rejection reason is required");
    const result = await (await getDatabase()).collection(LEADS).updateOne({ _id: objectId(args.id), fabricated: { $ne: true }, pipelineStatus: { $in: ["SOURCED", "CRITIQUED"] } }, { $set: { pipelineStatus: "REJECTED", rejectionReason: args.reason.trim(), updatedAt: Date.now() } });
    if (result.matchedCount !== 1) throw new Error("Lead candidate not found");
    return { id: args.id, status: "REJECTED" as const };
  },
});

/**
 * Persist Camofox evidence and run the existing strict qualification checks.
 * This can create only a SOURCED candidate; it never approves a lead.
 */
export const stageCamofoxEvidence = action({
  args: {
    url: v.string(),
    sourceType: sourceTypeValidator,
    title: v.optional(v.string()),
    excerpt: v.string(),
    links: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const access = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.scraperEnabled === false) throw new Error("The scraper tool is disabled in Tool access settings");
    const parsedUrl = assertPublicHttpUrl(args.url.trim());
    assertAuctionComSourceUrl(parsedUrl, args.sourceType);
    const fetchedAt = new Date().toISOString();
    const staged = await database.collection(IMPORT_STAGING).insertOne({
      sourceType: args.sourceType,
      rawJson: {
        url: parsedUrl.toString(),
        title: args.title?.trim().slice(0, 300) || parsedUrl.hostname,
        excerpt: args.excerpt.slice(0, 8000),
        links: (args.links ?? []).slice(0, 100),
        contentType: "camofox-accessibility-snapshot",
        fetchedAt,
      },
      status: "NEW",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const qualification = await qualifyStagedSourceImpl(database, String(staged.insertedId));
    return { stagedId: String(staged.insertedId), url: parsedUrl.toString(), fetchedAt, qualification };
  },
});

type FirecrawlMapResponse = {
  success?: boolean;
  links?: string[];
  error?: string;
};

type FirecrawlScrapeResponse = {
  success?: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      sourceURL?: string;
    };
  };
  error?: string;
};

function firecrawlApiKey() {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) {
    throw new Error("FIRECRAWL_API_KEY is not configured on the Convex deployment");
  }
  return key;
}

async function firecrawlRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://api.firecrawl.dev/v1${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${firecrawlApiKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => null)) as T | { error?: unknown } | null;
  if (!response.ok) {
    const detail = payload && typeof payload === "object" && "error" in payload
      ? String(payload.error)
      : response.statusText;
    throw new Error(`Firecrawl ${path} failed (${response.status}): ${detail}`);
  }
  return payload as T;
}

function samePublicSite(url: string, seedSites: Set<string>) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return seedSites.has(hostname);
  } catch {
    return false;
  }
}

/**
 * Firecrawl fallback for public domain research when the browser provider
 * cannot create a tab. It maps the supplied site first, then scrapes a small
 * bounded batch and stages each page for the same owner review workflow.
 */
export const firecrawlCrawl = action({
  args: {
    urls: v.array(v.string()),
    sourceType: sourceTypeValidator,
    maxPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const access = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.scraperEnabled === false) throw new Error("The scraper tool is disabled in Tool access settings");

    const seeds = Array.from(new Set(args.urls.map((url) => url.trim()).filter(Boolean)));
    if (seeds.length === 0) throw new Error("At least one source URL is required");
    if (seeds.length > 10) throw new Error("You can submit at most 10 Firecrawl starting URLs");
    const parsedSeeds = seeds.map((url) => assertPublicHttpUrl(url));
    parsedSeeds.forEach((url) => assertAuctionComSourceUrl(url, args.sourceType));
    const maxPages = Math.max(1, Math.min(12, Math.floor(args.maxPages ?? 8)));
    const seedSites = new Set(parsedSeeds.map((url) => url.hostname.toLowerCase().replace(/^www\./, "")));
    const discovered = new Set<string>();
    const queue = [...parsedSeeds.map((url) => url.toString())];
    const queued = new Set(queue);
    const failed: Array<{ url: string; error: string }> = [];
    const pages: Array<{
      url: string;
      finalUrl: string;
      snapshot: string;
      truncated: boolean;
      refsCount: number;
      discoveredLinks: string[];
    }> = [];
    const staged: Array<{
      url: string;
      stagedId: string;
      qualification: { status: string; reason?: string; leadId?: string };
    }> = [];
    const stagingFailed: Array<{ url: string; error: string }> = [];

    // Map each seed to discover rendered/public listing URLs without relying
    // on Camofox's tab lifecycle. Firecrawl's map response is discovery only;
    // pages still need to be scraped and staged below.
    for (const seed of parsedSeeds) {
      try {
        const mapped = await firecrawlRequest<FirecrawlMapResponse>("/map", {
          url: seed.toString(),
          limit: Math.min(100, maxPages * 8),
          includeSubdomains: false,
          ignoreQueryParameters: true,
        });
        for (const rawLink of mapped.links ?? []) {
          let link: string;
          try {
            link = new URL(rawLink, seed).toString();
          } catch {
            continue;
          }
          if (!samePublicSite(link, seedSites)) continue;
          const normalized = new URL(link);
          normalized.hash = "";
          const normalizedLink = normalized.toString();
          discovered.add(normalizedLink);
          if (!queued.has(normalizedLink) && queue.length < maxPages * 4) {
            queue.push(normalizedLink);
            queued.add(normalizedLink);
          }
        }
      } catch (error) {
        failed.push({ url: seed.toString(), error: error instanceof Error ? error.message : String(error) });
      }
    }

    while (queue.length > 0 && pages.length + failed.length < maxPages) {
      const url = queue.shift();
      if (!url) break;
      try {
        const scraped = await firecrawlRequest<FirecrawlScrapeResponse>("/scrape", {
          url,
          formats: ["markdown"],
          onlyMainContent: true,
          removeBase64Images: true,
        });
        const finalUrl = scraped.data?.metadata?.sourceURL ?? url;
        const markdown = scraped.data?.markdown ?? "";
        const excerpt = markdown.slice(0, 8_000);
        const links: string[] = [...markdown.matchAll(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/gi)]
          .map((match) => match[1])
          .filter((link): link is string => Boolean(link) && samePublicSite(link, seedSites))
          .slice(0, 100);
        const page = {
          url,
          finalUrl,
          snapshot: excerpt,
          truncated: markdown.length > excerpt.length,
          refsCount: 0,
          discoveredLinks: links,
        };
        pages.push(page);

        try {
          const stagedRecord = await database.collection(IMPORT_STAGING).insertOne({
            sourceType: args.sourceType,
            rawJson: {
              url: finalUrl,
              title: scraped.data?.metadata?.title ?? new URL(finalUrl).hostname,
              excerpt,
              links,
              contentType: "firecrawl-markdown",
              fetchedAt: new Date().toISOString(),
              provider: "firecrawl",
            },
            status: "NEW",
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          const qualification = await qualifyStagedSourceImpl(database, String(stagedRecord.insertedId));
          staged.push({ url: finalUrl, stagedId: String(stagedRecord.insertedId), qualification });
        } catch (error) {
          stagingFailed.push({ url: finalUrl, error: error instanceof Error ? error.message : String(error) });
        }
      } catch (error) {
        failed.push({ url, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return {
      provider: "firecrawl" as const,
      requested: seeds,
      maxPages,
      pages,
      failed,
      discoveredLinks: Array.from(discovered).slice(0, 100),
      queuedButNotVisited: queue.slice(0, 50),
      staged,
      stagingFailed,
    };
  },
});

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

// These internal wrappers are reachable only through the authenticated MCP HTTP route.
// They intentionally do not expose MongoDB or any approval/write action to the external agent.
export const mcpScrapeSource = internalAction({
  args: {
    url: v.string(),
    sourceType: sourceTypeValidator,
  },
  handler: async (_, args) => {
    if (args.sourceType === "SEED" || args.sourceType === "MANUAL") {
      throw new Error("MCP source staging requires a public, attributable source type");
    }
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    const access = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.scraperEnabled === false) throw new Error("The scraper tool is disabled in Tool access settings");
    return fetchAndStageSource(database, args);
  },
});

export const mcpEstimateDeal = internalAction({
  args: estimateInputValidator,
  handler: async (_, args) => {
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    const access = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.estimatorEnabled === false) throw new Error("The estimator tool is disabled in Tool access settings");
    return estimateWithDueDiligence(args);
  },
});

export const mcpRunConsultantCourt = internalAction({
  args: { stagedId: v.string() },
  handler: async (_, args) => {
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    const stagingId = objectId(args.stagedId);
    const staging = await database.collection(IMPORT_STAGING).findOne({ _id: stagingId });
    if (!staging) throw new Error("Staged source not found");
    const raw = staging.rawJson && typeof staging.rawJson === "object" ? staging.rawJson as Record<string, unknown> : {};
    const verdict = await runAiConsultantCourt({
      url: typeof raw.url === "string" ? raw.url : "",
      title: typeof raw.title === "string" ? raw.title : "Sourced deal",
      excerpt: typeof raw.excerpt === "string" ? raw.excerpt : "",
    });
    await database.collection(IMPORT_STAGING).updateOne({ _id: stagingId }, { $set: { aiCourtVerdict: verdict, updatedAt: Date.now() } });
    if (staging.candidateLeadId) {
      await database.collection(LEADS).updateOne({ _id: staging.candidateLeadId }, { $set: { aiCourtVerdict: verdict, updatedAt: Date.now() } });
    }
    return verdict;
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

type CourtRole = "EVIDENCE_AUDITOR" | "UNDERWRITING_ANALYST" | "RISK_COMPLIANCE";
type CourtStance = "SUPPORT" | "CAUTION" | "OPPOSE";
type CourtConfidence = "LOW" | "MEDIUM" | "HIGH";
type CourtVerdictValue = "PROCEED" | "HOLD" | "PASS";

type CourtEvidence = {
  claim: string;
  quote: string;
  sourceUrl: string;
  sourceDate?: string;
};

type CourtConsultant = {
  role: CourtRole;
  stance: CourtStance;
  confidence: CourtConfidence;
  summary: string;
  findings: CourtEvidence[];
  missingEvidence: string[];
  risks: string[];
};

type CourtVerdict = {
  status: "COMPLETED" | "FAILED" | "SKIPPED_MISSING_KEY";
  verdict?: CourtVerdictValue;
  confidence?: CourtConfidence;
  score?: number;
  summary?: string;
  decisiveEvidence?: CourtEvidence[];
  risks?: string[];
  missingEvidence?: string[];
  consultants?: CourtConsultant[];
  judgeNotes?: string;
  model?: string;
  reviewedAt: string;
  error?: string;
};

function courtString(value: unknown, fallback: string, maxLength: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function courtList(value: unknown, maxItems = 8) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().slice(0, 300)).slice(0, maxItems)
    : [];
}

function courtEvidence(value: unknown, source: { url: string; excerpt: string }) {
  if (!Array.isArray(value)) return [];
  // Scraped excerpts keep irregular whitespace (e.g. images stripped to double
  // spaces), so match quotes on whitespace/case-normalized text. The quote must
  // still be a real substring of the source excerpt — it is never paraphrased.
  // The judge may emit decisiveEvidence as either objects ({ claim, quote,
  // sourceUrl }) or bare quote strings; both are accepted and validated.
  const normalizedExcerpt = source.excerpt.replace(/\s+/g, " ").trim().toLowerCase();
  return value.flatMap((item) => {
    if (typeof item === "string") {
      const quote = item.replace(/^["'`]+|["'`]+$/g, "").trim().slice(0, 600);
      const normalizedQuote = quote.replace(/\s+/g, " ").trim().toLowerCase();
      if (normalizedQuote.length < 6 || !normalizedExcerpt.includes(normalizedQuote)) return [];
      return [{ claim: "Sourced statement", quote, sourceUrl: source.url }];
    }
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const quote = typeof record.quote === "string" ? record.quote.trim().slice(0, 600) : "";
    const sourceUrl = typeof record.sourceUrl === "string" ? record.sourceUrl.trim() : "";
    const normalizedQuote = quote.replace(/\s+/g, " ").trim().toLowerCase();
    if (!quote || sourceUrl !== source.url || normalizedQuote.length < 6 || !normalizedExcerpt.includes(normalizedQuote)) return [];
    return [{
      claim: courtString(record.claim, "Sourced statement", 300),
      quote,
      sourceUrl,
      ...(typeof record.sourceDate === "string" && record.sourceDate.trim() ? { sourceDate: record.sourceDate.trim().slice(0, 40) } : {}),
    }];
  }).slice(0, 8);
}

function courtStance(value: unknown): CourtStance {
  return value === "SUPPORT" || value === "OPPOSE" ? value : "CAUTION";
}

function courtConfidence(value: unknown): CourtConfidence {
  return value === "HIGH" || value === "MEDIUM" ? value : "LOW";
}

type CourtModelResult =
  | { ok: true; value: Record<string, unknown>; provider: "OLLAMA"; model: string; error?: string }
  | { ok: false; error: string };

function parseCourtContent(content: unknown, provider: "OLLAMA", model: string): CourtModelResult {
  if (typeof content !== "string" || !content.trim()) return { ok: false, error: "AI consultant returned no content" };

  const trimmed = content.trim();
  const candidates = [
    trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim(),
    trimmed.match(/\{[\s\S]*\}/)?.[0],
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ok: true, value: parsed as Record<string, unknown>, provider, model };
      }
    } catch {
      // Try the next safe extraction candidate before reporting a provider error.
    }
  }

  return { ok: false, error: "AI consultant returned invalid JSON" };
}

async function callOllamaCourtModel(prompt: string, maxTokens: number): Promise<CourtModelResult> {
  const model = process.env.OLLAMA_COURT_MODEL ?? process.env.OLLAMA_MODEL ?? "gpt-oss:20b";
  // Reasoning models can return truncated or malformed JSON when the generation
  // budget is tight, so retry once on a parse failure. The court's strict
  // coercion never trusts a partial object, and reasoning (message.thinking)
  // is never parsed as the court result.
  let result: CourtModelResult = { ok: false, error: "AI consultant returned invalid JSON" };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch("https://ollama.com/api/chat", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.OLLAMA_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        format: "json",
        // GPT-OSS ignores boolean thinking flags and needs a level. Keeping it
        // at low leaves enough generation budget for the final JSON response.
        think: model.toLowerCase().includes("gpt-oss") ? "low" : false,
        options: { temperature: 0, num_predict: maxTokens },
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(120000),
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: string;
      message?: { content?: unknown };
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    if (!response.ok) {
      const detail = typeof payload.error === "string" ? `: ${payload.error.slice(0, 240)}` : "";
      return { ok: false, error: `Ollama Cloud request failed (HTTP ${response.status}${detail})` };
    }

    const messageContent = payload.message?.content;
    const compatibleContent = payload.choices?.[0]?.message?.content;
    // Only the final answer content is accepted; reasoning (message.thinking)
    // is never parsed as the court result because it is not the JSON output.
    const content = typeof messageContent === "string" && messageContent.trim()
      ? messageContent
      : typeof compatibleContent === "string" && compatibleContent.trim()
        ? compatibleContent
        : undefined;

    result = parseCourtContent(content, "OLLAMA", model);
    if (result.ok) return result;
  }
  return result;
}

async function callCourtModel(prompt: string, maxTokens: number): Promise<CourtModelResult> {
  if (!process.env.OLLAMA_API_KEY?.trim()) return { ok: false, error: "OLLAMA_API_KEY is not configured" };
  return callOllamaCourtModel(prompt, maxTokens);
}

async function runAiConsultantCourt(source: { title: string; excerpt: string; url: string }): Promise<CourtVerdict> {
  const reviewedAt = new Date().toISOString();
  if (!process.env.OLLAMA_API_KEY?.trim()) return { status: "SKIPPED_MISSING_KEY", reviewedAt };
  const sourcePacket = `SOURCE URL: ${source.url}\nTITLE: ${source.title}\nSOURCE EXCERPT (the only evidence allowed): ${source.excerpt.slice(0, 7000)}`;
  const assignments: Array<{ role: CourtRole; task: string }> = [
    { role: "EVIDENCE_AUDITOR", task: "Audit whether the source contains enough explicit, reliable facts for a real deal review. Separate sourced facts from assumptions." },
    { role: "UNDERWRITING_ANALYST", task: "Assess the underwriting data sufficiency, likely deal economics, and missing ARV/repair/offer evidence. Never calculate or invent values that are not in the source." },
    { role: "RISK_COMPLIANCE", task: "Look for verification, privacy, source-quality, solicitation, duplicate, and compliance risks. Do not give legal advice and do not invent risks as facts." },
  ];
  const consultantResults: Array<{ role: CourtRole; consultant?: CourtConsultant; error?: string }> = await Promise.all(assignments.map(async ({ role, task }) => {
    const result = await callCourtModel(`You are the ${role} on an evidence-only real-estate deal review court. ${task}\n\nReturn JSON only with exactly these keys: stance (SUPPORT|CAUTION|OPPOSE), confidence (LOW|MEDIUM|HIGH), summary, findings, missingEvidence, risks. findings must be an array of objects with claim, quote, sourceUrl, and optional sourceDate. A quote is valid only when copied exactly from the supplied source excerpt and sourceUrl equals the supplied URL. Never invent names, addresses, phones, emails, parcels, prices, comps, ownership, motivation, or distress. This is a recommendation for the owner, not approval.\n\n${sourcePacket}`, 2500);
    if (!result.ok) return { role, error: result.error };
    const value = result.value;
    const findings = courtEvidence(value.findings, source);
    return {
      role,
      consultant: {
        role,
        stance: courtStance(value.stance),
        confidence: courtConfidence(value.confidence),
        summary: courtString(value.summary, "No consultant summary returned.", 600),
        findings,
        missingEvidence: courtList(value.missingEvidence),
        risks: courtList(value.risks),
      } satisfies CourtConsultant,
    };
  }));
  const failed = consultantResults.find((result) => !result.consultant);
  if (failed && !failed.consultant) return { status: "FAILED", reviewedAt, error: failed.error ?? "AI consultant failed" };
  const consultants: CourtConsultant[] = consultantResults.flatMap((result) => result.consultant ? [result.consultant] : []);
  const judgeInput = JSON.stringify(consultants);
  const judge = await callCourtModel(`You are the presiding judge of an evidence-only real-estate deal review court. Reconcile three consultant reports. Return JSON only with exactly these keys: verdict (PROCEED|HOLD|PASS), confidence (LOW|MEDIUM|HIGH), score (0-100), summary, decisiveEvidence, risks, missingEvidence, judgeNotes. PROCEED means the source carries enough concrete facts for continued owner review; HOLD means more verification is required; PASS means the evidence is too weak or risks outweigh the opportunity. A listing with a property address, an opening bid or price, a sale/auction date, and basic listing facts (size, beds/baths, occupancy or lien guidance) is sufficient for PROCEED — this is not approval. Use only exact quotes copied from the source excerpt for decisiveEvidence. Do not approve the lead, mark facts verified, invent PII, invent prices/comps, or give legal advice. If there is no valid exact evidence, choose HOLD.\n\n${sourcePacket}\n\nCONSULTANT REPORTS: ${judgeInput}`, 3000);
  if (!judge.ok) return { status: "FAILED", reviewedAt, error: judge.error, consultants };
  const judgeValue = judge.value;
  const decisiveEvidence = courtEvidence(judgeValue.decisiveEvidence, source);
  const verdict = judgeValue.verdict === "PROCEED" || judgeValue.verdict === "PASS" ? judgeValue.verdict : "HOLD";
  return {
    status: "COMPLETED",
    verdict: decisiveEvidence.length === 0 ? "HOLD" : verdict,
    confidence: courtConfidence(judgeValue.confidence),
    score: typeof judgeValue.score === "number" ? Math.max(0, Math.min(100, Math.round(judgeValue.score))) : undefined,
    summary: courtString(judgeValue.summary, "The court returned no summary.", 800),
    decisiveEvidence,
    risks: courtList(judgeValue.risks),
    missingEvidence: courtList(judgeValue.missingEvidence),
    consultants,
    judgeNotes: courtString(judgeValue.judgeNotes, "Owner review remains required.", 600),
    model: process.env.OLLAMA_COURT_MODEL ?? process.env.OLLAMA_MODEL ?? "gpt-oss:20b",
    reviewedAt,
  };
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
            const court = await runAiConsultantCourt(staged);
            aiResult = court;
            if (court.status === "COMPLETED") aiCompleted += 1;
            await database.collection(IMPORT_STAGING).updateOne({ _id: objectId(staged.stagedId) }, { $set: { aiCourtVerdict: court, updatedAt: Date.now() } });
          }
        }
        const qualification = await qualifyStagedSourceImpl(database, staged.stagedId);
        result = { kind: "SCRAPE", stagedId: staged.stagedId, sourceUrl: staged.url, aiCourtVerdict: aiResult, qualification, piiCreated: false };
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
  return { status: "COMPLETED" as const, processed, failed, remaining, ai: settings.mode === "BOTH" ? { completed: aiCompleted, configured: Boolean(process.env.OLLAMA_API_KEY && settings.aiEnabled) } : "not-requested" as const };
}

export const getAutomationConfig = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const document = await (await getDatabase()).collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    const settings = automationSettings(document);
    return {
      ...settings,
      providerConfigured: Boolean(process.env.OLLAMA_API_KEY),
      n8nSecretConfigured: Boolean(process.env.CONVEX_N8N_WEBHOOK_SECRET),
    };
  },
});

async function enqueueSourceTask(
  database: Awaited<ReturnType<typeof getDatabase>>,
  url: string,
  sourceType: string,
  idempotencyKey?: string,
) {
  if (!url.trim() || !sourceType || sourceType === "SEED" || sourceType === "MANUAL") {
    throw new Error("n8n source tasks require a non-seed public source type and URL");
  }
  const parsedUrl = assertPublicHttpUrl(url.trim());
  assertAuctionComSourceUrl(parsedUrl, sourceType);
  const normalizedUrl = parsedUrl.toString();
  const duplicate = await database.collection(AUTOMATION_TASKS).findOne(
    idempotencyKey
      ? { kind: "SCRAPE", idempotencyKey }
      : { kind: "SCRAPE", url: normalizedUrl, sourceType, status: { $in: ["PENDING", "RUNNING"] } },
  );
  if (duplicate) {
    return { id: String(duplicate._id), status: "PENDING" as const, deduplicated: true };
  }
  const now = Date.now();
  const result = await database.collection(AUTOMATION_TASKS).insertOne({
    kind: "SCRAPE",
    url: normalizedUrl,
    sourceType,
    ...(idempotencyKey ? { idempotencyKey } : {}),
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  });
  return { id: String(result.insertedId), status: "PENDING" as const, deduplicated: false };
}

export const enqueueN8nSource = internalAction({
  args: {
    url: v.string(),
    sourceType: sourceTypeValidator,
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (_, args) => {
    return enqueueSourceTask(await getDatabase(), args.url, args.sourceType, args.idempotencyKey?.trim() || undefined);
  },
});

const ALLEN_COUNTY_SOURCE_PRESETS = [
  {
    name: "Auction.com · 5214 Eicher Dr",
    url: "https://www.auction.com/details/5214-eicher-dr-fort-wayne-in-2097085",
    sourceType: "AUCTION_COM" as const,
  },
  {
    name: "Allen County 2026 sheriff sales",
    url: "https://www.allencountysheriff.org/2026-sheriff-sales/",
    sourceType: "SHERIFF_SALE" as const,
  },
  {
    name: "Allen County 2026 tax sale",
    url: "https://www.allencounty.in.gov/270/Tax-Sale",
    sourceType: "TAX_SALE" as const,
  },
] as const;

export const queueAllenCountySources = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    const database = await getDatabase();
    const queued = await Promise.all(
      ALLEN_COUNTY_SOURCE_PRESETS.map(async (source) => ({
        ...source,
        ...(await enqueueSourceTask(database, source.url, source.sourceType, `allen-county:${source.sourceType}:2026`)),
      })),
    );
    return { queued, ownerApprovalRequired: true };
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
    return {
      ...args,
      providerConfigured: Boolean(process.env.OLLAMA_API_KEY),
      n8nSecretConfigured: Boolean(process.env.CONVEX_N8N_WEBHOOK_SECRET),
    };
  },
});

export const enqueueAutomationTask = action({
  args: { task: automationTaskValidator },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    if (args.task.kind === "SCRAPE") {
      if (!args.task.url?.trim() || !args.task.sourceType) throw new Error("Scrape tasks require a URL and source type");
      return enqueueSourceTask(await getDatabase(), args.task.url, args.task.sourceType);
    }
    if (!args.task.estimate) throw new Error("Estimate tasks require explicit estimator inputs");
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

// MCP-facing pipeline bridges. These are only callable through the authenticated
// MCP HTTP route and deliberately expose no Mongo connection details or buyer PII.
async function requireMcpAiAccess(database: Awaited<ReturnType<typeof getDatabase>>) {
  const access = await database.collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
  if (access?.aiEnabled !== true) throw new Error("AI access is disabled in the owner Toolkit");
}

export const mcpAssertAiAccess = internalAction({
  args: {},
  handler: async () => {
    await requireMcpAiAccess(await getDatabase());
    return { enabled: true };
  },
});

export const mcpQueueSource = internalAction({
  args: {
    url: v.string(),
    sourceType: sourceTypeValidator,
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (_, args) => {
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    return enqueueSourceTask(database, args.url, args.sourceType, args.idempotencyKey?.trim() || undefined);
  },
});

export const mcpListPipeline = internalAction({
  args: {
    pipelineStatus: v.optional(pipelineStatusValidator),
    minDistressScore: v.optional(v.number()),
    limit: v.optional(v.number()),
    search: v.optional(v.string()),
  },
  handler: async (_, args) => {
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 25)));
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    const filter: Document = {
      fabricated: { $ne: true },
      pipelineStatus: args.pipelineStatus ?? { $in: ["SOURCED", "CRITIQUED", "APPROVED"] },
    };
    if (args.minDistressScore !== undefined) filter.distressScore = { $gte: args.minDistressScore };
    const search = args.search?.trim();
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { propertyAddress: { $regex: escaped, $options: "i" } },
        { city: { $regex: escaped, $options: "i" } },
        { county: { $regex: escaped, $options: "i" } },
        { parcelId: { $regex: escaped, $options: "i" } },
        { sourceRef: { $regex: escaped, $options: "i" } },
      ];
    }
    const documents = await database.collection(LEADS).find(filter).sort({ distressScore: -1, updatedAt: -1 }).limit(limit).toArray();
    const leads = documents.map((document) => {
      const lead = serialize(document);
      return {
        _id: lead._id,
        propertyAddress: lead.propertyAddress,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        county: lead.county,
        sourceType: lead.sourceType,
        sourceUrl: lead.sourceUrl,
        sourceRef: lead.sourceRef,
        sourceDate: lead.sourceDate,
        distressScore: lead.distressScore,
        distressSignals: lead.distressSignals,
        verificationStatus: lead.verificationStatus,
        pipelineStatus: lead.pipelineStatus,
        arv: lead.arv,
        repairs: lead.repairs,
        mao: lead.mao,
        estimatedProfit: calculateEstimatedProfit(lead),
        updatedAt: lead.updatedAt,
      };
    });
    if (!search) {
      return {
        dataOrigin: "verified_or_sourced" as const,
        live: false,
        leads,
      };
    }
    const ranked = rankLeads(leads as unknown as SearchableLead[], search);
    return {
      dataOrigin: "verified_or_sourced" as const,
      live: false,
      search: { query: ranked.query, terms: ranked.terms, total: ranked.total, ranked: true },
      leads: ranked.ranked
        .map((item) => {
          const lead = leads.find((candidate) => String(candidate._id) === item._id);
          return lead ? { ...lead, relevance: { score: item.score, matchedFields: item.matchedFields } } : undefined;
        })
        .filter((lead): lead is NonNullable<typeof lead> => Boolean(lead)),
    };
  },
});

export const mcpListStagedSources = internalAction({
  args: {
    status: v.optional(v.union(v.literal("NEW"), v.literal("DUPLICATE"), v.literal("REJECTED"))),
    limit: v.optional(v.number()),
  },
  handler: async (_, args) => {
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 25)));
    const database = await getDatabase();
    await requireMcpAiAccess(database);
    const documents = await database.collection(IMPORT_STAGING)
      .find(args.status ? { status: args.status } : {})
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => {
      const staging = serialize(document);
      const raw = staging.rawJson && typeof staging.rawJson === "object" ? staging.rawJson as Record<string, unknown> : {};
      return {
        _id: staging._id,
        sourceType: staging.sourceType,
        status: staging.status,
        sourceUrl: raw.url,
        title: raw.title,
        excerpt: typeof raw.excerpt === "string" ? raw.excerpt.slice(0, 4000) : undefined,
        links: Array.isArray(raw.links) ? raw.links.slice(0, 20) : [],
        fetchedAt: raw.fetchedAt,
        candidateLeadId: staging.candidateLeadId,
        aiCourtVerdict: staging.aiCourtVerdict,
        rejectReason: staging.rejectReason,
        updatedAt: staging.updatedAt,
      };
    });
  },
});

export const mcpListBuyBoxes = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (_, args) => {
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 25)));
    const documents = await (await getDatabase()).collection(BUYERS)
      .find({ intakeStatus: "APPROVED", verificationStatus: "VERIFIED" })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => ({
      _id: String(document._id),
      budgetMin: document.budgetMin,
      budgetMax: document.budgetMax,
      targetAreas: document.targetAreas,
      exitType: document.exitType,
      proofOfFundsStatus: document.proofOfFundsStatus,
      updatedAt: document.updatedAt,
    }));
  },
});

export const mcpListMatchBoard = internalAction({
  args: {
    status: v.optional(matchStatusValidator),
    confidence: v.optional(matchConfidenceValidator),
    limit: v.optional(v.number()),
  },
  handler: async (_, args) => {
    const limit = Math.max(1, Math.min(50, Math.floor(args.limit ?? 25)));
    const filter: Document = {};
    if (args.status) filter.status = args.status;
    if (args.confidence) filter.confidence = args.confidence;
    const documents = await (await getDatabase()).collection(MATCHES)
      .find(filter)
      .sort({ matchScore: -1, updatedAt: -1 })
      .limit(limit)
      .toArray();
    return documents.map((document) => ({
      _id: String(document._id),
      leadId: String(document.leadId),
      buyerId: String(document.buyerId),
      matchScore: document.matchScore,
      buyBoxSummary: document.buyBoxSummary,
      confidence: document.confidence,
      status: document.status,
      rejectReason: document.rejectReason,
      updatedAt: document.updatedAt,
    }));
  },
});

export const runAutomationCycle = internalAction({
  args: {},
  handler: async () => runAutomationCycleImpl(),
});

type EstimateOutcome =
  | {
      estimateStatus: "BLOCKED_DUE_DILIGENCE";
      dueDiligenceComplete: false;
      missingDueDiligence: string[];
      dueDiligence: ReturnType<typeof dueDiligenceSummary>;
    }
  | (ReturnType<typeof calculateDealEstimate> & {
      dueDiligenceComplete: boolean;
      dueDiligence: ReturnType<typeof dueDiligenceSummary> | null;
    });

// ARV/profit estimates for a lead are gated on the four due-diligence
// categories being verified (title/liens, sale history + comps, condition,
// occupancy). A missing category blocks the estimate and is reported explicitly
// instead of being estimated blindly. Standalone calculator use (no leadId) is
// not gated.
async function estimateWithDueDiligence(args: EstimateInput): Promise<EstimateOutcome> {
  if (!args.leadId) {
    return { ...calculateDealEstimate(args), dueDiligenceComplete: false, dueDiligence: null };
  }
  const database = await getDatabase();
  const lead = await database.collection(LEADS).findOne({ _id: objectId(args.leadId), fabricated: { $ne: true } });
  if (!lead) throw new Error("Lead not found");
  const record = lead.dueDiligence && typeof lead.dueDiligence === "object"
    ? lead.dueDiligence as DueDiligenceRecord
    : emptyDueDiligence();
  const summary = dueDiligenceSummary(record);
  if (!summary.complete) {
    return {
      estimateStatus: "BLOCKED_DUE_DILIGENCE",
      dueDiligenceComplete: false,
      missingDueDiligence: summary.missing,
      dueDiligence: summary,
    };
  }
  return { ...calculateDealEstimate(args), dueDiligenceComplete: true, dueDiligence: summary };
}

export const estimateDeal = action({
  args: estimateInputValidator,
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const access = await (await getDatabase()).collection<ToolAccessDocument>(TOOL_ACCESS).findOne({ _id: "admin_tools" });
    if (access?.estimatorEnabled === false) throw new Error("The estimator tool is disabled in Tool access settings");
    const result = await estimateWithDueDiligence(args);
    if (args.leadId && result.estimateStatus !== "BLOCKED_DUE_DILIGENCE") {
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Authentication required");
    const owner = await isOwnerIdentity(ctx);
    if (!owner && args.pipelineStatus && args.pipelineStatus !== "APPROVED") {
      throw new Error("Only the owner can view pending lead candidates");
    }
    const filter: Document = { fabricated: { $ne: true } };
    if (args.pipelineStatus) filter.pipelineStatus = args.pipelineStatus;
    if (!owner && !args.pipelineStatus) {
      filter.pipelineStatus = "APPROVED";
      filter.verificationStatus = "VERIFIED";
    }
    if (args.verificationStatus) filter.verificationStatus = args.verificationStatus;
    if (args.sourceType) filter.sourceType = args.sourceType;
    if (args.minDistressScore !== undefined || args.maxDistressScore !== undefined) {
      filter.distressScore = {
        ...(args.minDistressScore !== undefined ? { $gte: args.minDistressScore } : {}),
        ...(args.maxDistressScore !== undefined ? { $lte: args.maxDistressScore } : {}),
      };
    }
    const search = args.search?.trim();
    if (search) {
      // Candidate gate: keep the substring filter so MongoDB does the cheap
      // narrowing, then re-rank the matches with the in-house BM25 scorer.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { propertyAddress: { $regex: escaped, $options: "i" } },
        { city: { $regex: escaped, $options: "i" } },
        { county: { $regex: escaped, $options: "i" } },
        { parcelId: { $regex: escaped, $options: "i" } },
        { sourceRef: { $regex: escaped, $options: "i" } },
      ];
    }
    const documents = await (await getDatabase()).collection(LEADS).find(filter).sort({ distressScore: -1, updatedAt: -1 }).limit(100).toArray();
    const leads = documents.map((document) => {
      const lead = serialize(document);
      return { ...lead, estimatedProfit: calculateEstimatedProfit(lead) };
    });
    if (!search) {
      return {
        meta: { dataOrigin: "verified" as const, live: false },
        leads,
      };
    }
    const ranked = rankLeads(leads as unknown as SearchableLead[], search);
    const rankedById = new Map(ranked.ranked.map((item) => [item._id, item]));
    return {
      meta: {
        dataOrigin: "verified" as const,
        live: false,
        search: { query: ranked.query, terms: ranked.terms, total: ranked.total, ranked: true },
      },
      leads: ranked.ranked
        .map((item) => {
          const lead = leads.find((candidate) => String(candidate._id) === item._id);
          return lead ? { ...lead, relevance: { score: item.score, matchedFields: item.matchedFields } } : undefined;
        })
        .filter((lead): lead is NonNullable<typeof lead> => Boolean(lead)),
      // Keep the unranked list for callers that need every matching row even
      // when a term only appears in a low-weight field.
      unranked: leads.map((lead) => ({ ...lead, relevance: rankedById.get(String(lead._id)) })),
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
