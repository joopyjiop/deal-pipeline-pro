"use node";

import { Document, MongoClient, ObjectId } from "mongodb";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";

const LEADS = "leads";
const HOT_DEALS = "hot_deals";
const BUYERS = "buyers";
const MATCHES = "property_matches";
const IMPORT_STAGING = "import_staging";

const resourceValidator = v.union(
  v.literal("leads"),
  v.literal("buyers"),
  v.literal("matches"),
  v.literal("hot-deals"),
  v.literal("import-staging"),
);
const operationValidator = v.union(
  v.literal("LIST"),
  v.literal("GET"),
  v.literal("CREATE"),
  v.literal("UPDATE"),
  v.literal("DELETE"),
);

type Resource = "leads" | "buyers" | "matches" | "hot-deals" | "import-staging";
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

function collectionName(resource: Resource) {
  return resource === "leads"
    ? LEADS
    : resource === "buyers"
      ? BUYERS
      : resource === "matches"
        ? MATCHES
        : resource === "hot-deals"
          ? HOT_DEALS
          : IMPORT_STAGING;
}

function objectId(value: string) {
  if (!ObjectId.isValid(value)) throw new Error("Invalid MongoDB document id");
  return new ObjectId(value);
}

function serialize(value: unknown): unknown {
  if (value instanceof ObjectId) return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
}

function record(value: unknown, label: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  return value as Record<string, unknown>;
}

function requiredString(value: Record<string, unknown>, key: string) {
  if (typeof value[key] !== "string" || !value[key].trim()) throw new Error(`${key} is required`);
}

function requiredNumber(value: Record<string, unknown>, key: string) {
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error(`${key} must be a number`);
}

function enumValue(value: Record<string, unknown>, key: string, allowed: readonly string[]) {
  if (typeof value[key] !== "string" || !allowed.includes(value[key])) throw new Error(`${key} must be one of ${allowed.join(", ")}`);
}

const sourceTypes = ["SHERIFF_SALE", "TAX_SALE", "AUCTION_COM", "PROBATE", "OFF_MARKET", "ASSESSOR", "RECORDER", "PROPSTREAM", "BATCHLEADS", "DEALMACHINE", "MANUAL", "SEED"] as const;
const verificationStatuses = ["UNVERIFIED", "PARTIAL", "VERIFIED"] as const;
const leadStatuses = ["SOURCED", "CRITIQUED", "VERIFIED", "APPROVED", "REJECTED"] as const;
const matchStatuses = ["CANDIDATE", "APPROVED", "REJECTED", "CONTACTED", "CLOSED"] as const;

function validateSignals(value: Record<string, unknown>) {
  if (!Array.isArray(value.distressSignals)) throw new Error("distressSignals must be an array");
  for (const item of value.distressSignals) {
    const signal = record(item, "distress signal");
    for (const key of ["type", "evidence", "sourceUrl", "sourceDate"]) requiredString(signal, key);
    requiredNumber(signal, "weight");
    if (typeof signal.verified !== "boolean") throw new Error("distress signal verified must be boolean");
  }
}

function validateLead(value: Record<string, unknown>) {
  for (const key of ["propertyAddress", "city", "state", "zip", "county", "sourceType", "sourceUrl", "sourceRef", "sourceDate"]) requiredString(value, key);
  requiredNumber(value, "distressScore");
  if ((value.distressScore as number) < 0 || (value.distressScore as number) > 100) throw new Error("distressScore must be between 0 and 100");
  validateSignals(value);
  enumValue(value, "sourceType", sourceTypes);
  enumValue(value, "verificationStatus", verificationStatuses);
  enumValue(value, "pipelineStatus", leadStatuses);
}

function validateHotDeal(value: Record<string, unknown>) {
  for (const key of ["propertyAddress", "city", "state", "zip", "county", "sourceType", "sourceUrl", "sourceRef", "sourceDate"]) requiredString(value, key);
  requiredNumber(value, "distressScore");
  enumValue(value, "sourceType", sourceTypes);
  enumValue(value, "verificationStatus", verificationStatuses);
}

