"use node";

import { v } from "convex/values";
import { action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Camofox browser integration.
 *
 * Proxies the self-hosted camofox-browser REST API (Camoufox anti-detection
 * Firefox) so the owner workspace and the AI agent can browse JS-heavy or
 * login-gated public-record sources (sheriff sales, tax sales, assessor
 * portals) and capture evidence-backed snapshots for the lead pipeline.
 *
 * Every action is owner-gated server-side (same convention as mongodb.ts):
 * the permanent owner email OR the role "admin" users row. The camofox API
 * key never leaves the backend.
 *
 * Required env vars on the Convex deployment (keen-aardvark-333):
 *   CAMOFOX_BASE_URL = https://camofox-browser-h1ib.onrender.com
 *   CAMOFOX_API_KEY  = the same Bearer key set on the camofox server
 */

const OWNER_EMAIL = "jacobvierra8@gmail.com";
const CAMOFOX_USER = "owner";
const DEFAULT_SESSION = "owner";
const REQUEST_TIMEOUT_MS = 60_000;

type HealthResponse = {
  ok: boolean;
  engine?: string;
  browserConnected?: boolean;
  browserRunning?: boolean;
  activeTabs?: number;
  activeSessions?: number;
  consecutiveFailures?: number;
  memory?: { rssMb?: number; heapUsedMb?: number; nativeMemMb?: number };
};

type SnapshotResponse = {
  url?: string;
  snapshot?: string;
  refsCount?: number;
  truncated?: boolean;
  totalChars?: number;
  hasMore?: boolean;
  nextOffset?: number;
};

type CreateTabResponse = {
  tabId?: string;
  url?: string;
};

function camofoxBaseUrl(): string {
  const url = process.env.CAMOFOX_BASE_URL?.trim().replace(/\/+$/, "");
  if (!url) {
    throw new Error(
      "CAMOFOX_BASE_URL is not configured — set it on the Convex deployment env vars",
    );
  }
  return url;
}

function camofoxApiKey(): string {
  const key = process.env.CAMOFOX_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "CAMOFOX_API_KEY is not configured — set it on the Convex deployment env vars",
    );
  }
  return key;
}

async function camofox(
  path: string,
  init: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<unknown> {
  const response = await fetch(`${camofoxBaseUrl()}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${camofoxApiKey()}`,
      ...(init.headers as Record<string, string> | undefined),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : response.statusText;
    throw new Error(
      `Camofox ${init.method ?? "GET"} ${path} failed (${response.status}): ${detail}`,
    );
  }
  return body;
}

async function isOwner(ctx: ActionCtx): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email?.trim().toLowerCase() === OWNER_EMAIL) return true;
  // identity.subject is `<userId>|<sessionId>` (see @convex-dev/auth
  // getAuthUserId). Split off the userId and match the app's owner
  // convention (role "admin" OR the permanent owner email).
  const [userId] = (identity?.subject ?? "").split("|");
  if (!userId) return false;
  const user = await ctx.runQuery(internal.users.getUserBySubject, {
    subject: userId,
  });
  return Boolean(
    user && (user.role === "admin" || user.email?.trim().toLowerCase() === OWNER_EMAIL),
  );
}

async function requireOwner(ctx: ActionCtx) {
  if (await isOwner(ctx)) return;
  throw new Error("Owner access required");
}

function assertHttpUrl(url: string) {
  if (!/^https?:\/\/[^\s]+$/i.test(url.trim())) {
    throw new Error("url must be an absolute http(s) URL");
  }
}

/** GET /health — is the camofox browser engine up? */
export const camofoxCheck = action({
  args: {},
  handler: async (ctx): Promise<HealthResponse> => {
    await requireOwner(ctx);
    const body = (await camofox("/health", { method: "GET" }, 15_000)) as HealthResponse;
    return {
      ok: Boolean(body.ok),
      engine: body.engine,
      browserConnected: body.browserConnected,
      browserRunning: body.browserRunning,
      activeTabs: body.activeTabs,
      activeSessions: body.activeSessions,
      consecutiveFailures: body.consecutiveFailures,
      memory: body.memory,
    };
  },
});

