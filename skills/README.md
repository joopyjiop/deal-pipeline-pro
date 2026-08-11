# Skills Library

Agent skills integrated into this project (standard Agent Skills format: `SKILL.md` frontmatter + markdown, plus `references/`).

## Firecrawl — live web work & integration

| Pack | Contents | Source | License |
| --- | --- | --- | --- |
| `firecrawl/` | **Build skills** — integrate Firecrawl into app code: endpoint selection, SDK install, auth, scrape/search/interact patterns, developer & research indexes (7 skills) | `firecrawl/skills` | included (LICENSE) |
| `firecrawl-cli/` | **CLI skills** — live web work via the Firecrawl CLI during a session: scrape, search, crawl, map, monitor, parse, download, interact, agent (10 skills) | `firecrawl/cli` → `skills/` | ISC (per `firecrawl-cli` package.json) |
| `firecrawl-workflows/` | **Workflow skills** — repeatable business deliverables: lead-gen, lead-research, deep-research, market-research, competitive-intel, SEO audit, QA, knowledge-base/ingest, company-directories, dashboard-reporting, research-papers, shop, website-design-clone, demo-walkthrough, umbrella (16 skills) | `firecrawl/firecrawl-workflows` | ISC (included) |

## How these map to this project

- **Lead sourcing (real, verified leads):** `firecrawl-build-scrape` / `firecrawl-build-search` are the pattern for pulling public-record pages (county assessor, sheriff sale, tax sale sites) into the lead pipeline as sourced evidence. `firecrawl-workflows/firecrawl-lead-gen` and `firecrawl-lead-research` generate prospect/lead lists; `firecrawl-cli/firecrawl-scrape` + `firecrawl-search` do live web work when an agent needs current page content.
- **Prerequisite:** `FIRECRAWL_API_KEY` (hosted) or `FIRECRAWL_API_URL` (self-hosted) in the backend env vars (Convex dashboard for `keen-aardvark-333`). The CLI skills additionally need the Firecrawl CLI (`npx -y firecrawl-cli@latest init --all`).

## Conventions

- Skills are read-only reference; the source-of-truth for behavior stays in `src/convex/` and `src/pages/`.
- Anything that runs against live data (scraping, exporting, dialing) goes through the same owner-gate + fabricated-row guards as the rest of the app.
