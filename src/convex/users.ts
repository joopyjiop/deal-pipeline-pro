import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalQuery, query, QueryCtx } from "./_generated/server";

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
