---
name: perplexity-cli
description: "Use Perplexity's pplx CLI for grounded web search and query-relevant page snippets, then pass reviewed public URLs to Deal Pipeline Pro's evidence crawler."
when_to_use: "Use when researching current public real-estate sources, locating official auction or county pages, checking a specific public URL, or narrowing a source list before an owner-run crawl."
argument-hint: "[source research query or URL]"
---

# Perplexity `pplx` source research

This skill is a research aid for Deal Pipeline Pro. It finds candidate public URLs and relevant page excerpts; it does **not** create leads, verify ownership, invent PII, contact people, or approve a deal.

## Install and authenticate

Skip installation when `pplx --version` already works.

```sh
curl -fsSL https://github.com/perplexityai/perplexity-cli/releases/latest/download/install.sh | sh
```

The installer verifies the release checksum and installs to `~/.local/bin/pplx`. Supported platforms are macOS arm64, Linux x86_64, and Linux arm64. Use `pplx update --check` before updating and `pplx update` for a checksum-verified update.

For an interactive terminal:

```sh
pplx auth login
```

For agents or CI, use an environment variable instead of an interactive login:

```sh
export PERPLEXITY_API_KEY=pplx-...
```

Never commit the key, paste it into project source, or put it in browser code. In Freebuff, the user must manage secrets through the Keys/API keys UI; this skill does not edit `.env` files.

## Default full-domain lead-finding workflow

When the task is to find leads, the input is a complete website origin such as `https://www.auction.com/`, never a single property URL. Treat that origin as a crawl scope:

1. Validate the input as an absolute `http(s)` domain URL and reject single-listing URLs when a site-wide search was requested.
2. Discover the site's public listing surfaces from the homepage, navigation, sitemap, robots-declared sitemap, pagination, and category/search pages.
3. Crawl every reachable, relevant public listing page within the platform's bounded crawl limits. Continue page-by-page rather than stopping after the first property.
4. Extract only evidence visible on the source pages: listing URL, address, sale/status details, parcel or case reference, dates, property type, and explicitly published contact/ownership fields.
5. Preserve the source URL and retrieval date for every candidate. Never invent missing seller or buyer PII.
6. Review captured evidence manually before qualifying a candidate. A URL or snippet is not a verified lead.

The current Camofox action is intentionally bounded per run (`maxPages` is capped at 12). Run successive reviewed batches for larger domains; do not claim that one batch covered the entire site. Future changes may add resumable cursors, but must retain the same owner gate and evidence requirements.

## Blocked-source decision tree

If the domain returns a CAPTCHA, robots restriction, login wall, rate limit, anti-bot challenge, or gateway failure, do **not** bypass or defeat that control. Before giving up, check for a permitted path:

1. Official API, public feed, sitemap, bulk export, or documented partner access.
2. A maintained, reputable connector or browser integration that accesses only publicly permitted pages.
3. A different official source covering the same records.

When evaluating a repository or library, check license, recent commits, issue health, release activity, and community adoption/stars. Stars alone are not proof of safety or compatibility. Do not install tools whose purpose is to evade CAPTCHA, authentication, robots rules, paywalls, or access controls.

Only after these compliant paths genuinely fail may the workflow use buyer-first fallback. In fallback mode, first capture the buyer's target location, price range, property type, condition/distress criteria, timeline, and other box parameters; then search specifically for seller listings matching those criteria. Do not browse broadly or create generic leads.

## Research workflow for this project

1. Search for public, permitted source pages—not seller contact lists.
2. Prefer official county, court, assessor, recorder, sheriff, and auction domains.
3. Restrict the search with `--domains` or `--excluded-domains` when possible.
4. Save full JSON results with `--output-dir`; use a small stdout preview for agents.
5. Inspect every returned URL and snippet for relevance, source date, location, and reference identifiers.
6. Send the complete reviewed domain to Toolkit → Camofox link crawler or its reusable default-source registry, not just one listing URL.
7. Review captured evidence manually before qualifying a candidate. A URL or snippet is not a verified lead.

The crawler may discover and queue links from the supplied domain, but it must remain same-site by default and must return partial results plus per-page failures.
Example:

```sh
pplx search web "public foreclosure auction listings Allen County Indiana" \
  --domains allen.in.us,auction.com \
  -n 10 \
  --output-dir source-research \
  --stdout-preview=240
```

Use a second search for a different topic; extra quoted terms in one `search web` command are reformulations of the same query, not separate searches.

For specific pages, use query-relevant snippets:

```sh
pplx content snippets \
  "property address sale date case number auction status" \
  https://www.auction.com/ \
  --max-tokens 512 \
  --max-tokens-per-page 256
```

Check every `results[i].error` before trusting a snippet. A successful command can still contain per-URL failures. `content fetch` is deprecated; use `content snippets`.

## Evidence and safety rules

- Treat Perplexity results as discovery leads, not authoritative verification.
- Preserve the original URL, retrieval date, source reference, and quoted evidence.
- Do not search for or generate private seller contact information.
- Do not bypass login, CAPTCHA, robots restrictions, paywalls, rate limits, anti-bot controls, or access controls; use documented public alternatives instead.
- Do not use search snippets as proof when the official page is unavailable.
- Do not automatically insert search results into MongoDB leads or hot deals.
- A page must still pass the existing owner review, non-fabricated-data, and evidence requirements before it can become a candidate.

## Common CLI pitfalls

- `pplx auth login` is interactive; use `PERPLEXITY_API_KEY` in non-interactive sessions.
- `--stdout-preview` is useful with `--output-dir`; otherwise output can remain large.
- Search date flags use `MM/DD/YYYY`, not ISO dates.
- Do not combine `--recency-filter` with published date bounds.
- `content snippets` accepts 1–50 URLs and uses additional positionals as pages, unlike `search web` where additional quoted terms refine one query.
- On failure, inspect the JSON error on stderr. On snippet success, inspect each result's `error` field.
