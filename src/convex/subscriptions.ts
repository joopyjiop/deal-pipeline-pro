/**
 * Subscription state read/write (default Convex runtime — no node APIs).
 *
 * `upsertSubscription` is internal: it is invoked only from the verified
 * Stripe webhook handler in `http.ts` (`internal.subscriptions.upsertSubscription`),
 * so clients can never write their own subscription rows.
 *
 * `getSubscription` returns the signed-in user's subscription for the
 * marketing site / dashboard to display.
 */
import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/** Upsert a subscription row for a user. Internal only. */
export const upsertSubscription = internalMutation({
  args: {
    userId: v.string(),
    email: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    priceId: v.optional(v.string()),
    status: v.string(),
    currentPeriodEnd: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { ...args, updatedAt: now });
      return { id: existing._id };
    }
    const id = await ctx.db.insert("subscriptions", { ...args, createdAt: now, updatedAt: now });
    return { id };
  },
});

/** The signed-in user's Stripe subscription (or null). */
export const getSubscription = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const subscription = await ctx.db
      .query("subscriptions")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();
    return subscription ?? null;
  },
});
