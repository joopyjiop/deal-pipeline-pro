import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { messageContent, normalizeThreadId, sanitizeRefs, shouldNotifyOwner } from "./sharedConversation";
import { assertPublicOutboundUrl, clientIpFromRequest, constantTimeEqual, isIpAllowed } from "./networkGuard";

const http = httpRouter();

const n8nSourceTypes = [
  "SHERIFF_SALE",
  "TAX_SALE",
  "AUCTION_COM",
  "PROBATE",
  "OFF_MARKET",
  "ASSESSOR",
  "RECORDER",
  "FORECLOSURE",
  "MARKETPLACE",
  "ASSOCIATION",
] as const;
type N8nSourceType = (typeof n8nSourceTypes)[number];

const mcpSourceTypes = [
  "SHERIFF_SALE",
  "TAX_SALE",
  "AUCTION_COM",
  "PROBATE",
  "OFF_MARKET",
  "ASSESSOR",
  "RECORDER",
  "PROPSTREAM",
  "BATCHLEADS",
  "DEALMACHINE",
  "FORECLOSURE",
  "MARKETPLACE",
  "ASSOCIATION",
] as const;
type McpSourceType = (typeof mcpSourceTypes)[number];

type JsonRpcId = string | number | null;
type McpToolCallParams = {
  name?: unknown;
  arguments?: unknown;
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...extraHeaders },
  });
}

function empty(status: number, extraHeaders: Record<string, string> = {}) {
  return new Response(null, { status, headers: extraHeaders });
}

function isN8nSourceType(value: unknown): value is N8nSourceType {
  return typeof value === "string" && n8nSourceTypes.includes(value as N8nSourceType);
}

function isMcpSourceType(value: unknown): value is McpSourceType {
  return typeof value === "string" && mcpSourceTypes.includes(value as McpSourceType);
}

const queueN8nSource = httpAction(async (ctx, request) => {
  const expectedSecret = process.env.CONVEX_N8N_WEBHOOK_SECRET;
  const receivedSecret = request.headers.get("x-convex-n8n-secret");
  if (!expectedSecret || !receivedSecret || !constantTimeEqual(receivedSecret, expectedSecret)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 32_768) {
    return json({ error: "Request body is too large" }, 413);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }

  if (!body || typeof body !== "object") {
    return json({ error: "Request body must be an object" }, 400);
  }
  const payload = body as { url?: unknown; sourceType?: unknown; idempotencyKey?: unknown };
  if (typeof payload.url !== "string" || !payload.url.trim() || !isN8nSourceType(payload.sourceType)) {
    return json({
      error: "Expected { url: string, sourceType: supported source type, idempotencyKey?: string }",
    }, 400);
  }
  if (payload.idempotencyKey !== undefined && typeof payload.idempotencyKey !== "string") {
    return json({ error: "idempotencyKey must be a string when provided" }, 400);
  }

  try {
    const result = await ctx.runAction(internal.mongodb.enqueueN8nSource, {
      url: payload.url,
      sourceType: payload.sourceType,
      idempotencyKey: payload.idempotencyKey?.trim() || undefined,
    });
    return json({ ok: true, ...result }, 202);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Source could not be queued" }, 422);
  }
});

const adminResourceNames = new Set(["leads", "buyers", "matches", "hot-deals", "import-staging", "users"]);
const adminNumberFilters = new Set(["limit", "minDistressScore", "maxDistressScore", "minMatchScore"]);

// Optional IP allow-list for the admin surface (ADMIN_ALLOWED_IPS, comma-
// separated IPs or IPv4 CIDRs). Off by default; when set, a request whose
// client IP is not on the list is denied even with a valid key.
function adminIpAllowed(request: Request) {
  const allowlist = process.env.ADMIN_ALLOWED_IPS;
  if (!allowlist || !allowlist.trim()) return true;
  return isIpAllowed(clientIpFromRequest(request), allowlist);
}

function adminAuthorized(request: Request) {
  const expectedSecret = process.env.ADMIN_API_KEY;
  if (!expectedSecret) return false;
  if (!adminIpAllowed(request)) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const receivedSecret = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return Boolean(receivedSecret && constantTimeEqual(receivedSecret, expectedSecret));
}

// /api/mcp/admin uses the same ADMIN_API_KEY as the REST admin API — sent as a
// standard Bearer token (canonical, matches /api/admin) or as the
// x-admin-api-key header (for MCP clients that cannot set Authorization).
function adminMcpAuthorized(request: Request) {
  const expectedSecret = process.env.ADMIN_API_KEY;
  if (!expectedSecret) return false;
  if (!adminIpAllowed(request)) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const apiKey = request.headers.get("x-admin-api-key")?.trim();
  return Boolean(
    (bearer && constantTimeEqual(bearer, expectedSecret)) ||
    (apiKey && constantTimeEqual(apiKey, expectedSecret)),
  );
}

function adminErrorStatus(message: string) {
  return message.includes("not found") || message.includes("Invalid MongoDB document id") ? 404 : 422;
}

const adminApi = httpAction(async (ctx, request) => {
  if (!adminAuthorized(request)) return json({ error: "Unauthorized" }, 401, { "cache-control": "no-store" });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 512_000) return json({ error: "Request body is too large" }, 413);

  const pathname = new URL(request.url).pathname;
  const parts = pathname.replace(/^\/api\/admin\/?/, "").split("/").filter(Boolean).map((part) => {
    try {
      return decodeURIComponent(part);
    } catch {
      return "";
    }
  });
  if (parts.length < 1 || parts.length > 2 || !adminResourceNames.has(parts[0])) return json({ error: "Unknown admin resource" }, 404);
  const resource = parts[0] as "leads" | "buyers" | "matches" | "hot-deals" | "import-staging" | "users";
  const id = parts[1];
  const method = request.method;
  const operation = method === "GET" ? (id ? "GET" : "LIST") : method === "POST" ? "CREATE" : method === "PATCH" || method === "PUT" ? "UPDATE" : method === "DELETE" ? "DELETE" : undefined;
  if (!operation || (operation === "CREATE" && id) || (operation === "LIST" && id) || (operation !== "LIST" && operation !== "GET" && operation !== "CREATE" && !id)) return json({ error: "Unsupported method or route shape" }, 405);

  const url = new URL(request.url);
  const filters: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (adminNumberFilters.has(key)) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return json({ error: `Filter ${key} must be a finite number` }, 400, { "cache-control": "no-store" });
      filters[key] = numeric;
    } else {
      filters[key] = value;
    }
  }

  let payload: unknown = {};
  if (operation === "CREATE" || operation === "UPDATE") {
    try {
      payload = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400);
    }
  }

  try {
    const result = await ctx.runAction(internal.admin.adminCrud, {
      resource,
      operation,
      id,
      payload,
      filters,
    });
    return json(result, operation === "CREATE" ? 201 : 200, { "cache-control": "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin request failed";
    return json({ error: message }, adminErrorStatus(message), { "cache-control": "no-store" });
  }
});

// Best-effort notification fired when Odysseus posts a message the owner cares
// about, so an external system (n8n → email/Slack, or the owner's own
// endpoint) can alert without polling. Configured via the optional
// ODYSSEUS_NOTIFY_WEBHOOK_URL env var; a failed webhook must never fail the
// post itself. Only "problem" kinds notify by default (ESCALATION) — override
// with ODYSSEUS_NOTIFY_KINDS (comma-separated, e.g. "ESCALATION,REQUEST").
// After Odysseus posts a message, schedule the website's auto-responder to run
// ~25s later — just past the 20s settle guard in unansweredThreads — so
// Odysseus gets a reply right back instead of waiting for the next cron tick
// (the 3-minute cron stays as the backstop). Best-effort: a scheduling failure
// must never fail the post itself.
async function scheduleWebsiteReply(ctx: ActionCtx) {
  try {
    await ctx.scheduler.runAfter(25_000, internal.threadResponder.respondToOpenThreads, {});
  } catch {
    // Best-effort only.
  }
}