/**
 * Open a tab, navigate to url, and return the accessibility snapshot.
 * The tab stays open (session cookies persist per sessionKey), so a later
 * camofoxSnapshot/camofoxAct call can continue the same browsing session.
 */
export const camofoxScrape = action({
  args: {
    url: v.string(),
    sessionKey: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    assertHttpUrl(args.url);
    const sessionKey = (args.sessionKey ?? DEFAULT_SESSION).trim() || DEFAULT_SESSION;
    const timeoutMs = Math.max(10_000, Math.min(120_000, args.timeoutMs ?? REQUEST_TIMEOUT_MS));

    const created = (await camofox(
      "/tabs",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: CAMOFOX_USER,
          sessionKey,
          url: args.url.trim(),
        }),
      },
      timeoutMs,
    )) as CreateTabResponse;
    const tabId = created.tabId;
    if (!tabId) throw new Error("Camofox did not return a tabId");

    const snapshot = (await camofox(
      `/tabs/${encodeURIComponent(tabId)}/snapshot?userId=${encodeURIComponent(CAMOFOX_USER)}`,
      { method: "GET" },
      timeoutMs,
    )) as SnapshotResponse;

    return {
      tabId,
      url: snapshot.url ?? created.url ?? args.url.trim(),
      snapshot: snapshot.snapshot ?? "",
      refsCount: snapshot.refsCount ?? 0,
      truncated: snapshot.truncated ?? false,
      totalChars: snapshot.totalChars ?? 0,
      hasMore: snapshot.hasMore ?? false,
      nextOffset: snapshot.nextOffset ?? 0,
      sessionKey,
    };
  },
});

/** Snapshot an existing tab (continue a session opened by camofoxScrape). */
export const camofoxSnapshot = action({
  args: {
    tabId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const snapshot = (await camofox(
      `/tabs/${encodeURIComponent(args.tabId)}/snapshot?userId=${encodeURIComponent(CAMOFOX_USER)}`,
      { method: "GET" },
    )) as SnapshotResponse;
    return {
      tabId: args.tabId,
      url: snapshot.url,
      snapshot: snapshot.snapshot ?? "",
      refsCount: snapshot.refsCount ?? 0,
      truncated: snapshot.truncated ?? false,
      totalChars: snapshot.totalChars ?? 0,
      hasMore: snapshot.hasMore ?? false,
      nextOffset: snapshot.nextOffset ?? 0,
    };
  },
});

/** Act on a tab: click a ref/selector, type text, or press a key. */
export const camofoxAct = action({
  args: {
    tabId: v.string(),
    action: v.union(v.literal("click"), v.literal("type"), v.literal("press")),
    ref: v.optional(v.string()),
    selector: v.optional(v.string()),
    text: v.optional(v.string()),
    key: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const tabId = encodeURIComponent(args.tabId);

    if (args.action === "click") {
      if (!args.ref && !args.selector) throw new Error("click requires ref or selector");
      return camofox(`/tabs/${tabId}/click`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: CAMOFOX_USER,
          ref: args.ref,
          selector: args.selector,
        }),
      });
    }
    if (args.action === "type") {
      if (typeof args.text !== "string") throw new Error("type requires text");
      return camofox(`/tabs/${tabId}/type`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: CAMOFOX_USER,
          ref: args.ref,
          selector: args.selector,
          text: args.text,
          mode: "fill",
        }),
      });
    }
    // press
    if (!args.key) throw new Error("press requires key");
    return camofox(`/tabs/${tabId}/press`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: CAMOFOX_USER, key: args.key }),
    });
  },
});

/** Close a tab (and its downloads) when done. */
export const camofoxClose = action({
  args: {
    tabId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const body = (await camofox(
      `/tabs/${encodeURIComponent(args.tabId)}?userId=${encodeURIComponent(CAMOFOX_USER)}`,
      { method: "DELETE" },
    )) as { ok?: boolean };
    return { tabId: args.tabId, ok: Boolean(body.ok) };
  },
});
