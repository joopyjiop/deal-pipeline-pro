// Unit tests for the import-staging evidence gate (src/convex/stagingEvidence.ts).
// Only pure functions are imported so the Convex bundle never sees bun:test.
import { describe, expect, test } from "bun:test";
import {
  computeStagingStatus,
  detectScoreMismatch,
  isValidSourceDate,
  isValidSourceUrl,
  missingEvidenceFields,
  stagingScoreMismatch,
  stagingSourceText,
  TERMINAL_STAGING_STATUSES,
} from "../src/convex/stagingEvidence";

describe("isValidSourceUrl", () => {
  test("accepts a valid https URL", () => {
    expect(isValidSourceUrl("https://www.county.gov/sale/123")).toBe(true);
  });
  test("rejects http, blank, malformed, and non-string values", () => {
    expect(isValidSourceUrl("http://www.county.gov/sale/123")).toBe(false);
    expect(isValidSourceUrl("")).toBe(false);
    expect(isValidSourceUrl("   ")).toBe(false);
    expect(isValidSourceUrl("not a url")).toBe(false);
    expect(isValidSourceUrl(undefined)).toBe(false);
    expect(isValidSourceUrl(42)).toBe(false);
  });
});

describe("isValidSourceDate", () => {
  test("accepts a past or today ISO date", () => {
    expect(isValidSourceDate("2026-08-01")).toBe(true);
    expect(isValidSourceDate("2024-03-15")).toBe(true);
  });
  test("rejects future dates, garbage, blank, and non-strings", () => {
    expect(isValidSourceDate("2099-01-01")).toBe(false);
    expect(isValidSourceDate("yesterday-ish")).toBe(false);
    expect(isValidSourceDate("")).toBe(false);
    expect(isValidSourceDate(undefined)).toBe(false);
  });
});

describe("missingEvidenceFields", () => {
  test("returns empty when all three evidence fields are valid", () => {
    expect(missingEvidenceFields({
      sourceUrl: "https://www.county.gov/sale/123",
      sourceRef: "2026-CF-000123",
      sourceDate: "2026-08-01",
    })).toEqual([]);
  });
  test("flags a missing sourceRef", () => {
    expect(missingEvidenceFields({
      sourceUrl: "https://www.county.gov/sale/123",
      sourceDate: "2026-08-01",
    })).toEqual(["sourceRef"]);
  });
  test("flags all three when absent", () => {
    expect(missingEvidenceFields({})).toEqual(["sourceUrl", "sourceRef", "sourceDate"]);
  });
  test("flags an invalid sourceUrl and future sourceDate", () => {
    expect(missingEvidenceFields({
      sourceUrl: "ftp://bad",
      sourceRef: "REF-1",
      sourceDate: "2099-01-01",
    })).toEqual(["sourceUrl", "sourceDate"]);
  });
});

describe("computeStagingStatus", () => {
  test("complete evidence is NEW", () => {
    expect(computeStagingStatus({
      sourceUrl: "https://www.county.gov/sale/123",
      sourceRef: "CASE-1",
      sourceDate: "2026-08-01",
    })).toBe("NEW");
  });
  test("missing evidence is NEEDS_EVIDENCE", () => {
    expect(computeStagingStatus({ sourceRef: "CASE-1" })).toBe("NEEDS_EVIDENCE");
  });
});

describe("TERMINAL_STAGING_STATUSES", () => {
  test("treats DUPLICATE, REJECTED, and ARCHIVED as terminal", () => {
    expect(TERMINAL_STAGING_STATUSES.has("DUPLICATE")).toBe(true);
    expect(TERMINAL_STAGING_STATUSES.has("REJECTED")).toBe(true);
    expect(TERMINAL_STAGING_STATUSES.has("ARCHIVED")).toBe(true);
    expect(TERMINAL_STAGING_STATUSES.has("NEW")).toBe(false);
    expect(TERMINAL_STAGING_STATUSES.has("NEEDS_EVIDENCE")).toBe(false);
  });
});

describe("detectScoreMismatch", () => {
  test("flags a high score when the source says no distress", () => {
    expect(detectScoreMismatch({ distressScore: 85, sourceText: "Owner occupied, no distress, free and clear." })).toBe("SCORE_MISMATCH");
  });
  test("does not flag a high score when the source documents distress", () => {
    expect(detectScoreMismatch({ distressScore: 85, sourceText: "Sheriff sale scheduled, tax delinquent." })).toBe(null);
  });
  test("flags a low score when the source carries strong distress signals", () => {
    expect(detectScoreMismatch({ distressScore: 10, sourceText: "Foreclosure auction, tax sale." })).toBe("SCORE_MISMATCH");
  });
  test("returns null when there is nothing to judge", () => {
    expect(detectScoreMismatch({ distressScore: 50, sourceText: "Property listing." })).toBe(null);
    expect(detectScoreMismatch({ distressScore: undefined, sourceText: "Sheriff sale." })).toBe(null);
    expect(detectScoreMismatch({ distressScore: 90, sourceText: "" })).toBe(null);
  });
});

describe("stagingScoreMismatch", () => {
  test("reads title + excerpt from rawJson and the top-level score", () => {
    const row = {
      distressScore: 90,
      rawJson: { title: "Quiet owner-occupied home", excerpt: "No signs of distress." },
    };
    expect(stagingSourceText(row)).toContain("No signs of distress");
    expect(stagingScoreMismatch(row)).toBe("SCORE_MISMATCH");
  });
});
