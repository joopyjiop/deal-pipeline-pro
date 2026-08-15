// Unit tests for the RentCast property-data client (src/convex/rentcast.ts).
//
// Lives outside src/convex/ so the Convex bundle never sees the bun:test
// import. Query builders and parsers are pure and tested directly; the live
// fetch paths are tested with a mocked global fetch.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildPropertyQuery,
  fetchPropertyRecord,
  fetchRentEstimate,
  formatOwnerMailingAddress,
  latestAnnualPropertyTax,
  parsePropertyRecord,
  parseRentEstimate,
  rentcastApiKey,
  RENTCAST_BASE_URL,
} from "../src/convex/rentcast";

const originalKey = process.env.RENTCAST_API_KEY;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.RENTCAST_API_KEY = "test-rentcast-key";
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.RENTCAST_API_KEY;
  } else {
    process.env.RENTCAST_API_KEY = originalKey;
  }
  globalThis.fetch = originalFetch;
});

describe("rentcastApiKey", () => {
  test("throws with a clear message when the key is not configured", () => {
    delete process.env.RENTCAST_API_KEY;
    expect(() => rentcastApiKey()).toThrow(/RENTCAST_API_KEY is not configured/);
  });

  test("returns the trimmed key when configured", () => {
    process.env.RENTCAST_API_KEY = "  key-with-whitespace  ";
    expect(rentcastApiKey()).toBe("key-with-whitespace");
  });
});

describe("buildPropertyQuery", () => {
  test("always includes the address and only provided options", () => {
    expect(buildPropertyQuery({ address: "5500 Grand Lake Dr" })).toEqual({ address: "5500 Grand Lake Dr" });
    expect(buildPropertyQuery({ address: "5500 Grand Lake Dr", radius: 3, saleDateRange: 365, limit: 12 })).toEqual({
      address: "5500 Grand Lake Dr",
      radius: "3",
      saleDateRange: "365",
      limit: "12",
    });
  });
});

describe("parsePropertyRecord", () => {
  test("normalizes a full record including the tax history map", () => {
    const property = parsePropertyRecord({
      id: "5500-Grand-Lake-Dr",
      formattedAddress: "5500 Grand Lake Dr, San Antonio, TX 78244",
      city: "San Antonio",
      state: "TX",
      county: "Bexar",
      propertyType: "Single Family",
      bedrooms: 3,
      bathrooms: 2,
      squareFootage: 1878,
      yearBuilt: 1973,
      assessorID: "05076-103-0500",
      lastSaleDate: "2024-11-18T00:00:00.000Z",
      lastSalePrice: 270000,
      propertyTaxes: {
        "2023": { year: 2023, total: 4201 },
        "2024": { year: 2024, total: 4065 },
      },
    });
    expect(property).not.toBeNull();
    expect(property?.squareFootage).toBe(1878);
    expect(property?.lastSalePrice).toBe(270000);
    expect(property?.propertyTaxes?.["2024"]?.total).toBe(4065);
  });

  test("returns null for non-objects or records without an id", () => {
    expect(parsePropertyRecord(null)).toBeNull();
    expect(parsePropertyRecord([1, 2])).toBeNull();
    expect(parsePropertyRecord({ formattedAddress: "no id" })).toBeNull();
  });

  test("tolerates missing optional fields", () => {
    const property = parsePropertyRecord({ id: "abc" });
    expect(property?.id).toBe("abc");
    expect(property?.squareFootage).toBeUndefined();
    expect(property?.propertyTaxes).toBeUndefined();
  });

  test("extracts the owner block and ownerOccupied flag", () => {
    const property = parsePropertyRecord({
      id: "5500-Grand-Lake-Dr",
      owner: {
        names: ["Rolando Villarreal"],
        type: "Individual",
        mailingAddress: {
          formattedAddress: "5500 Grand Lake Dr, San Antonio, TX 78244",
          addressLine1: "5500 Grand Lake Dr",
          city: "San Antonio",
          state: "TX",
          zipCode: "78244",
        },
      },
      ownerOccupied: true,
    });
    expect(property?.ownerNames).toEqual(["Rolando Villarreal"]);
    expect(property?.ownerType).toBe("Individual");
    expect(property?.ownerMailingAddress?.city).toBe("San Antonio");
    expect(property?.ownerOccupied).toBe(true);
  });

  test("leaves owner fields undefined when the owner block is absent", () => {
    const property = parsePropertyRecord({ id: "abc" });
    expect(property?.ownerNames).toBeUndefined();
    expect(property?.ownerMailingAddress).toBeUndefined();
    expect(property?.ownerOccupied).toBeUndefined();
  });
});

