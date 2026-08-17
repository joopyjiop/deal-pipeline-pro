// Unit tests for the web-intelligence routing helpers (src/convex/webIntelCore.ts).
// Lives outside src/convex/ so the Convex bundle never sees the bun:test import.
import { describe, expect, test } from "bun:test";
import {
  chooseExtractionTargets,
  clampWebIntelBudget,
  webIntelPlan,
  webIntelProviderSummary,
} from "../src/convex/webIntelCore";

describe("clampWebIntelBudget", () => {
  test("uses the fallback when the value is undefined", () => {
    expect(clampWebIntelBudget(undefined, 60, 1, 200)).toBe(60);
  });

  test("floors and clamps below the minimum", () => {
    expect(clampWebIntelBudget(0, 60, 1, 200)).toBe(1);
    expect(clampWebIntelBudget(-4, 60, 1, 200)).toBe(1);
  });

  test("caps above the maximum", () => {
    expect(clampWebIntelBudget(999, 60, 1, 200)).toBe(200);
  });

  test("floors fractional values", () => {
    expect(clampWebIntelBudget(7.9, 60, 1, 200)).toBe(7);
  });
});

describe("webIntelPlan", () => {
  test("defaults to auto mode with discover and fetch but no extraction without a prompt", () => {
    const plan = webIntelPlan({});
    expect(plan.mode).toBe("auto");
    expect(plan.extract).toBe(false);
    expect(plan.steps.map((step) => step.step)).toEqual(["discover", "fetch", "escalate"]);
    expect(plan.steps.map((step) => step.provider)).toEqual(["sitemap", "fetch", "camofox"]);
  });

  test("auto mode with a prompt adds the scrapegraph extract step", () => {
    const plan = webIntelPlan({ prompt: "Extract the sale amount" });
    expect(plan.extract).toBe(true);
    expect(plan.steps.map((step) => step.step)).toEqual(["discover", "fetch", "extract", "escalate"]);
  });

  test("discover mode runs sitemap only", () => {
    const plan = webIntelPlan({ mode: "discover" });
    expect(plan.mode).toBe("discover");
    expect(plan.steps.map((step) => step.step)).toEqual(["discover", "escalate"]);
  });

  test("fetch mode runs fetch only", () => {
    const plan = webIntelPlan({ mode: "fetch" });
    expect(plan.steps.map((step) => step.step)).toEqual(["fetch", "escalate"]);
  });

  test("extract mode runs scrapegraph only", () => {
    const plan = webIntelPlan({ mode: "extract", prompt: "What is the parcel id?" });
    expect(plan.extract).toBe(true);
    expect(plan.steps.map((step) => step.step)).toEqual(["extract", "escalate"]);
  });

  test("clamps maxUrls and maxPages into their safe ranges", () => {
    const plan = webIntelPlan({ maxUrls: 5_000, maxPages: 0 });
    expect(plan.maxUrls).toBe(200);
    expect(plan.maxPages).toBe(1);
  });
});

describe("chooseExtractionTargets", () => {
  test("seeds first, dedupes, and respects the page budget", () => {
    const targets = chooseExtractionTargets("https://x.com/a", ["https://x.com/b", "https://x.com/a", "https://x.com/c"], 2);
    expect(targets).toEqual(["https://x.com/a", "https://x.com/b"]);
  });

  test("ignores blank discovered URLs", () => {
    const targets = chooseExtractionTargets("https://x.com/a", ["  ", "https://x.com/b"], 3);
    expect(targets).toEqual(["https://x.com/a", "https://x.com/b"]);
  });

  test("never returns fewer than one target", () => {
    expect(chooseExtractionTargets("https://x.com/a", [], 1)).toEqual(["https://x.com/a"]);
  });
});

describe("webIntelProviderSummary", () => {
  test("auto without a prompt: sitemap + fetch used, firecrawl fallback, no scrapegraph", () => {
    const plan = webIntelPlan({ mode: "auto" });
    expect(webIntelProviderSummary(plan)).toEqual({
      sitemap: "used",
      fetch: "used",
      firecrawl: "fallback",
      scrapegraph: "not-used",
      camofox: "owner-only",
    });
  });

  test("auto with a prompt marks scrapegraph as used", () => {
    const plan = webIntelPlan({ mode: "auto", prompt: "Extract facts" });
    expect(webIntelProviderSummary(plan).scrapegraph).toBe("used");
  });

  test("extract mode uses only scrapegraph and keeps camofox owner-only", () => {
    const plan = webIntelPlan({ mode: "extract", prompt: "Extract" });
    expect(webIntelProviderSummary(plan)).toEqual({
      sitemap: "not-used",
      fetch: "not-used",
      firecrawl: "not-used",
      scrapegraph: "used",
      camofox: "owner-only",
    });
  });
});
