import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";

const OWNER_EMAIL = "jacobvierra8@gmail.com";

/** Check if a given user document is the owner (admin or permanent owner email). */
export const isOwnerUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    const id = ctx.db.normalizeId("users", userId);
    if (id === null) return false;
    const user = await ctx.db.get(id);
    if (!user) return false;
    return user.role === "admin" || user.email?.trim().toLowerCase() === OWNER_EMAIL;
  },
});

/** Owner-only: toggle a user's premiumAccess flag. */
export const togglePremiumAccess = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const [rawId] = identity.subject.split("|");
    const isOwner = await ctx.runQuery(internal.users.isOwnerUser, { userId: rawId });
    if (!isOwner) throw new Error("Owner access required");

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");

    const current = Boolean(target.premiumAccess);
    await ctx.db.patch(args.userId, { premiumAccess: !current });
    return { premiumAccess: !current };
  },
});

/** The current user's premium access flag (for RequireSubscription). */
export const getMyPremiumAccess = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return user?.premiumAccess ?? false;
  },
});

/**
 * Get the current signed in user. Returns null if the user is not signed in.
 * Usage: const signedInUser = await ctx.runQuery(api.authHelpers.currentUser);
 * THIS FUNCTION IS READ-ONLY. DO NOT MODIFY.
 */
export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    if (user === null) {
      return null;
    }

    return user;
  },
});

/**
 * List users-table documents (for the admin API). Never returns auth secrets;
 * only the fields the schema stores.
 */
export const listUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").order("desc").take(200);
  },
});

/**
 * Resolve a users-table document by auth subject (the subject is the users
 * row `_id`). Used by owner checks in actions, where `ctx.db` is unavailable,
 * so the backend and frontend share one source of truth for owner status.
 */
export const getUserBySubject = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    const id = ctx.db.normalizeId("users", subject);
    if (id === null) return null;
    return await ctx.db.get(id);
  },
});

/**
 * Use this function internally to get the current user data. Remember to handle the null user case.
 * @param ctx
 * @returns
 */
export const getCurrentUser = async (ctx: QueryCtx) => {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    return null;
  }
  return await ctx.db.get(userId);
};