function validateBuyer(value: Record<string, unknown>) {
  for (const key of ["name", "phone", "email", "listSource"]) requiredString(value, key);
  for (const key of ["budgetMin", "budgetMax"]) requiredNumber(value, key);
  if ((value.budgetMin as number) < 0 || (value.budgetMax as number) < (value.budgetMin as number)) throw new Error("Buyer budget range is invalid");
  if (!Array.isArray(value.targetAreas)) throw new Error("targetAreas must be an array");
  enumValue(value, "exitType", ["ASSIGN", "FLIP", "BUY_HOLD"]);
  enumValue(value, "proofOfFundsStatus", ["NONE", "SELF_REPORTED", "VERIFIED"]);
  enumValue(value, "intakeStatus", ["PENDING", "APPROVED", "REJECTED"]);
  enumValue(value, "verificationStatus", verificationStatuses);
  if (value.proofOfFundsStatus === "VERIFIED") requiredString(value, "pofEvidenceRef");
}

function validateMatch(value: Record<string, unknown>) {
  for (const key of ["leadId", "buyerId", "buyBoxSummary"]) requiredString(value, key);
  requiredNumber(value, "matchScore");
  if ((value.matchScore as number) < 0 || (value.matchScore as number) > 100) throw new Error("matchScore must be between 0 and 100");
  enumValue(value, "confidence", ["LOW", "MEDIUM", "HIGH"]);
  enumValue(value, "status", matchStatuses);
}

function validateStaging(value: Record<string, unknown>) {
  requiredString(value, "sourceType");
  if (!("rawJson" in value)) throw new Error("rawJson is required");
  enumValue(value, "sourceType", sourceTypes);
  enumValue(value, "status", ["NEW", "DUPLICATE", "REJECTED"]);
}

function cleanPayload(value: Record<string, unknown>) {
  const clean = { ...value };
  delete clean._id;
  delete clean.createdAt;
  delete clean.updatedAt;
  return clean;
}

function filtersFor(resource: Resource, rawFilters: unknown) {
  const filters = rawFilters && typeof rawFilters === "object" && !Array.isArray(rawFilters)
    ? rawFilters as Record<string, unknown>
    : {};
  const filter: Document = {};
  if (resource === "leads") {
    if (typeof filters.status === "string") filter.pipelineStatus = filters.status;
    if (typeof filters.verificationStatus === "string") filter.verificationStatus = filters.verificationStatus;
    if (typeof filters.minDistressScore === "number" || typeof filters.maxDistressScore === "number") {
      filter.distressScore = {
        ...(typeof filters.minDistressScore === "number" ? { $gte: filters.minDistressScore } : {}),
        ...(typeof filters.maxDistressScore === "number" ? { $lte: filters.maxDistressScore } : {}),
      };
    }
  } else if (resource === "hot-deals") {
    if (typeof filters.status === "string") filter.verificationStatus = filters.status;
    if (typeof filters.minDistressScore === "number") filter.distressScore = { $gte: filters.minDistressScore };
  } else if (resource === "buyers") {
    if (typeof filters.status === "string") filter.intakeStatus = filters.status;
    if (typeof filters.proofOfFundsStatus === "string") filter.proofOfFundsStatus = filters.proofOfFundsStatus;
  } else if (resource === "matches") {
    if (typeof filters.status === "string") filter.status = filters.status;
    if (typeof filters.confidence === "string") filter.confidence = filters.confidence;
    if (typeof filters.minMatchScore === "number") filter.matchScore = { $gte: filters.minMatchScore };
  } else if (typeof filters.status === "string") {
    filter.status = filters.status;
  }
  return { filter, limit: Math.max(1, Math.min(500, Math.floor(typeof filters.limit === "number" ? filters.limit : 200))) };
}

