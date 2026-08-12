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

function normalizeUrl(rawUrl: string, baseUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim(), baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    parsed.hash = "";
    const pathname = parsed.pathname.toLowerCase();
    if (/\.(?:css|csv|gif|ico|jpe?g|js|json|mp3|mp4|pdf|png|svg|webp|woff2?|xml|zip)$/i.test(pathname)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractLinks(snapshot: string, baseUrl: string): string[] {
  const candidates = new Set<string>();
  const addMatches = (pattern: RegExp) => {
    for (const match of snapshot.matchAll(pattern)) {
      const candidate = normalizeUrl(match[1] ?? match[0], baseUrl);
      if (candidate) candidates.add(candidate);
    }
  };

  // Accessibility snapshots can expose links as absolute text, markdown, or
  // href-like attributes depending on the page and Camofox version.
  addMatches(/https?:\/\/[^\s"'<>()[\]{}]+/gi);
  addMatches(/(?:href|url)\s*[:=]\s*["']([^"']+)["']/gi);
  addMatches(/\]\((https?:\/\/[^)]+)\)/gi);

  return Array.from(candidates).slice(0, 100);
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

/**
 * Crawl a bounded set of owner-provided URLs and links discovered from them.
 * Explicit seed URLs may be from different sites; discovered links are kept
 * on the seed origins by default. Pages are processed sequentially and tabs
 * are closed after capture so a free browser host is not overwhelmed.
 */
export const camofoxCrawl = action({
  args: {
    urls: v.array(v.string()),
    sessionKey: v.optional(v.string()),
    maxPages: v.optional(v.number()),
    discoverLinks: v.optional(v.boolean()),
    sameOriginOnly: v.optional(v.boolean()),
    timeoutMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const seeds = Array.from(
      new Set(args.urls.map((url) => url.trim()).filter(Boolean)),
    );
    if (seeds.length === 0) throw new Error("At least one URL is required");
    if (seeds.length > 20) throw new Error("You can submit at most 20 starting URLs per crawl");
    seeds.forEach(assertHttpUrl);

    const maxPages = Math.max(1, Math.min(12, Math.floor(args.maxPages ?? 8)));
    const timeoutMs = Math.max(10_000, Math.min(60_000, args.timeoutMs ?? 45_000));
    const sessionKey = (args.sessionKey ?? DEFAULT_SESSION).trim() || DEFAULT_SESSION;
    const sameOriginOnly = args.sameOriginOnly ?? true;
    const shouldDiscover = args.discoverLinks ?? true;
    const allowedOrigins = new Set(seeds.map((url) => new URL(url).origin));
    const queue = [...seeds];
    const visited = new Set<string>();
    const discovered = new Set<string>();
    const pages: Array<{
      url: string;
      finalUrl: string;
      snapshot: string;
      truncated: boolean;
      refsCount: number;
      discoveredLinks: string[];
    }> = [];
    const failed: Array<{ url: string; error: string }> = [];

    while (queue.length > 0 && pages.length + failed.length < maxPages) {
      const requestedUrl = queue.shift();
      if (!requestedUrl) break;
      const pageUrl = normalizeUrl(requestedUrl, requestedUrl);
      if (!pageUrl || visited.has(pageUrl)) continue;
      visited.add(pageUrl);

      let tabId: string | undefined;
      try {
        const created = (await camofox(
          "/tabs",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId: CAMOFOX_USER, sessionKey, url: pageUrl }),
          },
          timeoutMs,
        )) as CreateTabResponse;
        tabId = created.tabId;
        if (!tabId) throw new Error("Camofox did not return a tabId");

        const snapshot = (await camofox(
          `/tabs/${encodeURIComponent(tabId)}/snapshot?userId=${encodeURIComponent(CAMOFOX_USER)}`,
          { method: "GET" },
          timeoutMs,
        )) as SnapshotResponse;
        const finalUrl = snapshot.url ?? created.url ?? pageUrl;
        const links = shouldDiscover ? extractLinks(snapshot.snapshot ?? "", finalUrl) : [];
        const acceptedLinks = links.filter((link) => {
          if (sameOriginOnly && !allowedOrigins.has(new URL(link).origin)) return false;
          if (!visited.has(link)) discovered.add(link);
          return !visited.has(link);
        });
        for (const link of acceptedLinks) {
          if (!queue.includes(link) && queue.length < maxPages * 4) queue.push(link);
        }

        const rawSnapshot = snapshot.snapshot ?? "";
        pages.push({
          url: pageUrl,
          finalUrl,
          snapshot: rawSnapshot.slice(0, 16_000),
          truncated: Boolean(snapshot.truncated) || rawSnapshot.length > 16_000,
          refsCount: snapshot.refsCount ?? 0,
          discoveredLinks: acceptedLinks,
        });
      } catch (error) {
        failed.push({
          url: pageUrl,
          error: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (tabId) {
          await camofox(
            `/tabs/${encodeURIComponent(tabId)}?userId=${encodeURIComponent(CAMOFOX_USER)}`,
            { method: "DELETE" },
          ).catch(() => undefined);
        }
      }
    }

    return {
      requested: seeds,
      sessionKey,
      maxPages,
      pages,
      failed,
      discoveredLinks: Array.from(discovered).slice(0, 100),
      queuedButNotVisited: queue.slice(0, 50),
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
