import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
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

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isN8nSourceType(value: unknown): value is N8nSourceType {
  return typeof value === "string" && n8nSourceTypes.includes(value as N8nSourceType);
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

auth.addHttpRoutes(http);

http.route({
  path: "/api/n8n/source",
  method: "POST",
  handler: queueN8nSource,
});

export default http;
