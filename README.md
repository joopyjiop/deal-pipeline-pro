# Deal Pipeline Pro

Full-stack wholesale real-estate deal-finding and deal-making platform. It sources **real, verified** property leads from public records (sheriff sales, tax sales, auctions, probate, assessor/recorder records), runs full underwriting (rent estimates, cash flow, DSCR, ARV, repairs), matches buyers against approved deals with confidence scoring, and exposes both a human dashboard and machine endpoints (admin REST API + MCP tool server) so external AI agents can review and maintain the pipeline.

**Non-negotiables:** no fabricated PII ever reaches export or dial paths. Rows flagged `fabricated: true` (old AI/seed rows) are tombstoned and excluded from every feed, search, export, and match. Every live lead carries a source URL, source reference, and source date. Agent recommendations never approve a lead — the owner does.

---

## Repository & version control

- Remote: `https://github.com/joopyjiop/deal-pipeline-pro.git`
- Branch: `main`
- The Freebuff/Vly platform manages version control for this project. `git` commands are blocked from the sandbox terminal; pushes are handled by the platform's own sync. When a worker agent needs to push from its own environment, it can use the remote above directly.

---

## Tech stack

- **Frontend:** Vite + TypeScript + React 19 + React Router v7 (`react-router`) + Tailwind v4 + shadcn/ui + Lucide icons + Framer Motion
- **Backend:** Convex (functions, auth, crons) — see `src/convex/`
- **Primary data store:** MongoDB (leads, buyers, matches, hot deals, staging) — accessed from Convex actions via `MONGODB_URI`
- **Auth:** Convex Auth (email OTP + anonymous)
- **Package manager:** Bun (`bun install`, `bun test`, `bun run build`)
- **AI:** every model call (consultant court, local-agents chat, semantic-search embeddings) routes through the OpenAI-compatible AI gateway via `AI_BASE_URL` (default: local OmniRoute at `https://localhost:20128/v1`, optional `AI_API_KEY` bearer). Embedding model: `text-embedding-3-small`
- **Data providers:** RentCast (property data/rent/AVM), Firecrawl (crawl), ScrapeGraphAI (extract), Camofox browser proxy (anti-detection fetch), n8n (recurring source runs)

---

## Architecture

```text
Browser (React) ── Convex client ──> Convex Cloud (keen-aardvark-333)
                                      ├── queries/mutations/actions (src/convex/*)
                                      ├── HTTP routes: /api/admin, /api/mcp, /api/n8n/source, auth
                                      └── crons (src/convex/crons.ts)
                                              │
                                      MongoDB (MONGODB_URI): leads, hot_deals, buyers,
                                      property_matches, import_staging, tool_access,
                                      automation_tasks, integration_checks
```

The Convex `users`, `appSettings`, and a `leads` table live in Convex itself (see below); the operational pipeline data lives in MongoDB.

---

## Convex schema (`src/convex/schema.ts`)

Defined with `defineSchema`; `schemaValidation: false`. Every table has `_id` and `_creationTime` automatically.

| Table | Fields | Indexes |
| --- | --- | --- |
| `users` | `name?`, `image?`, `email?`, `emailVerificationTime?`, `isAnonymous?`, `role?` (`admin` \| `user` \| `member`) | `email` |
| `appSettings` | `key`, `value`, `updatedAt` | `by_key` (`key`) |
| `leads` | `propertyAddress`, `city`, `state`, `zip`, `county`, `parcelId?`, `ownerMailingAddress?`, `sourceType` (enum), `sourceUrl`, `sourceRef`, `sourceDate`, `distressScore` (0–100), `distressSignals[]` (`{type, weight, evidence, verified, sourceUrl, sourceDate}`), `verificationStatus` (`UNVERIFIED`\|`PARTIAL`\|`VERIFIED`), `pipelineStatus` (`SOURCED`\|`CRITIQUED`\|`VERIFIED`\|`APPROVED`\|`REJECTED`), `fabricated`, `absenteeOwner`, `needsSkipTrace`, `listedPhone`, `lastVerifiedAt`, `arv?`, `repairs?`, `mao?`, `notes?`, `createdAt`, `updatedAt` | `by_pipeline_status`, `by_verification_status`, `by_source_type`, `by_parcel_id` |
| `sharedConversations` | `threadId` (conversation/task ref, e.g. `deal:<leadId>`), `sender` (`website` \| `odysseus`), `kind` (`MESSAGE` \| `REQUEST` \| `ESCALATION` \| `RESOLUTION`), `content`, `refs?[]`, `metadata?`, `sentAt` (ms epoch) | `by_thread` (`threadId`), `by_thread_time` (`threadId`, `sentAt`) |

