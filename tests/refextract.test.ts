// Unit tests for source-reference extraction (src/convex/refextract.ts).
//
// The patterns were validated against real Harris County delinquent tax-sale
// listing evidence, where the previous regex read "should" from prose like
// "sale should …" instead of the actual clerk file numbers on the page.

import { describe, expect, test } from "bun:test";
import { extractSourceReference } from "../src/convex/refextract";

describe("extractSourceReference", () => {
  test("extracts a clerk file number with punctuation", () => {
    expect(extractSourceReference("CLERK FILE NO. W - 158620, FILM CODE NO. 557-97-06", "TAX_SALE", "https://www.hctax.net/")).toBe("158620");
  });

  test("extracts a clerk file number without punctuation", () => {
    expect(extractSourceReference("Clerk File Number K253139; Also Known As Lot 19, A", "TAX_SALE", "https://www.hctax.net/")).toBe("K253139");
  });

  test("extracts a cause number", () => {
    expect(extractSourceReference("Cause No. 2024-0123456, in the District Court", "TAX_SALE", "https://www.hctax.net/")).toBe("2024-0123456");
  });

  test("extracts a parcel id", () => {
    expect(extractSourceReference("Parcel ID 02-05-29-100-006 was advertised", "SHERIFF_SALE", "https://example.gov/")).toBe("02-05-29-100-006");
  });

  test("rejects prose false positives that carry no digit", () => {
    expect(extractSourceReference("The sale should be confirmed at the next hearing", "SHERIFF_SALE", "https://example.gov/")).toBeUndefined();
    expect(extractSourceReference("Sale Date: September 01, 2026", "TAX_SALE", "https://www.hctax.net/")).toBeUndefined();
  });

  test("falls back to the auction listing id for auction.com pages", () => {
    expect(extractSourceReference("no reference present in the excerpt", "AUCTION_COM", "https://www.auction.com/details/8-cypress-ave-moundsville-wv-1886294")).toBe("1886294");
  });

  test("does not use the auction fallback for non-auction sources", () => {
    expect(extractSourceReference("no reference present in the excerpt", "TAX_SALE", "https://www.auction.com/details/8-cypress-ave-moundsville-wv-1886294")).toBeUndefined();
  });
});
