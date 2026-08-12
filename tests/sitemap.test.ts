// Unit tests for sitemap-driven URL discovery (src/convex/sitemap.ts).
//
// Lives outside src/convex/ so the Convex bundle never sees the bun:test
// import. The parsers are pure; the orchestrator is exercised with a mocked
// fetch so no network calls are made.

import { describe, expect, test } from "bun:test";
import {
  collectSitemapBatch,
  decodeXmlEntities,
  discoverSitemapUrls,
  extractLocs,
  listingPreference,
  parseSitemapXml,
  probeSitemapCandidates,
  samePublicSite,
  sitemapRefsFromRobots,
  type SitemapFetch,
} from "../src/convex/sitemap";

function okFetch(routes: Record<string, string | undefined>): SitemapFetch {
  return async (url) => {
    const body = routes[url];
    return body === undefined
      ? { ok: false, status: 404, text: async () => "" }
      : { ok: true, status: 200, text: async () => body };
  };
}

describe("decodeXmlEntities", () => {
  test("decodes common XML entities", () => {
    expect(decodeXmlEntities("a&amp;b &lt;x&gt; &quot;q&quot; &#39;apos&#39;")).toBe("a&b <x> \"q\" 'apos'");
  });
});

describe("extractLocs", () => {
  test("extracts and trims loc values", () => {
    const xml = `<urlset><url><loc> https://a.com/x </loc></url><url><loc>https://b.com/y</loc></url></urlset>`;
    expect(extractLocs(xml)).toEqual(["https://a.com/x", "https://b.com/y"]);
  });
});

describe("parseSitemapXml", () => {
  test("classifies a sitemap index", () => {
    const parsed = parseSitemapXml(`<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>`);
    expect(parsed.kind).toBe("index");
    expect(parsed.urls).toEqual(["https://a.com/s1.xml"]);
  });

  test("classifies a urlset", () => {
    const parsed = parseSitemapXml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://a.com/details/1-main-st-1234</loc></url></urlset>`);
    expect(parsed.kind).toBe("urlset");
    expect(parsed.urls).toHaveLength(1);
  });

  test("returns unknown for non-sitemap content", () => {
    const parsed = parseSitemapXml("<html><body>blocked</body></html>");
    expect(parsed.kind).toBe("unknown");
    expect(parsed.urls).toEqual([]);
  });
});

describe("samePublicSite", () => {
  test("ignores www and scheme differences", () => {
    expect(samePublicSite("https://www.auction.com/x", "auction.com")).toBe(true);
    expect(samePublicSite("http://auction.com/y", "www.auction.com")).toBe(true);
  });

  test("rejects other hosts", () => {
    expect(samePublicSite("https://evil.example.com/x", "auction.com")).toBe(false);
    expect(samePublicSite("https://auction.com.evil.io/x", "auction.com")).toBe(false);
  });

  test("returns false for malformed URLs", () => {
    expect(samePublicSite("not a url", "auction.com")).toBe(false);
  });
});

describe("listingPreference", () => {
  test("prefers deep listing-like paths", () => {
    const detail = listingPreference("https://a.com/details/416-2nd-st-willmar-mn-1925835");
    const shallow = listingPreference("https://a.com/");
    expect(detail).toBeGreaterThan(shallow);
  });
});

describe("probeSitemapCandidates", () => {
  test("builds standard sitemap locations from the seed origin", () => {
    const candidates = probeSitemapCandidates("https://www.auction.com/some/path");
    expect(candidates).toContain("https://www.auction.com/sitemap.xml");
    expect(candidates).toContain("https://www.auction.com/sitemap_index.xml");
  });

  test("returns empty for invalid seeds", () => {
    expect(probeSitemapCandidates("not a url")).toEqual([]);
  });
});

describe("sitemapRefsFromRobots", () => {
  test("extracts sitemap lines case-insensitively", () => {
    const robots = `User-agent: *\nSitemap: https://www.auction.com/sitemaps/sitemapindex.xml\nallow: /\n`;
    expect(sitemapRefsFromRobots(robots)).toEqual(["https://www.auction.com/sitemaps/sitemapindex.xml"]);
  });

  test("ignores non-http refs and other lines", () => {
    expect(sitemapRefsFromRobots("sitemap: /local.xml\nDisallow: /\n")).toEqual([]);
  });
});