`sharedConversations` is the mid-task collaboration thread between the website and the external Odysseus harness. The website writes via the owner-gated `postSharedMessage` mutation and reads via `getSharedThread`/`listSharedThreads` (UI: `/shared-conversation`); Odysseus writes/reads via the MCP tools `shared_thread_post` / `shared_thread_read` / `shared_threads_list`. Sender is forced server-side — the website can never impersonate Odysseus and vice versa. Protocol: either side posts `REQUEST`/`ESCALATION` when it hits something outside its strengths (see `src/convex/sharedConversation.ts` and `docs/odysseus-briefing.md`).

`sourceType` enum: `SHERIFF_SALE` \| `TAX_SALE` \| `AUCTION_COM` \| `PROBATE` \| `OFF_MARKET` \| `ASSESSOR` \| `RECORDER` \| `MANUAL` \| `SEED`.

Plus `authTables` from `@convex-dev/auth/server` (auth accounts/sessions/verification codes — do not edit).

> Note: a `leads` table also exists in MongoDB (`src/convex/mongodb.ts`). The Convex `leads` table predates the MongoDB migration; the live pipeline, admin API, and MCP server operate on the MongoDB `leads` collection.

---

## MongoDB collections

Managed from Convex actions (`src/convex/mongodb.ts`, `src/convex/admin.ts`).

| Collection | Contents |
| --- | --- |
| `leads` | Source-verified property leads: `propertyAddress`, `city`, `state`, `zip`, `county`, `parcelId?`, `ownerMailingAddress?`, `sourceType`, `sourceUrl`, `sourceRef`, `sourceDate`, `distressScore`, `distressSignals[]`, `verificationStatus`, `pipelineStatus`, `fabricated` (true = tombstoned, never exportable), `absenteeOwner`, `needsSkipTrace`, `listedPhone`, `arv?`, `repairs?`, `mao?`, `acquisitionPrice?`, `estimatedProfit?`, `dueDiligence?` (four evidence categories), `notes?`, `createdAt`, `updatedAt` |
| `hot_deals` | Paywalled hot-deals feed. Same shape as leads minus pipeline fields. Non-fabricated rows must be `VERIFIED` with `distressScore >= 80` |
| `buyers` | Buyer registry: `name`, `phone`, `email`, `budgetMin`, `budgetMax`, `targetAreas[]`, `exitType` (`ASSIGN`\|`FLIP`\|`BUY_HOLD`), `proofOfFundsStatus` (`NONE`\|`SELF_REPORTED`\|`VERIFIED`), `pofEvidenceRef?`, `purchaseHistory`, `listSource`, `intakeStatus` (`PENDING`\|`APPROVED`\|`REJECTED`), `verificationStatus`, `createdAt`, `updatedAt` |
| `property_matches` | Lead↔buyer matches: `leadId`, `buyerId`, `matchScore` (0–100), `buyBoxSummary`, `confidence` (`LOW`\|`MEDIUM`\|`HIGH`), `status` (`CANDIDATE`\|`APPROVED`\|`REJECTED`\|`CONTACTED`\|`CLOSED`), `rejectReason?`, `createdAt`, `updatedAt` |
| `import_staging` | Pending source/staging queue: `sourceType`, `rawJson`, `status` (`NEW`\|`DUPLICATE`\|`REJECTED`), `rejectReason?`, `aiCourtVerdict?`, `candidateLeadId?`, `createdAt`, `updatedAt`. Public buyer intake also lands here as `listSource: "PUBLIC_INTAKE"` |
| `tool_access` | Singleton doc `_id: "admin_tools"` — feature toggles (`scraperEnabled`, `estimatorEnabled`, `aiEnabled`, `automationEnabled`, `automationMode`, `dailyRunLimit`, `runsToday`, `usageDay`) |
| `automation_tasks` | Queued automation runs (`SCRAPE` / `ESTIMATE`, status `PENDING`\|`RUNNING`\|`COMPLETED`\|`FAILED`) |
| `integration_checks` | Health-check results for connected providers |