async function notifyOdysseusPost(payload: {
  threadId: string;
  kind: string;
  content: string;
  messageId: string;
  refs?: string[];
}) {
  const url = process.env.ODYSSEUS_NOTIFY_WEBHOOK_URL?.trim();
  if (!url) return;
  if (!shouldNotifyOwner(payload.kind, process.env.ODYSSEUS_NOTIFY_KINDS)) return;
  let target: URL;
  try {
    target = assertPublicOutboundUrl(url);
  } catch (error) {
    // Owner-configured webhook pointed at a non-public/unsafe URL: refuse to
    // fetch it (SSRF guard) and surface the reason in logs instead of leaking
    // the request to an internal target.
    console.warn(`[odysseus-notify] skipped webhook: ${error instanceof Error ? error.message : error}`);
    return;
  }
  try {
    await fetch(target.toString(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "odysseus_post",
        threadId: payload.threadId,
        kind: payload.kind,
        messageId: payload.messageId,
        refs: payload.refs ?? [],
        contentPreview: payload.content.slice(0, 400),
        sentAt: Date.now(),
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // Notification is best-effort only.
  }
}

// Shared conversation REST API for external agents (Odysseus). Authenticated
// with the same MCP_TOOL_SERVER_SECRET Odysseus uses for /api/mcp. Messages
// posted here are forced to sender "odysseus" server-side — a website client
// can never spoof the agent and vice versa.
//
//   GET  /api/shared-threads?limit=100  → list thread summaries
//   GET  /api/shared-thread?threadId=...&limit=500 → read one thread
//   POST /api/shared-thread            → { threadId, content, kind?, refs? }
const sharedThreadApi = httpAction(async (ctx, request) => {
  if (!mcpAuthorized(request)) return json({ error: "Unauthorized" }, 401, { "cache-control": "no-store" });

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 32_768) return json({ error: "Request body is too large" }, 413, { "cache-control": "no-store" });

  const url = new URL(request.url);
  const method = request.method;

  if (method === "GET" && url.pathname === "/api/shared-threads") {
    const limit = Number(url.searchParams.get("limit") ?? 100);
    if (!Number.isFinite(limit)) return json({ error: "limit must be a number" }, 400, { "cache-control": "no-store" });
    const unansweredOnly = url.searchParams.get("unanswered") === "1" || url.searchParams.get("unanswered") === "true";
    if (unansweredOnly) {
      // Inbox view: threads whose latest message is an unanswered Odysseus
      // request/escalation/question. This is the website's "notification"
      // surface — a quick poll returns exactly what is waiting for attention.
      const pending = await ctx.runQuery(internal.sharedConversation.unansweredThreads, {
        limit: Math.max(1, Math.min(50, Math.floor(limit))),
      });
      return json({ count: pending.length, unanswered: pending }, 200, { "cache-control": "no-store" });
    }
    const result = await ctx.runQuery(internal.sharedConversation.threadSummaries, {
      limit: Math.max(1, Math.min(100, Math.floor(limit))),
    });
    return json(result, 200, { "cache-control": "no-store" });
  }

  if (method === "GET" && url.pathname === "/api/shared-thread") {
    const threadId = url.searchParams.get("threadId");
    if (!threadId || !threadId.trim()) return json({ error: "threadId query parameter is required" }, 400, { "cache-control": "no-store" });
    const limit = Number(url.searchParams.get("limit") ?? 500);
    if (!Number.isFinite(limit)) return json({ error: "limit must be a number" }, 400, { "cache-control": "no-store" });
    const messages = await ctx.runQuery(internal.sharedConversation.threadMessages, {
      threadId: normalizeThreadId(threadId),
      limit: Math.max(1, Math.min(500, Math.floor(limit))),
    });
    return json({ threadId: normalizeThreadId(threadId), count: messages.length, messages }, 200, { "cache-control": "no-store" });
  }

  if (method === "POST" && url.pathname === "/api/shared-thread") {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Request body must be valid JSON" }, 400, { "cache-control": "no-store" });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "Request body must be an object" }, 400, { "cache-control": "no-store" });
    const payload = body as { threadId?: unknown; content?: unknown; kind?: unknown; refs?: unknown };
    if (typeof payload.threadId !== "string" || !payload.threadId.trim()) return json({ error: "threadId is required" }, 400, { "cache-control": "no-store" });
    if (typeof payload.content !== "string" || !payload.content.trim()) return json({ error: "content is required" }, 400, { "cache-control": "no-store" });
    const kind = payload.kind;
    if (kind !== undefined && kind !== "MESSAGE" && kind !== "REQUEST" && kind !== "ESCALATION" && kind !== "RESOLUTION") {
      return json({ error: "kind must be MESSAGE, REQUEST, ESCALATION, or RESOLUTION" }, 400, { "cache-control": "no-store" });
    }
    const refs = payload.refs === undefined ? undefined : (Array.isArray(payload.refs) && payload.refs.every((ref) => typeof ref === "string") ? payload.refs : undefined);
    if (payload.refs !== undefined && !refs) return json({ error: "refs must be an array of strings" }, 400, { "cache-control": "no-store" });
    const messageId = await ctx.runMutation(internal.sharedConversation.insertMessage, {
      threadId: normalizeThreadId(payload.threadId),
      sender: "odysseus",
      kind: (kind ?? "MESSAGE") as "MESSAGE" | "REQUEST" | "ESCALATION" | "RESOLUTION",
      content: messageContent(payload.content),
      refs: sanitizeRefs(refs as string[] | undefined),
      sentAt: Date.now(),
    });
    await notifyOdysseusPost({
      threadId: normalizeThreadId(payload.threadId),
      kind: (kind ?? "MESSAGE") as string,
      content: messageContent(payload.content),
      messageId,
      refs: sanitizeRefs(refs as string[] | undefined),
    });
    await scheduleWebsiteReply(ctx);
    return json({ ok: true, messageId, sender: "odysseus" }, 201, { "cache-control": "no-store" });
  }

  return json({ error: "Not found" }, 404, { "cache-control": "no-store" });
});

const mcpHeaders = {
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "mcp-protocol-version": "2025-06-18",
};

function mcpEventStream(body: string) {
  return new Response(body, {
    status: 200,
    headers: {
      ...mcpHeaders,
      "content-type": "text/event-stream",
    },
  });
}

function mcpUnauthorized() {
  return json({ error: "Unauthorized" }, 401, {
    ...mcpHeaders,
    "www-authenticate": "Bearer",
  });
}

function mcpGetFor(authorize: (request: Request) => boolean) {
  return httpAction(async (_, request) => {
    if (!authorize(request)) return mcpUnauthorized();
    const accept = request.headers.get("accept") ?? "";
    if (!accept.includes("text/event-stream")) {
      return json({ error: "Streamable HTTP GET requires Accept: text/event-stream" }, 406, mcpHeaders);
    }

    return mcpEventStream(": mcp stream ready\n\n");
  });
}

const mcpGet = mcpGetFor(mcpAuthorized);
const adminMcpGet = mcpGetFor(adminMcpAuthorized);

function mcpJsonRpcResult(id: JsonRpcId, value: unknown) {
  return json({ jsonrpc: "2.0", id, result: value }, 200, mcpHeaders);
}

function mcpToolResult(id: JsonRpcId, value: unknown) {
  return mcpJsonRpcResult(id, {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value,
  });
}

function mcpError(id: JsonRpcId, code: number, message: string) {
  return json({ jsonrpc: "2.0", id, error: { code, message } }, 200, mcpHeaders);
}

function mcpAuthorized(request: Request) {
  const expectedSecret = process.env.MCP_TOOL_SERVER_SECRET;
  if (!expectedSecret) return false;
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const apiKey = request.headers.get("x-mcp-api-key")?.trim();
  return Boolean(
    (bearer && constantTimeEqual(bearer, expectedSecret)) ||
    (apiKey && constantTimeEqual(apiKey, expectedSecret)),
  );
}

function mcpTools() {
  return [
    { name: "scrape_source", description: "Fetch one public source URL, return bounded evidence, and stage it for owner review. Never invents or creates PII.", inputSchema: { type: "object", properties: { url: { type: "string", description: "Public http(s) source URL" }, sourceType: { type: "string", enum: [...mcpSourceTypes] } }, required: ["url", "sourceType"], additionalProperties: false } },
    { name: "scrapegraph_extract", description: "Extract structured property facts from a public source URL with ScrapeGraphAI and stage them as bounded evidence for owner review. Never creates or invents PII and never approves a lead.", inputSchema: { type: "object", properties: { url: { type: "string", description: "Public http(s) source URL" }, sourceType: { type: "string", enum: [...mcpSourceTypes] }, prompt: { type: "string", description: "What to extract (10-2000 characters)" }, schema: { type: "object", description: "Optional JSON-Schema object constraining the extraction" } }, required: ["url", "sourceType", "prompt"], additionalProperties: false } },
    { name: "sitemap_discover", description: "Expand one public portal seed URL into a bounded batch of real listing URLs via its robots.txt sitemap refs and standard sitemap locations, then stage each page for owner review. Never invents data and never approves a lead.", inputSchema: { type: "object", properties: { url: { type: "string", description: "Public http(s) seed URL (e.g. a portal homepage)" }, sourceType: { type: "string", enum: [...mcpSourceTypes] }, maxUrls: { type: "number", minimum: 1, maximum: 200, description: "Optional batch size (default 60)" } }, required: ["url", "sourceType"], additionalProperties: false } },
    { name: "web_intel", description: "One-shot web intelligence: expand a seed URL into real listing URLs (sitemap discovery), fetch and stage each page (plain fetch with a Firecrawl render fallback), and optionally extract structured property facts with ScrapeGraphAI — all in one call. Camofox anti-detection browsing remains an owner-only escalation for bot-protected portals. Never invents PII and never approves a lead.", inputSchema: { type: "object", properties: { url: { type: "string", description: "Public http(s) seed URL (portal homepage or a single listing page)" }, sourceType: { type: "string", enum: [...mcpSourceTypes] }, mode: { type: "string", enum: ["auto", "discover", "fetch", "extract"], description: "auto = discover + fetch (+ extract when prompt given). Default auto." }, prompt: { type: "string", description: "What to extract with ScrapeGraphAI (10-2000 characters; extract/auto mode)" }, schema: { type: "object", description: "Optional JSON-Schema object constraining the extraction" }, maxUrls: { type: "number", minimum: 1, maximum: 200, description: "Discovery batch size (default 60)" }, maxPages: { type: "number", minimum: 1, maximum: 12, description: "Extraction page budget (default 3)" } }, required: ["url", "sourceType"], additionalProperties: false } },
    { name: "property_data", description: "Fetch official property attributes, rent estimate, and sold comparable prices for an address from RentCast to feed ARV and rental underwriting. Read-only; never creates or approves a lead.", inputSchema: { type: "object", properties: { address: { type: "string", description: "Full property address (street, city, state)" }, radius: { type: "number", minimum: 0.5, maximum: 25, description: "Comps radius in miles (default 3)" }, saleDateRange: { type: "number", minimum: 30, description: "Comps look-back in days (default 365)" }, compsLimit: { type: "number", minimum: 1, maximum: 50, description: "Max comps returned (default 12)" } }, required: ["address"], additionalProperties: false } },
    { name: "queue_source", description: "Send a public source URL into the same managed automation queue used by the website and n8n. It creates only a pending source task; it never approves a lead.", inputSchema: { type: "object", properties: { url: { type: "string", description: "Public http(s) source URL" }, sourceType: { type: "string", enum: [...mcpSourceTypes] }, idempotencyKey: { type: "string", description: "Optional stable key to make retries safe" } }, required: ["url", "sourceType"], additionalProperties: false } },
    { name: "list_pipeline", description: "Read non-fabricated sourced and approved leads from the website pipeline, including evidence links, distress score, verification, underwriting, and estimated profit.", inputSchema: { type: "object", properties: { pipelineStatus: { type: "string", enum: ["SOURCED", "CRITIQUED", "VERIFIED", "APPROVED", "REJECTED"] }, minDistressScore: { type: "number", minimum: 0, maximum: 100 }, limit: { type: "number", minimum: 1, maximum: 50 } }, additionalProperties: false } },
    { name: "list_staged_sources", description: "Read bounded source evidence and consultant-court results from the website staging queue so the agent can continue a review without direct MongoDB access.", inputSchema: { type: "object", properties: { status: { type: "string", enum: ["NEW", "NEEDS_EVIDENCE", "DUPLICATE", "REJECTED", "ARCHIVED"] }, limit: { type: "number", minimum: 1, maximum: 50 } }, additionalProperties: false } },
    { name: "list_buyer_buy_boxes", description: "Read approved, verified buyer buy-box constraints for matching. Contact names, emails, and phone numbers are never returned.", inputSchema: { type: "object", properties: { limit: { type: "number", minimum: 1, maximum: 50 } }, additionalProperties: false } },
    { name: "list_match_board", description: "Read the website's match board with scores, confidence, status, and buy-box summaries; no buyer contact information is returned.", inputSchema: { type: "object", properties: { status: { type: "string", enum: ["CANDIDATE", "APPROVED", "REJECTED", "CONTACTED", "CLOSED"] }, confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] }, limit: { type: "number", minimum: 1, maximum: 50 } }, additionalProperties: false } },
    { name: "estimate_deal", description: "Calculate ARV scenarios, repair estimate, MAO scenarios, and estimated gross spread from explicit inputs. Missing comps produce NEEDS_APPRAISAL.", inputSchema: { type: "object", properties: { leadId: { type: "string" }, squareFeet: { type: "number", exclusiveMinimum: 0 }, repairTier: { type: "string", enum: ["BASE", "MEDIUM", "GUT"] }, soldComps: { type: "array", items: { type: "number", minimum: 0 } }, compSourceUrl: { type: "string" }, compSourceDate: { type: "string" }, targetPct: { type: "number", exclusiveMinimum: 0, maximum: 100 }, wholesaleFee: { type: "number", minimum: 0 }, closingCosts: { type: "number", minimum: 0 }, holdingCosts: { type: "number", minimum: 0 }, acquisitionPrice: { type: "number", minimum: 0 } }, required: ["squareFeet", "repairTier", "soldComps", "targetPct", "wholesaleFee", "closingCosts", "holdingCosts"], additionalProperties: false } },
    { name: "consultant_court", description: "Run the evidence auditor, underwriting analyst, risk/compliance consultant, and judge on a staged source. Returns a recommendation only; owner approval remains required.", inputSchema: { type: "object", properties: { stagedId: { type: "string" } }, required: ["stagedId"], additionalProperties: false } },
    { name: "run_agent_team", description: "Run the sourcing, verification, rental underwriting, and ARV/repairs agents over one lead and return the aggregated readiness gate with every blocking data gap. Recommendations only; owner approval remains required.", inputSchema: { type: "object", properties: { leadId: { type: "string", description: "Lead _id to model" }, rental: { type: "object", description: "Rental underwriting inputs. purchasePrice required when provided; rentComps, annualPropertyTax, annualInsurance, loanAmount, interestRatePct, loanTermYears optional. Falls back to the lead's MAO/acquisition price otherwise.", properties: { purchasePrice: { type: "number", minimum: 0 }, rentComps: { type: "array", items: { type: "number", minimum: 0 } }, annualPropertyTax: { type: "number", minimum: 0 }, annualInsurance: { type: "number", minimum: 0 }, loanAmount: { type: "number", minimum: 0 }, interestRatePct: { type: "number", minimum: 0 }, loanTermYears: { type: "number", minimum: 1 } }, additionalProperties: false }, compPrices: { type: "array", items: { type: "number", minimum: 0 }, description: "Sold comparable prices for ARV" }, repairTier: { type: "string", enum: ["BASE", "MEDIUM", "GUT"] } }, required: ["leadId"], additionalProperties: false } },
    { name: "list_pipeline_brief", description: "Read the readiness gate across every eligible lead: which deals are ready and which are blocked by specific missing underwriting data.", inputSchema: { type: "object", properties: { limit: { type: "number", minimum: 1, maximum: 200 } }, additionalProperties: false } },
    { name: "skip_trace", description: "Run a reverse-address skip trace for a lead (Searchbug) to find the owner's phone numbers, emails, and mailing addresses, then save them as sourced contact data on the lead. Requires the lead _id. Owner approval still gates any dial; results are evidence-backed and never invented.", inputSchema: { type: "object", properties: { id: { type: "string", description: "Lead _id to skip trace" } }, required: ["id"], additionalProperties: false } },
    { name: "owner_lookup", description: "Pull the current owner's name, entity type, and mailing address from RentCast's public county records (free, no per-record fee) and save them onto the lead as sourced contact data, including the absentee-owner flag. Requires the lead _id. Phone numbers are not included — use skip_trace or a manual lookup for phones.", inputSchema: { type: "object", properties: { id: { type: "string", description: "Lead _id to enrich with owner data" } }, required: ["id"], additionalProperties: false } },
    { name: "semantic_search", description: "Search leads by meaning rather than exact text: the query is embedded and ranked against every indexed lead with cosine similarity. Requires the lead embeddings to be indexed first. Never invents data; fabricated rows are excluded.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Natural-language search, e.g. '3-bed distressed house near Dallas under 200k'" }, limit: { type: "number", minimum: 1, maximum: 50 } }, required: ["query"], additionalProperties: false } },
    { name: "shared_threads_list", description: "List every shared conversation thread with message count, last sender, last kind, and last content preview. Use it to discover the threadId to read or continue.", inputSchema: { type: "object", properties: { limit: { type: "number", minimum: 1, maximum: 100 } }, additionalProperties: false } },
    { name: "shared_thread_read", description: "Read the full shared conversation thread (oldest first) between Odysseus and the website. Thread ids follow the convention deal:<leadId>, task:<stagedId>, buyer:<buyerId>, or ops:<topic>.", inputSchema: { type: "object", properties: { threadId: { type: "string", description: "e.g. deal:<leadId> or task:<stagedId>" }, limit: { type: "number", minimum: 1, maximum: 500 } }, required: ["threadId"], additionalProperties: false } },
    { name: "shared_thread_post", description: "Post a message to a shared conversation thread as Odysseus. Use it when you hit something outside your strengths and need the website or owner (REQUEST), when you are blocked (ESCALATION), when you resolve an open item (RESOLUTION), or for a general note (MESSAGE). Never paste secrets or unnecessary PII; never claim verification that did not happen. Threads recommend and coordinate — they never approve a deal.", inputSchema: { type: "object", properties: { threadId: { type: "string", description: "e.g. deal:<leadId> or task:<stagedId>" }, content: { type: "string", description: "Message body (max 8000 chars)" }, kind: { type: "string", enum: ["MESSAGE", "REQUEST", "ESCALATION", "RESOLUTION"] }, refs: { type: "array", items: { type: "string" }, description: "Optional context: lead/staged/buyer ids or URLs" } }, required: ["threadId", "content"], additionalProperties: false } },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalString(value: unknown) {
  return value === undefined ? undefined : typeof value === "string" ? value : "__invalid__";
}

