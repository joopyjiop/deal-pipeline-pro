"use node";

/**
 * Pure helpers for the API access registry — no Convex imports (only
 * node:crypto) so the same rules are shared by the Convex actions, the HTTP
 * auth layer in http.ts, and unit tests in tests/.
 *
 * The registry is the "whoever I gave permission to" half of API auth: every
 * API surface accepts either the owner's master key (ADMIN_API_KEY,
 * MCP_TOOL_SERVER_SECRET, CONVEX_N8N_WEBHOOK_SECRET — the "me" half, checked
 * first and kept unchanged) OR a scoped, revocable credential issued from this
 * registry. Tokens are stored only as SHA-256 hashes; the plaintext token is
 * shown exactly once at issue/rotate time.
 */

import { createHash, randomBytes } from "node:crypto";

/** The four API surfaces a credential can be scoped to. */
export const API_SCOPES = ["mcp", "threads", "admin", "n8n"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const CREDENTIAL_STATUSES = ["ACTIVE", "PENDING", "REVOKED"] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const API_CREDENTIALS_COLLECTION = "api_credentials";

export const TOKEN_PREFIX = "dp_";

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && (API_SCOPES as readonly string[]).includes(value);
}

export function scopeLabel(scope: ApiScope): string {
  switch (scope) {
    case "mcp":
      return "Agent tools (/api/mcp)";
    case "threads":
      return "Shared conversations (/api/shared-thread)";
    case "admin":
      return "Full admin CRUD (/api/admin + /api/mcp/admin)";
    case "n8n":
      return "Automation queue (/api/n8n/source)";
  }
}

/**
 * Validate and deduplicate a scope list. Throws on empty or unknown scopes so
 * a credential can never be minted with more (or less) than the owner asked
 * for.
 */
export function normalizeScopes(value: unknown): ApiScope[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one API scope is required (mcp, threads, admin, n8n)");
  }
  const scopes: ApiScope[] = [];
  for (const entry of value) {
    if (!isApiScope(entry)) throw new Error(`Unknown API scope: ${String(entry)}`);
    if (!scopes.includes(entry)) scopes.push(entry);
  }
  return scopes;
}

/** Validate an agent/integration name (2-80 chars, no line breaks). */
export function sanitizeName(value: unknown): string {
  if (typeof value !== "string") throw new Error("Credential name is required");
  const name = value.trim();
  if (name.length < 2 || name.length > 80) throw new Error("Credential name must be 2-80 characters");
  if (/[\r\n]/.test(name)) throw new Error("Credential name cannot contain line breaks");
  return name;
}

export function sanitizeNote(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const note = value.trim();
  if (!note) return undefined;
  return note.replace(/[\r\n]+/g, " ").slice(0, 200);
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** First 8 chars of the token, for display/identification only. */
export function tokenPrefixOf(token: string): string {
  return token.slice(0, 8);
}

/**
 * Generate a fresh credential token (256-bit random, `dp_`-prefixed
 * base64url). Returns the plaintext token AND its hash/prefix; only the hash
 * is ever stored.
 */
export function generateApiToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { token, tokenHash: hashApiToken(token), tokenPrefix: tokenPrefixOf(token) };
}

/** A registry row as stored in MongoDB. `tokenHash` is never returned to callers. */
export type ApiCredentialDocument = {
  _id?: unknown;
  name: string;
  scopes: ApiScope[];
  tokenHash: string;
  tokenPrefix: string;
  status: CredentialStatus;
  createdBy: string;
  createdAt: number;
  lastUsedAt?: number;
  note?: string;
};

/** The safe, token-free view of a credential returned to the Dashboard. */
export type PublicApiCredential = {
  id: string;
  name: string;
  scopes: ApiScope[];
  tokenPrefix: string;
  status: CredentialStatus;
  createdBy: string;
  createdAt: number;
  lastUsedAt?: number;
  note?: string;
};

/** Coerce a raw MongoDB row (or any loose record) into the safe public view. */
export function toPublicCredential(doc: Record<string, unknown>): PublicApiCredential {
  return {
    id: String(doc._id),
    name: typeof doc.name === "string" ? doc.name : "unknown",
    scopes: Array.isArray(doc.scopes) ? (doc.scopes.filter(isApiScope) as ApiScope[]) : [],
    tokenPrefix: typeof doc.tokenPrefix === "string" ? doc.tokenPrefix : "",
    status: (CREDENTIAL_STATUSES as readonly string[]).includes(String(doc.status))
      ? (doc.status as CredentialStatus)
      : "REVOKED",
    createdBy: typeof doc.createdBy === "string" ? doc.createdBy : "",
    createdAt: Number(doc.createdAt) || 0,
    lastUsedAt: typeof doc.lastUsedAt === "number" ? doc.lastUsedAt : undefined,
    note: typeof doc.note === "string" ? doc.note : undefined,
  };
}
