// Unit tests for the ScrapeGraphAI extraction client (src/convex/scrapegraph.ts).
//
// Lives outside src/convex/ so the Convex bundle never sees the bun:test
// import. The request-building and response-parsing functions are pure and are
// tested directly; the live fetch path is tested with a mocked global fetch so
// no API key or network call is required.

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  buildExtractBody,
  parseExtractResponse,
  scrapegraphApiKey,
  scrapegraphExtract,
  SCRAPEGRAPH_EXTRACT_URL,
} from "../src/convex/scrapegraph";

const originalKey = process.env.SGAI_API_KEY;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.SGAI_API_KEY = "test-scrapegraph-key";
});

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.SGAI_API_KEY;
  } else {
    process.env.SGAI_API_KEY = originalKey;
  }
  globalThis.fetch = originalFetch;
});

describe("scrapegraphApiKey", () => {
  test("throws with a clear message when the key is not configured", () => {
    delete process.env.SGAI_API_KEY;
    expect(() => scrapegraphApiKey()).toThrow(/SGAI_API_KEY is not configured/);
  });

  test("returns the trimmed key when configured", () => {
    process.env.SGAI_API_KEY = "  key-with-whitespace  ";
    expect(scrapegraphApiKey()).toBe("key-with-whitespace");
  });
});

describe("buildExtractBody", () => {
  test("includes url, prompt, and the default mode", () => {
    const body = buildExtractBody({ url: "https://example.com/property", prompt: "Extract the sale details" });
    expect(body).toEqual({ url: "https://example.com/property", prompt: "Extract the sale details", mode: "normal" });
  });

  test("honors an explicit mode", () => {
    const body = buildExtractBody({ url: "https://example.com", prompt: "Extract the details", mode: "reader" });
    expect(body.mode).toBe("reader");
  });

  test("adds the schema only when non-empty", () => {
    const withSchema = buildExtractBody({
      url: "https://example.com",
      prompt: "Extract the details",
      schema: { type: "object", properties: { address: { type: "string" } } },
    });
    expect(withSchema.schema).toEqual({ type: "object", properties: { address: { type: "string" } } });

    const withoutSchema = buildExtractBody({ url: "https://example.com", prompt: "Extract the details", schema: {} });
    expect("schema" in withoutSchema).toBe(false);
  });
});

describe("parseExtractResponse", () => {
  test("parses a normal success response with json and usage", () => {
    const result = parseExtractResponse({
      raw: "some raw text",
      json: { address: "5214 Eicher Dr", price: 75000 },
      usage: { promptTokens: 1200, completionTokens: 300 },
      metadata: { chunker: { chunks: [] } },
    });
    expect(result.ok).toBe(true);
    expect(result.json).toEqual({ address: "5214 Eicher Dr", price: 75000 });
    expect(result.raw).toBe("some raw text");
    expect(result.usage).toEqual({ promptTokens: 1200, completionTokens: 300 });
  });

  test("tolerates a null json and raw", () => {
    const result = parseExtractResponse({ json: null, raw: null, usage: { promptTokens: 1, completionTokens: 1 } });
    expect(result.ok).toBe(true);
    expect(result.json).toBeNull();
    expect(result.raw).toBeNull();
  });

  test("reads extraction from a wrapped result envelope", () => {
    const result = parseExtractResponse({ result: { json: { case: "2026-CF-000123" }, raw: "text" }, usage: { promptTokens: 1, completionTokens: 1 } });
    expect(result.json).toEqual({ case: "2026-CF-000123" });
  });

  test("throws on a non-object payload", () => {
    expect(() => parseExtractResponse("not an object")).toThrow(/non-object response/);
  });

  test("throws when json is an array instead of an object", () => {
    expect(() => parseExtractResponse({ json: [1, 2], raw: null })).toThrow(/json must be an object or null/);
  });

  test("throws when raw is not a string", () => {
    expect(() => parseExtractResponse({ json: null, raw: 42 })).toThrow(/raw must be a string or null/);
  });

  test("omits usage when the shape is not numeric", () => {
    const result = parseExtractResponse({ json: null, raw: null, usage: { promptTokens: "many" } });
    expect(result.usage).toBeUndefined();
  });
});

describe("scrapegraphExtract", () => {
  function mockFetchResponse(status: number, body: unknown, statusText = "") {
    globalThis.fetch = (async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText,
      json: async () => body,
    })) as unknown as typeof fetch;
  }

  test("posts to the extract endpoint with the SGAI-APIKEY header and returns the parsed json", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init: init ?? {} };
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ json: { address: "123 Main St", salePrice: 98000 }, raw: "text", usage: { promptTokens: 10, completionTokens: 5 } }),
      } as Response;
    }) as unknown as typeof fetch;

    const result = await scrapegraphExtract({ url: "https://example.com/listing", prompt: "Extract the property facts" });
    expect(captured?.url).toBe(SCRAPEGRAPH_EXTRACT_URL);
    expect(captured?.init.method).toBe("POST");
    const headers = captured?.init.headers as Record<string, string>;
    expect(headers["SGAI-APIKEY"]).toBe("test-scrapegraph-key");
    expect(result.ok).toBe(true);
    expect(result.json).toEqual({ address: "123 Main St", salePrice: 98000 });
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });

  test("throws a descriptive error on a 4xx response with a detail payload", async () => {
    mockFetchResponse(402, { detail: "Insufficient credits" });
    await expect(scrapegraphExtract({ url: "https://example.com/listing", prompt: "Extract the property facts" })).rejects.toThrow(/402.*Insufficient credits/);
  });

  test("throws a descriptive error on a 5xx response without a payload", async () => {
    mockFetchResponse(503, null, "Service Unavailable");
    await expect(scrapegraphExtract({ url: "https://example.com/listing", prompt: "Extract the property facts" })).rejects.toThrow(/503.*Service Unavailable/);
  });

  test("throws before fetching when the key is missing", async () => {
    delete process.env.SGAI_API_KEY;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return { ok: true, status: 200, json: async () => ({ json: null, raw: null }) } as Response;
    }) as unknown as typeof fetch;
    await expect(scrapegraphExtract({ url: "https://example.com/listing", prompt: "Extract the property facts" })).rejects.toThrow(/SGAI_API_KEY is not configured/);
    expect(called).toBe(false);
  });
});
