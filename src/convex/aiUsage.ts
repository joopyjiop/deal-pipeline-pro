import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery, query, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { COURT_RUN_ESTIMATE_TOKENS, evaluateAiUsage, dayKey, getAiLimits, type AiUsageDoc } from "./aiUsageCore";

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
 * AI usage guard — Convex wiring half of src/convex/aiUsageCore.ts.
 *
 * `consumeAiUsage` is the single charge point: every AI request (chat
 * completion, embedding, consultant court, thread reply) calls it via
 * ctx.runMutation BEFORE the model request is sent. Because it is a mutation,
 * the read-modify-write of the actor row and the "global" row happens in one
 * transaction, so concurrent requests cannot race past the rate limit, the
 * per-user daily cap, or the app-wide daily budget.
 */

/** Atomically charge `estimatedTokens` to an actor for a UTC day. */
export const consumeAiUsage = internalMutation({
  args: {
    actor: v.string(),
    day: v.string(),
    estimatedTokens: v.number(),
    limits: v.object({
      ratePerMinute: v.number(),
      userDailyCap: v.number(),
      globalDailyCap: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const find = (actor: string) =>
      ctx.db
        .query("aiUsage")
        .withIndex("by_actor_day", (q) => q.eq("actor", actor).eq("day", args.day))
        .first();

    const usage = await find(args.actor);
    const globalUsage = await find("global");
    const decision = evaluateAiUsage({
      actor: args.actor,
      day: args.day,
      estimatedTokens: args.estimatedTokens,
      now,
      limits: args.limits,
      usage,
      globalUsage,
    });

    if (!decision.allowed) {
      return { ok: false, reason: decision.reason, retryAfterMs: decision.retryAfterMs };
    }

    const upsert = (doc: AiUsageDoc, existing: Awaited<ReturnType<typeof find>>) => {
      if (existing) {
        void ctx.db.patch(existing._id, { requests: doc.requests, tokens: doc.tokens, recent: doc.recent });
      } else {
        void ctx.db.insert("aiUsage", doc);
      }
    };
    upsert(decision.next, usage);
    upsert(decision.globalNext, globalUsage);
    return { ok: true };
  },
});

/** Recent usage rows (no auth — internal callers only; owner gate lives in the action). */
export const listAiUsageRows = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("aiUsage").order("desc").take(200);
  },
});

/** A signed-in user's own usage today (shown on their dashboard if surfaced). */
export const myAiUsage = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const doc = await ctx.db
      .query("aiUsage")
      .withIndex("by_actor_day", (q) => q.eq("actor", `user:${identity.subject}`).eq("day", dayKey(Date.now())))
      .first();
    return doc ? { requests: doc.requests, tokens: doc.tokens } : { requests: 0, tokens: 0 };
  },
});

/**
 * Cron wrapper for the Mongo automation cycle. The cycle's consultant-court
 * runs predate the token guard, so this wrapper charges the "court" actor for
 * however many court runs actually completed (COURT_RUN_ESTIMATE_TOKENS each)
 * after the cycle finishes. The cron can only reference internal functions,
 * hence the wrapper living here instead of in crons.ts.
 */
export const runAutomationCycleWithCharge = internalAction({
  args: {},
  handler: async (ctx) => {
    // Explicit annotation: resolving the cycle's return type through the
    // generated `internal` namespace makes TS infer a self-referential `any`
    // here (TS7022) — same workaround as getAiUsage below.
    const result = (await ctx.runAction(internal.mongodb.runAutomationCycle, {})) as {
      status: string;
      processed: number;
      remaining: number;
      ai: "not-run" | "not-requested" | { completed: number; configured: boolean };
    };
    const aiCompleted =
      result && typeof result.ai === "object" && result.ai !== null ? result.ai.completed : 0;
    if (aiCompleted > 0) {
      await ctx.runMutation(internal.aiUsage.consumeAiUsage, {
        actor: "court",
        day: dayKey(Date.now()),
        estimatedTokens: COURT_RUN_ESTIMATE_TOKENS * aiCompleted,
        limits: getAiLimits(),
      });
    }
    return result;
  },
});

/**
 * Owner-only usage view: current guard parameters and recent aiUsage rows, so
 * the owner can see exactly who is burning tokens and tune the caps.
 * Lives here (not in ollama.ts) to keep the generated-api type graph acyclic.
 */
export const getAiUsage = action({
  args: {},
  handler: async (ctx) => {
    await requireOwner(ctx);
    // Explicit annotation: the generated `internal` namespace references this
    // very module, so without a concrete type TS infers a self-referential
    // `any` here (TS7022).
    const rows = (await ctx.runQuery(internal.aiUsage.listAiUsageRows, {})) as Array<{
      actor: string;
      day: string;
      requests: number;
      tokens: number;
    }>;
    const today = dayKey(Date.now());
    const todayRows = rows.filter((row) => row.day === today);
    const globalToday = todayRows.find((row) => row.actor === "global");
    const actors = todayRows
      .filter((row) => row.actor !== "global")
      .sort((a, b) => b.tokens - a.tokens)
      .map((row) => ({ actor: row.actor, requests: row.requests, tokens: row.tokens }));
    return {
      limits: getAiLimits(),
      today: {
        globalTokens: globalToday?.tokens ?? 0,
        actors,
      },
      recentRows: rows.slice(0, 50).map((row) => ({ actor: row.actor, day: row.day, requests: row.requests, tokens: row.tokens })),
    };
  },
});
