import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  pipelineStatusValidator,
  sourceTypeValidator,
  verificationStatusValidator,
} from "./schema";
import { isPermanentOwner, requirePermanentOwner } from "./owner";

const distressSignalArgs = v.array(
  v.object({
    type: v.string(),
    weight: v.number(),
    evidence: v.string(),
    verified: v.boolean(),
    sourceUrl: v.string(),
    sourceDate: v.string(),
  }),
);

const leadFields = {
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
  distressSignals: distressSignalArgs,
  verificationStatus: verificationStatusValidator,
  pipelineStatus: pipelineStatusValidator,
  absenteeOwner: v.boolean(),
  needsSkipTrace: v.boolean(),
  listedPhone: v.boolean(),
  arv: v.optional(v.number()),
  repairs: v.optional(v.number()),
  mao: v.optional(v.number()),
  notes: v.optional(v.string()),
};

function validateVerifiedLead(args: {
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
  verificationStatus: string;
  pipelineStatus: string;
}) {
  if (args.sourceType === "SEED") {
    throw new Error("Seed rows cannot enter the verified lead workspace");
  }
  if (!args.sourceUrl.trim() || !args.sourceRef.trim() || !args.sourceDate.trim()) {
    throw new Error("A source URL, source reference, and source date are required");
  }
  if (args.distressScore < 0 || args.distressScore > 100) {
    throw new Error("Distress score must be between 0 and 100");
  }
  if (args.verificationStatus !== "VERIFIED" || args.pipelineStatus !== "APPROVED") {
    throw new Error("Only verified and approved leads can be surfaced");
  }
  if (
    args.distressSignals.some(
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

export const approved = query({
  args: {
    search: v.optional(v.string()),
    minScore: v.optional(v.number()),
    sourceType: v.optional(sourceTypeValidator),
  },
  handler: async (ctx, args) => {
    const viewer = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", "jacobvierra8@gmail.com"))
      .first();
    const owner = await isPermanentOwner(ctx);
    const leads = await ctx.db
      .query("leads")
      .withIndex("by_pipeline_status", (q) => q.eq("pipelineStatus", "APPROVED"))
      .collect();

    const normalizedSearch = args.search?.trim().toLowerCase();
    const filtered = leads
      .filter((lead) => !lead.fabricated)
      .filter((lead) =>
        args.minScore === undefined ? true : lead.distressScore >= args.minScore!,
      )
      .filter((lead) =>
        args.sourceType === undefined ? true : lead.sourceType === args.sourceType,
      )
      .filter((lead) => {
        if (!normalizedSearch) return true;
        return [
          lead.propertyAddress,
          lead.city,
          lead.state,
          lead.zip,
          lead.county,
          lead.parcelId,
          lead.sourceRef,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(normalizedSearch));
      })
      .sort((a, b) => b.distressScore - a.distressScore);

    return {
      meta: {
        dataOrigin: "verified" as const,
        simulated: false,
        ownerAccess: owner,
        ownerEmailConfigured: Boolean(viewer),
      },
      leads: filtered,
    };
  },
});

export const create = mutation({
  args: leadFields,
  handler: async (ctx, args) => {
    await requirePermanentOwner(ctx);
    validateVerifiedLead(args);
    const now = Date.now();

    return await ctx.db.insert("leads", {
      ...args,
      fabricated: false,
      lastVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("leads"),
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
    distressSignals: v.optional(distressSignalArgs),
    verificationStatus: v.optional(verificationStatusValidator),
    pipelineStatus: v.optional(pipelineStatusValidator),
    absenteeOwner: v.optional(v.boolean()),
    needsSkipTrace: v.optional(v.boolean()),
    listedPhone: v.optional(v.boolean()),
    arv: v.optional(v.number()),
    repairs: v.optional(v.number()),
    mao: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requirePermanentOwner(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing || existing.fabricated) {
      throw new Error("Lead not found");
    }

    const { id, ...patch } = args;
    const next = { ...existing, ...patch };
    validateVerifiedLead(next);
    await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("leads") },
  handler: async (ctx, args) => {
    await requirePermanentOwner(ctx);
    const existing = await ctx.db.get(args.id);
    if (!existing || existing.fabricated) {
      throw new Error("Lead not found");
    }
    await ctx.db.delete(args.id);
  },
});