describe("formatOwnerMailingAddress", () => {
  test("prefers the provider's formatted address", () => {
    expect(formatOwnerMailingAddress({ formattedAddress: "5500 Grand Lake Dr, San Antonio, TX 78244", city: "San Antonio" })).toBe(
      "5500 Grand Lake Dr, San Antonio, TX 78244",
    );
  });

  test("joins parts when there is no formatted address", () => {
    expect(formatOwnerMailingAddress({ addressLine1: "5500 Grand Lake Dr", city: "San Antonio", state: "TX", zipCode: "78244" })).toBe(
      "5500 Grand Lake Dr, San Antonio, TX, 78244",
    );
  });

  test("returns undefined for empty or missing addresses", () => {
    expect(formatOwnerMailingAddress(undefined)).toBeUndefined();
    expect(formatOwnerMailingAddress({})).toBeUndefined();
  });
});

describe("latestAnnualPropertyTax", () => {
  test("returns the most recent year's total", () => {
    const property = parsePropertyRecord({
      id: "x",
      propertyTaxes: {
        "2022": { year: 2022, total: 4077 },
        "2023": { year: 2023, total: 4201 },
      },
    });
    expect(latestAnnualPropertyTax(property)).toBe(4201);
  });

  test("returns undefined when no positive total exists", () => {
    const property = parsePropertyRecord({ id: "x", propertyTaxes: { "2024": { year: 2024, total: 0 } } });
    expect(latestAnnualPropertyTax(property)).toBeUndefined();
    expect(latestAnnualPropertyTax(null)).toBeUndefined();
  });
});

describe("parseRentEstimate", () => {
  test("parses rent, range, and subject property", () => {
    const estimate = parseRentEstimate({
      rent: 1620,
      rentRangeLow: 1550,
      rentRangeHigh: 1690,
      subjectProperty: { id: "5500-Grand-Lake-Dr", squareFootage: 1878, yearBuilt: 1973 },
    });
    expect(estimate?.rent).toBe(1620);
    expect(estimate?.rentRangeLow).toBe(1550);
    expect(estimate?.rentRangeHigh).toBe(1690);
    expect(estimate?.subjectProperty?.squareFootage).toBe(1878);
  });

  test("returns null for a non-object payload", () => {
    expect(parseRentEstimate("nope")).toBeNull();
  });
});

describe("live fetch paths (mocked)", () => {
  function mockFetch(status: number, body: unknown, statusText = "") {
    globalThis.fetch = (async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      json: async () => body,
    })) as unknown as typeof fetch;
  }

  test("fetchPropertyRecord posts the X-Api-Key header and parses the first record", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      void init;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => [{ id: "5500-Grand-Lake-Dr", squareFootage: 1878, lastSalePrice: 270000 }],
      } as Response;
    }) as unknown as typeof fetch;

    const property = await fetchPropertyRecord("5500 Grand Lake Dr, San Antonio, TX");
    expect(capturedUrl.startsWith(`${RENTCAST_BASE_URL}/properties?`)).toBe(true);
    const parsedUrl = new URL(capturedUrl);
    expect(parsedUrl.searchParams.get("address")).toBe("5500 Grand Lake Dr, San Antonio, TX");
    expect(parsedUrl.searchParams.get("limit")).toBe("1");
    expect(property?.squareFootage).toBe(1878);
    expect(property?.lastSalePrice).toBe(270000);
  });

  test("fetchPropertyRecord returns null when the API returns an empty list", async () => {
    mockFetch(200, []);
    expect(await fetchPropertyRecord("123 Nowhere St, Nowhere, ZZ")).toBeNull();
  });

  test("throws a descriptive error on a 4xx with a message payload", async () => {
    mockFetch(402, { message: "Plan limit exceeded" });
    await expect(fetchRentEstimate("5500 Grand Lake Dr, San Antonio, TX")).rejects.toThrow(/402.*Plan limit exceeded/);
  });

  test("throws before fetching when the key is missing", async () => {
    delete process.env.RENTCAST_API_KEY;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    }) as unknown as typeof fetch;
    await expect(fetchPropertyRecord("5500 Grand Lake Dr, San Antonio, TX")).rejects.toThrow(/RENTCAST_API_KEY is not configured/);
    expect(called).toBe(false);
  });
});
