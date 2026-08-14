// Unit tests for the shared-conversation thread helpers
// (src/convex/sharedConversation.ts). Only the pure helpers are imported so
// the Convex runtime never sees bun:test.
import { describe, expect, test } from "bun:test";
import {
  isUnansweredThreadMessage,
  messageContent,
  normalizeThreadId,
  sanitizeRefs,
} from "../src/convex/sharedConversation";

type MessageDoc = {
  _id: string;
  _creationTime: number;
  threadId: string;
  sender: "website" | "odysseus";
  kind: "MESSAGE" | "REQUEST" | "ESCALATION" | "RESOLUTION";
  content: string;
  refs?: string[];
  metadata?: Record<string, unknown>;
  sentAt: number;
};

function message(overrides: Partial<MessageDoc>): MessageDoc {
  return {
    _id: "msg-1",
    _creationTime: 1,
    threadId: "ops:test",
    sender: "odysseus",
    kind: "MESSAGE",
    content: "hello",
    sentAt: 1,
    ...overrides,
  };
}

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

describe("isUnansweredThreadMessage", () => {
  test("Odysseus REQUEST is open", () => {
    expect(isUnansweredThreadMessage(message({ kind: "REQUEST", content: "Please pull RentCast comps for this lead" }))).toBe(true);
  });

  test("Odysseus ESCALATION is open", () => {
    expect(isUnansweredThreadMessage(message({ kind: "ESCALATION", content: "SALE_HISTORY cannot be verified from here" }))).toBe(true);
  });

  test("a question (message ending in ?) is open", () => {
    expect(isUnansweredThreadMessage(message({ content: "Should we ask the owner to approve this?" }))).toBe(true);
    expect(isUnansweredThreadMessage(message({ content: "Is the staging review done?  " }))).toBe(true);
  });

  test("a plain note without a question is not open", () => {
    expect(isUnansweredThreadMessage(message({ content: "The RentCast pull completed" }))).toBe(false);
  });

  test("an explicit expectReply flag opens a plain message", () => {
    expect(isUnansweredThreadMessage(message({ content: "Review the staging queue", metadata: { expectReply: true } }))).toBe(true);
  });

  test("RESOLUTION is never open even with a question", () => {
    expect(isUnansweredThreadMessage(message({ kind: "RESOLUTION", content: "Done? yes" }))).toBe(false);
  });

  test("website messages are never answered by the website", () => {
    expect(isUnansweredThreadMessage(message({ sender: "website" }))).toBe(false);
  });

  test("an already auto-replied message is not open", () => {
    expect(
      isUnansweredThreadMessage(
        message({ kind: "REQUEST", content: "Pull comps please", metadata: { autoRepliedAt: 1234 } }),
      ),
    ).toBe(false);
  });
});
