// Unit tests for the coordinated agent team (src/convex/agents.ts).
//
// Lives outside src/convex/ so the Convex bundle never sees the bun:test
// import. Runs with Bun's built-in test runner: `bun test`.

import { describe, expect, test } from "bun:test";
import {
  arvRepairsAgent,
  buyerMatchingAgent,
  readinessReport,
  scoreBuyerMatch,
  sourcingAgent,
  underwritingAgent,
  underwritingAgentFromModel,
  verificationAgent,
} from "../src/convex/agents";
import { rentalUnderwriting } from "../src/convex/underwriting";

function lead(overrides: Record<string, unknown> = {}) {
  return {
    _id: "lead-1",
    propertyAddress: "5214 Eicher Dr",
    city: "Fort Wayne",
    state: "IN",
    zip: "46806",
    county: "Allen",
    parcelId: "02-05-29-100-006",
    sourceType: "SHERIFF_SALE",
    sourceUrl: "https://www.allencountysheriff.org/2026-sheriff-sales/",
    sourceRef: "2026-CF-000123",
    sourceDate: "2026-08-01",
    distressScore: 30,
    distressSignals: [
      { type: "PRE_FORECLOSURE", weight: 30, evidence: "Sale scheduled in official sheriff list.", verified: true, sourceUrl: "https://www.allencountysheriff.org/2026-sheriff-sales/", sourceDate: "2026-08-01" },
    ],
    ...overrides,
  };
}

describe("sourcingAgent", () => {
  test("blocks fabricated rows outright", () => {
    const report = sourcingAgent(lead({ fabricated: true }));
    expect(report.status).toBe("BLOCKED");
    expect(report.dataGaps.some((gap) => gap.category === "FABRICATED" && gap.blocksReady)).toBe(true);
  });

  test("completes when location, source evidence, and verified distress signals exist", () => {
    const report = sourcingAgent(lead());
    expect(report.status).toBe("COMPLETED");
    expect(report.findings.length).toBeGreaterThan(0);
  });

  test("flags a missing property location as blocking", () => {
    const report = sourcingAgent(lead({ propertyAddress: "" }));
    expect(report.status).toBe("BLOCKED");
    expect(report.dataGaps.some((gap) => gap.category === "LOCATION" && gap.blocksReady)).toBe(true);
  });

  test("flags missing source evidence as blocking", () => {
    const report = sourcingAgent(lead({ sourceUrl: "", sourceRef: "" }));
    expect(report.status).toBe("BLOCKED");
    expect(report.dataGaps.some((gap) => gap.category === "SOURCE_EVIDENCE" && gap.blocksReady)).toBe(true);
  });

  test("flags distress signals that are not verified with evidence", () => {
    const report = sourcingAgent(lead({ distressSignals: [{ type: "PRE_FORECLOSURE", weight: 30, evidence: "", verified: false, sourceUrl: "", sourceDate: "" }] }));
    expect(report.status).toBe("BLOCKED");
    expect(report.dataGaps.some((gap) => gap.category === "DISTRESS_EVIDENCE" && gap.blocksReady)).toBe(true);
  });
});

describe("verificationAgent", () => {
  const complete = {
    titleAndLiens: { status: "FOUND", sourceUrl: "https://assessor.example", summary: "Title clear." },
    saleHistory: { status: "FOUND", sourceUrl: "https://zillow.example", summary: "3 comps." },
    condition: { status: "FOUND", sourceUrl: "https://listing.example", summary: "Fair condition." },
    occupancy: { status: "FOUND", sourceUrl: "https://record.example", summary: "Vacant." },
  };

  test("completes when every category is verified", () => {
    const report = verificationAgent(complete);
    expect(report.status).toBe("COMPLETED");
  });

  test("blocks when title/lien, sale history, or condition is missing", () => {
    const report = verificationAgent({ ...complete, titleAndLiens: { status: "MISSING" } });
    expect(report.status).toBe("BLOCKED");
    const gap = report.dataGaps.find((item) => item.category === "TITLE_AND_LIENS");
    expect(gap?.blocksReady).toBe(true);
  });

  test("treats missing occupancy as non-blocking", () => {
    const report = verificationAgent({ ...complete, occupancy: undefined });
    expect(report.status).toBe("COMPLETED");
    const gap = report.dataGaps.find((item) => item.category === "OCCUPANCY");
    expect(gap?.blocksReady).toBe(false);
  });

  test("never claims to have browsed the web itself", () => {
    const report = verificationAgent(undefined);
    expect(report.status).toBe("BLOCKED");
    expect(report.findings.join(" ").toLowerCase()).not.toMatch(/browsed|scraped|visited/i);
  });
});

