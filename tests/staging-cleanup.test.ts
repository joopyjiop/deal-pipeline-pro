import { describe, expect, test } from "bun:test";
import { isEmptyStagingRow } from "../src/convex/stagingCleanupCore";

describe("isEmptyStagingRow", () => {
  test("a row with nothing at all is empty garbage", () => {
    expect(isEmptyStagingRow({})).toBe(true);
    expect(isEmptyStagingRow({ sourceType: "MANUAL" })).toBe(true);
    expect(isEmptyStagingRow({ status: "NEEDS_EVIDENCE" })).toBe(true);
  });

  test("whitespace-only strings count as empty", () => {
    expect(
      isEmptyStagingRow({ sourceUrl: "   ", title: " ", rawJson: { url: "", excerpt: "  " } }),
    ).toBe(true);
  });

  test("a top-level sourceUrl makes the row actionable, never garbage", () => {
    expect(isEmptyStagingRow({ sourceUrl: "https://county.gov/sales" })).toBe(false);
    expect(isEmptyStagingRow({ sourceUrl: "https://county.gov/sales", status: "NEEDS_EVIDENCE" })).toBe(false);
  });

  test("a nested rawJson.url keeps the row (fetch/crawl paths store evidence there)", () => {
    expect(isEmptyStagingRow({ rawJson: { url: "https://county.gov/sales" } })).toBe(false);
    expect(
      isEmptyStagingRow({ rawJson: { url: "https://county.gov/sales", title: "", excerpt: "" } }),
    ).toBe(false);
  });

  test("content without a URL is kept — evidence can still be filled in", () => {
    expect(isEmptyStagingRow({ title: "Some title" })).toBe(false);
    expect(isEmptyStagingRow({ excerpt: "Some text from the source" })).toBe(false);
    expect(isEmptyStagingRow({ rawJson: { excerpt: "Some text" } })).toBe(false);
    expect(isEmptyStagingRow({ rawJson: { title: "Some title" } })).toBe(false);
  });

  test("non-string fields are ignored safely", () => {
    expect(isEmptyStagingRow({ sourceUrl: 123, title: null, excerpt: undefined, rawJson: "nope" })).toBe(true);
    expect(isEmptyStagingRow({ sourceUrl: 123, title: 42 })).toBe(true);
  });
});
