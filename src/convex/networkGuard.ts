/**
 * Server-side network-safety helpers (pure — no Convex/Node imports) so the
 * same rules can be shared by HTTP handlers and actions and unit-tested from
 * `tests/` without pulling the Convex bundle in.
 *
 * - `constantTimeEqual` — timing-safe secret comparison. Never use `===` for
 *   secrets: it short-circuits on the first differing byte, leaking the match
 *   position through timing.
 * - `assertPublicOutboundUrl` — SSRF guard for any URL the server fetches.
 * - `isIpAllowed` / `clientIpFromRequest` — optional admin-API IP allow-list.
 */

/** Timing-safe string equality. Runtime depends on length only, not content. */
export function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    // charCodeAt returns NaN past the end; NaN | 0 === 0.
    difference |= (left.charCodeAt(index) | 0) ^ (right.charCodeAt(index) | 0);
  }
  return difference === 0;
}

// ── SSRF guard ─────────────────────────────────────────────────────────────

const IPV4_OCTET = "(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])";
const DOTTED_IPV4 = new RegExp(`^${IPV4_OCTET}(?:\\.${IPV4_OCTET}){3}$`);

function dottedIpv4ToInt(hostname: string): number | null {
  if (!DOTTED_IPV4.test(hostname)) return null;
  const parts = hostname.split(".").map((part) => Number(part));
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

/**
 * Resolves hostnames that are not dotted-decimal but still parse as IPv4
 * literals in the URL/fetch layer (inet_aton semantics): a bare integer,
 * hex (`0x7f000001`), or octal (`0177.0.0.1` is handled as dotted; whole-host
 * octal like `010.0.0.1` is caught here). Returns null for real domain names.
 */
function ipv4LiteralToInt(hostname: string): number | null {
  const dotted = dottedIpv4ToInt(hostname);
  if (dotted !== null) return dotted;
  if (/^\d+$/.test(hostname)) {
    const value = Number(hostname);
    return value >= 0 && value <= 0xffffffff ? value >>> 0 : null;
  }
  if (/^0x[0-9a-f]{1,8}$/i.test(hostname)) {
    const value = Number.parseInt(hostname.slice(2), 16);
    return value <= 0xffffffff ? value >>> 0 : null;
  }
  if (/^0[0-7]+$/.test(hostname)) {
    const value = Number.parseInt(hostname.slice(1), 8);
    return value <= 0xffffffff ? value >>> 0 : null;
  }
  return null;
}

function isBlockedIpv4Int(value: number): boolean {
  const o0 = (value >>> 24) & 0xff;
  const o1 = (value >>> 16) & 0xff;
  return (
    o0 === 0 || // 0.0.0.0/8
    o0 === 10 || // 10.0.0.0/8
    o0 === 127 || // 127.0.0.0/8
    (o0 === 100 && o1 >= 64 && o1 <= 127) || // 100.64.0.0/10 (CGNAT)
    (o0 === 169 && o1 === 254) || // 169.254.0.0/16 (link-local + cloud metadata)
    (o0 === 172 && o1 >= 16 && o1 <= 31) || // 172.16.0.0/12
    (o0 === 192 && o1 === 168) || // 192.168.0.0/16
    o0 >= 224 // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  );
}

function isBlockedIpv4(hostname: string): boolean {
  const value = ipv4LiteralToInt(hostname);
  return value !== null && isBlockedIpv4Int(value);
}

// Extracts the embedded 32-bit IPv4 from an IPv4-mapped (`::ffff:x.x.x.x`) or
// IPv4-compatible (`::x.x.x.x`) IPv6 address. URL parsers canonicalize these
// to hex (e.g. `::ffff:127.0.0.1` → `::ffff:7f00:1`), so both hex and dotted
// tail forms are accepted. Returns null when the address embeds no IPv4.
function ipv6EmbeddedIpv4(hostname: string): number | null {
  const lower = hostname.toLowerCase();
  const hex = lower.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = Number.parseInt(hex[1], 16);
    const lo = Number.parseInt(hex[2], 16);
    return ((hi << 16) >>> 0) + lo;
  }
  const dotted = lower.match(/^::(?:ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  return dotted ? dottedIpv4ToInt(dotted[1]) : null;
}

function isBlockedIpv6(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  const first = lower.split(":")[0];
  if (/^fe[89ab]/.test(first)) return true; // fe80::/10 link-local
  if (/^fec/.test(first)) return true; // fec0::/10 site-local (deprecated)
  if (/^f[cd]/.test(first)) return true; // fc00::/7 unique-local
  if (/^ff/.test(first)) return true; // ff00::/8 multicast
  const embedded = ipv6EmbeddedIpv4(lower);
  return embedded !== null && isBlockedIpv4Int(embedded);
}

/**
 * SSRF guard: parse and validate a URL the server is about to fetch. Rejects
 * non-http(s) schemes, loopback/link-local/private/metadata targets, and IP
 * literal tricks (bare integer, hex, octal, IPv6-mapped). Returns the parsed
 * URL so callers can use `.hostname`, `.toString()`, etc.
 */
export function assertPublicOutboundUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Enter a valid public http(s) URL");
  }

  // WHATWG URL.hostname keeps the brackets on IPv6 literals ("[::1]"), so
  // strip them before the address-range checks below.
  const rawHostname = parsed.hostname.toLowerCase();
  const hostname =
    rawHostname.startsWith("[") && rawHostname.endsWith("]")
      ? rawHostname.slice(1, -1)
      : rawHostname;
  const blocked =
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    isBlockedIpv4(hostname) ||
    isBlockedIpv6(hostname);

  if (blocked) {
    throw new Error("Only public http(s) source URLs are allowed");
  }
  return parsed;
}

// ── Admin API IP allow-list (optional, off by default) ─────────────────────

/**
 * Resolve the most trustworthy client-IP signal available on a Convex HTTP
 * action `Request`. Convex does not expose a socket-level peer address, so
 * this reads standard proxy headers. NOTE: these headers are spoofable by a
 * direct client unless a trusted proxy/edge overwrites them — treat this as
 * defense-in-depth, not the primary control.
 */
export function clientIpFromRequest(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const cf = request.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  return null;
}

/** Match an IP against a rule: exact IP or IPv4 CIDR (e.g. "203.0.113.0/24"). */
export function ipMatchesRule(rule: string, clientIp: string): boolean {
  const trimmed = rule.trim();
  if (trimmed === clientIp) return true;

  const cidr = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!cidr) return false;
  const prefix = Number(cidr[2]);
  if (prefix < 0 || prefix > 32) return false;

  const ruleInt = dottedIpv4ToInt(cidr[1]);
  const clientInt = dottedIpv4ToInt(clientIp);
  if (ruleInt === null || clientInt === null) return false;
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
  return (ruleInt & mask) === (clientInt & mask);
}

/**
 * Evaluate a comma-separated allow-list (from `ADMIN_ALLOWED_IPS`). An empty
 * or unset allow-list means "allow all" (current behavior). When set, a
 * missing/unresolvable client IP is denied (fail closed).
 */
export function isIpAllowed(clientIp: string | null, allowlistCsv: string | null | undefined): boolean {
  const entries = (allowlistCsv ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return true;
  if (!clientIp) return false;
  return entries.some((entry) => ipMatchesRule(entry, clientIp));
}