---

## HTTP API layer (`src/convex/http.ts`)

All HTTP routes live on the Convex site URL: `https://keen-aardvark-333.convex.site` (the `.convex.site` host of the deployment).

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/admin/...` | GET/POST/PATCH/PUT/DELETE | `Authorization: Bearer ADMIN_API_KEY` | Full CRUD over leads, buyers, matches, hot-deals, import-staging (below) |
| `/api/mcp` | GET/POST/OPTIONS | `Authorization: Bearer MCP_TOOL_SERVER_SECRET` or `x-mcp-api-key` header | MCP tool server for external AI agents (20 tools: `scrape_source`, `scrapegraph_extract`, `sitemap_discover`, `property_data`, `queue_source`, `list_pipeline`, `list_staged_sources`, `list_buyer_buy_boxes`, `list_match_board`, `estimate_deal`, `consultant_court`, `run_agent_team`, `list_pipeline_brief`, `semantic_search`, `shared_threads_list`, `shared_thread_read`, `shared_thread_post`, …). Recommendations only — never approves |
| `/api/n8n/source` | POST | `x-convex-n8n-secret: CONVEX_N8N_WEBHOOK_SECRET` | Queue a public source URL for automated processing (n8n recurring runs) |
| `/api/auth/*` | — | Convex Auth | Email OTP + anonymous sign-in |

---

## Admin API (`/api/admin`)

Owner-only write surface for worker agents and integrations. **Every request must send `Authorization: Bearer <ADMIN_API_KEY>`** (constant-time compared server-side). Body limit 512 KB. All mutations are enforced server-side — the UI never bypasses this layer.

### Resources and operations

| Resource | LIST (GET no id) | GET (by id) | CREATE (POST) | UPDATE (PATCH/PUT by id) | DELETE (by id) |
| --- | --- | --- | --- | --- | --- |
| `leads` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `buyers` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `matches` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `hot-deals` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `import-staging` | ✅ | ✅ | ✅ | ✅ | ✅ |
| `users` | ✅ | ❌ read-only by design (no role/email edits over HTTP) | ❌ | ❌ | ❌ |

### Endpoint shapes

- `GET /api/admin/{resource}` — list (max 500 rows, default 200). Query filters:
  - All: `limit`
  - `leads`: `status` (pipelineStatus), `verificationStatus`, `minDistressScore`, `maxDistressScore`
  - `hot-deals`: `status` (verificationStatus), `minDistressScore`
  - `buyers`: `status` (intakeStatus), `proofOfFundsStatus`
  - `matches`: `status`, `confidence`, `minMatchScore`
  - `import-staging`: `status`
- `GET /api/admin/{resource}/{id}` — one document (`_id` is the MongoDB ObjectId as a string)
- `POST /api/admin/{resource}` — create; body is the document (without `_id`/`createdAt`/`updatedAt`, which are managed)
- `PATCH /api/admin/{resource}/{id}` (or `PUT`) — partial merge update; body is the fields to change
- `DELETE /api/admin/{resource}/{id}` — hard delete

### Response shapes

```jsonc
// LIST
{ "resource": "leads", "count": 2, "data": [ /* docs */ ] }
// GET / CREATE / UPDATE
{ "resource": "leads", "id": "64f1…", "data": { /* doc */ } }
// DELETE
{ "resource": "leads", "id": "64f1…", "deleted": true }
```

Errors: `401` unauthorized · `400` bad filter/body · `404` unknown resource or missing doc · `405` unsupported method/route shape · `413` body too large · `422` validation failure. ObjectIds and Dates are serialized to strings/ISO in responses.

### Validation rules (enforced in `src/convex/admin.ts`)

- **leads:** required `propertyAddress`, `city`, `state`, `zip`, `county`, `sourceType`, `sourceUrl`, `sourceRef`, `sourceDate`, `distressScore` (0–100), `distressSignals[]` (each with `type`, `weight`, `evidence`, `verified`, `sourceUrl`, `sourceDate`), `verificationStatus`, `pipelineStatus`. `sourceType: "SEED"` forces `fabricated: true`; a row already `fabricated: true` can never be un-tombstoned.
- **hot-deals:** same base shape; non-fabricated rows must be `verificationStatus: "VERIFIED"` with `distressScore >= 80`.
- **buyers:** required `name`, `phone`, `email`, `listSource`, `budgetMin <= budgetMax` (both ≥ 0), `targetAreas[]`, `exitType`, `proofOfFundsStatus`, `intakeStatus`, `verificationStatus`. `proofOfFundsStatus: "VERIFIED"` requires `pofEvidenceRef`.
- **matches:** required `leadId`, `buyerId`, `buyBoxSummary`, `matchScore` (0–100), `confidence`, `status`. The lead must exist, be non-fabricated, `APPROVED` and `VERIFIED`; the buyer must be `intakeStatus: "APPROVED"`. `confidence: "HIGH"` requires the buyer to have verified proof of funds.
- **import-staging:** required `sourceType` + `rawJson` (any), `status` in `NEW`/`DUPLICATE`/`REJECTED`.

### Examples

```bash
# Create a lead (worker agent)
curl -X POST https://keen-aardvark-333.convex.site/api/admin/leads \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{
    "propertyAddress": "5500 Grand Lake Dr", "city": "San Antonio", "state": "TX",
    "zip": "78244", "county": "Bexar", "sourceType": "SHERIFF_SALE",
    "sourceUrl": "https://www.bexar.org/sheriff-sales/", "sourceRef": "2026-CF-00123",
    "sourceDate": "2026-08-01", "distressScore": 72,
    "distressSignals": [{ "type": "PRE_FORECLOSURE", "weight": 72, "evidence": "Listed in official sheriff sale schedule.", "verified": true, "sourceUrl": "https://www.bexar.org/sheriff-sales/", "sourceDate": "2026-08-01" }],
    "verificationStatus": "PARTIAL", "pipelineStatus": "SOURCED",
    "absenteeOwner": false, "needsSkipTrace": true, "listedPhone": false
  }'