describe("arvRepairsAgent", () => {
  test("blocks when no sold comps are provided", () => {
    const report = arvRepairsAgent({ squareFeet: 1200, compPrices: [] });
    expect(report.status).toBe("BLOCKED");
    expect(report.dataGaps.some((gap) => gap.category === "SOLD_COMPS")).toBe(true);
  });

  test("blocks when square feet are missing", () => {
    const report = arvRepairsAgent({ squareFeet: undefined, compPrices: [150000, 160000] });
    expect(report.status).toBe("BLOCKED");
    expect(report.dataGaps.some((gap) => gap.category === "SQUARE_FEET")).toBe(true);
  });

  test("completes with comps and square feet, reporting ARV scenarios", () => {
    const report = arvRepairsAgent({ squareFeet: 1200, compPrices: [150000, 160000, 170000] });
    expect(report.status).toBe("COMPLETED");
    const joined = report.findings.join(" ");
    expect(joined).toMatch(/ARV scenario/);
    expect(joined).toMatch(/Repair estimate/);
  });

  test("states the assumed repair tier when none is given", () => {
    const report = arvRepairsAgent({ squareFeet: 1200, compPrices: [150000] });
    expect(report.findings.join(" ")).toMatch(/assumed at MEDIUM/i);
  });
});

describe("underwritingAgent", () => {
  test("completes and reports DSCR, cap rate, and cash flow for a READY model", () => {
    const model = rentalUnderwriting({
      purchasePrice: 150000,
      rentComps: [1400, 1500, 1600],
      annualPropertyTax: 2400,
      annualInsurance: 1200,
      loanAmount: 112500,
      interestRatePct: 6.5,
      loanTermYears: 30,
    });
    const report = underwritingAgentFromModel(model);
    expect(report.status).toBe("COMPLETED");
    const joined = report.findings.join(" ");
    expect(joined).toMatch(/Rent estimate/);
    expect(joined).toMatch(/DSCR/);
    expect(joined).toMatch(/Cap rate/);
    expect(joined).toMatch(/Cash flow/);
  });

  test("blocks when the rental model is blocked and surfaces its gaps", () => {
    const report = underwritingAgent({ purchasePrice: 150000 });
    expect(report.status).toBe("BLOCKED");
    expect(report.dataGaps.length).toBeGreaterThan(0);
  });

  test("reports partial status when only debt-service inputs are missing", () => {
    const model = rentalUnderwriting({
      purchasePrice: 150000,
      rentComps: [1500],
      annualPropertyTax: 2400,
      annualInsurance: 1200,
    });
    const report = underwritingAgentFromModel(model);
    expect(report.status).toBe("COMPLETED");
    expect(report.summary).toMatch(/partial/i);
  });
});

