import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

export const sourceTypeValidator = v.union(
  v.literal("SHERIFF_SALE"),
  v.literal("TAX_SALE"),
  v.literal("AUCTION_COM"),
  v.literal("PROBATE"),
  v.literal("OFF_MARKET"),
  v.literal("ASSESSOR"),
  v.literal("RECORDER"),
  v.literal("MANUAL"),
  v.literal("SEED"),
);

export const verificationStatusValidator = v.union(
  v.literal("UNVERIFIED"),
  v.literal("PARTIAL"),
  v.literal("VERIFIED"),
);

export const pipelineStatusValidator = v.union(
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

const schema = defineSchema(
  {
    ...authTables,

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
    }).index("email", ["email"]),

    appSettings: defineTable({
      key: v.string(),
      value: v.string(),
      updatedAt: v.number(),
    }).index("by_key", ["key"]),

    leads: defineTable({
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
      fabricated: v.boolean(),
      absenteeOwner: v.boolean(),
      needsSkipTrace: v.boolean(),
      listedPhone: v.boolean(),
      lastVerifiedAt: v.number(),
      arv: v.optional(v.number()),
      repairs: v.optional(v.number()),
      mao: v.optional(v.number()),
      notes: v.optional(v.string()),
      createdAt: v.number(),
      updatedAt: v.number(),
    })
      .index("by_pipeline_status", ["pipelineStatus"])
      .index("by_verification_status", ["verificationStatus"])
      .index("by_source_type", ["sourceType"])
      .index("by_parcel_id", ["parcelId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