function optionalNumber(value: unknown) {
  return value === undefined ? undefined : typeof value === "number" ? value : NaN;
}

async function callMcpTool(ctx: ActionCtx, name: string, rawArguments: unknown) {
  if (!isRecord(rawArguments)) throw new Error("Tool arguments must be an object");
  if (name === "scrape_source") {
    if (typeof rawArguments.url !== "string" || !isMcpSourceType(rawArguments.sourceType)) throw new Error("scrape_source requires a public url and supported sourceType");
    return ctx.runAction(internal.mongodb.mcpScrapeSource, { url: rawArguments.url, sourceType: rawArguments.sourceType });
  }
  if (name === "scrapegraph_extract") {
    if (typeof rawArguments.url !== "string" || !isMcpSourceType(rawArguments.sourceType)) throw new Error("scrapegraph_extract requires a public url and supported sourceType");
    if (typeof rawArguments.prompt !== "string" || !rawArguments.prompt.trim()) throw new Error("scrapegraph_extract requires a prompt");
    const schema = isRecord(rawArguments.schema) ? rawArguments.schema : undefined;
    if (rawArguments.schema !== undefined && !schema) throw new Error("schema must be an object when provided");
    return ctx.runAction(internal.mongodb.mcpScrapegraphExtract, { url: rawArguments.url, sourceType: rawArguments.sourceType, prompt: rawArguments.prompt, schema: schema as Record<string, unknown> | undefined });
  }
  if (name === "sitemap_discover") {
    if (typeof rawArguments.url !== "string" || !isMcpSourceType(rawArguments.sourceType)) throw new Error("sitemap_discover requires a public url and supported sourceType");
    const maxUrls = optionalNumber(rawArguments.maxUrls);
    if (Number.isNaN(maxUrls)) throw new Error("maxUrls must be a number when provided");
    return ctx.runAction(internal.mongodb.mcpSitemapDiscover, { url: rawArguments.url, sourceType: rawArguments.sourceType, maxUrls });
  }
  if (name === "web_intel") {
    if (typeof rawArguments.url !== "string" || !isMcpSourceType(rawArguments.sourceType)) throw new Error("web_intel requires a public url and supported sourceType");
    const mode = optionalString(rawArguments.mode);
    if (mode === "__invalid__" || (mode !== undefined && mode !== "auto" && mode !== "discover" && mode !== "fetch" && mode !== "extract")) throw new Error("web_intel mode must be auto, discover, fetch, or extract");
    const prompt = optionalString(rawArguments.prompt);
    if (prompt === "__invalid__") throw new Error("web_intel prompt must be a string when provided");
    const schema = isRecord(rawArguments.schema) ? rawArguments.schema : undefined;
    if (rawArguments.schema !== undefined && !schema) throw new Error("web_intel schema must be an object when provided");
    const maxUrls = optionalNumber(rawArguments.maxUrls);
    const maxPages = optionalNumber(rawArguments.maxPages);
    if (Number.isNaN(maxUrls) || Number.isNaN(maxPages)) throw new Error("web_intel maxUrls and maxPages must be numbers when provided");
    return ctx.runAction(internal.webIntel.mcpWebIntel, { url: rawArguments.url, sourceType: rawArguments.sourceType, mode: mode as "auto" | "discover" | "fetch" | "extract" | undefined, prompt, schema: schema as Record<string, unknown> | undefined, maxUrls, maxPages });
  }
  if (name === "property_data") {
    if (typeof rawArguments.address !== "string" || !rawArguments.address.trim()) throw new Error("property_data requires a full property address");
    const radius = optionalNumber(rawArguments.radius);
    const saleDateRange = optionalNumber(rawArguments.saleDateRange);
    const compsLimit = optionalNumber(rawArguments.compsLimit);
    if (Number.isNaN(radius) || Number.isNaN(saleDateRange) || Number.isNaN(compsLimit)) throw new Error("property_data options must be numbers when provided");
    return ctx.runAction(internal.mongodb.mcpRentcastPropertyData, { address: rawArguments.address, radius, saleDateRange, compsLimit });
  }
  if (name === "queue_source") {
    if (typeof rawArguments.url !== "string" || !isMcpSourceType(rawArguments.sourceType)) throw new Error("queue_source requires a public url and supported sourceType");
    const idempotencyKey = optionalString(rawArguments.idempotencyKey);
    if (idempotencyKey === "__invalid__") throw new Error("idempotencyKey must be a string when provided");
    return ctx.runAction(internal.mongodb.mcpQueueSource, { url: rawArguments.url, sourceType: rawArguments.sourceType, idempotencyKey });
  }
  if (name === "list_pipeline") {
    const pipelineStatus = optionalString(rawArguments.pipelineStatus);
    const minDistressScore = optionalNumber(rawArguments.minDistressScore);
    const limit = optionalNumber(rawArguments.limit);
    if (pipelineStatus === "__invalid__" || Number.isNaN(minDistressScore) || Number.isNaN(limit)) throw new Error("list_pipeline filters must use the documented types");
    return ctx.runAction(internal.mongodb.mcpListPipeline, { pipelineStatus: pipelineStatus as "SOURCED" | "CRITIQUED" | "VERIFIED" | "APPROVED" | "REJECTED" | undefined, minDistressScore, limit });
  }
  if (name === "list_staged_sources") {
    const status = optionalString(rawArguments.status);
    const limit = optionalNumber(rawArguments.limit);
    if (status === "__invalid__" || Number.isNaN(limit)) throw new Error("list_staged_sources filters must use the documented types");
    return ctx.runAction(internal.mongodb.mcpListStagedSources, { status: status as "NEW" | "NEEDS_EVIDENCE" | "DUPLICATE" | "REJECTED" | "ARCHIVED" | undefined, limit });
  }
  if (name === "list_buyer_buy_boxes") {
    const limit = optionalNumber(rawArguments.limit);
    if (Number.isNaN(limit)) throw new Error("limit must be a number when provided");
    return ctx.runAction(internal.mongodb.mcpListBuyBoxes, { limit });
  }
  if (name === "list_match_board") {
    const status = optionalString(rawArguments.status);
    const confidence = optionalString(rawArguments.confidence);
    const limit = optionalNumber(rawArguments.limit);
    if (status === "__invalid__" || confidence === "__invalid__" || Number.isNaN(limit)) throw new Error("list_match_board filters must use the documented types");
    return ctx.runAction(internal.mongodb.mcpListMatchBoard, { status: status as "CANDIDATE" | "APPROVED" | "REJECTED" | "CONTACTED" | "CLOSED" | undefined, confidence: confidence as "LOW" | "MEDIUM" | "HIGH" | undefined, limit });
  }
  if (name === "estimate_deal") {
    const soldComps = Array.isArray(rawArguments.soldComps) ? rawArguments.soldComps.map((value) => typeof value === "number" ? { salePrice: value } : value) : rawArguments.soldComps;
    const leadId = optionalString(rawArguments.leadId);
    const compSourceUrl = optionalString(rawArguments.compSourceUrl);
    const compSourceDate = optionalString(rawArguments.compSourceDate);
    if (leadId === "__invalid__" || compSourceUrl === "__invalid__" || compSourceDate === "__invalid__") throw new Error("Optional estimate fields must use the documented types");
    return ctx.runAction(internal.mongodb.mcpEstimateDeal, { leadId, squareFeet: rawArguments.squareFeet as number, yearBuilt: optionalNumber(rawArguments.yearBuilt), repairTier: rawArguments.repairTier as "BASE" | "MEDIUM" | "GUT", soldComps: soldComps as Array<{ salePrice: number }>, compSourceUrl, compSourceDate, targetPct: rawArguments.targetPct as number, wholesaleFee: rawArguments.wholesaleFee as number, closingCosts: rawArguments.closingCosts as number, holdingCosts: rawArguments.holdingCosts as number, acquisitionPrice: optionalNumber(rawArguments.acquisitionPrice) });
  }
  if (name === "consultant_court") {
    if (typeof rawArguments.stagedId !== "string" || !rawArguments.stagedId.trim()) throw new Error("consultant_court requires stagedId");
    return ctx.runAction(internal.mongodb.mcpRunConsultantCourt, { stagedId: rawArguments.stagedId });
  }
  if (name === "run_agent_team") {
    if (typeof rawArguments.leadId !== "string" || !rawArguments.leadId.trim()) throw new Error("run_agent_team requires leadId");
    const rental = isRecord(rawArguments.rental) ? rawArguments.rental : undefined;
    if (rawArguments.rental !== undefined && !rental) throw new Error("rental must be an object when provided");
    const compPrices = rawArguments.compPrices === undefined ? undefined : (Array.isArray(rawArguments.compPrices) ? rawArguments.compPrices : undefined);
    if (rawArguments.compPrices !== undefined && !compPrices) throw new Error("compPrices must be an array of numbers when provided");
    const repairTier = optionalString(rawArguments.repairTier);
    if (repairTier === "__invalid__") throw new Error("repairTier must be a string when provided");
    if (repairTier !== undefined && repairTier !== "BASE" && repairTier !== "MEDIUM" && repairTier !== "GUT") throw new Error("repairTier must be BASE, MEDIUM, or GUT");
    return ctx.runAction(internal.mongodb.mcpRunAgentTeam, {
      leadId: rawArguments.leadId,
      rental: rental as unknown as {
        purchasePrice: number;
        rentComps?: number[];
        marketRentPerSqFt?: number;
        squareFeet?: number;
        annualPropertyTax?: number;
        annualInsurance?: number;
        managementPct?: number;
        vacancyPct?: number;
        maintenancePct?: number;
        loanAmount?: number;
        loanToValuePct?: number;
        interestRatePct?: number;
        loanTermYears?: number;
      } | undefined,
      compPrices: compPrices as number[] | undefined,
      repairTier: repairTier as "BASE" | "MEDIUM" | "GUT" | undefined,
    });
  }
  if (name === "list_pipeline_brief") {
    const limit = optionalNumber(rawArguments.limit);
    if (Number.isNaN(limit)) throw new Error("limit must be a number when provided");
    return ctx.runAction(internal.mongodb.mcpListPipelineBrief, { limit });
  }
  if (name === "semantic_search") {
    if (typeof rawArguments.query !== "string" || !rawArguments.query.trim()) throw new Error("semantic_search requires a query");
    const limit = optionalNumber(rawArguments.limit);
    if (Number.isNaN(limit)) throw new Error("semantic_search limit must be a number when provided");
    return ctx.runAction(internal.mongodb.mcpSemanticSearch, { query: rawArguments.query, limit });
  }
  if (name === "skip_trace") {
    if (typeof rawArguments.id !== "string" || !rawArguments.id.trim()) throw new Error("skip_trace requires a lead id");
    return ctx.runAction(internal.mongodb.mcpSkipTrace, { id: rawArguments.id });
  }
  if (name === "owner_lookup") {
    if (typeof rawArguments.id !== "string" || !rawArguments.id.trim()) throw new Error("owner_lookup requires a lead id");
    return ctx.runAction(internal.mongodb.mcpOwnerLookup, { id: rawArguments.id });
  }
  if (name === "shared_threads_list") {
    const limit = optionalNumber(rawArguments.limit);
    if (Number.isNaN(limit)) throw new Error("shared_threads_list limit must be a number when provided");
    return ctx.runQuery(internal.sharedConversation.threadSummaries, { limit: Math.max(1, Math.min(100, Math.floor(limit ?? 100))) });
  }
  if (name === "shared_thread_read") {
    if (typeof rawArguments.threadId !== "string" || !rawArguments.threadId.trim()) throw new Error("shared_thread_read requires threadId");
    const limit = optionalNumber(rawArguments.limit);
    if (Number.isNaN(limit)) throw new Error("shared_thread_read limit must be a number when provided");
    const messages = await ctx.runQuery(internal.sharedConversation.threadMessages, {
      threadId: normalizeThreadId(rawArguments.threadId),
      limit: Math.max(1, Math.min(500, Math.floor(limit ?? 500))),
    });
    return { threadId: normalizeThreadId(rawArguments.threadId), count: messages.length, messages };
  }
  if (name === "shared_thread_post") {
    if (typeof rawArguments.threadId !== "string" || !rawArguments.threadId.trim()) throw new Error("shared_thread_post requires threadId");
    if (typeof rawArguments.content !== "string" || !rawArguments.content.trim()) throw new Error("shared_thread_post requires content");
    const kind = optionalString(rawArguments.kind);
    if (kind === "__invalid__") throw new Error("kind must be a string when provided");
    if (kind !== undefined && kind !== "MESSAGE" && kind !== "REQUEST" && kind !== "ESCALATION" && kind !== "RESOLUTION") throw new Error("kind must be MESSAGE, REQUEST, ESCALATION, or RESOLUTION");
    const refs = rawArguments.refs === undefined ? undefined : (Array.isArray(rawArguments.refs) && rawArguments.refs.every((ref) => typeof ref === "string") ? rawArguments.refs : undefined);
    if (rawArguments.refs !== undefined && !refs) throw new Error("refs must be an array of strings when provided");
    const messageId = await ctx.runMutation(internal.sharedConversation.insertMessage, {
      threadId: normalizeThreadId(rawArguments.threadId),
      sender: "odysseus",
      kind: (kind ?? "MESSAGE") as "MESSAGE" | "REQUEST" | "ESCALATION" | "RESOLUTION",
      content: messageContent(rawArguments.content),
      refs: sanitizeRefs(refs as string[] | undefined),
      sentAt: Date.now(),
    });
    await notifyOdysseusPost({
      threadId: normalizeThreadId(rawArguments.threadId),
      kind: (kind ?? "MESSAGE") as string,
      content: messageContent(rawArguments.content),
      messageId,
      refs: sanitizeRefs(refs as string[] | undefined),
    });
    await scheduleWebsiteReply(ctx);
    return { ok: true, messageId, sender: "odysseus" };
  }
  throw new Error(`Unknown MCP tool: ${name}`);
}

