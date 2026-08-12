/**
 * ScrapeGraphAI extraction client.
 *
 * Uses the official v2 HTTP API (https://v2-api.scrapegraphai.com/api/extract)
 * with the SGAI-APIKEY header. The key is read server-side only (process.env),
 * never from browser code. The module is deliberately pure where possible so
 * the request/response contract can be unit-tested without a live account.
 */

export type ScrapegraphMode = "normal" | "reader" | "prune";

export type ScrapegraphExtractOptions = {
  url: string;
  prompt: string;
  mode?: ScrapegraphMode;
  /** Optional JSON-Schema object constraining the extraction shape. */
  schema?: Record<string, unknown>;
};

export type ScrapegraphUsage = {
  promptTokens: number;
  completionTokens: number;
};

export type ScrapegraphExtractResult = {
  ok: true;
  json: Record<string, unknown> | null;
  raw: string | null;
  usage?: ScrapegraphUsage;
};

export type ScrapegraphExtractFailure = {
  ok: false;
  status?: number;
  error: string;
};

export const SCRAPEGRAPH_EXTRACT_URL = "https://v2-api.scrapegraphai.com/api/extract";

export function scrapegraphApiKey() {
  const key = process.env.SGAI_API_KEY?.trim();
  if (!key) {
    throw new Error("SGAI_API_KEY is not configured on the Convex deployment");
  }
  return key;
}

/** Pure: builds the JSON body for /api/extract. */
export function buildExtractBody(options: ScrapegraphExtractOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    url: options.url,
    prompt: options.prompt,
    mode: options.mode ?? "normal",
  };
  if (options.schema && Object.keys(options.schema).length > 0) {
    body.schema = options.schema;
  }
  return body;
}

/**
 * Pure: normalizes the ScrapeGraphAI extract response into a stable shape.
 * The current API returns { raw, json, usage, metadata }; some responses wrap
 * the extraction in a `result` envelope, so that is tolerated as a fallback.
 */
export function parseExtractResponse(payload: unknown): ScrapegraphExtractResult {
  if (!payload || typeof payload !== "object") {
    throw new Error("ScrapeGraphAI returned a non-object response");
  }
  const record = payload as Record<string, unknown>;
  const envelope = record.result && typeof record.result === "object" ? (record.result as Record<string, unknown>) : record;
  const json = envelope.json === undefined || envelope.json === null ? null : envelope.json;
  if (json !== null && (typeof json !== "object" || Array.isArray(json))) {
    throw new Error("ScrapeGraphAI extraction json must be an object or null");
  }
  const raw = envelope.raw === undefined || envelope.raw === null ? null : envelope.raw;
  if (raw !== null && typeof raw !== "string") {
    throw new Error("ScrapeGraphAI extraction raw must be a string or null");
  }
  let usage: ScrapegraphUsage | undefined;
  const rawUsage = envelope.usage;
  if (rawUsage && typeof rawUsage === "object") {
    const usageRecord = rawUsage as Record<string, unknown>;
    const promptTokens = usageRecord.promptTokens;
    const completionTokens = usageRecord.completionTokens;
    if (typeof promptTokens === "number" && typeof completionTokens === "number") {
      usage = { promptTokens, completionTokens };
    }
  }
  return { ok: true, json: json as Record<string, unknown> | null, raw, usage };
}

/** Live call: extracts structured data from a public URL. Throws on failure. */
export async function scrapegraphExtract(options: ScrapegraphExtractOptions): Promise<ScrapegraphExtractResult> {
  const response = await fetch(SCRAPEGRAPH_EXTRACT_URL, {
    method: "POST",
    headers: {
      "SGAI-APIKEY": scrapegraphApiKey(),
      "content-type": "application/json",
    },
    body: JSON.stringify(buildExtractBody(options)),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as Record<string, unknown>).detail)
        : payload && typeof payload === "object" && "error" in payload
          ? String((payload as Record<string, unknown>).error)
          : response.statusText;
    const failure: ScrapegraphExtractFailure = { ok: false, status: response.status, error: detail };
    throw new Error(`ScrapeGraphAI extract failed (${failure.status}): ${failure.error}`);
  }
  return parseExtractResponse(payload);
}
