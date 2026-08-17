/**
 * DealProof Web Intelligence — standalone, dependency-free reference.
 *
 * Node 18+ (global fetch). No Convex, no framework. The routing logic mirrors
 * src/convex/webIntelCore.ts in the main app so the two stay interchangeable.
 *
 *   FIRECRAWL_API_KEY                    optional — enables /map + /scrape fallback
 *   SGAI_API_KEY                         optional — enables extract mode
 *   CAMOFOX_BASE_URL / CAMOFOX_API_KEY   optional — owner-only browser escalation
 */

export type WebIntelMode = "auto" | "discover" | "fetch" | "extract";

export type WebIntelArgs = {
  url: string;
  sourceType: string;
  mode?: WebIntelMode;
  prompt?: string;
  schema?: Record<string, unknown>;
  maxUrls?: number;
  maxPages?: number;
  fetchImpl?: typeof fetch;
};

export type WebIntelReport = {
  provider: "web-intel";
  mode: WebIntelMode;
  seedUrl: string;
  sourceType: string;
  plan: Array<{ step: string; provider: string; note?: string }>;
  providers: Record<string, "used" | "fallback" | "not-used" | "owner-only">;
  discovery?: unknown;
  fetch?: unknown;
  extraction?: { targets: string[]; results: unknown[] };
  errors: Array<{ phase: string; error: string }>;
  warnings: string[];
};

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  const raw = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(min, Math.min(max, raw));
}

export function webIntelPlan(args: Pick<WebIntelArgs, "mode" | "prompt" | "maxUrls" | "maxPages">) {
  const mode: WebIntelMode = args.mode ?? "auto";
  const prompt = (args.prompt ?? "").trim();
  const extract = mode === "extract" || (mode === "auto" && prompt.length > 0);
  const steps: Array<{ step: string; provider: string; note?: string }> = [];
  if (mode === "discover" || mode === "auto") {
    steps.push({ step: "discover", provider: "sitemap", note: "robots.txt → sitemap.xml → same-site listing URLs" });
  }
  if (mode === "fetch" || mode === "auto") {
    steps.push({ step: "fetch", provider: "fetch", note: "plain fetch first; empty/JS-challenge pages re-render through Firecrawl" });
  }
  if (extract) {
    steps.push({ step: "extract", provider: "scrapegraph", note: "structured facts via ScrapeGraphAI" });
  }
  steps.push({ step: "escalate", provider: "camofox", note: "owner-only anti-detection browser for bot-protected portals" });
  return {
    mode,
    extract,
    maxUrls: clamp(args.maxUrls, 60, 1, 200),
    maxPages: clamp(args.maxPages, 3, 1, 12),
    steps,
  };
}

const ASSET_RE = /\.(?:css|csv|gif|ico|jpe?g|js|json|mp3|mp4|pdf|png|svg|webp|woff2?|xml|zip)$/i;

function samePublicSite(url: string, hostname: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "") === hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
}

function sitemapRefsFromRobots(robotsText: string): string[] {
  const refs: string[] = [];
  for (const line of robotsText.split(/\r?\n/)) {
    const match = line.trim().match(/^sitemap:\s*(.+)$/i);
    if (match && /^https?:\/\//i.test(match[1].trim())) refs.push(match[1].trim());
  }
  return refs;
}

function extractLocs(xml: string): string[] {
  const urls: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const value = match[1]
      .trim()
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    if (value) urls.push(value);
  }
  return urls;
}