// ── Admin MCP tool server (full CRUD, authenticated with ADMIN_API_KEY) ──────
// Exposes every operation of the /api/admin REST API as a distinct MCP tool for
// leads, buyers, matches, and hot deals, so an external agent can control the
// pipeline through the MCP protocol instead of hand-building REST calls. All
// validation and owner rules live in src/convex/admin.ts and apply unchanged.

type AdminResource = "leads" | "buyers" | "matches" | "hot-deals";
type AdminOperation = "LIST" | "GET" | "CREATE" | "UPDATE" | "DELETE";

const adminSourceTypes = ["SHERIFF_SALE", "TAX_SALE", "AUCTION_COM", "PROBATE", "OFF_MARKET", "ASSESSOR", "RECORDER", "PROPSTREAM", "BATCHLEADS", "DEALMACHINE", "FORECLOSURE", "MARKETPLACE", "ASSOCIATION", "MANUAL", "SEED"] as const;
const adminLeadStatuses = ["SOURCED", "CRITIQUED", "VERIFIED", "APPROVED", "REJECTED"] as const;
const adminVerificationStatuses = ["UNVERIFIED", "PARTIAL", "VERIFIED"] as const;
const adminMatchStatuses = ["CANDIDATE", "APPROVED", "REJECTED", "CONTACTED", "CLOSED"] as const;

