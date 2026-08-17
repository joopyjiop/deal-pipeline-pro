# DealProof Web Intelligence

A single "mega skill" that turns four web-research surfaces — **sitemap discovery, Firecrawl, ScrapeGraphAI, and the Camofox browser** — into one routed call.

This folder is both:

1. **The integrated version** already wired into the DealProof website as the `web_intel` MCP tool (`POST /api/mcp`, `tools/call` → `web_intel`).
2. **A standalone reference** (`references/web-intel-portable.ts`) you can drop into its own repo for any agent or script that needs provider-aware web research outside the website.

## What it does

Given a seed URL it can, in one call:

- **discover** — expand the seed into real same-site listing URLs via robots.txt + sitemap.xml,
- **fetch** — fetch a page as text, re-rendering empty/JS-challenge pages through Firecrawl,
- **extract** — pull structured facts with ScrapeGraphAI (prompt + optional JSON-Schema),
- **escalate** — flag bot-protected / login-gated pages for the owner-only Camofox browser.

Every page is returned with the provider that produced it and any per-step errors, so the caller never has to guess which backend succeeded.

## Use the integrated version (Odysseus / any MCP agent)

```
URL:      https://keen-aardvark-333.convex.site/api/mcp
Header:   Authorization: Bearer <MCP_TOOL_SERVER_SECRET>
Method:   tools/call
Tool:     web_intel
```

Arguments: `url` (required), `sourceType` (required), `mode` (`auto|discover|fetch|extract`), `prompt`, `schema`, `maxUrls`, `maxPages`.

See `SKILL.md` for the full argument table and routing rules.

## Use the standalone version

`references/web-intel-portable.ts` is dependency-free TypeScript for Node 18+ (uses global `fetch`). Environment variables it reads:

| Variable | Used for | Required? |
| --- | --- | --- |
| `FIRECRAWL_API_KEY` | Firecrawl `/map` + `/scrape` fallback | optional (skip provider when unset) |
| `SGAI_API_KEY` | ScrapeGraphAI `/api/extract` | only for `extract` |
| `CAMOFOX_BASE_URL` / `CAMOFOX_API_KEY` | owner-only Camofox browser | optional; owner escalation |

```ts
import { runWebIntel } from "./web-intel-portable";

const report = await runWebIntel({
  url: "https://example-county.gov/sheriff-sales",
  sourceType: "SHERIFF_SALE",
  mode: "auto",
  prompt: "Extract the property address, sale date, and opening bid",
});
console.log(JSON.stringify(report, null, 2));
```

## Integrity rules

- No fabricated PII, prices, comps, distress, or verification status — missing data is flagged as missing.
- Staging/approval stays owner-controlled; this skill fetches and structures evidence only.
- 403/429 and bot walls are reported, never bypassed.
- Camofox is owner-only in every context.
