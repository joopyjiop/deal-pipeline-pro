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
  v.literal("FORECLOSURE"),
  v.literal("MARKETPLACE"),
  v.literal("ASSOCIATION"),
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

    // Shared conversation thread between the website and the external Odysseus
    // AI harness (docs/odysseus-briefing.md → "Shared conversation"). Both
    // sides insert into the same table and read the full thread so they can
    // collaborate mid-task instead of handing off one-way requests. Convex
    // documents also carry `_id` and `_creationTime` automatically; `sentAt`
    // is the explicit insertion timestamp both sides sort on.
    sharedConversations: defineTable({
      // Conversation/task reference, e.g. "deal:<leadId>", "task:<stagedId>",
      // "buyer:<buyerId>", or "ops:<topic>".
      threadId: v.string(),
      // Which side wrote the message. Forced server-side: the website mutation
      // always writes "website", the MCP tools always write "odysseus".
      sender: v.union(v.literal("website"), v.literal("odysseus")),
      // Message kind so readers can route by intent (see the protocol comment
      // in src/convex/shared-conversation.ts).
      kind: v.union(
        v.literal("MESSAGE"),
        v.literal("REQUEST"),
        v.literal("ESCALATION"),
        v.literal("RESOLUTION"),
      ),
      content: v.string(),
      // Optional context: lead/staged/buyer ids, URLs, or keys the message
      // refers to. Never PII beyond what the thread already discusses.
      refs: v.optional(v.array(v.string())),
      // Optional structured payload (e.g. a tool result summary). Never
      // secrets; treated as display-only JSON.
      metadata: v.optional(v.any()),
      // Explicit insertion timestamp (ms epoch).
      sentAt: v.number(),
    })
      .index("by_thread", ["threadId"])
      .index("by_thread_time", ["threadId", "sentAt"]),

    users: defineTable({
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      role: v.optional(roleValidator),
      // Owner-granted premium access: lets a user bypass the Stripe
      // subscription gate without paying. Toggled via the owner Users panel.
      premiumAccess: v.optional(v.boolean()),
      // Tiered access control set by the owner: "disabled" (no dashboard),
      // "standard" (limited leads), "premium" (full access).
      accessTier: v.optional(v.union(
        v.literal("disabled"),
        v.literal("standard"),
        v.literal("premium"),
      )),
      // Maximum number of leads a standard-tier user can view. Undefined or
      // null means the platform default (currently 10).
      leadLimit: v.optional(v.number()),
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

    // Stripe subscription state (Deal Forge marketing site). Written only by
    // the verified Stripe webhook (/api/stripe/webhook); keyed by the Convex
    // user id so the signed-in user can read their own status.
    subscriptions: defineTable({
      // Convex auth subject / user id the subscription belongs to.
      userId: v.string(),
      email: v.optional(v.string()),
      stripeCustomerId: v.optional(v.string()),
      stripeSubscriptionId: v.optional(v.string()),
      priceId: v.optional(v.string()),
      // Stripe subscription status: active | trialing | past_due | unpaid |
      // incomplete | incomplete_expired | canceled.
      status: v.string(),
      // End of the current billing period (ms epoch), when known.
      currentPeriodEnd: v.optional(v.number()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // AI usage accounting for the token guard (src/convex/aiUsage.ts +
    // aiUsageCore.ts). One doc per (actor, UTC day) plus one "global" doc per
    // day. Written only by the internal consumeAiUsage mutation, which charges
    // every model call (chat, embeddings, consultant court, thread replies)
    // before it is sent — per-actor rate/daily caps for users, plus an
    // app-wide daily budget that bounds everyone including system actors.
    aiUsage: defineTable({
      // "user:<subject>", "court", "thread-responder", "agent", "indexing",
      // or "global" for the app-wide daily budget row.
      actor: v.string(),
      // UTC calendar day bucket ("YYYY-MM-DD").
      day: v.string(),
      requests: v.number(),
      // Estimated tokens charged (input chars / 4 + reserved output).
      tokens: v.number(),
      // Rolling request timestamps within the rate window (user actors only).
      recent: v.array(v.number()),
    })
      .index("by_actor_day", ["actor", "day"])
      .index("by_day", ["day"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