const adminListFilters: Record<AdminResource, Record<string, unknown>> = {
  leads: {
    status: { type: "string", enum: [...adminLeadStatuses], description: "Filter by pipelineStatus" },
    verificationStatus: { type: "string", enum: [...adminVerificationStatuses] },
    minDistressScore: { type: "number", minimum: 0, maximum: 100 },
    maxDistressScore: { type: "number", minimum: 0, maximum: 100 },
    limit: { type: "number", minimum: 1, maximum: 500, description: "Default 200" },
  },
  buyers: {
    status: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"], description: "Filter by intakeStatus" },
    proofOfFundsStatus: { type: "string", enum: ["NONE", "SELF_REPORTED", "VERIFIED"] },
    limit: { type: "number", minimum: 1, maximum: 500, description: "Default 200" },
  },
  matches: {
    status: { type: "string", enum: [...adminMatchStatuses] },
    confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
    minMatchScore: { type: "number", minimum: 0, maximum: 100 },
    limit: { type: "number", minimum: 1, maximum: 500, description: "Default 200" },
  },
  "hot-deals": {
    status: { type: "string", enum: [...adminVerificationStatuses], description: "Filter by verificationStatus" },
    minDistressScore: { type: "number", minimum: 0, maximum: 100 },
    limit: { type: "number", minimum: 1, maximum: 500, description: "Default 200" },
  },
};

