// Unit tests for src/convex/aiUsageCore.ts — the pure AI token-guard logic:
// output/input clamps, token estimation, and the per-actor + global budget
// decision. Lives outside src/convex/ so the Convex bundle never sees bun:test.
import { afterEach, describe, expect, test } from "bun:test";
import {
  clampOutputTokens,
  COURT_RUN_ESTIMATE_TOKENS,
  dayKey,
  DEFAULT_LIMITS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  estimateChatTokens,
  estimateEmbeddingTokens,
  evaluateAiUsage,
  getAiLimits,
  HARD_MAX_OUTPUT_TOKENS,
  isUserActor,
  MAX_INPUT_CHARS,
  MIN_OUTPUT_TOKENS,
  type AiUsageDoc,
} from "../src/convex/aiUsageCore";

const now = Date.UTC(2026, 7, 19, 12, 0, 0);
const day = dayKey(now);

function usage(overrides: Partial<AiUsageDoc> = {}): AiUsageDoc {
  return { actor: "user:someone", day, requests: 0, tokens: 0, recent: [], ...overrides };
}

const limits = { ...DEFAULT_LIMITS };

afterEach(() => {
  delete process.env.AI_RATE_LIMIT_PER_MINUTE;
  delete process.env.AI_USER_DAILY_CAP_TOKENS;
  delete process.env.AI_DAILY_BUDGET_TOKENS;
});

describe("clampOutputTokens", () => {
  test("defaults to 2000 when no request value is given", () => {
    expect(clampOutputTokens(undefined)).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });
  test("clamps to the hard ceiling", () => {
    expect(clampOutputTokens(100_000)).toBe(HARD_MAX_OUTPUT_TOKENS);
    expect(clampOutputTokens(HARD_MAX_OUTPUT_TOKENS)).toBe(HARD_MAX_OUTPUT_TOKENS);
  });
  test("floors at the minimum", () => {
    expect(clampOutputTokens(1)).toBe(MIN_OUTPUT_TOKENS);
  });
  test("tolerates NaN / Infinity", () => {
    expect(clampOutputTokens(Number.NaN)).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
    expect(clampOutputTokens(Number.POSITIVE_INFINITY)).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });
});

describe("token estimation", () => {
  test("chat estimate = input chars / 4 + reserved output", () => {
    expect(estimateChatTokens(400, 2000)).toBe(2100);
    expect(estimateChatTokens(0, 700)).toBe(700);
  });
  test("embedding estimate adds a small margin", () => {
    expect(estimateEmbeddingTokens(400)).toBe(164);
  });
  test("court run estimate is a fixed per-run charge", () => {
    expect(COURT_RUN_ESTIMATE_TOKENS).toBe(24_000);
  });
});

describe("dayKey", () => {
  test("uses UTC calendar days", () => {
    expect(dayKey(Date.UTC(2026, 0, 1, 23, 59))).toBe("2026-01-01");
    expect(dayKey(Date.UTC(2026, 0, 2, 0, 1))).toBe("2026-01-02");
  });
});

describe("isUserActor", () => {
  test("only actors prefixed user: are treated as end users", () => {
    expect(isUserActor("user:abc123")).toBe(true);
    expect(isUserActor("court")).toBe(false);
    expect(isUserActor("agent")).toBe(false);
    expect(isUserActor("thread-responder")).toBe(false);
    expect(isUserActor("indexing")).toBe(false);
  });
});