export async function discoverSitemapUrls(seedUrl: string, fetchImpl: typeof fetch, maxUrls: number): Promise<{ sitemapsUsed: string[]; discovered: string[]; errors: Array<{ url: string; error: string }> }> {
  const seed = new URL(seedUrl);
  const hostname = seed.hostname;
  const errors: Array<{ url: string; error: string }> = [];
  const sitemapsUsed: string[] = [];
  let refs: string[] = [];

  try {
    const robots = await fetchImpl(seed.origin + "/robots.txt", { signal: AbortSignal.timeout(15000) });
    if (robots.ok) {
      refs = sitemapRefsFromRobots(await robots.text()).filter((ref) => samePublicSite(ref, hostname));
    }
  } catch (error) {
    errors.push({ url: seed.origin + "/robots.txt", error: error instanceof Error ? error.message : String(error) });
  }

  if (refs.length === 0) {
    for (const candidate of ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/sitemaps/sitemapindex.xml"].map((path) => seed.origin + path)) {
      try {
        const response = await fetchImpl(candidate, { signal: AbortSignal.timeout(15000) });
        if (response.ok) {
          refs = [candidate];
          break;
        }
      } catch (error) {
        errors.push({ url: candidate, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  const discovered = new Set<string>();
  const visited = new Set<string>();
  const pending = [...refs];
  while (pending.length > 0 && sitemapsUsed.length < 8) {
    const url = pending.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    try {
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) {
        errors.push({ url, error: `HTTP ${response.status}` });
        continue;
      }
      const xml = await response.text();
      sitemapsUsed.push(url);
      if (/<sitemapindex[^>]*>/i.test(xml)) {
        for (const child of extractLocs(xml)) {
          if (samePublicSite(child, hostname) && !visited.has(child)) pending.push(child);
        }
      } else {
        for (const loc of extractLocs(xml)) {
          if (samePublicSite(loc, hostname) && !ASSET_RE.test(new URL(loc).pathname)) discovered.add(loc);
        }
      }
    } catch (error) {
      errors.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return { sitemapsUsed, discovered: Array.from(discovered).slice(0, maxUrls), errors };
}

async function firecrawl(path: "/map" | "/scrape", body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const key = process.env.FIRECRAWL_API_KEY?.trim();
  if (!key) throw new Error("FIRECRAWL_API_KEY is not set");
  const response = await fetch(`https://api.firecrawl.dev/v1${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(`Firecrawl ${path} failed (${response.status})`);
  }
  return payload ?? {};
}

async function fetchPage(url: string, fetchImpl: typeof fetch): Promise<{ url: string; text: string; provider: "fetch" | "firecrawl-render" }> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { "user-agent": "DealProof-web-intel/1.0 (+public-source-review)" },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new Error(`fetch failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    if (response.status === 403 || response.status === 429) throw new Error(`Source declined automated access (HTTP ${response.status}) — no bypass attempted`);
    throw new Error(`Source returned HTTP ${response.status}`);
  }
  const text = (await response.text()).slice(0, 1_000_000);
  if (text.trim().length >= 200) return { url, text, provider: "fetch" };

  // Empty / JS-challenge shell → Firecrawl re-render fallback.
  const scraped = await firecrawl("/scrape", { url, formats: ["markdown"], onlyMainContent: true, removeBase64Images: true });
  const data = (scraped.data as { markdown?: string } | undefined) ?? {};
  if ((data.markdown ?? "").trim().length >= 200) {
    return { url, text: (data.markdown ?? "").slice(0, 8000), provider: "firecrawl-render" };
  }
  return { url, text, provider: "fetch" };
}

async function extractFacts(url: string, prompt: string, schema?: Record<string, unknown>): Promise<unknown> {
  const key = process.env.SGAI_API_KEY?.trim();
  if (!key) throw new Error("SGAI_API_KEY is not set");
  const body: Record<string, unknown> = { url, prompt, mode: "normal" };
  if (schema && Object.keys(schema).length > 0) body.schema = schema;
  const response = await fetch("https://v2-api.scrapegraphai.com/api/extract", {
    method: "POST",
    headers: { "SGAI-APIKEY": key, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error(`ScrapeGraphAI extract failed (${response.status})`);
  return payload;
}

export async function runWebIntel(args: WebIntelArgs): Promise<WebIntelReport> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const plan = webIntelPlan(args);
  const report: WebIntelReport = {
    provider: "web-intel",
    mode: plan.mode,
    seedUrl: args.url,
    sourceType: args.sourceType,
    plan: plan.steps,
    providers: {
      sitemap: plan.mode === "discover" || plan.mode === "auto" ? "used" : "not-used",
      fetch: plan.mode === "fetch" || plan.mode === "auto" ? "used" : "not-used",
      firecrawl: plan.mode === "fetch" || plan.mode === "auto" ? "fallback" : "not-used",
      scrapegraph: plan.extract ? "used" : "not-used",
      camofox: "owner-only",
    },
    errors: [],
    warnings: ["Camofox is owner-only; escalate bot-protected pages to the owner."],
  };

  let discoveredUrls: string[] = [];
  if (plan.mode === "discover" || plan.mode === "auto") {
    try {
      const discovery = await discoverSitemapUrls(args.url, fetchImpl, plan.maxUrls);
      report.discovery = discovery;
      discoveredUrls = discovery.discovered;
    } catch (error) {
      report.errors.push({ phase: "discover", error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (plan.mode === "fetch" || plan.mode === "auto") {
    try {
      report.fetch = await fetchPage(args.url, fetchImpl);
    } catch (error) {
      report.errors.push({ phase: "fetch", error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (plan.extract) {
    const targets = Array.from(new Set([args.url, ...discoveredUrls])).slice(0, plan.maxPages);
    const results: unknown[] = [];
    for (const target of targets) {
      try {
        results.push(await extractFacts(target, (args.prompt ?? "").trim(), args.schema));
      } catch (error) {
        results.push({ url: target, error: error instanceof Error ? error.message : String(error) });
      }
    }
    report.extraction = { targets, results };
  }

  return report;
}