const adminLeadFields: Record<string, unknown> = {
  propertyAddress: { type: "string", description: "Street address of the property" },
  city: { type: "string" },
  state: { type: "string" },
  zip: { type: "string" },
  county: { type: "string" },
  sourceType: { type: "string", enum: [...adminSourceTypes], description: "SEED forces fabricated:true" },
  sourceUrl: { type: "string", description: "Real public source URL (https)" },
  sourceRef: { type: "string", description: "Parcel id / case number / sale id from the source" },
  sourceDate: { type: "string", description: "Source record date (YYYY-MM-DD, not in the future)" },
  distressScore: { type: "number", minimum: 0, maximum: 100 },
  distressSignals: {
    type: "array",
    items: {
      type: "object",
      properties: {
        type: { type: "string" },
        weight: { type: "number", minimum: 0 },
        evidence: { type: "string" },
        verified: { type: "boolean" },
        sourceUrl: { type: "string" },
        sourceDate: { type: "string" },
      },
      required: ["type", "weight", "evidence", "verified", "sourceUrl", "sourceDate"],
    },
    description: "Evidence-backed distress signals (never invented)",
  },
  verificationStatus: { type: "string", enum: [...adminVerificationStatuses] },
  pipelineStatus: { type: "string", enum: [...adminLeadStatuses] },
  fabricated: { type: "boolean", description: "true tombstones the row forever — never set on real data and never cleared" },
};

