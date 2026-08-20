import { action, internalMutation, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

const OWNER_EMAIL = "jacobvierra8@gmail.com";

// Same owner convention as the rest of the app (role "admin" OR the permanent
// owner email), resolved the way actions must (auth identity + users query).
async function requireOwner(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email?.trim().toLowerCase() === OWNER_EMAIL) return;
  const [userId] = (identity?.subject ?? "").split("|");
  if (!userId) throw new Error("Owner access required");
  const user = await ctx.runQuery(internal.users.getUserBySubject, { subject: userId });
  if (user && (user.role === "admin" || user.email?.trim().toLowerCase() === OWNER_EMAIL)) return;
  throw new Error("Owner access required");
}

/**
 * Delete every anonymous (guest) user row. Guests are not offered sign-in
 * anymore and are rejected server-side everywhere, but any anonymous account
 * created before that change still exists — this removes them entirely so
 * their sessions stop resolving to a user (owner checks and marketplace
 * access both fail for them afterward).
 */
export const purgeAnonymousUsers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const anonymous = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("isAnonymous"), true))
      .collect();
    let deleted = 0;
    for (const row of anonymous) {
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    return { deleted };
  },
});

/** Owner-only wrapper the Dashboard calls. */
export const purgeAnonymousUsersAction = action({
  args: {},
  // Explicit annotation: the generated `internal` namespace references this
  // very module, so without a concrete type TS infers a self-referential
  // `any` here (TS7022) — same workaround as aiUsage.ts.
  handler: async (ctx): Promise<{ deleted: number }> => {
    await requireOwner(ctx);
    return await ctx.runMutation(internal.userAdmin.purgeAnonymousUsers, {});
  },
});

/**
 * Owner-only: list every user account with access-level metadata.
 * Returns users sorted by creation date (newest first) with their
 * role, subscription status, and join date.
 */
export const listAllUsers = action({
  args: {},
  handler: async (ctx): Promise<{
    users: Array<{
      id: string;
      name: string | undefined;
      email: string | undefined;
      role: string | undefined;
      isAnonymous: boolean | undefined;
      subscriptionStatus: string | null;
      joinedAt: number;
    }>;
  }> => {
    await requireOwner(ctx);

    const users = await ctx.runQuery(internal.users.listUsers, {});
    const userIds = users.map((u) => String(u._id));

    // Fetch subscription status for each user in parallel
    const subscriptionResults = await Promise.all(
      userIds.map((userId) =>
        ctx.runQuery(internal.subscriptions.getSubscriptionByUserId, { userId }).catch(() => null),
      ),
    );

    const subscriptionMap = new Map<string, string | null>();
    userIds.forEach((userId, i) => {
      const sub = subscriptionResults[i];
      subscriptionMap.set(userId, sub?.status ?? null);
    });

    return {
      users: users.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        role: u.role,
        isAnonymous: u.isAnonymous,
        subscriptionStatus: subscriptionMap.get(String(u._id)) ?? null,
        joinedAt: u._creationTime,
      })),
    };
  },
});
