import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Internal helpers for owner-managed app settings. These functions are never
 * exposed to the client directly; only owner-gated actions may call them via
 * `internal.settings.*`. The stored value is treated as a secret: it must not
 * be returned by any public query or the admin API.
 */

export const getByKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const doc = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    return doc?.value ?? null;
  },
});

export const upsert = internalMutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("appSettings", { key, value, updatedAt: Date.now() });
    }
  },
});

export const remove = internalMutation({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});