const adminBuyerFields: Record<string, unknown> = {
  name: { type: "string" },
  phone: { type: "string" },
  email: { type: "string" },
  listSource: { type: "string", description: "Where the buyer came from (e.g. PUBLIC_INTAKE, nationalreia.org, connectedinvestors.com)" },
  budgetMin: { type: "number", minimum: 0 },
  budgetMax: { type: "number", minimum: 0, description: "Must be >= budgetMin" },
  targetAreas: { type: "array", items: { type: "string" }, description: "Cities / counties the buyer targets" },
  exitType: { type: "string", enum: ["ASSIGN", "FLIP", "BUY_HOLD"] },
  proofOfFundsStatus: { type: "string", enum: ["NONE", "SELF_REPORTED", "VERIFIED"] },
  pofEvidenceRef: { type: "string", description: "Required when proofOfFundsStatus is VERIFIED" },
  intakeStatus: { type: "string", enum: ["PENDING", "APPROVED", "REJECTED"] },
  verificationStatus: { type: "string", enum: [...adminVerificationStatuses] },
};

const adminMatchFields: Record<string, unknown> = {
  leadId: { type: "string", description: "_id of a verified, approved, non-fabricated lead" },
  buyerId: { type: "string", description: "_id of an approved buyer" },
  buyBoxSummary: { type: "string" },
  matchScore: { type: "number", minimum: 0, maximum: 100 },
  confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"], description: "HIGH requires verified proof of funds" },
  status: { type: "string", enum: [...adminMatchStatuses] },
};

const adminHotDealFields: Record<string, unknown> = {
  propertyAddress: { type: "string" },
  city: { type: "string" },
  state: { type: "string" },
  zip: { type: "string" },
  county: { type: "string" },
  sourceType: { type: "string", enum: [...adminSourceTypes], description: "SEED forces fabricated:true" },
  sourceUrl: { type: "string", description: "Real public source URL (https)" },
  sourceRef: { type: "string", description: "Parcel id / case number / sale id from the source" },
  sourceDate: { type: "string", description: "Source record date (YYYY-MM-DD, not in the future)" },
  distressScore: { type: "number", minimum: 0, maximum: 100, description: "Non-fabricated hot deals require >= 80" },
  verificationStatus: { type: "string", enum: [...adminVerificationStatuses], description: "Non-fabricated hot deals require VERIFIED" },
  fabricated: { type: "boolean", description: "true tombstones the row forever — never set on real data and never cleared" },
};

function adminResourceTools(resource: AdminResource, spec: { singular: string; plural: string; noun: string; createDescription: string; createData: Record<string, unknown>; createRequired: string[] }) {
  const idSchema = { type: "object", properties: { id: { type: "string", description: `MongoDB _id of the ${spec.noun}` } }, required: ["id"], additionalProperties: false };
  const listSchema = { type: "object", properties: adminListFilters[resource], additionalProperties: false };
  const createSchema = { type: "object", properties: { data: { type: "object", description: spec.createDescription, properties: spec.createData, required: spec.createRequired, additionalProperties: true } }, required: ["data"], additionalProperties: false };
  const updateSchema = { type: "object", properties: { id: { type: "string", description: `MongoDB _id of the ${spec.noun}` }, data: { type: "object", description: "Partial patch — only the fields to change. Same validation rules as create.", properties: spec.createData, additionalProperties: true } }, required: ["id", "data"], additionalProperties: false };
  return [
    { name: `admin_list_${spec.plural}`, description: `List ${spec.plural} from the DealForge pipeline with optional filters (same as GET /api/admin/${spec.plural}). Returns { resource, count, data }.`, inputSchema: listSchema },
    { name: `admin_get_${spec.singular}`, description: `Read one ${spec.noun} by id (same as GET /api/admin/${spec.plural}/{id}).`, inputSchema: idSchema },
    { name: `admin_create_${spec.singular}`, description: `Create a ${spec.noun} (same as POST /api/admin/${spec.plural}). Server-side validation is identical to the REST API.`, inputSchema: createSchema },
    { name: `admin_update_${spec.singular}`, description: `Update an existing ${spec.noun} by id with a partial patch (same as PATCH /api/admin/${spec.plural}/{id}).`, inputSchema: updateSchema },
    { name: `admin_delete_${spec.singular}`, description: `Hard-delete a ${spec.noun} by id (same as DELETE /api/admin/${spec.plural}/{id}). Irreversible.`, inputSchema: idSchema },
  ];
}

function adminMcpTools() {
  return [
    ...adminResourceTools("leads", {
      singular: "lead",
      plural: "leads",
      noun: "lead",
      createDescription: "Lead document. Required: propertyAddress, city, state, zip, county, sourceType, sourceUrl (real https public source), sourceRef (parcel id / case / sale id), sourceDate, distressScore 0-100, distressSignals[], verificationStatus, pipelineStatus. sourceType SEED or fabricated:true tombstones the row forever. Never invent addresses, PII, prices, or evidence.",
      createData: adminLeadFields,
      createRequired: ["propertyAddress", "city", "state", "zip", "county", "sourceType", "sourceUrl", "sourceRef", "sourceDate", "distressScore", "distressSignals", "verificationStatus", "pipelineStatus"],
    }),
    ...adminResourceTools("buyers", {
      singular: "buyer",
      plural: "buyers",
      noun: "buyer-registry entry",
      createDescription: "Buyer document. Required: name, phone, email, listSource, budgetMin, budgetMax (>= budgetMin), targetAreas[], exitType, proofOfFundsStatus, intakeStatus, verificationStatus; pofEvidenceRef required when proofOfFundsStatus is VERIFIED.",
      createData: adminBuyerFields,
      createRequired: ["name", "phone", "email", "listSource", "budgetMin", "budgetMax", "targetAreas", "exitType", "proofOfFundsStatus", "intakeStatus", "verificationStatus"],
    }),
    ...adminResourceTools("matches", {
      singular: "match",
      plural: "matches",
      noun: "lead-to-buyer match",
      createDescription: "Match document. Required: leadId (_id of a verified + approved + non-fabricated lead), buyerId (_id of an approved buyer), buyBoxSummary, matchScore 0-100, confidence, status. HIGH confidence requires verified proof of funds.",
      createData: adminMatchFields,
      createRequired: ["leadId", "buyerId", "buyBoxSummary", "matchScore", "confidence", "status"],
    }),
    ...adminResourceTools("hot-deals", {
      singular: "hot_deal",
      plural: "hot_deals",
      noun: "hot deal",
      createDescription: "Hot-deal document. Required: propertyAddress, city, state, zip, county, sourceType, sourceUrl, sourceRef, sourceDate, distressScore, verificationStatus. Non-fabricated hot deals require verificationStatus VERIFIED and distressScore >= 80.",
      createData: adminHotDealFields,
      createRequired: ["propertyAddress", "city", "state", "zip", "county", "sourceType", "sourceUrl", "sourceRef", "sourceDate", "distressScore", "verificationStatus"],
    }),
  ];
}

const adminToolMap: Record<string, { resource: AdminResource; operation: AdminOperation }> = {
  admin_list_leads: { resource: "leads", operation: "LIST" },
  admin_get_lead: { resource: "leads", operation: "GET" },
  admin_create_lead: { resource: "leads", operation: "CREATE" },
  admin_update_lead: { resource: "leads", operation: "UPDATE" },
  admin_delete_lead: { resource: "leads", operation: "DELETE" },
  admin_list_buyers: { resource: "buyers", operation: "LIST" },
  admin_get_buyer: { resource: "buyers", operation: "GET" },
  admin_create_buyer: { resource: "buyers", operation: "CREATE" },
  admin_update_buyer: { resource: "buyers", operation: "UPDATE" },
  admin_delete_buyer: { resource: "buyers", operation: "DELETE" },
  admin_list_matches: { resource: "matches", operation: "LIST" },
  admin_get_match: { resource: "matches", operation: "GET" },
  admin_create_match: { resource: "matches", operation: "CREATE" },
  admin_update_match: { resource: "matches", operation: "UPDATE" },
  admin_delete_match: { resource: "matches", operation: "DELETE" },
  admin_list_hot_deals: { resource: "hot-deals", operation: "LIST" },
  admin_get_hot_deal: { resource: "hot-deals", operation: "GET" },
  admin_create_hot_deal: { resource: "hot-deals", operation: "CREATE" },
  admin_update_hot_deal: { resource: "hot-deals", operation: "UPDATE" },
  admin_delete_hot_deal: { resource: "hot-deals", operation: "DELETE" },
};

