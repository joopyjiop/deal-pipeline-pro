// Unit tests for the in-house underwriting math (src/convex/underwriting.ts).
//
// Lives outside src/convex/ so the Convex bundle never sees the bun:test
// import. Runs with Bun's built-in test runner: `bun test`.

import { describe, expect, test } from "bun:test";
import {
  amortizedPayment,
  arvFromComps,
  median,
  rentalUnderwriting,
  repairEstimate,
} from "../src/convex/underwriting";

describe("median", () => {
  test("returns the middle value for an odd count", () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  test("averages the two middle values for an even count", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
  });

  test("returns undefined for an empty list", () => {
    expect(median([])).toBeUndefined();
  });
});

describe("repairEstimate", () => {
  test("escalates the total with the tier rate per square foot", () => {
    const base = repairEstimate(1000, "BASE");
    const medium = repairEstimate(1000, "MEDIUM");
    const gut = repairEstimate(1000, "GUT");
    expect(base.total).toBeLessThan(medium.total);
    expect(medium.total).toBeLessThan(gut.total);
  });

  test("applies a 10% age adjustment for pre-1960 properties", () => {
    const modern = repairEstimate(1000, "MEDIUM", 1990);
    const old = repairEstimate(1000, "MEDIUM", 1940);
    expect(old.ratePerSquareFoot).toBeCloseTo(modern.ratePerSquareFoot * 1.1, 5);
    expect(old.total).toBe(Math.round(modern.total * 1.1));
  });

  test("line items sum to the subtotal and contingency is 10%", () => {
    const result = repairEstimate(1200, "MEDIUM");
    const subtotal = Object.values(result.items).reduce((total, value) => total + value, 0);
    expect(subtotal).toBe(result.subtotal);
    expect(result.contingency).toBe(Math.round(result.subtotal * 0.1));
    expect(result.total).toBe(result.subtotal + result.contingency);
  });
});

describe("arvFromComps", () => {
  test("builds conservative/median/aggressive scenarios from the comp median", () => {
    const result = arvFromComps([100000, 200000, 300000]);
    expect(result?.compMedian).toBe(200000);
    expect(result?.conservative).toBe(180000);
    expect(result?.median).toBe(200000);
    expect(result?.aggressive).toBe(220000);
  });

  test("ignores non-positive comps", () => {
    const result = arvFromComps([0, -5, 200000]);
    expect(result?.compCount).toBe(1);
    expect(result?.compMedian).toBe(200000);
  });

  test("returns undefined when no comps are provided", () => {
    expect(arvFromComps([])).toBeUndefined();
  });
});

describe("amortizedPayment", () => {
  test("computes a standard P&I payment", () => {
    const payment = amortizedPayment(200000, 6.5, 30);
    expect(payment).toBeGreaterThan(1200);
    expect(payment).toBeLessThan(1300);
  });

  test("handles a 0% rate as principal divided by periods", () => {
    expect(amortizedPayment(120000, 0, 10)).toBe(1000);
  });
});

describe("rentalUnderwriting", () => {
  const fullInput = {
    purchasePrice: 150000,
    rentComps: [1400, 1500, 1600],
    annualPropertyTax: 2400,
    annualInsurance: 1200,
    loanAmount: 112500,
    interestRatePct: 6.5,
    loanTermYears: 30,
  };

  test("returns READY with full inputs and computes NOI, DSCR, cap rate, and cash flow", () => {
    const result = rentalUnderwriting(fullInput);
    expect(result.status).toBe("READY");
    expect(result.rentEstimate).toBe(1500);
    expect(result.grossAnnualRent).toBe(18000);
    expect(result.netOperatingIncome).toBeGreaterThan(0);
    expect(result.debtService.annual).toBeGreaterThan(0);
    expect(result.dscr).toBeGreaterThan(0);
    expect(result.capRate).toBeGreaterThan(0);
    expect(result.annualCashFlow).toBe(result.netOperatingIncome! - result.debtService.annual!);
    expect(result.monthlyCashFlow).toBe(Math.round(result.annualCashFlow! / 12));
    expect(result.dataGaps.filter((gap) => gap.blocksReady)).toEqual([]);
  });

  test("is BLOCKED when no rent evidence exists and no per-SF fallback is given", () => {
    const result = rentalUnderwriting({ purchasePrice: 150000, annualPropertyTax: 2400, annualInsurance: 1200 });
    expect(result.status).toBe("BLOCKED");
    const gap = result.dataGaps.find((item) => item.category === "RENT_COMPS");
    expect(gap?.blocksReady).toBe(true);
    expect(result.rentEstimate).toBeUndefined();
  });

  test("is BLOCKED when property tax or insurance is missing", () => {
    const result = rentalUnderwriting({ purchasePrice: 150000, rentComps: [1500] });
    expect(result.status).toBe("BLOCKED");
    const categories = result.dataGaps.map((item) => item.category);
    expect(categories).toContain("PROPERTY_TAX");
    expect(categories).toContain("INSURANCE");
    expect(result.netOperatingIncome).toBeUndefined();
  });

  test("is PARTIAL without loan terms: NOI and cap rate exist but DSCR and cash flow do not", () => {
    const result = rentalUnderwriting({
      purchasePrice: 150000,
      rentComps: [1500],
      annualPropertyTax: 2400,
      annualInsurance: 1200,
    });
    expect(result.status).toBe("PARTIAL");
    expect(result.netOperatingIncome).toBeGreaterThan(0);
    expect(result.capRate).toBeGreaterThan(0);
    expect(result.dscr).toBeUndefined();
    expect(result.annualCashFlow).toBeUndefined();
    const gap = result.dataGaps.find((item) => item.category === "LOAN_TERMS");
    expect(gap?.blocksReady).toBe(false);
  });

  test("lists default operating ratios as assumptions", () => {
    const result = rentalUnderwriting(fullInput);
    const joined = result.assumptions.join(" ");
    expect(joined).toMatch(/vacancy/i);
    expect(joined).toMatch(/management/i);
    expect(joined).toMatch(/maintenance/i);
  });

  test("marks the market rent per square foot fallback as an assumption", () => {
    const result = rentalUnderwriting({
      purchasePrice: 150000,
      marketRentPerSqFt: 1.5,
      squareFeet: 1000,
      annualPropertyTax: 2400,
      annualInsurance: 1200,
      loanAmount: 112500,
      interestRatePct: 6.5,
      loanTermYears: 30,
    });
    expect(result.rentEstimate).toBe(1500);
    expect(result.assumptions.some((item) => /per square foot/i.test(item))).toBe(true);
  });

  test("derives the loan amount from LTV when not explicit and says so", () => {
    const result = rentalUnderwriting({
      purchasePrice: 200000,
      rentComps: [1800],
      annualPropertyTax: 3000,
      annualInsurance: 1500,
      interestRatePct: 6,
      loanTermYears: 30,
    });
    expect(result.debtService.monthly).toBeGreaterThan(0);
    expect(result.assumptions.some((item) => /loan-to-value/i.test(item))).toBe(true);
  });
});
