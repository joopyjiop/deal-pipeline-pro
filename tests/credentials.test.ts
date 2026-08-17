// Unit tests for the deal-credential completeness gate (src/convex/credentials.ts).
// Lives outside src/convex/ so the Convex bundle never sees the bun:test import.
import { describe, expect, test } from "bun:test";
import {
  assertBuyerDealReady,
  assertHotDealDealReady,
  assertLeadDealReady,
  missingBuyerDealCredentials,
  missingHotDealDealCredentials,
  missingLeadDealCredentials,
} from "../src/convex/credentials";

const completeLead = {
  ownerNames: ["Jane Doe"],
  listedPhone: true,
  arv: 275000,
  repairs: 25000,
};

describe("missingLeadDealCredentials", () => {
  test("returns [] for a lead with seller name, phone, and ARV", () => {
    expect(missingLeadDealCredentials(completeLead)).toEqual([]);
  });

  test("flags every missing credential on an empty lead", () => {
    const missing = missingLeadDealCredentials({});
    expect(missing).toContain("seller name (ownerNames)");
    expect(missing).toContain("a contact phone (listedPhone or skipTrace)");
    expect(missing.some((item) => item.includes("arv"))).toBe(true);
  });

  test("accepts ownerNames as a non-empty string", () => {
    expect(missingLeadDealCredentials({ ...completeLead, ownerNames: "Jane Doe" })).toEqual([]);
  });

  test("rejects an ownerNames array of blanks", () => {
    const missing = missingLeadDealCredentials({ ...completeLead, ownerNames: ["  ", ""] });
    expect(missing).toContain("seller name (ownerNames)");
  });

  test("treats listedPhone true as a phone credential", () => {
    expect(missingLeadDealCredentials({ ...completeLead, listedPhone: true })).toEqual([]);
  });

  test("accepts skip-traced phone numbers when listedPhone is false", () => {
    const lead = {
      ownerNames: ["Jane Doe"],
      listedPhone: false,
      skipTrace: { provider: "searchbug", phones: [{ number: "555-0142" }] },
      arv: 275000,
    };
    expect(missingLeadDealCredentials(lead)).toEqual([]);
  });

  test("rejects skipTrace with no phone numbers", () => {
    const lead = {
      ownerNames: ["Jane Doe"],
      listedPhone: false,
      skipTrace: { provider: "searchbug", phones: [] },
      arv: 275000,
    };
    const missing = missingLeadDealCredentials(lead);
    expect(missing).toContain("a contact phone (listedPhone or skipTrace)");
  });

  test("treats ARV or any offer estimate as the pricing credential", () => {
    expect(missingLeadDealCredentials({ ...completeLead, arv: 275000 })).toEqual([]);
    for (const field of ["repairs", "mao", "acquisitionPrice"]) {
      const lead = { ownerNames: ["Jane Doe"], listedPhone: true, [field]: 50000 };
      const missing = missingLeadDealCredentials(lead);
      expect(missing.some((item) => item.includes("arv"))).toBe(false);
    }
  });

  test("a zero or missing ARV and no estimate is flagged", () => {
    const lead = { ownerNames: ["Jane Doe"], listedPhone: true, arv: 0 };
    expect(missingLeadDealCredentials(lead).some((item) => item.includes("arv"))).toBe(true);
  });
});

describe("assertLeadDealReady", () => {
  test("does not throw for a complete lead", () => {
    expect(() => assertLeadDealReady(completeLead)).not.toThrow();
  });

  test("throws with the missing credential labels", () => {
    expect(() => assertLeadDealReady({})).toThrow(/seller name/);
    expect(() => assertLeadDealReady({ ownerNames: ["Jane Doe"], listedPhone: true })).toThrow(/arv/);
  });
});

describe("missingBuyerDealCredentials", () => {
  const completeBuyer = {
    name: "Bob Buyer",
    phone: "555-0100",
    email: "bob@example.com",
    proofOfFundsStatus: "SELF_REPORTED",
    targetAreas: ["Rowan County"],
  };

  test("returns [] for a buyer with contact details and proof of funds", () => {
    expect(missingBuyerDealCredentials(completeBuyer)).toEqual([]);
  });

  test("flags a missing contact field", () => {
    expect(missingBuyerDealCredentials({ ...completeBuyer, phone: "" })).toContain("phone");
    expect(missingBuyerDealCredentials({ ...completeBuyer, email: undefined })).toContain("email");
  });

  test("flags proofOfFundsStatus NONE", () => {
    const missing = missingBuyerDealCredentials({ ...completeBuyer, proofOfFundsStatus: "NONE" });
    expect(missing.some((item) => item.includes("proof of funds"))).toBe(true);
  });

  test("accepts VERIFIED proof of funds", () => {
    expect(
      missingBuyerDealCredentials({ ...completeBuyer, proofOfFundsStatus: "VERIFIED", pofEvidenceRef: "bank-stmt-1" }),
    ).toEqual([]);
  });

  test("flags an empty targetAreas list", () => {
    expect(missingBuyerDealCredentials({ ...completeBuyer, targetAreas: [] })).toContain("targetAreas");
  });
});

describe("assertBuyerDealReady", () => {
  test("does not throw for a complete buyer", () => {
    expect(() =>
      assertBuyerDealReady({ name: "Bob", phone: "555-0100", email: "b@e.com", proofOfFundsStatus: "VERIFIED", targetAreas: ["NC"] }),
    ).not.toThrow();
  });

  test("throws for a buyer with no proof of funds", () => {
    expect(() => assertBuyerDealReady({ name: "Bob", phone: "555-0100", email: "b@e.com", proofOfFundsStatus: "NONE", targetAreas: ["NC"] })).toThrow(
      /proof of funds/,
    );
  });
});

describe("missingHotDealDealCredentials", () => {
  test("returns [] for a hot deal with ARV", () => {
    expect(missingHotDealDealCredentials({ arv: 180000, repairs: 20000 })).toEqual([]);
  });

  test("accepts any offer estimate when ARV is absent", () => {
    for (const field of ["repairs", "mao", "acquisitionPrice"]) {
      expect(missingHotDealDealCredentials({ [field]: 45000 })).toEqual([]);
    }
  });

  test("flags a hot deal with no pricing", () => {
    const missing = missingHotDealDealCredentials({ propertyAddress: "123 Main St" });
    expect(missing.some((item) => item.includes("arv"))).toBe(true);
  });

  test("flags a zero ARV with no estimate", () => {
    expect(missingHotDealDealCredentials({ arv: 0 })).not.toEqual([]);
  });
});

describe("assertHotDealDealReady", () => {
  test("does not throw for a priced hot deal", () => {
    expect(() => assertHotDealDealReady({ arv: 180000 })).not.toThrow();
  });

  test("throws for an unpriced hot deal", () => {
    expect(() => assertHotDealDealReady({})).toThrow(/arv/);
  });
});