# Approve a buyer's intake
curl -X PATCH https://keen-aardvark-333.convex.site/api/admin/buyers/<id> \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{ "intakeStatus": "APPROVED" }'

# List verified, approved leads
curl "https://keen-aardvark-333.convex.site/api/admin/leads?status=APPROVED&verificationStatus=VERIFIED&limit=50" \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

---

## Environment variables

### Client / build-time (`src/lib/convex-url.ts`)

| Variable | Purpose |
| --- | --- |
| `VITE_CONVEX_URL` | Convex URL injected by the Freebuff platform for its sandbox deployment. **Not used at runtime** — the app hardcodes the owner deployment. |
| `VITE_CONVEX_URL_OVERRIDE` | Escape hatch for self-hosted builds (Render/Vercel/etc.). When set, the browser talks to this Convex deployment instead of the default. |

### Server-side (Convex Keys panel / environment)

Set in the Convex dashboard (or `npx convex env set`). Never in the browser bundle.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | ✅ | MongoDB connection string for the primary data store. A Convex-stored fallback (`mongoUri` setting) is used when the env var is absent/unreachable |
| `ADMIN_API_KEY` | ✅ (if using admin API) | Bearer key for `/api/admin/*` |
| `MCP_TOOL_SERVER_SECRET` | ✅ (if using MCP) | Bearer / `x-mcp-api-key` for `/api/mcp` |
| `CONVEX_N8N_WEBHOOK_SECRET` | n8n only | `x-convex-n8n-secret` for `/api/n8n/source` |
| `JWKS` | auth | Auth JSON Web Key Set |
| `JWT_PRIVATE_KEY` | auth | Auth JWT signing key |
| `SITE_URL` | auth | Canonical app URL used by Convex Auth |
| `VLY_EMAIL_API_KEY` | optional | Freebuff email-OTP relay key (has a built-in fallback; env var wins) |
| `VLY_APP_NAME` | optional | App name shown in OTP emails |
| `RENTCAST_API_KEY` | RentCast features | RentCast property/rent/AVM data |
| `CAMOFOX_BASE_URL` | Camofox features | Base URL of the camofox browser proxy (default `https://camofox-browser-h1ib.onrender.com`) |
| `CAMOFOX_API_KEY` | Camofox features | Bearer key for the camofox proxy |
| `SGAI_API_KEY` | ScrapeGraphAI | `SGAI-APIKEY` header for `v2-api.scrapegraphai.com` |
| `FIRECRAWL_API_KEY` | Firecrawl | Firecrawl API key |
| `AI_BASE_URL` | AI features | OpenAI-compatible AI gateway base for chat (consultant court + local agents) and embeddings. Default `https://localhost:20128/v1` (local OmniRoute). Chat no longer calls Ollama Cloud directly — `OLLAMA_API_KEY` is not used |
| `AI_API_KEY` | optional | Bearer key sent to the AI gateway (some local gateways expect one) |
| `OLLAMA_MODEL` | optional | Chat model-name selector routed through the gateway (default `gpt-oss:20b`) |
| `OLLAMA_COURT_MODEL` | optional | Court model-name selector (wins over `OLLAMA_MODEL`) |

