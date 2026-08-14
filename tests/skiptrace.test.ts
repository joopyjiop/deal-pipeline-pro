// Unit tests for the skip-trace pure helpers (src/convex/skiptrace.ts).
// Only pure functions are imported so the Convex runtime never sees bun:test.
import { describe, expect, test } from "bun:test";
import {
  buildSearchbugForm,
  formatPropertyAddress,
  parseSearchbugResult,
  PEOPLEFINDERS_ADDRESS_URL,
} from "../src/convex/skiptrace";

describe("buildSearchbugForm", () => {
  test("always includes the provider type, format, and limit", () => {
    const form = buildSearchbugForm({});
    expect(form.TYPE).toBe("api_ppl");
    expect(form.FORMAT).toBe("JSON");
    expect(form.LIMIT).toBe("25");
  });

  test("includes only the fields that are present", () => {
    const form = buildSearchbugForm({ firstName: " Jane ", lastName: "Doe" });
    expect(form.FNAME).toBe("Jane");
    expect(form.LNAME).toBe("Doe");
    expect(form.MNAME).toBeUndefined();
    expect(form.ADDRESS).toBeUndefined();
  });
});

describe("formatPropertyAddress", () => {
  test("joins present parts with commas and drops empty pieces", () => {
    expect(formatPropertyAddress({ address: "123 Main St", city: "Fort Wayne", state: "IN", zip: "46802" })).toBe(
      "123 Main St, Fort Wayne, IN 46802",
    );
    expect(formatPropertyAddress({ address: "123 Main St" })).toBe("123 Main St");
    expect(formatPropertyAddress({})).toBe("");
  });
});

describe("parseSearchbugResult", () => {
  test("reads the nested response node and flattens phones", () => {
    const result = parseSearchbugResult({
      response: {
        reportToken: "tok-1",
        names: [{ firstName: "Jane", lastName: "Doe" }],
        phones: [
          { phoneNumber: "555-0100", phoneType: "landline", possibleSubjectPhone: "Yes" },
        ],
        emails: [{ email: "jane@example.com" }],
      },
    });
    expect(result.provider).toBe("searchbug");
    expect(result.reportToken).toBe("tok-1");
    expect(result.names).toEqual([{ first: "Jane", middle: undefined, last: "Doe" }]);
    expect(result.phones).toEqual([
      { number: "555-0100", type: "landline", carrier: undefined, listingName: undefined, score: undefined, possibleSubject: true },
    ]);
    expect(result.emails).toEqual(["jane@example.com"]);
  });

  test("dedupes phone numbers and drops blank ones", () => {
    const result = parseSearchbugResult({
      phones: [{ phoneNumber: "555-0100" }, { phoneNumber: "555-0100" }, { phoneNumber: "  " }],
    });
    expect(result.phones.map((phone) => phone.number)).toEqual(["555-0100"]);
  });

  test("tolerates a flat response with no response wrapper", () => {
    const result = parseSearchbugResult({ reportToken: "flat", phones: [], names: [], emails: [] });
    expect(result.reportToken).toBe("flat");
    expect(result.phones).toEqual([]);
  });
});

describe("PEOPLEFINDERS_ADDRESS_URL", () => {
  test("points at the PeopleFinders reverse-address page", () => {
    expect(PEOPLEFINDERS_ADDRESS_URL).toBe("https://www.peoplefinders.com/address");
  });
});
