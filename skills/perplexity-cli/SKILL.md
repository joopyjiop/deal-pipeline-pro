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

## Research workflow for this project

1. Search for public, permitted source pages—not seller contact lists.
2. Prefer official county, court, assessor, recorder, sheriff, and auction domains.
3. Restrict the search with `--domains` or `--excluded-domains` when possible.
4. Save full JSON results with `--output-dir`; use a small stdout preview for agents.
5. Inspect every returned URL and snippet for relevance, source date, location, and reference identifiers.
6. Send only reviewed public URLs to Toolkit → Camofox link crawler or its reusable default-source registry.
7. Review captured evidence manually before qualifying a candidate. A URL or snippet is not a verified lead.

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
- Do not bypass login, CAPTCHA, robots restrictions, paywalls, or access controls.
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