describe("scoreBuyerMatch", () => {
  const baseLead = {
    city: "Fort Wayne",
    county: "Allen",
    state: "IN",
    mao: 120000,
    arv: 180000,
    acquisitionPrice: 120000,
    estimatedProfit: 15000,
  };
  const buyer = {
    _id: "buyer-1",
    budgetMin: 100000,
    budgetMax: 150000,
    targetAreas: ["Fort Wayne"],
    exitType: "ASSIGN" as const,
    proofOfFundsStatus: "VERIFIED" as const,
  };

  test("scores area overlap, budget fit, exit fit, and POF boost", () => {
    const result = scoreBuyerMatch(baseLead, buyer);
    expect(result.components.area).toBe(40);
    expect(result.components.budget).toBe(30);
    expect(result.components.exit).toBe(30);
    expect(result.components.pofBoost).toBe(5);
    expect(result.matchScore).toBe(100);
    expect(result.confidence).toBe("HIGH");
  });

  test("counts a state-wide target as a full area hit", () => {
    const result = scoreBuyerMatch(baseLead, { ...buyer, targetAreas: ["IN"] });
    expect(result.components.area).toBe(40);
    expect(result.summary).toMatch(/target area overlap/i);
  });

  test("flags no-area overlap with pricing outside the buy box as a reject reason", () => {
    const result = scoreBuyerMatch(baseLead, { ...buyer, targetAreas: ["Gary"], budgetMin: 400000, budgetMax: 500000 });
    expect(result.components.area).toBe(0);
    expect(result.components.budget).toBe(10);
    expect(result.rejectReason).toMatch(/no area overlap/i);
  });

  test("flags an unpriced lead with no area overlap as a reject", () => {
    const unpriced = { city: "Fort Wayne", county: "Allen", state: "IN", mao: undefined, arv: undefined, acquisitionPrice: undefined, estimatedProfit: undefined };
    const result = scoreBuyerMatch(unpriced, { ...buyer, targetAreas: ["Gary"], budgetMin: 400000, budgetMax: 500000 });
    expect(result.rejectReason).toMatch(/no area overlap/i);
  });

  test("gives BUY_HOLD buyers exit credit from DSCR instead of profit", () => {
    const hold = scoreBuyerMatch({ ...baseLead, rentalModel: { dscr: 1.25, annualCashFlow: 2000, monthlyCashFlow: 166 } }, { ...buyer, exitType: "BUY_HOLD" });
    expect(hold.components.exit).toBe(30);
    const weak = scoreBuyerMatch({ ...baseLead, rentalModel: { dscr: 0.9, annualCashFlow: -500, monthlyCashFlow: -41 } }, { ...buyer, exitType: "BUY_HOLD" });
    expect(weak.components.exit).toBe(15);
  });

  test("partial budget credit is capped at 20 when pricing sits inside the 15% band", () => {
    const result = scoreBuyerMatch({ ...baseLead, mao: 90000 }, buyer);
    expect(result.components.budget).toBe(20);
  });

  test("budget stays at the 10 unknown/out-of-band floor when pricing is far outside", () => {
    const result = scoreBuyerMatch({ ...baseLead, mao: 40000 }, buyer);
    expect(result.components.budget).toBe(10);
  });
});

describe("buyerMatchingAgent", () => {
  test("ranks buyers by score and filters below the minimum", () => {
    const lead = {
      city: "Fort Wayne",
      county: "Allen",
      state: "IN",
      mao: 120000,
      arv: 180000,
      acquisitionPrice: 120000,
      estimatedProfit: 15000,
    };
    const buyers = [
      { _id: "far", budgetMin: 400000, budgetMax: 500000, targetAreas: ["Gary"], exitType: "ASSIGN" as const, proofOfFundsStatus: "NONE" as const },
      { _id: "near", budgetMin: 100000, budgetMax: 150000, targetAreas: ["Fort Wayne"], exitType: "ASSIGN" as const, proofOfFundsStatus: "VERIFIED" as const },
    ];
    const result = buyerMatchingAgent(lead, buyers, 55);
    expect(result.matches.map((match) => match.buyerId)).toEqual(["near"]);
    expect(result.skipped).toBe(1);
  });
});

describe("readinessReport", () => {
  test("marks READY only when no blocking gaps exist across the team", () => {
    const team = [sourcingAgent(lead()), verificationAgent({ titleAndLiens: { status: "FOUND" }, saleHistory: { status: "FOUND" }, condition: { status: "FOUND" }, occupancy: { status: "FOUND" } })];
    const report = readinessReport(team);
    expect(report.ready).toBe(true);
    expect(report.status).toBe("READY");
    expect(report.gaps).toEqual([]);
  });

  test("aggregates blocking gaps from every agent into INCOMPLETE", () => {
    const team = [
      sourcingAgent(lead({ sourceUrl: "" })),
      verificationAgent(undefined),
      arvRepairsAgent({ squareFeet: 1200, compPrices: [] }),
      underwritingAgent({ purchasePrice: 150000 }),
    ];
    const report = readinessReport(team);
    expect(report.ready).toBe(false);
    expect(report.status).toBe("INCOMPLETE");
    expect(report.gaps.every((gap) => gap.blocksReady)).toBe(true);
    const categories = Object.values(report.categories);
    expect(categories).toContain("MISSING");
  });

  test("records which categories were found for the brief", () => {
    const team = [sourcingAgent(lead()), verificationAgent({ titleAndLiens: { status: "FOUND" }, saleHistory: { status: "FOUND" }, condition: { status: "FOUND" }, occupancy: { status: "FOUND" } })];
    const report = readinessReport(team);
    expect(report.categories.SOURCING).toBe("FOUND");
    expect(report.categories.VERIFICATION).toBe("FOUND");
    expect(report.categories.UNDERWRITING).toBe("MISSING");
  });
});
