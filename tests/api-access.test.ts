// Unit tests for src/convex/apiAccessCore.ts (API access registry helpers:
// scope validation, credential-token generation/hashing, and the token-free
// public view). Lives outside src/convex/ so the Convex bundle never sees the
// bun:test import.
import { describe, expect, test } from "bun:test";
import {
  API_SCOPES,
  generateApiToken,
  hashApiToken,
  isApiScope,
  normalizeScopes,
  sanitizeName,
  sanitizeNote,
  scopeLabel,
  tokenPrefixOf,
  toPublicCredential,
  TOKEN_PREFIX,
} from "../src/convex/apiAccessCore";

describe("normalizeScopes", () => {
  test("accepts every registered scope", () => {
    expect(normalizeScopes(["admin"])).toEqual(["admin"]);
    expect(normalizeScopes(["threads"])).toEqual(["threads"]);
    expect(normalizeScopes(["n8n"])).toEqual(["n8n"]);
    expect(normalizeScopes([...API_SCOPES])).toEqual([...API_SCOPES]);
  });

  test("deduplicates repeated scopes", () => {
    expect(normalizeScopes(["threads", "threads", "admin"])).toEqual(["threads", "admin"]);
  });

  test("rejects an empty scope list", () => {
    expect(() => normalizeScopes([])).toThrow(/at least one API scope/i);
    expect(() => normalizeScopes(undefined)).toThrow(/at least one API scope/i);
    expect(() => normalizeScopes("admin")).toThrow(/at least one API scope/i);
  });

  test("rejects unknown scopes", () => {
    expect(() => normalizeScopes(["mcp"])).toThrow(/unknown API scope/i);
    expect(() => normalizeScopes(["admin", "root"])).toThrow(/unknown API scope/i);
  });
});

describe("isApiScope", () => {
  test("recognizes registered scopes and rejects everything else", () => {
    expect(isApiScope("admin")).toBe(true);
    expect(isApiScope("threads")).toBe(true);
    expect(isApiScope("n8n")).toBe(true);
    expect(isApiScope("mcp")).toBe(false);
    expect(isApiScope("")).toBe(false);
    expect(isApiScope(42)).toBe(false);
    expect(isApiScope(undefined)).toBe(false);
  });
});

describe("scopeLabel", () => {
  test("describes every registered scope", () => {
    for (const scope of API_SCOPES) {
      expect(scopeLabel(scope)).toMatch(/^.+$/);
    }
  });
});

describe("sanitizeName", () => {
  test("trims and accepts valid names", () => {
    expect(sanitizeName("  Odysseus  ")).toBe("Odysseus");
    expect(sanitizeName("n8n")).toBe("n8n");
  });

  test("rejects non-strings", () => {
    expect(() => sanitizeName(undefined)).toThrow(/name is required/i);
    expect(() => sanitizeName(42)).toThrow(/name is required/i);
    expect(() => sanitizeName("")).toThrow(/2-80 characters/i);
    expect(() => sanitizeName("   ")).toThrow(/2-80 characters/i);
  });

  test("rejects too-short and too-long names", () => {
    expect(() => sanitizeName("a")).toThrow(/2-80 characters/i);
    expect(() => sanitizeName("x".repeat(81))).toThrow(/2-80 characters/i);
  });

  test("rejects line breaks", () => {
    expect(() => sanitizeName("evil\nname")).toThrow(/line breaks/i);
    expect(() => sanitizeName("evil\r\nname")).toThrow(/line breaks/i);
  });
});

describe("sanitizeNote", () => {
  test("trims, collapses line breaks, and caps length", () => {
    expect(sanitizeNote("  hello  ")).toBe("hello");
    expect(sanitizeNote("line1\nline2")).toBe("line1 line2");
    expect(sanitizeNote("x".repeat(300))!.length).toBeLessThanOrEqual(200);
  });

  test("returns undefined for empty or non-strings", () => {
    expect(sanitizeNote("")).toBeUndefined();
    expect(sanitizeNote("   ")).toBeUndefined();
    expect(sanitizeNote(undefined)).toBeUndefined();
    expect(sanitizeNote(7)).toBeUndefined();
  });
});

describe("token generation and hashing", () => {
  test("generates dp_-prefixed 256-bit tokens", () => {
    const { token, tokenHash, tokenPrefix } = generateApiToken();
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true);
    // 3-char prefix + base64url(32 bytes) = 46 chars total.
    expect(token.length).toBe(3 + 43);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenPrefix).toBe(token.slice(0, 8));
  });

  test("never repeats tokens", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const { token } = generateApiToken();
      expect(seen.has(token)).toBe(false);
      seen.add(token);
    }
  });

  test("hashes deterministically and matches the generated hash", () => {
    const { token, tokenHash } = generateApiToken();
    expect(hashApiToken(token)).toBe(tokenHash);
    expect(hashApiToken("dp_abc")).toBe(hashApiToken("dp_abc"));
    expect(hashApiToken("dp_abc")).not.toBe(hashApiToken("dp_abd"));
  });

  test("tokenPrefixOf returns the display prefix", () => {
    expect(tokenPrefixOf("dp_abcdefgh")).toBe("dp_abcde");
    expect(tokenPrefixOf("dp_x").length).toBeLessThanOrEqual(8);
  });
});

describe("toPublicCredential", () => {
  test("never leaks the token hash and coerces a raw row", () => {
    const raw = {
      _id: "65f1a2b3c4d5e6f7a8b9c0d1",
      name: "Odysseus",
      scopes: ["threads", "admin"],
      tokenHash: "deadbeef".repeat(8),
      tokenPrefix: "dp_AbCd",
      status: "ACTIVE",
      createdBy: "owner@example.com",
      createdAt: 1700000000000,
      lastUsedAt: 1700003600000,
      note: "agent",
    };
    const publicView = toPublicCredential(raw);
    expect(publicView).not.toHaveProperty("tokenHash");
    expect(publicView.id).toBe("65f1a2b3c4d5e6f7a8b9c0d1");
    expect(publicView.name).toBe("Odysseus");
    expect(publicView.scopes).toEqual(["threads", "admin"]);
    expect(publicView.status).toBe("ACTIVE");
    expect(publicView.lastUsedAt).toBe(1700003600000);
    expect(publicView.note).toBe("agent");
  });

  test("filters unknown scopes out of the public view", () => {
    const publicView = toPublicCredential({ _id: "1", name: "x", scopes: ["admin", "mcp", "root"], tokenPrefix: "dp_", status: "ACTIVE", createdBy: "o", createdAt: 1 });
    expect(publicView.scopes).toEqual(["admin"]);
  });

  test("falls back safely on malformed rows", () => {
    const publicView = toPublicCredential({});
    expect(publicView.id).toBe("undefined");
    expect(publicView.name).toBe("unknown");
    expect(publicView.scopes).toEqual([]);
    expect(publicView.status).toBe("REVOKED");
    expect(publicView.createdAt).toBe(0);
  });
});
