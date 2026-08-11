import { httpRouter } from "convex/server";
import { httpAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";

const http = httpRouter();

const n8nSourceTypes = [
  "SHERIFF_SALE",
  "TAX_SALE",
  "AUCTION_COM",
  "PROBATE",
  "OFF_MARKET",
  "ASSESSOR",
  "RECORDER",
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

function constantTimeEqual(left: string, right: string) {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index % Math.max(left.length, 1)) || 0) ^ (right.charCodeAt(index % Math.max(right.length, 1)) || 0);
  }
  return difference === 0;
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

const mcpGet = httpAction(async (_, request) => {
  if (!mcpAuthorized(request)) return mcpUnauthorized();
  const accept = request.headers.get("accept") ?? "";
  if (!accept.includes("text/event-stream")) {
    return json({ error: "Streamable HTTP GET requires Accept: text/event-stream" }, 406, mcpHeaders);
  }

  // This server has synchronous tool responses and does not emit unsolicited
  // notifications. Return a valid empty SSE stream for clients that probe GET.
  return mcpEventStream(": mcp stream ready\\n\\n");
});

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
    {
      name: "scrape_source",
      description: "Fetch one public source URL, return bounded evidence, and stage it for owner review. Never invents or creates PII.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Public http(s) source URL" },
          sourceType: { type: "string", enum: [...mcpSourceTypes] },
        },
        required: ["url", "sourceType"],
        additionalProperties: false,
      },
    },
    {
      name: "queue_source",
      description: "Send a public source URL into the same managed automation queue used by the website and n8n. It creates only a pending source task; it never approves a lead.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Public http(s) source URL" },
          sourceType: { type: "string", enum: [...mcpSourceTypes] },
          idempotencyKey: { type: "string", description: "Optional stable key to make retries safe" },
        },
        required: ["url", "sourceType"],
        additionalProperties: false,
      },
    },
    {
      name: "list_pipeline",
      description: "Read non-fabricated sourced and approved leads from the website pipeline, including evidence links, distress score, verification, underwriting, and estimated profit.",
      inputSchema: {
        type: "object",
        properties: {
          pipelineStatus: { type: "string", enum: ["SOURCED", "CRITIQUED", "VERIFIED", "APPROVED", "REJECTED"] },
          minDistressScore: { type: "number", minimum: 0, maximum: 100 },
          limit: { type: "number", minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
    {
      name: "list_staged_sources",
      description: "Read bounded source evidence and consultant-court results from the website staging queue so the agent can continue a review without direct MongoDB access.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["NEW", "DUPLICATE", "REJECTED"] },
          limit: { type: "number", minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
    {
      name: "list_buyer_buy_boxes",
      description: "Read approved, verified buyer buy-box constraints for matching. Contact names, emails, and phone numbers are never returned.",
      inputSchema: {
        type: "object",
        properties: { limit: { type: "number", minimum: 1, maximum: 50 } },
        additionalProperties: false,
      },
    },
    {
      name: "list_match_board",
      description: "Read the website's match board with scores, confidence, status, and buy-box summaries; no buyer contact information is returned.",
      inputSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["CANDIDATE", "APPROVED", "REJECTED", "CONTACTED", "CLOSED"] },
          confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
          limit: { type: "number", minimum: 1, maximum: 50 },
        },
        additionalProperties: false,
      },
    },
    {
      name: "estimate_deal",
      description: "Calculate ARV scenarios, repair estimate, MAO scenarios, and estimated gross spread from explicit inputs. Missing comps produce NEEDS_APPRAISAL.",
      inputSchema: {
        type: "object",
        properties: {
          leadId: { type: "string" },
          squareFeet: { type: "number", exclusiveMinimum: 0 },
          yearBuilt: { type: "number" },
          repairTier: { type: "string", enum: ["BASE", "MEDIUM", "GUT"] },
          soldComps: { type: "array", items: { type: "number", minimum: 0 } },
          compSourceUrl: { type: "string" },
          compSourceDate: { type: "string" },
          targetPct: { type: "number", exclusiveMinimum: 0, maximum: 100 },
          wholesaleFee: { type: "number", minimum: 0 },
          closingCosts: { type: "number", minimum: 0 },
          holdingCosts: { type: "number", minimum: 0 },
          acquisitionPrice: { type: "number", minimum: 0 },
        },
        required: ["squareFeet", "repairTier", "soldComps", "targetPct", "wholesaleFee", "closingCosts", "holdingCosts"],
        additionalProperties: false,
      },
    },
    {
      name: "consultant_court",
      description: "Run the evidence auditor, underwriting analyst, risk/compliance consultant, and judge on a staged source. Returns a recommendation only; owner approval remains required.",
      inputSchema: {
        type: "object",
        properties: { stagedId: { type: "string" } },
        required: ["stagedId"],
        additionalProperties: false,
      },
    },
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
    if (typeof rawArguments.url !== "string" || !isMcpSourceType(rawArguments.sourceType)) {
      throw new Error("scrape_source requires a public url and supported sourceType");
    }
    return ctx.runAction(internal.mongodb.mcpScrapeSource, {
      url: rawArguments.url,
      sourceType: rawArguments.sourceType,
    });
  }

  if (name === "queue_source") {
    if (typeof rawArguments.url !== "string" || !isMcpSourceType(rawArguments.sourceType)) {
      throw new Error("queue_source requires a public url and supported sourceType");
    }
    const idempotencyKey = optionalString(rawArguments.idempotencyKey);
    if (idempotencyKey === "__invalid__") throw new Error("idempotencyKey must be a string when provided");
    return ctx.runAction(internal.mongodb.mcpQueueSource, {
      url: rawArguments.url,
      sourceType: rawArguments.sourceType,
      idempotencyKey,
    });
  }

  if (name === "list_pipeline") {
    const pipelineStatus = optionalString(rawArguments.pipelineStatus);
    const minDistressScore = optionalNumber(rawArguments.minDistressScore);
    const limit = optionalNumber(rawArguments.limit);
    if (pipelineStatus === "__invalid__" || Number.isNaN(minDistressScore) || Number.isNaN(limit)) {
      throw new Error("list_pipeline filters must use the documented types");
    }
    return ctx.runAction(internal.mongodb.mcpListPipeline, {
      pipelineStatus: pipelineStatus as "SOURCED" | "CRITIQUED" | "VERIFIED" | "APPROVED" | "REJECTED" | undefined,
      minDistressScore,
      limit,
    });
  }

  if (name === "list_staged_sources") {
    const status = optionalString(rawArguments.status);
    const limit = optionalNumber(rawArguments.limit);
    if (status === "__invalid__" || Number.isNaN(limit)) {
      throw new Error("list_staged_sources filters must use the documented types");
    }
    return ctx.runAction(internal.mongodb.mcpListStagedSources, {
      status: status as "NEW" | "DUPLICATE" | "REJECTED" | undefined,
      limit,
    });
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
    if (status === "__invalid__" || confidence === "__invalid__" || Number.isNaN(limit)) {
      throw new Error("list_match_board filters must use the documented types");
    }
    return ctx.runAction(internal.mongodb.mcpListMatchBoard, {
      status: status as "CANDIDATE" | "APPROVED" | "REJECTED" | "CONTACTED" | "CLOSED" | undefined,
      confidence: confidence as "LOW" | "MEDIUM" | "HIGH" | undefined,
      limit,
    });
  }

  if (name === "estimate_deal") {
    const soldComps = Array.isArray(rawArguments.soldComps)
      ? rawArguments.soldComps.map((value) => typeof value === "number" ? { salePrice: value } : value)
      : rawArguments.soldComps;
    const leadId = optionalString(rawArguments.leadId);
    const compSourceUrl = optionalString(rawArguments.compSourceUrl);
    const compSourceDate = optionalString(rawArguments.compSourceDate);
    if (leadId === "__invalid__" || compSourceUrl === "__invalid__" || compSourceDate === "__invalid__") {
      throw new Error("Optional estimate fields must use the documented types");
    }
    return ctx.runAction(internal.mongodb.mcpEstimateDeal, {
      leadId,
      squareFeet: rawArguments.squareFeet as number,
      yearBuilt: optionalNumber(rawArguments.yearBuilt),
      repairTier: rawArguments.repairTier as "BASE" | "MEDIUM" | "GUT",
      soldComps: soldComps as Array<{ salePrice: number }>,
      compSourceUrl,
      compSourceDate,
      targetPct: rawArguments.targetPct as number,
      wholesaleFee: rawArguments.wholesaleFee as number,
      closingCosts: rawArguments.closingCosts as number,
      holdingCosts: rawArguments.holdingCosts as number,
      acquisitionPrice: optionalNumber(rawArguments.acquisitionPrice),
    });
  }

  if (name === "consultant_court") {
    if (typeof rawArguments.stagedId !== "string" || !rawArguments.stagedId.trim()) {
      throw new Error("consultant_court requires stagedId");
    }
    return ctx.runAction(internal.mongodb.mcpRunConsultantCourt, { stagedId: rawArguments.stagedId });
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}

const mcpToolServer = httpAction(async (ctx, request) => {
  if (!mcpAuthorized(request)) return mcpUnauthorized();

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 32_768) {
    return json({ error: "Request body is too large" }, 413, mcpHeaders);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mcpError(null, -32700, "Request body must be valid JSON");
  }
  if (!isRecord(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return mcpError(null, -32600, "Expected a JSON-RPC 2.0 request");
  }

  const requestId: JsonRpcId = typeof body.id === "string" || typeof body.id === "number" || body.id === null
    ? body.id
    : null;
  const isNotification = body.id === undefined;
  const method = body.method;

  if (isNotification && method === "notifications/initialized") {
    return empty(202, mcpHeaders);
  }
  if (isNotification && method.startsWith("notifications/")) {
    return empty(202, mcpHeaders);
  }
  if (isNotification) {
    return empty(202, mcpHeaders);
  }

  if (method === "initialize") {
    return mcpJsonRpcResult(requestId, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "groundwork-deal-tools", version: "1.0.0" },
      instructions: "Use sourced evidence only. The owner must review and approve every deal; this server never approves leads.",
    });
  }
  if (method === "ping") {
    return mcpJsonRpcResult(requestId, {});
  }
  if (method === "tools/list") {
    return mcpJsonRpcResult(requestId, { tools: mcpTools() });
  }
  if (method === "tools/call") {
    if (!isRecord(body.params)) return mcpError(requestId, -32602, "tools/call requires params");
    const params = body.params as McpToolCallParams;
    if (typeof params.name !== "string") return mcpError(requestId, -32602, "tools/call requires a tool name");
    try {
      await ctx.runAction(internal.mongodb.mcpAssertAiAccess, {});
      const value = await callMcpTool(ctx, params.name, params.arguments ?? {});
      return mcpToolResult(requestId, value);
    } catch (error) {
      return mcpToolResult(requestId, { isError: true, error: error instanceof Error ? error.message : "Tool call failed" });
    }
  }

  return mcpError(requestId, -32601, `Method not found: ${method}`);
});

const mcpOptions = httpAction(async () => empty(204, {
  ...mcpHeaders,
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "authorization, content-type, x-mcp-api-key, mcp-session-id",
}));

auth.addHttpRoutes(http);

http.route({
  path: "/api/n8n/source",
  method: "POST",
  handler: queueN8nSource,
});

http.route({
  path: "/api/mcp",
  method: "GET",
  handler: mcpGet,
});

http.route({
  path: "/api/mcp",
  method: "POST",
  handler: mcpToolServer,
});

http.route({
  path: "/api/mcp",
  method: "OPTIONS",
  handler: mcpOptions,
});

export default http;
