/**
 * Pure routing logic for the DealProof web-intelligence "mega skill".
 *
 * No Convex or MongoDB imports — this module only decides which of the four
 * fetch surfaces a `web_intel` call should touch, in what order, and how its
 * provider summary and extraction targets should read. The Convex action that
 * actually performs the work lives in `./webIntel`; unit tests import this
 * module directly.
 */

export const WEB_INTEL_SOURCE_TYPES = [
  "SHERIFF_SALE",
  "TAX_SALE",
  "AUCTION_COM",
  "PROBATE",
  "OFF_MARKET",
  "ASSESSOR",
  "RECORDER",
  "PROPSTREAM",
  "BATCHLEADS",
  "DEALMACHINE",
  "FORECLOSURE",
  "MARKETPLACE",
  "ASSOCIATION",
] as const;

export type WebIntelSourceType = (typeof WEB_INTEL_SOURCE_TYPES)[number];

export const WEB_INTEL_MODES = ["auto", "discover", "fetch", "extract"] as const;
export type WebIntelMode = (typeof WEB_INTEL_MODES)[number];

export type WebIntelProvider = "sitemap" | "fetch" | "firecrawl" | "scrapegraph" | "camofox";
export type WebIntelProviderState = "used" | "fallback" | "not-used" | "owner-only";

export type WebIntelStep = {
  step: string;
  provider: string;
  note?: string;
};

export type WebIntelPlan = {
  mode: WebIntelMode;
  maxUrls: number;
  maxPages: number;
  extract: boolean;
  steps: WebIntelStep[];
};

/** Clamp a numeric budget to the pipeline's safe bounds. */
export function clampWebIntelBudget(value: number | undefined, fallback: number, min: number, max: number): number {
  const raw = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(min, Math.min(max, raw));
}

/** Pure: decide which of the four surfaces this call will touch, in order. */
export function webIntelPlan(args: {
  mode?: WebIntelMode;
  prompt?: string;
  maxUrls?: number;
  maxPages?: number;
}): WebIntelPlan {
  const mode: WebIntelMode = args.mode && WEB_INTEL_MODES.includes(args.mode) ? args.mode : "auto";
  const prompt = (args.prompt ?? "").trim();
  const extract = mode === "extract" || (mode === "auto" && prompt.length > 0);

  const steps: WebIntelStep[] = [];
  if (mode === "discover" || mode === "auto") {
    steps.push({
      step: "discover",
      provider: "sitemap",
      note: "robots.txt sitemap refs → standard sitemap locations → same-site listing URLs, staged for owner review",
    });
  }
  if (mode === "fetch" || mode === "auto") {
    steps.push({
      step: "fetch",
      provider: "fetch",
      note: "plain fetch first; empty/JS-challenge pages are re-rendered through the Firecrawl fallback before staging",
    });
  }
  if (extract) {
    steps.push({
      step: "extract",
      provider: "scrapegraph",
      note: "structured property facts pulled from the fetched page(s) via ScrapeGraphAI, staged as bounded evidence",
    });
  }
  // Camofox is always listed so the agent knows the escalation exists, but it
  // is never driven from the MCP path — the owner uses it from the website.
  steps.push({
    step: "escalate",
    provider: "camofox",
    note: "owner-only anti-detection browser for bot-protected / JS-heavy / login-gated portals — not callable from the agent path",
  });

  return {
    mode,
    maxUrls: clampWebIntelBudget(args.maxUrls, 60, 1, 200),
    maxPages: clampWebIntelBudget(args.maxPages, 3, 1, 12),
    extract,
    steps,
  };
}

/** Pure: which extraction targets to run, bounded and deduped. */
export function chooseExtractionTargets(seedUrl: string, discoveredUrls: string[], maxPages: number): string[] {
  const targets: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    const url = raw.trim();
    if (!url || seen.has(url)) return;
    seen.add(url);
    targets.push(url);
  };
  add(seedUrl);
  for (const url of discoveredUrls) {
    if (targets.length >= maxPages) break;
    add(url);
  }
  return targets.slice(0, Math.max(1, maxPages));
}

/** Pure: intent-based provider summary for the report. */
export function webIntelProviderSummary(plan: WebIntelPlan): Record<WebIntelProvider, WebIntelProviderState> {
  const wantsDiscovery = plan.steps.some((step) => step.step === "discover");
  const wantsFetch = plan.steps.some((step) => step.step === "fetch");
  return {
    sitemap: wantsDiscovery ? "used" : "not-used",
    fetch: wantsFetch ? "used" : "not-used",
    firecrawl: wantsFetch ? "fallback" : "not-used",
    scrapegraph: plan.extract ? "used" : "not-used",
    camofox: "owner-only",
  };
}