async function callAdminMcpTool(ctx: ActionCtx, name: string, rawArguments: unknown) {
  const spec = adminToolMap[name];
  if (!spec) throw new Error(`Unknown admin MCP tool: ${name}`);
  if (!isRecord(rawArguments)) throw new Error("Tool arguments must be an object");
  const needsId = spec.operation === "GET" || spec.operation === "UPDATE" || spec.operation === "DELETE";
  const needsData = spec.operation === "CREATE" || spec.operation === "UPDATE";
  let id: string | undefined;
  if (needsId) {
    if (typeof rawArguments.id !== "string" || !rawArguments.id.trim()) throw new Error(`${name} requires an id`);
    id = rawArguments.id;
  }
  let payload: unknown = {};
  if (needsData) {
    if (!isRecord(rawArguments.data)) throw new Error(`${name} requires a data object`);
    payload = rawArguments.data;
  }
  const filters = spec.operation === "LIST" ? rawArguments : {};
  return ctx.runAction(internal.admin.adminCrud, { resource: spec.resource, operation: spec.operation, id, payload, filters });
}

// Shared MCP server plumbing. Both /api/mcp (review-only, MCP secret) and
// /api/mcp/admin (full CRUD, ADMIN_API_KEY) are the same JSON-RPC/Streamable
// HTTP protocol; only auth, the tool manifest, and the dispatch table differ.
function createMcpToolServer(options: {
  authorize: (request: Request) => boolean;
  serverInfo: { name: string; version: string };
  instructions: string;
  tools: () => Array<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
  callTool: (ctx: ActionCtx, name: string, rawArguments: unknown) => Promise<unknown>;
  assertAccess?: (ctx: ActionCtx) => Promise<void>;
  maxBodyBytes?: number;
}) {
  const maxBodyBytes = options.maxBodyBytes ?? 32_768;
  return httpAction(async (ctx, request) => {
    if (!options.authorize(request)) return mcpUnauthorized();
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) return json({ error: "Request body is too large" }, 413, mcpHeaders);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return mcpError(null, -32700, "Request body must be valid JSON");
    }
    if (!isRecord(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") return mcpError(null, -32600, "Expected a JSON-RPC 2.0 request");
    const requestId: JsonRpcId = typeof body.id === "string" || typeof body.id === "number" || body.id === null ? body.id : null;
    const isNotification = body.id === undefined;
    const method = body.method;
    if (isNotification) return empty(202, mcpHeaders);
    if (method === "initialize") return mcpJsonRpcResult(requestId, { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: options.serverInfo, instructions: options.instructions });
    if (method === "ping") return mcpJsonRpcResult(requestId, {});
    if (method === "tools/list") return mcpJsonRpcResult(requestId, { tools: options.tools() });
    if (method === "tools/call") {
      if (!isRecord(body.params)) return mcpError(requestId, -32602, "tools/call requires params");
      const params = body.params as McpToolCallParams;
      if (typeof params.name !== "string") return mcpError(requestId, -32602, "tools/call requires a tool name");
      try {
        if (options.assertAccess) await options.assertAccess(ctx);
        const value = await options.callTool(ctx, params.name, params.arguments ?? {});
        return mcpToolResult(requestId, value);
      } catch (error) {
        return mcpToolResult(requestId, { isError: true, error: error instanceof Error ? error.message : "Tool call failed" });
      }
    }
    return mcpError(requestId, -32601, `Method not found: ${method}`);
  });
}

const mcpToolServer = createMcpToolServer({
  authorize: mcpAuthorized,
  serverInfo: { name: "dealforge-deal-tools", version: "1.0.0" },
  instructions: "Use sourced evidence only. The owner must review and approve every deal; this server never approves leads.",
  tools: mcpTools,
  callTool: callMcpTool,
  assertAccess: async (ctx) => {
    await ctx.runAction(internal.mongodb.mcpAssertAiAccess, {});
  },
});

const adminMcpToolServer = createMcpToolServer({
  authorize: adminMcpAuthorized,
  serverInfo: { name: "dealforge-admin-tools", version: "1.0.0" },
  instructions: "Full CRUD over the DealForge pipeline (leads, buyers, matches, hot deals) using the same ADMIN_API_KEY as /api/admin. Server-side rules match the REST API exactly: SEED sourceType forces fabricated:true, fabricated rows are tombstoned forever, live leads require real sourceUrl/sourceRef/sourceDate evidence, hot deals require verificationStatus VERIFIED with distressScore >= 80, and matches require a verified + approved non-fabricated lead and an approved buyer. Never invent PII, prices, comps, or verification status.",
  tools: adminMcpTools,
  callTool: callAdminMcpTool,
  maxBodyBytes: 512_000,
});

const mcpOptionsFor = (extraHeaders: string[]) => httpAction(async () => empty(204, { ...mcpHeaders, "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": ["authorization", "content-type", "mcp-session-id", ...extraHeaders].join(", ") }));
const mcpOptions = mcpOptionsFor(["x-mcp-api-key"]);
const adminMcpOptions = mcpOptionsFor(["x-admin-api-key"]);

auth.addHttpRoutes(http);

http.route({ path: "/api/n8n/source", method: "POST", handler: queueN8nSource });

for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"] as const) {
  http.route({ pathPrefix: "/api/admin/", method, handler: adminApi });
}

http.route({ path: "/api/mcp", method: "GET", handler: mcpGet });
http.route({ path: "/api/mcp", method: "POST", handler: mcpToolServer });
http.route({ path: "/api/mcp", method: "OPTIONS", handler: mcpOptions });

http.route({ path: "/api/mcp/admin", method: "GET", handler: adminMcpGet });
http.route({ path: "/api/mcp/admin", method: "POST", handler: adminMcpToolServer });
http.route({ path: "/api/mcp/admin", method: "OPTIONS", handler: adminMcpOptions });

http.route({ path: "/api/shared-thread", method: "GET", handler: sharedThreadApi });
http.route({ path: "/api/shared-thread", method: "POST", handler: sharedThreadApi });
http.route({ path: "/api/shared-threads", method: "GET", handler: sharedThreadApi });


const SPA_HTML = `<!doctype html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/logo.svg" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="DealForge — Wholesale deals, forged fast. Source-verified leads, evidence chains, and buyer matching without fabricated data." />
  <title>DealForge — Wholesale Deals, Forged Fast</title>
  <script type="module" crossorigin src="/assets/index-CG7k_dIi.js"></script>
  <link rel="modulepreload" crossorigin href="/assets/react-vendor-CyyHX-xR.js">
  <link rel="modulepreload" crossorigin href="/assets/framer-motion-DFOSl-E0.js">
  <link rel="modulepreload" crossorigin href="/assets/radix-ui-9N12fl3T.js">
  <link rel="modulepreload" crossorigin href="/assets/charts-9ukDj5My.js">
  <link rel="stylesheet" crossorigin href="/assets/index-DzEKs1NS.css">
</head>


<body>
  <div id="root"></div>
</body>

</html>
`;
const spaHandler = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) { return new Response("Not found", { status: 404 }); }
  return new Response(SPA_HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
});
http.route({ path: "/", method: "GET", handler: spaHandler });
http.route({ path: "/{*any}", method: "GET", handler: spaHandler });

export default http;
