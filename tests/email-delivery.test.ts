// Unit tests for src/convex/emailDeliveryCore.ts (purchase-confirmation email
// delivery helpers: CSV building with formula-injection guard, lead export
// gates, retry backoff, and the public delivery-log view). Lives outside
// src/convex/ so the Convex bundle never sees the bun:test import.
import { describe, expect, test } from "bun:test";
import {
  MAX_DELIVERY_ATTEMPTS,
  RETRY_DELAYS_MINUTES,
  buildLeadsCsv,
  csvCell,
  isExportableLead,
  nextRetryAtMs,
  toPublicDelivery,
  type LeadCsvRow,
} from "../src/convex/emailDeliveryCore";

const ROW: LeadCsvRow = {
  id: "abc123",
  propertyAddress: "123 Main St",
  city: "Austin",
  state: "TX",
  zip: "78701",
  county: "Travis",
  parcelId: "R-123",
  sourceUrl: "https://county.gov/sale/42",
  sourceRef: "42",
  sourceDate: "2026-08-01",
  distressScore: 82,
  verificationStatus: "VERIFIED",
  pipelineStatus: "APPROVED",
  absenteeOwner: true,
  arv: 250000,
  repairs: 40000,
  mao: 180000,
  acquisitionPrice: 175000,
  estimatedProfit: 35000,
  matchScore: 91,
  confidence: "HIGH",
  buyBoxSummary: "Buy & hold, 3BR/2BA",
};

describe("csvCell", () => {
  test("empty for null/undefined", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  test("plain values pass through", () => {
    expect(csvCell("Austin")).toBe("Austin");
    expect(csvCell(91)).toBe("91");
    expect(csvCell(true)).toBe("true");
  });

  test("quotes, commas, and newlines are quoted and escaped", () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  test("formula-like cells are neutralized against CSV injection", () => {
    // A formula cell containing quotes is both neutralized and escaped.
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1+2")).toBe("'+1+2");
    expect(csvCell("-1")).toBe("'-1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });
});

describe("buildLeadsCsv", () => {
  test("writes header row with CRLF and trailing newline", () => {
    const csv = buildLeadsCsv([]);
    expect(csv).toContain("lead_id,property_address,city,state,zip,county,parcel_id");
    expect(csv).toContain("source_url,source_ref,source_date");
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(1); // header only
  });

  test("writes one row per lead with all matched-lead fields", () => {
    const csv = buildLeadsCsv([ROW]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("abc123");
    expect(lines[1]).toContain("https://county.gov/sale/42");
    expect(lines[1]).toContain("HIGH");
    expect(lines[1]).toContain("35000");
  });

  test("escapes source data in row cells", () => {
    const csv = buildLeadsCsv([{ ...ROW, propertyAddress: '111 "The" Ave, Apt 2', county: "=SUM(A1)" }]);
    const row = csv.trim().split("\r\n")[1]!;
    expect(row).toContain('"111 ""The"" Ave, Apt 2"');
    expect(row).toContain("'=SUM(A1)");
  });
});

describe("isExportableLead", () => {
  const good = {
    fabricated: false,
    sourceType: "SHERIFF_SALE",
    verificationStatus: "VERIFIED",
    pipelineStatus: "APPROVED",
  };

  test("accepts verified, approved, non-fabricated leads", () => {
    expect(isExportableLead(good)).toBe(true);
  });

  test("rejects fabricated rows forever (tombstone rule)", () => {
    expect(isExportableLead({ ...good, fabricated: true })).toBe(false);
  });

  test("rejects SEED rows even if fabricated flag is absent", () => {
    expect(isExportableLead({ ...good, sourceType: "SEED" })).toBe(false);
  });

  test("rejects unverified or unapproved rows", () => {
    expect(isExportableLead({ ...good, verificationStatus: "PARTIAL" })).toBe(false);
    expect(isExportableLead({ ...good, verificationStatus: "UNVERIFIED" })).toBe(false);
    expect(isExportableLead({ ...good, pipelineStatus: "SOURCED" })).toBe(false);
  });
});

describe("nextRetryAtMs / retry policy", () => {
  const now = 1_000_000;

  test("backoff follows the configured schedule", () => {
    expect(nextRetryAtMs(1, now)).toBe(now + RETRY_DELAYS_MINUTES[0]! * 60_000);
    expect(nextRetryAtMs(2, now)).toBe(now + RETRY_DELAYS_MINUTES[1]! * 60_000);
    expect(nextRetryAtMs(4, now)).toBe(now + RETRY_DELAYS_MINUTES[3]! * 60_000);
  });

  test("returns null when retries are exhausted", () => {
    expect(nextRetryAtMs(0, now)).toBeNull();
    expect(nextRetryAtMs(MAX_DELIVERY_ATTEMPTS, now)).toBeNull();
    expect(nextRetryAtMs(99, now)).toBeNull();
  });
});

describe("toPublicDelivery", () => {
  test("exposes delivery metadata but never the CSV payload", () => {
    const doc = {
      _id: "507f1f77bcf86cd799439011",
      kind: "PURCHASE_CONFIRMATION",
      checkoutSessionId: "cs_test_1",
      userId: "u1",
      email: "buyer@example.com",
      priceId: "price_x",
      subscriptionId: "sub_x",
      status: "FAILED",
      attempts: 2,
      error: "Resend 429: rate limited",
      leadCount: 5,
      providerId: "9e1234",
      sentAt: undefined,
      createdAt: 100,
      updatedAt: 200,
      nextAttemptAt: 500,
      csv: "lead_id,...",
    };
    const view = toPublicDelivery(doc);
    expect(view.id).toBe("507f1f77bcf86cd799439011");
    expect(view.status).toBe("FAILED");
    expect(view.attempts).toBe(2);
    expect(view.error).toBe("Resend 429: rate limited");
    expect(view.email).toBe("buyer@example.com");
    expect(view.leadCount).toBe(5);
    expect(view.csv).toBeUndefined();
  });
});