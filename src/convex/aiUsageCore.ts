/**
 * Pure AI usage-guard logic (no Convex imports — unit-testable from tests/).
 *
 * Every AI request that costs the owner tokens (chat completions, embeddings,
 * consultant court, thread replies) is charged against a budget before it is
 * sent. Charging is a single atomic read-modify-write in the `aiUsage` table
 * (see aiUsage.ts) using `evaluateAiUsage` below, so a burst of concurrent
 * requests cannot race past a cap.
 *
 * Policy:
 *  - Per-request parameters: output tokens are always clamped (default 2,000,
 *    hard ceiling 8,000, owner can lower via AI_MAX_OUTPUT_TOKENS) and total
 *    input characters are capped (200,000) before anything is sent.
 *  - Rate limit (per minute) and daily token cap apply to end-user actors
 *    (actor ids starting with "user:"). Trusted system actors ("court",
 *    "thread-responder", "agent", "indexing") are not rate-limited per minute
 *    and have no per-actor daily cap — but every actor, including system
 *    actors, is bounded by the app-wide daily budget.
 */

export interface AiUsageLimits {
  /** Max requests per 60s window for a single user actor. 0 disables. */
  ratePerMinute: number;
  /** Max estimated tokens per user actor per UTC day. 0 disables. */
  userDailyCap: number;
  /** Max estimated tokens across ALL actors per UTC day. 0 disables. */
  globalDailyCap: number;
}

export interface AiUsageDoc {
  actor: string;
  day: string;
  requests: number;
  tokens: number;
  /** Rolling request timestamps (ms epoch) within the rate window. */
  recent: number[];
}

/** Rolling rate-limit window. */
export const RATE_WINDOW_MS = 60_000;

/** Bound on stored timestamps so docs stay small. */
export const MAX_RECENT_SAMPLES = 120;

/** Actors that run on the owner's behalf (cron/MCP) — see policy above. */
export const SYSTEM_ACTORS = new Set(["court", "thread-responder", "agent", "indexing"]);

export const DEFAULT_MAX_OUTPUT_TOKENS = 2_000;
export const HARD_MAX_OUTPUT_TOKENS = 8_000;
export const MIN_OUTPUT_TOKENS = 64;
/** Hard ceiling on total input characters for any chat-shaped model call. */
export const MAX_INPUT_CHARS = 200_000;

export const DEFAULT_LIMITS: AiUsageLimits = {
  ratePerMinute: 6,
  userDailyCap: 200_000,
  globalDailyCap: 1_000_000,
};

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

/**
 * Owner-configurable guard parameters, read from the Convex Keys panel env:
 * AI_RATE_LIMIT_PER_MINUTE (default 6), AI_USER_DAILY_CAP_TOKENS (default
 * 200,000), AI_DAILY_BUDGET_TOKENS (default 1,000,000). Also exported from
 * ollama.ts for callers that need the current values.
 */
export function getAiLimits(): AiUsageLimits {
  return {
    ratePerMinute: envInt("AI_RATE_LIMIT_PER_MINUTE", DEFAULT_LIMITS.ratePerMinute, 0, 120),
    userDailyCap: envInt("AI_USER_DAILY_CAP_TOKENS", DEFAULT_LIMITS.userDailyCap, 1_000, 100_000_000),
    globalDailyCap: envInt("AI_DAILY_BUDGET_TOKENS", DEFAULT_LIMITS.globalDailyCap, 1_000, 1_000_000_000),
  };
}

/** Clamp a requested max_tokens value into [MIN, HARD_MAX]. */
export function clampOutputTokens(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return DEFAULT_MAX_OUTPUT_TOKENS;
  return Math.max(MIN_OUTPUT_TOKENS, Math.min(HARD_MAX_OUTPUT_TOKENS, Math.floor(requested)));
}

/** Rough conservative token estimate for a chat call (input chars / 4 + reserved output). */
export function estimateChatTokens(totalInputChars: number, maxOutputTokens: number): number {
  return Math.ceil(totalInputChars / 4) + maxOutputTokens;
}

/** Rough conservative token estimate for an embedding call. */
export function estimateEmbeddingTokens(chars: number): number {
  return Math.ceil(chars / 4) + 64;
}

/**
 * Rough estimate for one full consultant-court run (3 consultants + judge,
 * ~6k tokens each). The court chain in mongodb.ts predates the token guard and
 * its call site is not editable with this repo's tooling, so court runs are
 * charged at their entry points (MCP dispatch in http.ts, automation cron in
 * crons.ts) using this fixed estimate instead of per-call charging.
 */
export const COURT_RUN_ESTIMATE_TOKENS = 24_000;

/** UTC calendar-day key ("YYYY-MM-DD") used for daily budget buckets. */
export function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function isUserActor(actor: string): boolean {
  return actor.startsWith("user:");
}

export type UsageDecision =
  | { allowed: true; next: AiUsageDoc; globalNext: AiUsageDoc }
  | { allowed: false; reason: string; retryAfterMs?: number };

/**
 * Decide whether `estimatedTokens` may be consumed by `actor` today, given the
 * actor's current usage doc and the global doc. Returns the next doc states so
 * the caller (a single atomic mutation) can persist them.
 */
export function evaluateAiUsage(params: {
  actor: string;
  day: string;
  estimatedTokens: number;
  now: number;
  limits: AiUsageLimits;
  usage: AiUsageDoc | null;
  globalUsage: AiUsageDoc | null;
}): UsageDecision {
  const { actor, day, estimatedTokens, now, limits } = params;
  const userActor = isUserActor(actor);

  // Rate limit — users only, rolling 60s window.
  const recent = (params.usage?.recent ?? []).filter((timestamp) => now - timestamp < RATE_WINDOW_MS);
  if (
    userActor &&
    limits.ratePerMinute > 0 &&
    recent.length >= limits.ratePerMinute
  ) {
    const oldest = recent[0];
    return {
      allowed: false,
      reason: "Too many AI requests — slow down",
      retryAfterMs: Math.max(0, oldest + RATE_WINDOW_MS - now),
    };
  }

  // Per-actor daily cap — users only.
  const usageTokens = params.usage?.tokens ?? 0;
  if (userActor && limits.userDailyCap > 0 && usageTokens + estimatedTokens > limits.userDailyCap) {
    return { allowed: false, reason: "This account's daily AI limit has been reached" };
  }

  // App-wide daily budget — everyone.
  const globalTokens = params.globalUsage?.tokens ?? 0;
  if (limits.globalDailyCap > 0 && globalTokens + estimatedTokens > limits.globalDailyCap) {
    return { allowed: false, reason: "The app-wide AI budget for today is exhausted" };
  }

  const nextRecent = userActor ? [...recent, now].slice(-MAX_RECENT_SAMPLES) : [];
  return {
    allowed: true,
    next: {
      actor,
      day,
      requests: (params.usage?.requests ?? 0) + 1,
      tokens: usageTokens + estimatedTokens,
      recent: nextRecent,
    },
    globalNext: {
      actor: "global",
      day,
      requests: (params.globalUsage?.requests ?? 0) + 1,
      tokens: globalTokens + estimatedTokens,
      recent: [],
    },
  };
}
