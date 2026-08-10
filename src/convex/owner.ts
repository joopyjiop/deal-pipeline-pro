import { getAuthUserId } from "@convex-dev/auth/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const PERMANENT_OWNER_EMAILS = new Set(["jacobvierra8@gmail.com"]);

function matchesOwnerEmail(email: string | undefined) {
  return email ? PERMANENT_OWNER_EMAILS.has(email.trim().toLowerCase()) : false;
}

export async function getOwner(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (userId === null) return null;

  const user = await ctx.db.get(userId);
  if (!user || user.isAnonymous) return null;

  return user;
}

export async function isPermanentOwner(ctx: QueryCtx | MutationCtx) {
  const user = await getOwner(ctx);
  return Boolean(user && (user.role === "admin" || matchesOwnerEmail(user.email)));
}

export async function requirePermanentOwner(ctx: MutationCtx) {
  const user = await getOwner(ctx);
  if (!user || (user.role !== "admin" && !matchesOwnerEmail(user.email))) {
    throw new Error("Owner access required");
  }
  return user;
}
