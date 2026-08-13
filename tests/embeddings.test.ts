// Unit tests for the in-house semantic search module (src/convex/embeddings.ts).
// Lives outside src/convex/ so the Convex bundle never sees the bun:test import.

import { describe, expect, test } from "bun:test";
import {
  cosineSimilarity,
  embeddingPrompt,
  isFiniteVector,
  normalizeVector,
  rankBySimilarity,
  type EmbeddableLead,
} from "../src/convex/embeddings";

describe("embeddingPrompt", () => {
  test("joins every populated field, skipping blanks", () => {
    const lead: EmbeddableLead = {
      _id: "a",
      propertyAddress: "900 N 23 1/2 St",
      city: "Corsicana",
      state: "TX",
      zip: "75110",
      county: "Navarro",
      parcelId: "12345",
      sourceType: "AUCTION_COM",
      sourceRef: "2016995",
      distressSignals: [{ type: "TAX_DELINQUENT", evidence: "2 yrs unpaid" }],
      notes: "",
    };
    const prompt = embeddingPrompt(lead);
    expect(prompt).toContain("900 N 23 1/2 St");
    expect(prompt).toContain("Corsicana");
    expect(prompt).toContain("Navarro");
    expect(prompt).toContain("TAX_DELINQUENT");
    expect(prompt).toContain("2 yrs unpaid");
    expect(prompt).not.toContain("undefined");
    expect(prompt.length).toBeLessThanOrEqual(4000);
  });

  test("returns empty string when the lead has no searchable text", () => {
    expect(embeddingPrompt({ _id: "b" })).toBe("");
  });
});

describe("cosineSimilarity", () => {
  test("identical unit vectors score 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  test("orthogonal vectors score 0", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  test("opposite vectors score -1", () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1);
  });

  test("mismatched or empty vectors score 0 instead of throwing", () => {
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe("normalizeVector", () => {
  test("produces a unit-length vector", () => {
    const normalized = normalizeVector([3, 4]);
    expect(normalized[0]).toBeCloseTo(0.6);
    expect(normalized[1]).toBeCloseTo(0.8);
  });

  test("leaves a zero vector untouched", () => {
    expect(normalizeVector([0, 0])).toEqual([0, 0]);
  });
});

describe("isFiniteVector", () => {
  test("accepts non-empty arrays of finite numbers only", () => {
    expect(isFiniteVector([0.1, -2, 3])).toBe(true);
    expect(isFiniteVector([])).toBe(false);
    expect(isFiniteVector([1, NaN])).toBe(false);
    expect(isFiniteVector([1, Infinity])).toBe(false);
    expect(isFiniteVector("nope")).toBe(false);
    expect(isFiniteVector(null)).toBe(false);
  });
});

describe("rankBySimilarity", () => {
  const query = [1, 0, 0];

  test("orders by score descending and caps at the limit", () => {
    const rows = [
      { id: "near", vector: [0.9, 0.1, 0] },
      { id: "far", vector: [0.1, 0.9, 0] },
      { id: "closest", vector: [1, 0, 0] },
    ];
    const ranked = rankBySimilarity(query, rows, 2);
    expect(ranked.map((item) => item.id)).toEqual(["closest", "near"]);
  });

  test("skips rows without usable vectors", () => {
    const rows = [
      { id: "no-vector" },
      { id: "bad", vector: "text" },
      { id: "good", vector: [1, 0, 0] },
    ];
    const ranked = rankBySimilarity(query, rows, 10);
    expect(ranked.map((item) => item.id)).toEqual(["good"]);
  });

  test("clamps the limit into the 1-50 window", () => {
    const rows = [
      { id: "a", vector: [1, 0, 0] },
      { id: "b", vector: [0.99, 0.1, 0] },
    ];
    expect(rankBySimilarity(query, rows, 0)).toHaveLength(1);
    expect(rankBySimilarity(query, rows, 999)).toHaveLength(2);
  });

  test("returns empty when no rows match", () => {
    expect(rankBySimilarity(query, [], 5)).toEqual([]);
  });
});
