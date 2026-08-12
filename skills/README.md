# Skills Library

Agent skills integrated into this project (standard Agent Skills format: `SKILL.md` frontmatter + markdown, plus `references/`).

## Firecrawl — live web work & integration

| Pack | Contents | Source | License |
| --- | --- | --- | --- |
| `firecrawl/` | **Build skills** — integrate Firecrawl into app code: endpoint selection, SDK install, auth, scrape/search/interact patterns, developer & research indexes (7 skills) | `firecrawl/skills` | included (LICENSE) |
| `firecrawl-cli/` | **CLI skills** — live web work via the Firecrawl CLI during a session: scrape, search, crawl, map, monitor, parse, download, interact, agent (10 skills) | `firecrawl/cli` → `skills/` | ISC (per `firecrawl-cli` package.json) |
| `firecrawl-workflows/` | **Workflow skills** — repeatable business deliverables: lead-gen, lead-research, deep-research, market-research, competitive-intel, SEO audit, QA, knowledge-base/ingest, company-directories, dashboard-reporting, research-papers, shop, website-design-clone, demo-walkthrough, umbrella (16 skills) | `firecrawl/firecrawl-workflows` | ISC (included) |

## Playwright — browser automation & component testing

| Pack | Contents | Source | License |
| --- | --- | --- | --- |
| `playwright/` | **User-facing skills**: `playwright-cli` (browser automation: open/goto/click/type, test generation, tracing, video, storage state, request mocking — 9 references), `playwright-component-testing` (React/Vue component tests via a story-gallery dev page + `mount` fixture, with React/Vue templates), `playwright-trace` (inspect `.zip` trace files from the CLI) | `microsoft/playwright` → `packages/playwright-core/src/tools/skills/` | Apache-2.0 (included) |

> Skipped from the fork: `.claude/skills/` (playwright-dev/devops/test-results/triage) are contributor skills for developing the Playwright monorepo itself — not applicable to this project, which consumes Playwright rather than building it.

## Minimalist Entrepreneur — business strategy

| Pack | Contents | Source |
| --- | --- | --- |
| `minimalist-entrepreneur/` | **Business strategy skills** — community discovery, idea validation, MVP scoping, processization, first customers, pricing, marketing, sustainable growth, company values, and decision review (10 skills) | `joopyjiop/skills` |

## Prompt Master — prompt engineering

| Pack | Contents | Source | License |
| --- | --- | --- | --- |
| `prompt-master/` | **Prompt engineering** — tool routing, output contracts, coding-agent scope locks, credential stripping, prompt decompilation, failure patterns, and templates | `joopyjiop/prompt-master` | MIT (included) |

## Perplexity CLI — grounded source research

| Pack | Contents | Source |
| --- | --- | --- |
| `perplexity-cli/` | **Research skills** — install and use `pplx search web` and `pplx content snippets` to discover and narrow public source URLs before handing them to the owner-only Camofox crawler | `joopyjiop/perplexity-cli` + upstream Perplexity agent-skill guidance |

## How these map to this project

- **Lead sourcing (real, verified leads):** `firecrawl-build-scrape` / `firecrawl-build-search` are the pattern for pulling public-record pages (county assessor, sheriff sale, tax sale sites) into the lead pipeline as sourced evidence. `firecrawl-workflows/firecrawl-lead-gen` and `firecrawl-lead-research` generate prospect/lead lists; `firecrawl-cli/firecrawl-scrape` + `firecrawl-search` do live web work when an agent needs current page content.
- **Prerequisite:** `FIRECRAWL_API_KEY` (hosted) or `FIRECRAWL_API_URL` (self-hosted) in the backend env vars (Convex dashboard for `keen-aardvark-333`). The CLI skills additionally need the Firecrawl CLI (`npx -y firecrawl-cli@latest init --all`).
- **E2E / component tests:** `playwright` skills cover browser automation (`playwright-cli`), component tests for the React UI (`playwright-component-testing` — story-gallery pattern fits this app's shadcn/ui components), and trace debugging (`playwright-trace`). `@playwright/test` is not yet installed in this project — say the word and I'll add it plus a first smoke test.

## Conventions

- Skills are read-only reference; the source-of-truth for behavior stays in `src/convex/` and `src/pages/`.
- The `minimalist-entrepreneur/` pack is guidance for product and business decisions; it does not replace owner authorization, evidence validation, or fabricated-data safeguards.
- The `prompt-master/` pack is used only for explicit prompt-engineering requests; it does not override project safety rules or authorize external actions.
- Anything that runs against live data (scraping, exporting, dialing) goes through the same owner-gate + fabricated-row guards as the rest of the app.