async function validateMatchReferences(database: Awaited<ReturnType<typeof getDatabase>>, value: Record<string, unknown>) {
  const [lead, buyer] = await Promise.all([
    database.collection(LEADS).findOne({ _id: objectId(value.leadId as string) }),
    database.collection(BUYERS).findOne({ _id: objectId(value.buyerId as string) }),
  ]);
  if (!lead || lead.fabricated === true || lead.pipelineStatus !== "APPROVED" || lead.verificationStatus !== "VERIFIED") throw new Error("Matches require a verified, approved, non-fabricated lead");
  if (!buyer || buyer.intakeStatus !== "APPROVED") throw new Error("Matches require an approved buyer");
  if (value.confidence === "HIGH" && buyer.proofOfFundsStatus !== "VERIFIED") throw new Error("High-confidence matches require verified proof of funds");
}

export const adminCrud = internalAction({
  args: {
    resource: resourceValidator,
    operation: operationValidator,
    id: v.optional(v.string()),
    payload: v.any(),
    filters: v.any(),
  },
  handler: async (_, args) => {
    const database = await getDatabase();
    const documents = database.collection(collectionName(args.resource));

    if (args.operation === "LIST") {
      const { filter, limit } = filtersFor(args.resource, args.filters);
      const rows = await documents.find(filter).sort({ updatedAt: -1, createdAt: -1 }).limit(limit).toArray();
      return { resource: args.resource, count: rows.length, data: rows.map(serialize) };
    }

    if (args.operation === "CREATE") {
      const next = cleanPayload(record(args.payload, "Request body"));
      if (args.resource === "leads") {
        validateLead(next);
        next.fabricated = next.sourceType === "SEED" || next.fabricated === true;
      } else if (args.resource === "hot-deals") {
        validateHotDeal(next);
        next.fabricated = next.sourceType === "SEED" || next.fabricated === true;
        if (next.fabricated !== true && (next.verificationStatus !== "VERIFIED" || (next.distressScore as number) < 80)) throw new Error("Hot deals require verified records with distress score 80 or higher");
      } else if (args.resource === "buyers") {
        validateBuyer(next);
      } else if (args.resource === "matches") {
        validateMatch(next);
        await validateMatchReferences(database, next);
      } else {
        validateStaging(next);
      }
      const now = Date.now();
      const inserted = await documents.insertOne({ ...next, createdAt: now, updatedAt: now });
      return { resource: args.resource, id: String(inserted.insertedId), data: serialize({ ...next, _id: inserted.insertedId, createdAt: now, updatedAt: now }) };
    }

    if (!args.id) throw new Error("A document id is required");
    const id = objectId(args.id);
    const existing = await documents.findOne({ _id: id });
    if (!existing) throw new Error(`${args.resource} document not found`);

    if (args.operation === "GET") return { resource: args.resource, data: serialize(existing) };
    if (args.operation === "DELETE") {
      await documents.deleteOne({ _id: id });
      return { resource: args.resource, id: args.id, deleted: true };
    }

    const patch = cleanPayload(record(args.payload, "Request body"));
    const next = { ...existing, ...patch } as Record<string, unknown>;
    if (args.resource === "leads") {
      if (existing.fabricated === true) next.fabricated = true;
      validateLead(next);
      if (next.sourceType === "SEED") next.fabricated = true;
    } else if (args.resource === "hot-deals") {
      if (existing.fabricated === true) next.fabricated = true;
      validateHotDeal(next);
      if (next.sourceType === "SEED") next.fabricated = true;
      if (next.fabricated !== true && (next.verificationStatus !== "VERIFIED" || (next.distressScore as number) < 80)) throw new Error("Hot deals require verified records with distress score 80 or higher");
    } else if (args.resource === "buyers") {
      validateBuyer(next);
    } else if (args.resource === "matches") {
      validateMatch(next);
      await validateMatchReferences(database, next);
    } else {
      validateStaging(next);
    }
    const updatedAt = Date.now();
    await documents.updateOne({ _id: id }, { $set: { ...patch, ...(next.fabricated !== undefined ? { fabricated: next.fabricated } : {}), updatedAt } });
    return { resource: args.resource, id: args.id, data: serialize({ ...existing, ...patch, ...(next.fabricated !== undefined ? { fabricated: next.fabricated } : {}), updatedAt }) };
  },
});
