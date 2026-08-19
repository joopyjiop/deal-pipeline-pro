import { describe, expect, test } from "bun:test";
import { countActiveMatchesByLead, estimatedProfitFrom, sortDeals } from "../src/convex/marketplaceCore";

type Deal = { distressScore: number; matchCount?: number; estimatedProfit?: number };

const deals: Deal[] = [
  { distressScore: 70, matchCount: 2, estimatedProfit: 25000 },
  { distressScore: 90, matchCount: 0, estimatedProfit: undefined },
  { distressScore: 60, matchCount: 5, estimatedProfit: 120000 },
  { distressScore: 80, matchCount: 1, estimatedProfit: 8000 },
];

describe("sortDeals", () => {
  test("distress sort orders by distressScore descending", () => {
    expect(sortDeals(deals, "distress").map((deal) => deal.distressScore)).toEqual([90, 80, 70, 60]);
  });

  test("matches sort orders by matchCount descending, ties fall back to distress", () => {
    const sorted = sortDeals(deals, "matches");
    expect(sorted.map((deal) => deal.matchCount)).toEqual([5, 2, 1, 0]);
    const ties = sortDeals(
      [
        { distressScore: 40, matchCount: 3 },
        { distressScore: 80, matchCount: 3 },
      ],
      "matches",
    );
    expect(ties.map((deal) => deal.distressScore)).toEqual([80, 40]);
  });

  test("profit sort orders by estimatedProfit descending, deals without profit rank last", () => {
    const sorted = sortDeals(deals, "profit");
    expect(sorted.map((deal) => deal.estimatedProfit)).toEqual([120000, 25000, 8000, undefined]);
    expect(sorted[3].distressScore).toBe(90);
  });

  test("profit sort never produces NaN comparisons (all undefined)", () => {
    const allUnknown = [
      { distressScore: 50, estimatedProfit: undefined },
      { distressScore: 30, estimatedProfit: undefined },
    ];
    expect(sortDeals(allUnknown, "profit").map((deal) => deal.distressScore)).toEqual([50, 30]);
  });

  test("does not mutate the input array", () => {
    const input = [...deals];
    sortDeals(input, "profit");
    expect(input.map((deal) => deal.distressScore)).toEqual([70, 90, 60, 80]);
  });
});

describe("countActiveMatchesByLead", () => {
  test("counts non-REJECTED matches per lead id", () => {
    const counts = countActiveMatchesByLead([
      { leadId: "a", status: "CANDIDATE" },
      { leadId: "a", status: "APPROVED" },
      { leadId: "a", status: "REJECTED" },
      { leadId: "b", status: "CONTACTED" },
      { leadId: "c", status: "REJECTED" },
      {},
    ]);
    expect(counts.get("a")).toBe(2);
    expect(counts.get("b")).toBe(1);
    expect(counts.get("c")).toBeUndefined();
  });
});

describe("estimatedProfitFrom", () => {
  test("MAO minus acquisition price", () => {
    expect(estimatedProfitFrom({ mao: 150000, acquisitionPrice: 110000 })).toBe(40000);
  });
  test("undefined when either side is missing", () => {
    expect(estimatedProfitFrom({ mao: 150000 })).toBeUndefined();
    expect(estimatedProfitFrom({})).toBeUndefined();
  });
});
