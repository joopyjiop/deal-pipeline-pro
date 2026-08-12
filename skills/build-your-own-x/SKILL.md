---
name: build-your-own-x
description: "Use when the user wants a capability built from scratch instead of paying for a hosted service, installing a heavy dependency, or wiring a third-party vendor — databases, search, web servers, scrapers, queues, LLM/agent plumbing, and more."
when_to_use: "Use when the user says build it yourself, make it free, avoid a paid service, or replace a vendor dependency with an in-house implementation; also when the request maps to a category in the build-your-own-x index (database, search engine, web server, CLI tool, bot, shell, template engine, network stack, and more)."
argument-hint: "[capability to build from scratch]"
---

# Build-your-own-X reference

Source repository: https://github.com/codecrafters-io/build-your-own-x (curated tutorial index, ~30 categories, ~390 step-by-step guides). No upstream LICENSE file; the index itself is a link list and this pack is a read-only reference.

This pack is the project's from-scratch playbook: when the owner wants a feature without paying a vendor, the first move is to check the index for a proven step-by-step tutorial and implement the minimal version in this codebase, keeping the same owner-gate and evidence rules as everything else.

## Decision rule

Reach for this pack when any of these apply:

- The request says "for free", "build it ourselves", "no paid service", "self-hosted", or "from scratch".
- The feature is a commodity: database, search, queue, web server, crawler/parser, bot, CLI, template engine, cache, or small ML/LLM plumbing.
- A third-party vendor would add a subscription, API key, data-sharing, or lock-in the owner does not want.

Do **not** use it to bypass security, auth, compliance, or ownership rules. Building a component in-house never removes the fabricated-data, PII, TCPA, or owner-approval guards. Keep Convex as the backend and database unless the owner explicitly asks otherwise.

## Workflow

1. **Name the capability** the user wants (e.g. "deal search", "queue", "PDF export", "scraper", "lead dedupe").
2. **Check the index** in `references/index.md` for the matching category and pick a well-known tutorial with the project's stack (TypeScript/JavaScript preferred; adapt other languages — the pattern transfers).
3. **Scope a minimal version** that fits this codebase: one focused module, existing Convex queries/mutations/actions, existing shadcn/ui + Tailwind surface. No new database, no new server unless the feature truly requires it.
4. **Keep the honest-data rules**: any data the component produces must be sourced and evidence-backed like the rest of the pipeline; never invent PII, prices, comps, or distress signals.
5. **Wire it behind the same gates**: owner-only writes, signed-in reads, fabricated-row filtering, and the existing MCP/automation boundaries.
6. **Verify**: typecheck and push; exercise the new component through the app or the authenticated MCP path before reporting done.

## Common mappings to this project

| Need | Index category | Typical approach here |
| --- | --- | --- |
| Search across leads/sources | Search Engine | Keep Convex index + `$regex` filters; add a small inverted index or text scoring module only if real search is required |
| Queue/worker for crawls | Distributed Systems / Web Server | Already exists (`automation_tasks` + run cycle) — extend it, do not build a second queue |
| Web scraper/crawler | Web Scraper (Uncategorized) | Keep owner-gated fetch + staging; respect robots/rate limits; no bypass |
| CLI tooling | Command-Line Tool | Add to the project's scripts; no standalone binary unless requested |
| Bot / automation | Bot | Reuse the MCP JSON-RPC route + owner auth |
| Small LLM plumbing | AI Model / Neural Network | Keep the Ollama court adapter; a from-scratch model only if explicitly wanted |
| Template rendering, dedupe, parser | Template Engine / Regex Engine / Text Editor | Implement as a pure TypeScript module with tests |

## Project constraints

- Reference is read-only: `references/index.md` is the upstream list; keep behavior in `src/convex/` and `src/pages/`.
- Never remove or weaken the fabricated-row, owner-approval, or evidence requirements while swapping an implementation.
- Prefer the smallest change that satisfies the request; a from-scratch build is not a reason to expand scope.
- If the tutorial index has no fit, say so and propose the smallest in-house alternative or a free-tier vendor instead of silently skipping the search.
