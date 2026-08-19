# AGENTS.md — instructions for AI agents working in this repo

This file is auto-loaded by agent tools on clone. It is the quick contract; **`README.md` is the source of truth** for schema, the admin API, environment variables, and deployment. **`docs/odysseus-briefing.md`** is the operator contract for external agents (Odysseus and worker agents). Read those before changing the live app.

## Project

**Deal Pipeline Pro** — a wholesale real-estate deal-finding and deal-making platform: real, source-verified property leads (sheriff/tax sales, auctions, probate, assessor/recorder), full underwriting (rent, cash flow, DSCR, ARV, repairs), a buyer registry, and lead↔buyer matching with confidence scores. Frontend + Convex backend + MongoDB.

## Stack & commands

- Vite + TypeScript + React 19 + React Router v7 + Tailwind v4 + shadcn/ui + Framer Motion
- Convex (backend functions, auth, crons) + Convex Auth (email OTP)
- MongoDB as the primary data store (accessed from Convex actions via `MONGODB_URI`)
- Bun is the package manager

```bash
bun install            # install
bun run dev            # Vite dev server
bun convex dev --once  # Convex codegen (run after touching src/convex/ BEFORE typecheck)
bun tsc -b --noEmit    # typecheck — must pass
bun test tests         # unit tests — must pass
bun run lint           # ESLint (only pre-existing shadcn template errors acceptable)
```

Never run interactive `bun convex dev` (no `--once`) — it hangs in non-interactive environments. Never hand-edit `src/convex/_generated/*`. Never run a full production build unless asked; `bun tsc -b --noEmit` is the check.

## Layout

- `src/pages/` — route pages; `src/main.tsx` owns the router + providers
- `src/components/ui/` — shadcn primitives; `src/components/` — app components
- `src/convex/` — backend: `schema.ts` (Convex tables), `http.ts` (HTTP routes: `/api/admin`, `/api/mcp`, `/api/n8n/source`), `mongodb.ts` (MongoDB actions + owner gates), `admin.ts` (admin CRUD), `owner.ts` (owner checks), `agents.ts`/`underwriting.ts`/`embeddings.ts`/`ollama.ts`/`rentcast.ts`/`camofox.ts`/`scrapegraph.ts`/`sitemap.ts` (pipeline logic)
- `tests/` — Bun unit tests (outside `src/convex/` so the Convex bundle never sees `bun:test`)
- `docs/` — runbooks and handoffs (`odysseus-briefing.md`, `n8n-recurring-lead-runs.md`, etc.)

## Non-negotiable rules

1. **Never fabricate or invent** PII (names, addresses, phones, emails), ownership, distress, comps, or verification status. Missing data is flagged as missing — never guessed.
2. **`fabricated: true` rows are tombstoned forever** — never un-tombstone, never export/dial/feed them. `sourceType: "SEED"` forces fabricated.
3. **Approvals are owner-only, enforced server-side.** Every write action runs through `requireOwner`/`requirePermanentOwner`. Never bypass a gate in the UI or API — the backend enforces it regardless.
4. Every live lead needs a real `sourceUrl`, `sourceRef`, and `sourceDate` as evidence.
5. **Keep the README synced** — when you change the schema, admin API, env vars, or deployment, update the relevant README sections in the same change.
6. **Secrets live in the Convex Keys panel / Freebuff Keys UI, never in `.env`, code, or chat.** Don't edit `.env` files; ask the user to paste keys into the Keys/API keys UI.

## Machine endpoints (env vars, not literal values)

- `https://keen-aardvark-333.convex.site/api/admin/...` — full CRUD (leads, buyers, matches, hot-deals, import-staging; users read-only) — `Authorization: Bearer $ADMIN_API_KEY`
- `POST /api/mcp` — MCP tool server (review/recommend only, never approves) — `$MCP_TOOL_SERVER_SECRET`
- `POST /api/mcp/admin` — MCP tool server exposing the admin CRUD surface (20 tools: list/get/create/update/delete for leads, buyers, matches, hot-deals) — `Authorization: Bearer $ADMIN_API_KEY` (or `x-admin-api-key` header)
- `GET /api/shared-thread?threadId=...` + `POST /api/shared-thread` + `GET /api/shared-threads` — shared-conversation REST API (Odysseus posts as `odysseus` server-side) — `$MCP_TOOL_SERVER_SECRET`
- `POST /api/n8n/source` — automation queue — header `x-convex-n8n-secret: $CONVEX_N8N_WEBHOOK_SECRET`
- Convex deployment: `keen-aardvark-333` (client URL `.convex.cloud`, HTTP routes `.convex.site`)

## Before-first-run configuration (owner action, not code)

For an external agent to operate the app, the owner must set in the Convex dashboard Keys panel (or Freebuff Keys UI): `ADMIN_API_KEY`, `MCP_TOOL_SERVER_SECRET`, `MONGODB_URI`, and per-provider `RENTCAST_API_KEY`, `FIRECRAWL_API_KEY`, `SGAI_API_KEY`, `CAMOFOX_BASE_URL`, `CAMOFOX_API_KEY`, plus `AI_BASE_URL` (AI gateway — consultant court, chat, embeddings; optional `AI_API_KEY`) (plus auth vars `JWKS`, `JWT_PRIVATE_KEY`, `SITE_URL` as already configured). Optional AI token-guard limits: `AI_MAX_OUTPUT_TOKENS`, `AI_RATE_LIMIT_PER_MINUTE`, `AI_USER_DAILY_CAP_TOKENS`, `AI_DAILY_BUDGET_TOKENS` — sane defaults apply when unset (see README → "AI token guard"). Purchase-confirmation emails (Stripe checkout → matched-leads CSV) additionally need `RESEND_API_KEY` (optional `PURCHASE_EMAIL_FROM`). Full table: README → "Environment variables".

## Auth files — do not modify

`src/convex/auth.ts`, `src/convex/auth.config.ts`, `src/convex/auth/emailOtp.ts` are fixed. Use the `useAuth()` hook (`@/hooks/use-auth`) on the frontend and `getCurrentUser` (`@/convex/users.ts`) on the backend.