---

## Deployment

### Current hosting

The app currently runs on the Freebuff platform, which manages the dev server and the Convex dev process (`keen-aardvark-333`). The Convex deployment is the production backend; its env vars live in the Convex dashboard's Environment Variables panel.

### Self-hosted: Render (end-to-end)

The stack has two deployable parts: the Convex backend (Convex Cloud, not Render) and the static Vite frontend (Render). A companion camofox browser proxy is an optional third service.

**1. Backend — Convex Cloud**
- Push backend changes: `npx convex deploy` (from a machine with Convex auth) or wire it into CI with `CONVEX_DEPLOYMENT` + a deploy token.
- Set every server-side env var above in **Convex dashboard → Settings → Environment Variables** (`npx convex env set KEY value` also works).
- HTTP routes are served automatically at `https://keen-aardvark-333.convex.site`.

**2. Frontend — Render Static Site**
- In Render: **New → Static Site** → connect `github.com/joopyjiop/deal-pipeline-pro`.
- **Build command:** `bun install && bun run build` (fallback: `npm ci && npm run build` — the build script is `tsc -b && vite build`).
- **Publish directory:** `dist`.
- **Environment:** set `VITE_CONVEX_URL_OVERRIDE=https://keen-aardvark-333.convex.cloud` so the deployed bundle talks to the production Convex deployment.
- **Auto-deploy:** enable auto-deploy on `main` — every push to the repo rebuilds and redeploys the site (this is the redeploy path for worker agents).

**3. Optional — Camofox browser proxy (Render Web Service)**
- The camofox-browser service (`https://camofox-browser-h1ib.onrender.com`) is a separate Render web service. Point `CAMOFOX_BASE_URL` and `CAMOFOX_API_KEY` at it from the Convex deployment.

