import { describe, expect, test } from "bun:test";
import { mongoIdLookups } from "../src/convex/mongoIdCore";

describe("mongoIdLookups", () => {
  test("tries a literal string and native ObjectId for serialized hex IDs", () => {
    expect(mongoIdLookups("507f1f77bcf86cd799439011")).toEqual([
      { kind: "string", value: "507f1f77bcf86cd799439011" },
      { kind: "objectId", value: "507f1f77bcf86cd799439011" },
    ]);
  });

  test("keeps legacy non-hex IDs as literal strings", () => {
    expect(mongoIdLookups(" admin-lead-42 ")).toEqual([{ kind: "string", value: "admin-lead-42" }]);
  });
});
