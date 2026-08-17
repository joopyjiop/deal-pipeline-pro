// Unit tests for src/convex/networkGuard.ts (constant-time secret comparison,
// SSRF URL guard, and admin IP allow-list). Lives outside src/convex/ so the
// Convex bundle never sees the bun:test import.
import { describe, expect, test } from "bun:test";
import {
  assertPublicOutboundUrl,
  clientIpFromRequest,
  constantTimeEqual,
  ipMatchesRule,
  isIpAllowed,
} from "../src/convex/networkGuard";

describe("constantTimeEqual", () => {
  test("returns true for identical strings", () => {
    expect(constantTimeEqual("secret-token-123", "secret-token-123")).toBe(true);
  });

  test("returns true for two empty strings", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });

  test("returns false for different strings", () => {
    expect(constantTimeEqual("secret-token-123", "secret-token-999")).toBe(false);
  });

  test("returns false when lengths differ", () => {
    expect(constantTimeEqual("abc", "abcdef")).toBe(false);
  });

  test("returns false for empty vs non-empty", () => {
    expect(constantTimeEqual("", "x")).toBe(false);
    expect(constantTimeEqual("x", "")).toBe(false);
  });

  test("is not fooled by a common prefix", () => {
    expect(constantTimeEqual("Bearer abcdef", "Bearer abcdeg")).toBe(false);
  });
});

describe("assertPublicOutboundUrl", () => {
  test("allows public https domains", () => {
    expect(() => assertPublicOutboundUrl("https://example.com/page")).not.toThrow();
  });

  test("allows public http domains", () => {
    expect(() => assertPublicOutboundUrl("http://example.com/page")).not.toThrow();
  });

  test("allows public IPv4 and IPv6", () => {
    expect(() => assertPublicOutboundUrl("https://8.8.8.8/")).not.toThrow();
    expect(() => assertPublicOutboundUrl("https://[2606:4700::1111]/")).not.toThrow();
  });

  test("blocks localhost and loopback", () => {
    expect(() => assertPublicOutboundUrl("http://localhost/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://127.0.0.1/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://127.1.2.3/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://[::1]/")).toThrow();
  });

  test("blocks private IPv4 ranges", () => {
    expect(() => assertPublicOutboundUrl("http://10.0.0.1/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://192.168.1.1/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://172.16.0.1/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://172.31.255.255/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://100.64.0.1/")).toThrow();
  });

  test("blocks link-local and cloud metadata", () => {
    expect(() => assertPublicOutboundUrl("http://169.254.169.254/latest/meta-data/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://[fe80::1]/")).toThrow();
  });

  test("blocks unique-local and multicast IPv6", () => {
    expect(() => assertPublicOutboundUrl("http://[fc00::1]/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://[fd00::1]/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://[ff02::1]/")).toThrow();
  });

  test("blocks IPv4-mapped IPv6", () => {
    expect(() => assertPublicOutboundUrl("http://[::ffff:127.0.0.1]/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://[::ffff:10.0.0.1]/")).toThrow();
  });

  test("blocks integer/hex/octal IPv4 literal tricks", () => {
    expect(() => assertPublicOutboundUrl("http://2130706433/")).toThrow(); // 127.0.0.1
    expect(() => assertPublicOutboundUrl("http://0x7f000001/")).toThrow(); // 127.0.0.1
    expect(() => assertPublicOutboundUrl("http://017700000001/")).toThrow(); // 127.0.0.1
  });

  test("blocks non-http(s) schemes", () => {
    expect(() => assertPublicOutboundUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPublicOutboundUrl("gopher://example.com/")).toThrow();
    expect(() => assertPublicOutboundUrl("ftp://example.com/")).toThrow();
  });

  test("blocks multicast/reserved and .local hostnames", () => {
    expect(() => assertPublicOutboundUrl("http://224.0.0.1/")).toThrow();
    expect(() => assertPublicOutboundUrl("http://foo.local/")).toThrow();
  });

  test("rejects malformed URLs", () => {
    expect(() => assertPublicOutboundUrl("not a url")).toThrow();
  });
});

describe("ipMatchesRule", () => {
  test("matches an exact IP", () => {
    expect(ipMatchesRule("203.0.113.5", "203.0.113.5")).toBe(true);
    expect(ipMatchesRule("203.0.113.5", "203.0.113.6")).toBe(false);
  });

  test("matches an IPv4 CIDR range", () => {
    expect(ipMatchesRule("203.0.113.0/24", "203.0.113.42")).toBe(true);
    expect(ipMatchesRule("203.0.113.0/24", "203.0.114.42")).toBe(false);
  });

  test("handles /32 and /0", () => {
    expect(ipMatchesRule("203.0.113.5/32", "203.0.113.5")).toBe(true);
    expect(ipMatchesRule("203.0.113.5/32", "203.0.113.6")).toBe(false);
    expect(ipMatchesRule("0.0.0.0/0", "198.51.100.7")).toBe(true);
  });
});

describe("isIpAllowed", () => {
  test("allows everyone when the allow-list is empty or unset", () => {
    expect(isIpAllowed("203.0.113.5", "")).toBe(true);
    expect(isIpAllowed("203.0.113.5", null)).toBe(true);
    expect(isIpAllowed(null, undefined)).toBe(true);
  });

  test("fails closed when configured and no client IP is resolvable", () => {
    expect(isIpAllowed(null, "203.0.113.0/24")).toBe(false);
  });

  test("allows a listed IP and denies an unlisted one", () => {
    expect(isIpAllowed("203.0.113.5", "203.0.113.0/24, 198.51.100.1")).toBe(true);
    expect(isIpAllowed("8.8.8.8", "203.0.113.0/24, 198.51.100.1")).toBe(false);
  });
});

describe("clientIpFromRequest", () => {
  test("prefers the first x-forwarded-for entry", () => {
    const request = new Request("http://x/", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.1", "x-real-ip": "9.9.9.9" },
    });
    expect(clientIpFromRequest(request)).toBe("203.0.113.5");
  });

  test("falls back to x-real-ip then cf-connecting-ip", () => {
    expect(clientIpFromRequest(new Request("http://x/", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientIpFromRequest(new Request("http://x/", { headers: { "cf-connecting-ip": "8.8.4.4" } }))).toBe("8.8.4.4");
  });

  test("returns null when no proxy header is present", () => {
    expect(clientIpFromRequest(new Request("http://x/"))).toBeNull();
  });
});
