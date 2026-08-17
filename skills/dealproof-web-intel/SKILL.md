---
name: dealproof-web-intel
description: "Use when an agent (Odysseus or a worker) needs to research a public real-estate source end-to-end — discover listing URLs, fetch and stage pages, and extract structured property facts — through one tool that routes across sitemap discovery, Firecrawl, ScrapeGraphAI, and the owner-only Camofox browser."
---

# DealProof Web Intelligence (mega skill)

One call that fronts the four fetch surfaces the DealProof pipeline owns:

1. **Sitemap discovery** — expand a portal seed into real listing URLs.
2. **Plain fetch + Firecrawl render fallback** — fetch a page; re-render bot-walled / empty pages through Firecrawl.
3. **ScrapeGraphAI extraction** — pull structured property facts (price, parcel, sale, distress).
4. **Camofox anti-detection browser** — owner-only escalation for login/JS/bot-protected portals.

## When to use

Use `web_intel` when the task is "research this source" and you want discovery + fetch + optional extraction without juggling three separate tools. Use the individual tools (`sitemap_discover`, `scrape_source`, `scrapegraph_extract`) only when you need exactly one step.

## How to call it (via the website MCP server)

Endpoint: `POST https://keen-aardvark-333.convex.site/api/mcp`
Header: `Authorization: Bearer <MCP_TOOL_SERVER_SECRET>`

```jsonc
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "web_intel",
    "arguments": {
      "url": "https://example-county.gov/sheriff-sales",
      "sourceType": "SHERIFF_SALE",
      "mode": "auto",              // auto | discover | fetch | extract (default auto)
      "prompt": "Extract the property address, sale date, and opening bid", // optional
      "schema": { /* optional JSON-Schema */ },
      "maxUrls": 60,               // discovery budget (1-200)
      "maxPages": 3                // extraction budget (1-12)
    }
  }
}
```

Modes:
- `auto` — discover + fetch (+ extract when `prompt` is present).
- `discover` — sitemap expansion only.
- `fetch` — fetch/stage the single URL (plain fetch → Firecrawl fallback).
- `extract` — ScrapeGraphAI extraction only (requires `prompt`).

## Routing rules (provider selection)

| Situation | Route |
| --- | --- |
| Need the list of listing URLs under a portal | sitemap discovery (robots.txt → sitemap.xml) |
| Need one page's text, and it is a normal public page | plain fetch |
| Page returns 200 but is an empty / JS-challenge shell | Firecrawl `/scrape` re-render fallback (automatic) |
| Need structured facts (price, parcel, sale, distress) from page text | ScrapeGraphAI `/api/extract` with a prompt + optional schema |
| Bot wall, login, or heavy client-side JS blocks everything | **Escalate to the owner** — Camofox is owner-only and never driven from the agent path |

## Non-negotiables (never weaken these)

- Never invent PII, prices, comps, distress, or verification status. Missing data is flagged as missing.
- Every fetched page is staged behind the source-evidence gate (`sourceUrl` / `sourceRef` / `sourceDate`) for **owner review**. `web_intel` stages evidence; it never approves a lead.
- Camofox stays owner-only. The agent never drives a login-capable browser.
- Respect the source's robots.txt / rate limits. A 403/429 is reported as blocked — never bypassed.

## Output shape

```jsonc
{
  "provider": "web-intel",
  "mode": "auto",
  "seedUrl": "…",
  "sourceType": "SHERIFF_SALE",
  "plan": [ { "step": "discover", "provider": "sitemap", "note": "…" }, /* … */ ],
  "providers": { "sitemap": "used", "fetch": "used", "firecrawl": "fallback", "scrapegraph": "not-used", "camofox": "owner-only" },
  "discovery": { /* sitemap result + staged records */ },
  "fetch": { /* staged seed record */ },
  "extraction": { "targets": ["…"], "results": [/* … */] },
  "errors": [ { "phase": "discover", "error": "…" } ],
  "warnings": ["Camofox is owner-only …"]
}
```

## Standalone repo

`references/web-intel-portable.ts` is a self-contained copy of the routing + fetch orchestration (Node 18+ `fetch`, no Convex). See `README.md` in this folder for how to package it as its own repo.