describe("evaluateAiUsage", () => {
  const base = {
    actor: "user:alice",
    day,
    estimatedTokens: 1000,
    now,
    limits,
  };

  test("allows a fresh request and returns the next doc states", () => {
    const decision = evaluateAiUsage({ ...base, usage: null, globalUsage: null });
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.next.requests).toBe(1);
    expect(decision.next.tokens).toBe(1000);
    expect(decision.next.recent).toEqual([now]);
    expect(decision.globalNext.actor).toBe("global");
    expect(decision.globalNext.tokens).toBe(1000);
  });

  test("accumulates across requests", () => {
    const prior = usage({ requests: 3, tokens: 4000, recent: [now - 10_000, now - 20_000, now - 30_000] });
    const decision = evaluateAiUsage({
      ...base,
      estimatedTokens: 2500,
      usage: prior,
      globalUsage: usage({ actor: "global", requests: 9, tokens: 40_000 }),
    });
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.next.requests).toBe(4);
    expect(decision.next.tokens).toBe(6500);
    expect(decision.globalNext.tokens).toBe(42_500);
  });

  test("blocks a user when the rate window is full and reports retryAfterMs", () => {
    const recent = [now - 1000, now - 2000, now - 3000, now - 4000, now - 5000, now - 6000];
    const decision = evaluateAiUsage({
      ...base,
      usage: usage({ requests: 6, tokens: 100, recent }),
      globalUsage: null,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toContain("slow down");
    expect(decision.retryAfterMs).toBe(59_000);
  });

  test("prunes timestamps outside the 60s window so the rate limit slides", () => {
    const recent = [now - 90_000, now - 80_000, now - 10_000, now - 20_000, now - 30_000, now - 40_000];
    const decision = evaluateAiUsage({
      ...base,
      usage: usage({ requests: 6, tokens: 0, recent }),
      globalUsage: null,
    });
    // Only 4 timestamps remain inside the window → allowed.
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.next.recent).toHaveLength(5); // 4 live + the new one
  });

  test("blocks a user once their daily token cap is exhausted", () => {
    const decision = evaluateAiUsage({
      ...base,
      estimatedTokens: 50_000,
      usage: usage({ requests: 2, tokens: 160_000 }),
      globalUsage: null,
    });
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reason).toContain("daily AI limit");
  });

  test("system actors are not rate-limited per minute", () => {
    const decision = evaluateAiUsage({
      ...base,
      actor: "court",
      usage: usage({ actor: "court", requests: 40, tokens: 100, recent: Array.from({ length: 40 }, () => now - 1000) }),
      globalUsage: null,
    });
    expect(decision.allowed).toBe(true);
  });

  test("system actors have no per-actor daily cap but still hit the global budget", () => {
    const decision = evaluateAiUsage({
      ...base,
      actor: "agent",
      estimatedTokens: 200_000,
      usage: usage({ actor: "agent", requests: 1, tokens: 300_000 }),
      globalUsage: null,
    });
    expect(decision.allowed).toBe(true); // per-actor cap skipped for system actors

    const globalDecision = evaluateAiUsage({
      ...base,
      actor: "agent",
      estimatedTokens: 200_000,
      usage: null,
      globalUsage: usage({ actor: "global", requests: 1, tokens: 900_000 }),
    });
    expect(globalDecision.allowed).toBe(false);
    if (globalDecision.allowed) return;
    expect(globalDecision.reason).toContain("app-wide");
  });

  test("user actors are also bounded by the app-wide budget", () => {
    const decision = evaluateAiUsage({
      ...base,
      usage: null,
      globalUsage: usage({ actor: "global", requests: 1, tokens: 999_500 }),
    });
    expect(decision.allowed).toBe(false);
  });

  test("respects a zero limit as disabled", () => {
    const decision = evaluateAiUsage({
      ...base,
      limits: { ...limits, ratePerMinute: 0, userDailyCap: 0, globalDailyCap: 0 },
      usage: usage({ requests: 999, tokens: 10_000_000, recent: Array.from({ length: 50 }, () => now - 1000) }),
      globalUsage: usage({ actor: "global", requests: 999, tokens: 10_000_000 }),
    });
    expect(decision.allowed).toBe(true);
  });
});

describe("getAiLimits", () => {
  test("uses sane defaults when env vars are unset", () => {
    expect(getAiLimits()).toEqual(DEFAULT_LIMITS);
  });
  test("reads and clamps owner env overrides", () => {
    process.env.AI_RATE_LIMIT_PER_MINUTE = "20";
    process.env.AI_USER_DAILY_CAP_TOKENS = "50000";
    process.env.AI_DAILY_BUDGET_TOKENS = "250000";
    expect(getAiLimits()).toEqual({ ratePerMinute: 20, userDailyCap: 50_000, globalDailyCap: 250_000 });
  });
  test("clamps absurd values and tolerates garbage", () => {
    process.env.AI_RATE_LIMIT_PER_MINUTE = "9999";
    process.env.AI_USER_DAILY_CAP_TOKENS = "not-a-number";
    process.env.AI_DAILY_BUDGET_TOKENS = "1";
    const result = getAiLimits();
    expect(result.ratePerMinute).toBe(120);
    expect(result.userDailyCap).toBe(DEFAULT_LIMITS.userDailyCap);
    expect(result.globalDailyCap).toBe(1_000);
  });
});

describe("input cap", () => {
  test("the hard input cap constant is enforced upstream", () => {
    expect(MAX_INPUT_CHARS).toBe(200_000);
  });
});
