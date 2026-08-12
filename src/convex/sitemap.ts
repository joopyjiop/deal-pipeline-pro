/**
 * Sitemap-driven URL discovery.
 *
 * Turns one seed URL (e.g. a real-estate portal homepage) into a bounded batch
 * of real listing URLs by reading the site's robots.txt sitemap references and
 * standard sitemap locations. The parsers are pure and unit-testable; the
 * orchestrator takes an injectable fetch so tests never hit the network.
 *
 * Discovery only narrows WHERE to look — it never invents data and never
 * qualifies anything. Every discovered URL still flows through the existing
 * public-URL gates and the owner-review staging queue.
 */

export type SitemapFetch = (url: string) => Promise<{ ok: boolean; status?: number; text(): Promise<string> }>;

export type SitemapDiscoverResult = {
  sitemapsUsed: string[];
  discovered: string[];
  truncated: boolean;
  errors: Array<{ url: string; error: string }>;
};

/** Decode the few XML entities that appear in <loc> values. */
export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Extract every <loc> value from sitemap XML, trimmed and entity-decoded. */
export function extractLocs(xml: string): string[] {
  const urls: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) {
    const value = decodeXmlEntities(match[1].trim());
    if (value) urls.push(value);
  }
  return urls;
}

export type ParsedSitemap = { kind: "index" | "urlset" | "unknown"; urls: string[] };

/** Classify sitemap XML and pull its locs. Tolerates namespaces and casing. */
export function parseSitemapXml(xml: string): ParsedSitemap {
  const trimmed = xml.trim();
  const urls = extractLocs(trimmed);
  if (/<sitemapindex[^>]*>/i.test(trimmed)) return { kind: "index", urls };
  if (/<urlset[^>]*>/i.test(trimmed)) return { kind: "urlset", urls };
  return { kind: "unknown", urls };
}

/** True when the URL lives on the same public site (www and scheme ignored). */
export function samePublicSite(url: string, hostname: string): boolean {
  try {
    const candidate = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return candidate === hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
}

/**
 * Rough preference score for ordering discovered URLs: deeper paths, numeric
 * slugs, and detail/listing path segments are treated as more listing-like.
 * Used only to order a bounded batch; nothing is ever dropped for a low score
 * within the limit.
 */
export function listingPreference(url: string): number {
  try {
    const path = new URL(url).pathname;
    const segments = path.split("/").filter(Boolean).length;
    const digits = (path.match(/\d+/g) ?? []).length;
    const detail = /(details?|property|listing|home|auction|pdp|\/h\/|\/p\/)/i.test(path) ? 2 : 0;
    return segments * 10 + digits * 2 + detail;
  } catch {
    return 0;
  }
}

/** Standard sitemap locations to probe when robots.txt gives no references. */
export function probeSitemapCandidates(seedUrl: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(seedUrl);
  } catch {
    return [];
  }
  const base = parsed.origin;
  return ["/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/sitemaps/sitemapindex.xml"].map((path) => base + path);
}

/** Extract `Sitemap:` lines from robots.txt (case-insensitive). */
export function sitemapRefsFromRobots(robotsText: string): string[] {
  const refs: string[] = [];
  for (const line of robotsText.split(/\r?\n/)) {
    const match = line.trim().match(/^sitemap:\s*(.+)$/i);
    if (match && /^https?:\/\//i.test(match[1].trim())) refs.push(match[1].trim());
  }
  return refs;
}

/**
 * Bounded, pure-ish reducer: given parsed sitemap documents, collect the same-
 * site URLs up to the limit, ordered by listing preference. Returns everything
 * discovered plus whether the budget was exhausted.
 */
export function collectSitemapBatch(parsed: ParsedSitemap[], hostname: string, maxUrls: number): { urls: string[]; truncated: boolean } {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const document of parsed) {
    for (const url of document.urls) {
      if (!samePublicSite(url, hostname)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      urls.push(url);
    }
    if (urls.length >= maxUrls) break;
  }
  urls.sort((a, b) => listingPreference(b) - listingPreference(a));
  const bounded = urls.slice(0, maxUrls);
  return { urls: bounded, truncated: urls.length > bounded.length };
}

/**
 * Discover listing URLs for one seed: read robots.txt sitemap refs (falling
 * back to standard sitemap locations), fetch sitemap documents (following
 * index → child references, bounded), and return the same-site URL batch.
 */
export async function discoverSitemapUrls(options: {
  seedUrl: string;
  fetchFn: SitemapFetch;
  maxSitemaps?: number;
  maxUrls?: number;
}): Promise<SitemapDiscoverResult> {
  const maxSitemaps = Math.max(1, Math.min(20, Math.floor(options.maxSitemaps ?? 8)));
  const maxUrls = Math.max(1, Math.min(1000, Math.floor(options.maxUrls ?? 500)));
  const seed = new URL(options.seedUrl);
  const hostname = seed.hostname;
  const errors: Array<{ url: string; error: string }> = [];

  // 1. Prefer the site's own robots.txt sitemap references.
  let refs: string[] = [];
  try {
    const robotsUrl = seed.origin + "/robots.txt";
    const robotsResponse = await options.fetchFn(robotsUrl);
    if (robotsResponse.ok) {
      const text = await robotsResponse.text();
      refs = sitemapRefsFromRobots(text).filter((ref) => samePublicSite(ref, hostname));
    }
  } catch (error) {
    errors.push({ url: seed.origin + "/robots.txt", error: error instanceof Error ? error.message : String(error) });
  }
  // 1b. No robots refs: probe standard sitemap locations until one answers.
  // Probe misses are speculative, so they are skipped silently — only real
  // fetch failures are recorded.
  if (refs.length === 0) {
    for (const candidate of probeSitemapCandidates(seed.toString())) {
      if (!samePublicSite(candidate, hostname)) continue;
      try {
        const response = await options.fetchFn(candidate);
        if (response.ok) {
          refs = [candidate];
          break;
        }
      } catch (error) {
        errors.push({ url: candidate, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  // 2. Fetch sitemap documents, bounded, following index files one level deep.
  const sitemapsUsed: string[] = [];
  const parsedDocs: ParsedSitemap[] = [];
  const pending = [...refs];
  const visited = new Set<string>();
  while (pending.length > 0 && sitemapsUsed.length < maxSitemaps) {
    const url = pending.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    try {
      const response = await options.fetchFn(url);
      if (!response.ok) {
        errors.push({ url, error: `HTTP ${response.status}` });
        continue;
      }
      const parsed = parseSitemapXml(await response.text());
      sitemapsUsed.push(url);
      if (parsed.kind === "index") {
        for (const child of parsed.urls) {
          if (samePublicSite(child, hostname) && !visited.has(child) && pending.length < maxSitemaps * 4) {
            pending.push(child);
          }
        }
      } else if (parsed.kind === "urlset") {
        parsedDocs.push(parsed);
      }
    } catch (error) {
      errors.push({ url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  // 3. Same-site filter, dedupe, order by listing preference, bound.
  const batch = collectSitemapBatch(parsedDocs, hostname, maxUrls);
  // Truncation means either the URL budget ran out or sitemap files remain
  // unexplored because the sitemap cap was hit — both are caller signals.
  const truncated = batch.truncated || pending.length > 0;
  return { sitemapsUsed, discovered: batch.urls, truncated, errors };
}