**Post-deploy verification**
1. `GET https://{your-site}.onrender.com` loads the landing page.
2. `GET https://keen-aardvark-333.convex.site/api/admin/leads?limit=1` with `Authorization: Bearer $ADMIN_API_KEY` returns 200 (or 401 without the key).
3. `POST /api/mcp` with `{ "jsonrpc": "2.0", "method": "tools/list", "id": 1 }` returns the tool manifest.
4. Sign in with email OTP on the deployed site.

---

## Local development

```bash
bun install        # install dependencies
bun convex dev     # run the Convex dev backend (generates src/convex/_generated)
bun run dev        # run the Vite dev server
```

Verification commands (run before finishing any change):

```bash
bun tsc -b --noEmit   # typecheck
bun test tests        # unit tests (Bun test runner)
bun run lint          # ESLint
```

After touching anything under `src/convex/`, regenerate types first: `bun convex dev --once`, then typecheck. Never hand-edit `src/convex/_generated/*`.

---

## Testing

Unit tests live in `tests/` and run with Bun's test runner (they live outside `src/convex/` so the Convex bundle never sees `bun:test`). Coverage includes: coordinated agent team, embeddings/cosine ranking, RentCast client, ScrapeGraphAI, sitemap discovery, search ranking, underwriting, and reference extraction.

---

## Code conventions (keep these)

- **Auth:** use the `useAuth()` hook from `@/hooks/use-auth` on the frontend; `getCurrentUser` from `@/convex/users.ts` on the backend. Never modify `src/convex/auth.ts`, `src/convex/auth.config.ts`, or `src/convex/auth/emailOtp.ts`.
- **Owner gate:** every write action requires the permanent owner — `requirePermanentOwner` (`src/convex/owner.ts`) for Convex tables, `requireOwner`/`isOwnerIdentity` (`src/convex/mongodb.ts`) for MongoDB actions. The owner check is server-side, never just UI.
- **Convex:** `_id` for document IDs, `Id<"Table">` for their types, `Doc<"Table">` for documents. Imports use `@/convex/...`. No return-type validators. External network calls must be actions with `"use node"` at the top; queries/mutations live in separate files.
- **Frontend:** pages in `src/pages`, shadcn primitives in `src/components/ui`, mobile-responsive, `cursor-pointer` on clickables, no nested cards/shadows, toasts via `sonner`, Framer Motion for animation.
- **Data honesty:** never invent PII, never fabricate evidence, never set `fabricated: false` on a tombstoned row, and never bypass the owner-approval step. Missing data is flagged as missing, never guessed.

---

## Agent handoff (Odysseus & worker agents)

- **Reviewing deals:** use the MCP server at `POST https://keen-aardvark-333.convex.site/api/mcp` with `MCP_TOOL_SERVER_SECRET` (`tools/list` → `list_pipeline`, `list_pipeline_brief`, `run_agent_team`, `consultant_court`, `semantic_search`, …). The MCP surface is read/recommend only.
- **Collaborating mid-task:** `shared_thread_post` (post as Odysseus), `shared_thread_read` (full thread), `shared_threads_list` (find threads). Post a `REQUEST`/`ESCALATION` whenever you hit something outside your strengths — missing data, blocked gates, unknown sources, or owner-judgment steps — instead of handling it alone. Threads never approve deals.
- **Writing data:** use the admin API above with `ADMIN_API_KEY` (create/update leads, buyers, matches, hot-deals, staging). Approvals are owner-only; the API validates every shape server-side.
- **Code fixes + redeploy:** push to `main` on `github.com/joopyjiop/deal-pipeline-pro`; the Render static site auto-redeploys, and `npx convex deploy` updates the backend. Run `bun tsc -b --noEmit && bun test tests` before pushing.
- **This README is the source of truth** for the schema, admin API, env vars, and deployment. When you change the live app, update the relevant sections here in the same change.
