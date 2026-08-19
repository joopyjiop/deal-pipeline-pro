import { describe, expect, test } from "bun:test";
import {
  SOURCE_REGISTRY,
  dedupeSourceUrls,
  normalizeSourceUrl,
  registryNormalizedUrls,
} from "../src/convex/sourceRegistry";

describe("SOURCE_REGISTRY", () => {
  test("contains every curated deal site (including the owner-provided ones)", () => {
    const domains = SOURCE_REGISTRY.map((source) => source.domain.toLowerCase());
    expect(domains).toContain("auction.com");
    expect(domains).toContain("homepath.fanniemae.com");
    expect(domains).toContain("foreclosure.com");
    expect(domains).toContain("connectedinvestors.com");
    expect(domains).toContain("nationalreia.org");
    expect(domains).toContain("allencountysheriff.org");
    expect(domains).toContain("allencounty.in.gov");
  });

  test("has no duplicate normalized URLs across the whole registry", () => {
    const urls = registryNormalizedUrls(SOURCE_REGISTRY);
    expect(new Set(urls).size).toBe(urls.length);
  });

  test("has no duplicate domains", () => {
    const domains = SOURCE_REGISTRY.map((source) => source.domain.toLowerCase());
    expect(new Set(domains).size).toBe(domains.length);
  });

  test("every source has at least one URL and a valid source type", () => {
    for (const source of SOURCE_REGISTRY) {
      expect(source.urls.length).toBeGreaterThan(0);
      expect(["SHERIFF_SALE", "TAX_SALE", "AUCTION_COM", "FORECLOSURE", "MARKETPLACE", "ASSOCIATION"]).toContain(source.sourceType);
    }
  });
});

describe("normalizeSourceUrl", () => {
  test("strips trailing slashes, keeps https", () => {
    expect(normalizeSourceUrl("https://www.foreclosure.com/")).toBe("https://www.foreclosure.com");
    expect(normalizeSourceUrl("https://www.auction.com/residential/")).toBe("https://www.auction.com/residential");
  });

  test("lowercases the host", () => {
    expect(normalizeSourceUrl("https://WWW.HomePath.FannieMae.com/")).toBe("https://www.homepath.fanniemae.com");
  });

  test("empty or whitespace input returns empty", () => {
    expect(normalizeSourceUrl("")).toBe("");
    expect(normalizeSourceUrl("   ")).toBe("");
  });
});

describe("dedupeSourceUrls", () => {
  test("removes exact duplicates", () => {
    expect(dedupeSourceUrls(["https://a.com/", "https://a.com/"])).toEqual(["https://a.com/"]);
  });

  test("removes normalized duplicates (trailing slash, case, protocol)", () => {
    expect(
      dedupeSourceUrls([
        "https://a.com/",
        "https://A.com",
        "http://a.com",
        "https://a.com/extra/",
        "https://a.com/extra",
      ]),
    ).toEqual(["https://a.com/", "https://a.com/extra/"]);
  });

  test("keeps distinct paths", () => {
    expect(dedupeSourceUrls(["https://a.com/", "https://a.com/residential/"])).toHaveLength(2);
  });
});