describe("collectSitemapBatch", () => {
  test("dedupes, filters to the same site, orders by preference, and bounds", () => {
    const parsed = [
      { kind: "urlset" as const, urls: ["https://a.com/details/x-123", "https://a.com/", "https://a.com/details/x-123", "https://b.com/other"] },
      { kind: "urlset" as const, urls: ["https://a.com/details/y-456"] },
    ];
    const batch = collectSitemapBatch(parsed, "a.com", 10);
    expect(batch.urls).toHaveLength(3);
    expect(batch.truncated).toBe(false);
    expect(batch.urls).not.toContain("https://b.com/other");
    // The two detail pages outrank the homepage.
    expect(batch.urls[0]).toMatch(/details/);
    expect(batch.urls[1]).toMatch(/details/);
    expect(batch.urls[2]).toBe("https://a.com/");
  });

  test("flags truncation when the budget is exhausted", () => {
    const parsed = [{ kind: "urlset" as const, urls: ["https://a.com/1", "https://a.com/2", "https://a.com/3"] }];
    const batch = collectSitemapBatch(parsed, "a.com", 2);
    expect(batch.urls).toHaveLength(2);
    expect(batch.truncated).toBe(true);
  });
});

describe("discoverSitemapUrls", () => {
  test("follows robots.txt sitemap refs through an index into urlset files", async () => {
    const fetchFn = okFetch({
      "https://a.com/robots.txt": "Sitemap: https://a.com/sitemaps/index.xml\n",
      "https://a.com/sitemaps/index.xml": `<sitemapindex><sitemap><loc>https://a.com/sitemaps/pdp-0.xml</loc></sitemap><sitemap><loc>https://a.com/sitemaps/pdp-1.xml</loc></sitemap></sitemapindex>`,
      "https://a.com/sitemaps/pdp-0.xml": `<urlset><url><loc>https://a.com/details/1-main-100</loc></url><url><loc>https://a.com/details/2-oak-101</loc></url></urlset>`,
      "https://a.com/sitemaps/pdp-1.xml": `<urlset><url><loc>https://a.com/details/3-pine-102</loc></url></urlset>`,
    });
    const result = await discoverSitemapUrls({ seedUrl: "https://a.com/", fetchFn, maxSitemaps: 4, maxUrls: 10 });
    expect(result.sitemapsUsed).toEqual(["https://a.com/sitemaps/index.xml", "https://a.com/sitemaps/pdp-0.xml", "https://a.com/sitemaps/pdp-1.xml"]);
    expect(result.discovered).toHaveLength(3);
    expect(result.discovered[0]).toMatch(/details/);
    expect(result.truncated).toBe(false);
    expect(result.errors).toEqual([]);
  });

  test("falls back to standard sitemap locations when robots.txt has no refs", async () => {
    const fetchFn = okFetch({
      "https://a.com/robots.txt": "User-agent: *\n",
      "https://a.com/sitemap.xml": `<urlset><url><loc>https://a.com/details/1-main-100</loc></url></urlset>`,
    });
    const result = await discoverSitemapUrls({ seedUrl: "https://a.com/", fetchFn, maxUrls: 5 });
    expect(result.sitemapsUsed).toContain("https://a.com/sitemap.xml");
    expect(result.discovered).toHaveLength(1);
  });

  test("never crosses to other hosts from index children", async () => {
    const fetchFn = okFetch({
      "https://a.com/robots.txt": "Sitemap: https://a.com/sitemap.xml\n",
      "https://a.com/sitemap.xml": `<sitemapindex><sitemap><loc>https://b.com/sneaky.xml</loc></sitemap><sitemap><loc>https://a.com/pages.xml</loc></sitemap></sitemapindex>`,
      "https://a.com/pages.xml": `<urlset><url><loc>https://a.com/details/1-main-100</loc></url></urlset>`,
    });
    const result = await discoverSitemapUrls({ seedUrl: "https://a.com/", fetchFn, maxUrls: 10 });
    expect(result.sitemapsUsed).not.toContain("https://b.com/sneaky.xml");
    expect(result.discovered).toHaveLength(1);
    expect(result.discovered[0]).toMatch(/^https:\/\/a\.com\//);
  });

  test("stops fetching at the sitemap cap and reports truncation", async () => {
    const fetchFn = okFetch({
      "https://a.com/robots.txt": "Sitemap: https://a.com/sitemap.xml\n",
      "https://a.com/sitemap.xml": `<sitemapindex><sitemap><loc>https://a.com/pages.xml</loc></sitemap></sitemapindex>`,
      "https://a.com/pages.xml": `<urlset><url><loc>https://a.com/details/1-main-100</loc></url></urlset>`,
    });
    const result = await discoverSitemapUrls({ seedUrl: "https://a.com/", fetchFn, maxSitemaps: 1, maxUrls: 1 });
    expect(result.sitemapsUsed).toHaveLength(1);
    expect(result.discovered).toEqual([]);
    expect(result.truncated).toBe(true);
  });

  test("tolerates a missing robots.txt by falling back to probes without an error", async () => {
    const fetchFn = okFetch({
      "https://a.com/robots.txt": undefined,
      "https://a.com/sitemap.xml": `<urlset><url><loc>https://a.com/details/1-main-100</loc></url></urlset>`,
    });
    const result = await discoverSitemapUrls({ seedUrl: "https://a.com/", fetchFn, maxUrls: 5 });
    expect(result.discovered).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });
});
