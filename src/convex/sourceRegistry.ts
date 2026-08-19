// Canonical source registry — the curated public sources used to find leads.
// Single source of truth for:
//   - the Toolkit's "Default deal websites" (Camofox link crawler)
//   - the MCP `list_sources` tool agents (Odysseus/n8n) use to discover what
//     to scrape
//   - the agent briefing (docs/odysseus-briefing.md → Source registry)
//
// Pure module (no Convex imports) so unit tests can exercise the dedupe rules
// directly. URLs are normalized (https, lowercase host, no trailing slash) for
// duplicate detection — see normalizeSourceUrl/dedupeSourceUrls.

export type RegistrySourceType =
  | "SHERIFF_SALE"
  | "TAX_SALE"
  | "AUCTION_COM"
  | "FORECLOSURE"
  | "MARKETPLACE"
  | "ASSOCIATION";

export type RegistrySource = {
  id: string;
  name: string;
  domain: string;
  description: string;
  sourceType: RegistrySourceType;
  urls: string[];
};

export const SOURCE_REGISTRY: RegistrySource[] = [
  {
    id: "auction-com",
    name: "Auction.com",
    domain: "auction.com",
    description: "Public foreclosure and auction catalog",
    sourceType: "AUCTION_COM",
    urls: ["https://www.auction.com/", "https://www.auction.com/residential/"],
  },
  {
    id: "homepath",
    name: "Fannie Mae HomePath",
    domain: "homepath.fanniemae.com",
    description: "Fannie Mae REO and foreclosure listings",
    sourceType: "FORECLOSURE",
    urls: ["https://www.homepath.fanniemae.com/"],
  },
  {
    id: "foreclosure-com",
    name: "Foreclosure.com",
    domain: "foreclosure.com",
    description: "Foreclosure and pre-foreclosure listings",
    sourceType: "FORECLOSURE",
    urls: ["https://www.foreclosure.com/"],
  },
  {
    id: "connected-investors",
    name: "Connected Investors",
    domain: "connectedinvestors.com",
    description: "Off-market distressed property marketplace",
    sourceType: "MARKETPLACE",
    urls: ["https://connectedinvestors.com/"],
  },
  {
    id: "national-reia",
    name: "National REIA",
    domain: "nationalreia.org",
    description: "Investor association and chapter network",
    sourceType: "ASSOCIATION",
    urls: ["https://nationalreia.org/"],
  },
  {
    id: "allen-county-sheriff",
    name: "Allen County sheriff sales",
    domain: "allencountysheriff.org",
    description: "Official Allen County, IN sheriff sale calendar",
    sourceType: "SHERIFF_SALE",
    urls: ["https://www.allencountysheriff.org/2026-sheriff-sales/"],
  },
  {
    id: "allen-county-tax",
    name: "Allen County tax sale",
    domain: "allencounty.in.gov",
    description: "Official Allen County, IN tax sale page",
    sourceType: "TAX_SALE",
    urls: ["https://www.allencounty.in.gov/270/Tax-Sale"],
  },
];

/** Normalize a URL for duplicate detection: https, lowercase host, no trailing slash. */
export function normalizeSourceUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    parsed.protocol = "https:";
    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

/** Remove duplicate URLs from a list (normalized comparison, first occurrence kept). */
export function dedupeSourceUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of urls) {
    const normalized = normalizeSourceUrl(url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(url.trim());
  }
  return result;
}

/** All distinct normalized URLs across the whole registry (for duplicate audits). */
export function registryNormalizedUrls(sources: RegistrySource[]): string[] {
  const seen = new Set<string>();
  for (const source of sources) {
    for (const url of source.urls) {
      const normalized = normalizeSourceUrl(url);
      if (normalized) seen.add(normalized);
    }
  }
  return [...seen];
}
