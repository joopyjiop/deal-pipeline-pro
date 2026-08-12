// Unit tests for the in-house full-text search engine (src/convex/search.ts).
//
// Lives outside src/convex/ so the Convex bundle never sees the bun:test
// import. Runs with Bun's built-in test runner: `bun test`.
import { describe, expect, test } from "bun:test";
import { rankLeads, tokenize } from "../src/convex/search";
import type { SearchableLead } from "../src/convex/search";

function lead(overrides: Partial<SearchableLead> & { _id: string }): SearchableLead {
  return {
    propertyAddress: "",
    city: "",
    state: "",
    zip: "",
    county: "",
    parcelId: undefined,
    sourceRef: "",
    sourceType: "",
    notes: "",
    ...overrides,
  };
}

describe("tokenize", () => {
  test("lowercases and splits on non-alphanumerics, keeping numeric tokens", () => {
    expect(tokenize("5214 Eicher Dr, Fort Wayne, IN 46806")).toEqual([
      "5214",
      "eicher",
      "dr",
      "fort",
      "wayne",
      "46806",
    ]);
  });

  test("drops stop words and single letters", () => {
    expect(tokenize("the AND of 2 a x 46806")).toEqual(["46806"]);
  });

  test("dedupes repeated terms", () => {
    expect(tokenize("Eicher eicher EICHER")).toEqual(["eicher"]);
  });

  test("returns an empty list for blank input", () => {
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("rankLeads", () => {
  const eicher = lead({
    _id: "lead-eicher",
    propertyAddress: "5214 Eicher Dr",
    city: "Fort Wayne",
    state: "IN",
    zip: "46806",
    county: "Allen",
    sourceRef: "5214-EICHER-01",
    sourceType: "AUCTION_COM",
  });
  const clinton = lead({
    _id: "lead-clinton",
    propertyAddress: "102 N Clinton St",
    city: "Fort Wayne",
    state: "IN",
    zip: "46802",
    county: "Huntington",
    sourceRef: "2026-CF-000123",
    sourceType: "SHERIFF_SALE",
  });

  test("blank query returns all leads unranked with total 0", () => {
    const result = rankLeads([eicher, clinton], "  ");
    expect(result.terms).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.ranked.map((item) => item._id).sort()).toEqual([
      "lead-clinton",
      "lead-eicher",
    ]);
    expect(result.ranked.every((item) => item.score === 0)).toBe(true);
  });

  test("identity match ranks the exact record first and reports matched fields", () => {
    const result = rankLeads([clinton, eicher], "5214");
    expect(result.total).toBe(1);
    expect(result.ranked[0]._id).toBe("lead-eicher");
    expect(result.ranked[0].matchedFields).toContain("propertyAddress");
    expect(result.ranked[0].matchedFields).toContain("sourceRef");
  });

  test("county match outranks a notes-only match (field weights)", () => {
    const notesOnly = lead({
      _id: "lead-notes",
      propertyAddress: "1440 E Wayne Ave",
      city: "Fort Wayne",
      state: "IN",
      zip: "46803",
      county: "Huntington",
      sourceRef: "1440-WAYNE-02",
      sourceType: "MANUAL",
      notes: "Allen family trustee is selling",
    });
    const result = rankLeads([notesOnly, eicher], "allen");
    expect(result.total).toBe(2);
    const byId = new Map(result.ranked.map((item) => [item._id, item.score]));
    expect(byId.get("lead-eicher")!).toBeGreaterThan(byId.get("lead-notes")!);
    expect(result.ranked[0].matchedFields).toContain("county");
  });

  test("multi-term query ranks the lead matching both terms first", () => {
    const wayneAve = lead({
      _id: "lead-wayne-ave",
      propertyAddress: "1440 E Wayne Ave",
      city: "Fort Wayne",
      state: "IN",
      zip: "46803",
      county: "Allen",
      sourceRef: "1440-WAYNE-02",
      sourceType: "SHERIFF_SALE",
    });
    const result = rankLeads([wayneAve, eicher], "eicher wayne");
    expect(result.total).toBe(2);
    expect(result.ranked[0]._id).toBe("lead-eicher");
  });

  test("no matches returns total 0 and an empty ranked list", () => {
    const result = rankLeads([eicher, clinton], "zzzzz");
    expect(result.total).toBe(0);
    expect(result.ranked).toEqual([]);
  });

  test("equal scores tie-break stably by _id", () => {
    const a = lead({ _id: "a", propertyAddress: "Same Street", county: "Allen" });
    const b = lead({ _id: "b", propertyAddress: "Same Street", county: "Allen" });
    const result = rankLeads([b, a], "same");
    expect(result.ranked.map((item) => item._id)).toEqual(["a", "b"]);
  });

  test("scores are non-negative and the ranking is deterministic", () => {
    const first = rankLeads([clinton, eicher], "fort wayne allen");
    const second = rankLeads([clinton, eicher], "fort wayne allen");
    expect(first.ranked).toEqual(second.ranked);
    expect(first.ranked.every((item) => item.score >= 0)).toBe(true);
  });
});
