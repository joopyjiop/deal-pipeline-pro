// Unit tests for the shared-conversation thread helpers
// (src/convex/sharedConversation.ts). Only the pure helpers are imported so
// the Convex runtime never sees bun:test.
import { describe, expect, test } from "bun:test";
import { messageContent, normalizeThreadId, sanitizeRefs } from "../src/convex/sharedConversation";

describe("normalizeThreadId", () => {
  test("trims and collapses whitespace", () => {
    expect(normalizeThreadId("  deal:  abc123  ")).toBe("deal: abc123");
  });

  test("caps at the thread-id limit", () => {
    expect(normalizeThreadId("x".repeat(300)).length).toBeLessThanOrEqual(120);
  });

  test("returns empty for blank input", () => {
    expect(normalizeThreadId("   ")).toBe("");
  });
});

describe("messageContent", () => {
  test("trims and normalizes line endings", () => {
    expect(messageContent("  hello\r\nworld  ")).toBe("hello\nworld");
  });

  test("caps at the content limit", () => {
    expect(messageContent("y".repeat(10_000)).length).toBeLessThanOrEqual(8000);
  });

  test("returns empty for blank input", () => {
    expect(messageContent(" \n ")).toBe("");
  });
});

describe("sanitizeRefs", () => {
  test("trims, dedupes, and bounds", () => {
    const refs = sanitizeRefs(["  lead:abc  ", "lead:abc", "task:xyz", ""]);
    expect(refs).toEqual(["lead:abc", "task:xyz"]);
  });

  test("returns undefined for empty input", () => {
    expect(sanitizeRefs([])).toBeUndefined();
    expect(sanitizeRefs(undefined)).toBeUndefined();
    expect(sanitizeRefs(["  ", ""])).toBeUndefined();
  });

  test("caps the number of refs and each ref length", () => {
    const many = Array.from({ length: 20 }, (_, index) => `ref-${index}`);
    expect(sanitizeRefs(many)?.length).toBeLessThanOrEqual(10);
    expect(sanitizeRefs(["z".repeat(500)])?.[0].length).toBeLessThanOrEqual(200);
  });
});
