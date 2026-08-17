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
                                      ├── HTTP routes: /api/admin, /api/mcp, /api/n8n/source,
                                      │   /api/shared-thread(s), auth
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

**Auto-responder:** the website actively answers open Odysseus messages. Each Odysseus post (REST or MCP) schedules an immediate reply (~30s later, past the settle guard), with a 3-minute cron (`answer open shared threads`) as backstop — both run `src/convex/threadResponder.ts`: it finds threads whose latest message is an unanswered Odysseus `REQUEST`/`ESCALATION` or question, grounds a reply in real app data (the referenced lead/staged-source/buyer document, or the pipeline brief for `ops:` threads), and posts it as sender `website` with `metadata.auto: true` (shown as an "Auto" badge in the UI). Auto-replies never fabricate, never approve a deal, and defer owner-only decisions with the exact owner step named. It skips when the Toolkit "AI access" switch is off or `AI_BASE_URL` is unset; model is `OLLAMA_MODEL` (default `gpt-oss:20b`). See README → "Website auto-responder" below.

`sourceType` enum: `SHERIFF_SALE` \| `TAX_SALE` \| `AUCTION_COM` \| `PROBATE` \| `OFF_MARKET` \| `ASSESSOR` \| `RECORDER` \| `FORECLOSURE` \| `MARKETPLACE` \| `ASSOCIATION` \| `MANUAL` \| `SEED`.

Plus `authTables` from `@convex-dev/auth/server` (auth accounts/sessions/verification codes — do not edit).

> Note: a `leads` table also exists in MongoDB (`src/convex/mongodb.ts`). The Convex `leads` table predates the MongoDB migration; the live pipeline, admin API, and MCP server operate on the MongoDB `leads` collection.

---

## MongoDB collections

Managed from Convex actions (`src/convex/mongodb.ts`, `src/convex/admin.ts`).

| Collection | Contents |
| --- | --- |
| `leads` | Source-verified property leads: `propertyAddress`, `city`, `state`, `zip`, `county`, `parcelId?`, `ownerMailingAddress?`, `ownerNames?`, `ownerType?`, `ownerLookup?` (provider + source evidence), `sourceType`, `sourceUrl`, `sourceRef`, `sourceDate`, `distressScore`, `distressSignals[]`, `verificationStatus`, `pipelineStatus`, `fabricated` (true = tombstoned, never exportable), `absenteeOwner`, `needsSkipTrace`, `listedPhone`, `skipTrace?` (paid provider contact data), `arv?`, `repairs?`, `mao?`, `acquisitionPrice?`, `estimatedProfit?`, `dueDiligence?` (four evidence categories), `notes?`, `createdAt`, `updatedAt` |
| `hot_deals` | Paywalled hot-deals feed. Same shape as leads minus pipeline fields. Non-fabricated rows must be `VERIFIED` with `distressScore >= 80` |
| `buyers` | Buyer registry: `name`, `phone`, `email`, `budgetMin`, `budgetMax`, `targetAreas[]`, `exitType` (`ASSIGN`\|`FLIP`\|`BUY_HOLD`), `proofOfFundsStatus` (`NONE`\|`SELF_REPORTED`\|`VERIFIED`), `pofEvidenceRef?`, `purchaseHistory`, `listSource`, `intakeStatus` (`PENDING`\|`APPROVED`\|`REJECTED`), `verificationStatus`, `createdAt`, `updatedAt` |
| `property_matches` | Lead↔buyer matches: `leadId`, `buyerId`, `matchScore` (0–100), `buyBoxSummary`, `confidence` (`LOW`\|`MEDIUM`\|`HIGH`), `status` (`CANDIDATE`\|`APPROVED`\|`REJECTED`\|`CONTACTED`\|`CLOSED`), `rejectReason?`, `createdAt`, `updatedAt` |
| `import_staging` | Pending source/staging queue: `sourceType`, `rawJson`, `status` (`NEW`\|`NEEDS_EVIDENCE`\|`DUPLICATE`\|`REJECTED`\|`ARCHIVED`), `sourceUrl?`, `sourceRef?`, `sourceDate?`, `distressScore?`, `missingEvidence?`, `rejectReason?`, `aiCourtVerdict?`, `candidateLeadId?`, `createdAt`, `updatedAt`. A row written without complete source evidence is auto-flagged `NEEDS_EVIDENCE` (never `NEW`). Public buyer intake also lands here as `listSource: "PUBLIC_INTAKE"` |
| `promotion_audit` | Immutable promotion log: `stagingId`, `promotedBy`, `promotedAt`, `sourceUrl`, `sourceRef`, `sourceDate`, `distressScore` — written every time a staged row is promoted to a live lead |
| `tool_access` | Singleton doc `_id: "admin_tools"` — feature toggles (`scraperEnabled`, `estimatorEnabled`, `aiEnabled`, `automationEnabled`, `automationMode`, `dailyRunLimit`, `runsToday`, `usageDay`) |
| `automation_tasks` | Queued automation runs (`SCRAPE` / `ESTIMATE`, status `PENDING`\|`RUNNING`\|`COMPLETED`\|`FAILED`) |
| `integration_checks` | Health-check results for connected providers |

---

## HTTP API layer (`src/convex/http.ts`)

All HTTP routes live on the Convex site URL: `https://keen-aardvark-333.convex.site` (the `.convex.site` host of the deployment).

| Route | Method | Auth | Purpose |
| --- | --- | --- | --- |
| `/api/admin/...` | GET/POST/PATCH/PUT/DELETE | `Authorization: Bearer ADMIN_API_KEY` | Full CRUD over leads, buyers, matches, hot-deals, import-staging (below) |
| `/api/mcp` | GET/POST/OPTIONS | `Authorization: Bearer MCP_TOOL_SERVER_SECRET` or `x-mcp-api-key` header | MCP tool server for external AI agents (23 tools: `scrape_source`, `scrapegraph_extract`, `sitemap_discover`, `web_intel` (one-shot discovery + fetch/Firecrawl fallback + ScrapeGraphAI extraction over sitemap, Firecrawl, ScrapeGraphAI, and the owner-only Camofox escalation), `property_data`, `queue_source`, `list_pipeline`, `list_staged_sources`, `list_buyer_buy_boxes`, `list_match_board`, `estimate_deal`, `consultant_court`, `run_agent_team`, `list_pipeline_brief`, `semantic_search`, `skip_trace`, `owner_lookup`, `shared_threads_list`, `shared_thread_read`, `shared_thread_post`, …). Recommendations only — never approves |
| `/api/mcp/admin` | GET/POST/OPTIONS | `Authorization: Bearer ADMIN_API_KEY` or `x-admin-api-key` header | MCP tool server exposing the full admin CRUD surface as 20 tools (`admin_list_leads` / `admin_get_lead` / `admin_create_lead` / `admin_update_lead` / `admin_delete_lead`, and the same five for buyers, matches, hot-deals). Same server-side validation as `/api/admin` |
| `/api/shared-thread` | GET/POST | `Authorization: Bearer MCP_TOOL_SERVER_SECRET` | Shared-conversation REST API for Odysseus (below): read a thread, post as `odysseus` |
| `/api/shared-threads` | GET | `Authorization: Bearer MCP_TOOL_SERVER_SECRET` | List shared-conversation thread summaries; `?unanswered=1` returns only the open-message inbox (unanswered Odysseus requests) |
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
  - `import-staging`: `status` (`NEW`/`NEEDS_EVIDENCE`/`DUPLICATE`/`REJECTED`/`ARCHIVED`)
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
- **import-staging:** required `sourceType` + `rawJson` (any), `status` in `NEW`/`NEEDS_EVIDENCE`/`DUPLICATE`/`REJECTED`/`ARCHIVED`. **Evidence gate (NON-NEGOTIABLE #4):** promotion to a live lead requires all three of `sourceUrl` (valid HTTPS), `sourceRef` (non-empty citation), and `sourceDate` (ISO date ≤ today). A row written without complete evidence is auto-flagged `NEEDS_EVIDENCE`; filling all three flips it back to `NEW`. Promoting a `NEEDS_EVIDENCE` row is rejected with `Missing source evidence`. A computed `scoreMismatch` flag (`SCORE_MISMATCH`) is returned on list when the cited source contradicts `distressScore`. Every successful promotion writes an immutable `promotion_audit` entry.

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

## Admin MCP server (`/api/mcp/admin`)

The full admin CRUD surface as an MCP tool server, so an external agent (Odysseus, a worker script, an n8n flow) can create, read, update, and delete pipeline records through the MCP protocol without hand-building REST calls. Same protocol as `/api/mcp` (JSON-RPC 2.0 over Streamable HTTP: `initialize`, `ping`, `tools/list`, `tools/call`) and **the same secret as the admin REST API** — `Authorization: Bearer <ADMIN_API_KEY>` (canonical) or the `x-admin-api-key` header (for MCP clients that cannot set `Authorization`). Body limit 512 KB (matches `/api/admin`).

20 tools — the five below for each of `leads`, `buyers`, `matches`, and `hot-deals`:

| Tool family | Maps to | Notes |
| --- | --- | --- |
| `admin_list_<plural>` | `GET /api/admin/<plural>` | Optional filters per resource: `status`, `verificationStatus`, `minDistressScore`/`maxDistressScore`, `confidence`, `minMatchScore`, `limit` (1–500, default 200) |
| `admin_get_<singular>` | `GET /api/admin/<plural>/{id}` | `id` = MongoDB ObjectId string |
| `admin_create_<singular>` | `POST /api/admin/<plural>` | `data` object; validation identical to the REST API |
| `admin_update_<singular>` | `PATCH /api/admin/<plural>/{id}` | `id` + partial `data` patch (merged with existing) |
| `admin_delete_<singular>` | `DELETE /api/admin/<plural>/{id}` | Irreversible hard delete |

Concretely: `admin_list_leads`, `admin_get_lead`, `admin_create_lead`, `admin_update_lead`, `admin_delete_lead`, and the same five for `buyers`, `matches`, `hot_deals`. Every rule in `src/convex/admin.ts` applies unchanged — `sourceType: "SEED"` / `fabricated: true` tombstones are permanent, hot deals require `VERIFIED` with `distressScore >= 80`, matches require a verified + approved non-fabricated lead and an approved buyer, and all writes are validated server-side. Tool errors are returned as MCP tool results with `isError: true` and the same message the REST API would return.

**Smoke test:**

```bash
curl -X POST https://keen-aardvark-333.convex.site/api/mcp/admin \
  -H "Authorization: Bearer $ADMIN_API_KEY" -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

---

## Shared conversation REST API (`/api/shared-thread`)

Plain REST alternative to the MCP `shared_thread_*` tools so Odysseus (or a worker agent script) can join a thread with a simple HTTP call — no MCP client needed. Same secret and server-side sender rule as the MCP tools: `Authorization: Bearer <MCP_TOOL_SERVER_SECRET>`, and messages are always stored with `sender: "odysseus"` — the website can never spoof the agent. Body limit 32 KB.

### Endpoints

- `GET /api/shared-thread?threadId=deal:<leadId>&limit=50` — read one thread, oldest first (`limit` 1–500, default 500).
- `GET /api/shared-threads?limit=100` — list thread summaries (message count, last sender/kind, preview; `limit` 1–100, default 100).
- `GET /api/shared-threads?unanswered=1` — the **inbox**: only threads whose latest message is an unanswered Odysseus `REQUEST`/`ESCALATION`/question, newest first (`limit` 1–50). This is the low-friction polling surface for "is there anything waiting for me right now".
- `POST /api/shared-thread` — post as Odysseus. Body: `{ "threadId": string, "content": string, "kind"?: "MESSAGE"|"REQUEST"|"ESCALATION"|"RESOLUTION", "refs"?: string[] }`. Returns `201 { "ok": true, "messageId": "…", "sender": "odysseus" }`.

**Webhook notification.** When Odysseus posts an **error/problem** (`ESCALATION` by default), the backend fires a best-effort `POST` to `ODYSSEUS_NOTIFY_WEBHOOK_URL` (if set) with `{ event: "odysseus_post", threadId, kind, messageId, refs, contentPreview, sentAt }`, so an external system (n8n → email/Slack, or the owner's own endpoint) can alert without polling. Routine `MESSAGE`/`REQUEST`/`RESOLUTION` posts do **not** notify. Override the kinds with `ODYSSEUS_NOTIFY_KINDS` (comma-separated). A failed webhook never fails the post itself.

A ready-to-import n8n workflow that emails the owner on each escalation is committed at `docs/n8n-odysseus-notify.json` (adapted from the [Zie619 n8n-workflows](https://github.com/zie619/n8n-workflows) collection). Import it, select a Gmail OAuth2 credential on the "Email owner" node, activate it, and set `ODYSSEUS_NOTIFY_WEBHOOK_URL` to its production webhook URL (`…/webhook/odysseus-post`).

Thread ids follow the shared convention: `deal:<leadId>`, `task:<stagedId>`, `buyer:<buyerId>`, `ops:<topic>`. Never post secrets or unnecessary PII — both sides read the full thread.

```bash
# Read a thread
curl "https://keen-aardvark-333.convex.site/api/shared-thread?threadId=deal:abc123&limit=50" \
  -H "Authorization: Bearer $MCP_TOOL_SERVER_SECRET"

# List open threads
curl "https://keen-aardvark-333.convex.site/api/shared-threads?limit=100" \
  -H "Authorization: Bearer $MCP_TOOL_SERVER_SECRET"

# Escalate a blocked due-diligence gate as Odysseus
curl -X POST https://keen-aardvark-333.convex.site/api/shared-thread \
  -H "Authorization: Bearer $MCP_TOOL_SERVER_SECRET" -H "content-type: application/json" \
  -d '{ "threadId": "deal:abc123", "kind": "ESCALATION", "content": "SALE_HISTORY cannot be verified from here: no comps in 12 months within 3 miles. Can the website pull RentCast comps?", "refs": ["abc123"] }'
```

---

## Website auto-responder (answers Odysseus in threads)

The website actively responds to Odysseus's open messages instead of leaving every thread to the owner. Every Odysseus post (REST `POST /api/shared-thread` or MCP `shared_thread_post`) schedules an immediate responder run ~30s later (just past the 20s settle guard), and a Convex cron (`answer open shared threads`, every 3 minutes) is the backstop — both run `src/convex/threadResponder.ts`:

- **Trigger:** a thread whose latest message is an unanswered Odysseus `REQUEST`, `ESCALATION`, or a question (content ends with `?`). Messages younger than 20s are skipped so message bursts settle; the newest few open threads are answered per run (max 3 by default).
- **Grounding:** the reply is generated from real app data only — the referenced document for `deal:<leadId>` / `task:<stagedId>` / `buyer:<buyerId>` threads (read via the admin read path; buyer summaries are PII-free), or the live pipeline brief + staging queue + match board for `ops:` threads. It never invents PII, prices, comps, distress, or verification status; missing data is named as missing and owner-only decisions are deferred to the owner with the exact step needed.
- **Delivery:** replies are posted as sender `website`, kind `MESSAGE`, with `metadata.auto: true` (the `/shared-conversation` UI shows an "Auto" badge). Auto-replies never approve a deal and never claim verification.
- **Gates:** the cron skips cleanly when the owner's Toolkit "AI access" switch is off (same gate as the MCP tools and consultant court). When AI access is on, it replies with the AI gateway (`OLLAMA_MODEL`, default `gpt-oss:20b`, via `AI_BASE_URL`) if configured, otherwise with a **deterministic grounded reply** built from live app data — so Odysseus gets an answer every run even without a reachable AI gateway.
- **Owner controls:** enable "AI access" in `/toolkit` to turn auto-replies on. The `/shared-conversation` page adds a "Run auto-responder" button (owner-only, runs the same scan immediately) and an "Ask the website to answer" button on the latest open Odysseus message.

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
| `MCP_TOOL_SERVER_SECRET` | ✅ (if using MCP or shared thread API) | Bearer / `x-mcp-api-key` for `/api/mcp` and `/api/shared-thread(s)` |
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
| `SKIPTRACE_API_KEY` | Skip trace (optional, paid) | Searchbug API password (`PASS`) for the reverse-address people search. Phone numbers are licensed per-record and need a funded Searchbug prepaid balance |
| `SKIPTRACE_ACCOUNT_ID` | Skip trace (optional, paid) | Searchbug account/company code (`CO_CODE`) for the reverse-address people search |
| `AI_BASE_URL` | AI features | OpenAI-compatible AI gateway base for chat (consultant court + local agents) and embeddings. Default `https://localhost:20128/v1` (local OmniRoute). Chat no longer calls Ollama Cloud directly — `OLLAMA_API_KEY` is not used |
| `ODYSSEUS_NOTIFY_WEBHOOK_URL` | optional | When set, the backend `POST`s an `odysseus_post` event to this URL whenever Odysseus posts a notifying kind (default: `ESCALATION` only; best-effort, 5s timeout). Point it at n8n/Slack/email |
| `ODYSSEUS_NOTIFY_KINDS` | optional | Comma-separated message kinds that trigger the notify webhook (default `ESCALATION`, e.g. `ESCALATION,REQUEST`). Set it so you are only pinged for the problems you care about |
| `AI_API_KEY` | optional | Bearer key sent to the AI gateway (some local gateways expect one) |
| `OLLAMA_MODEL` | optional | Chat model-name selector routed through the gateway (default `gpt-oss:20b`) |
| `OLLAMA_COURT_MODEL` | optional | Court model-name selector (wins over `OLLAMA_MODEL`) |

### Owner enrichment (free) vs. skip trace (paid)

Two contact-data paths, both stored with source evidence and never invented:

- **Owner enrichment — free.** The "Pull owner" button (and the MCP tool `owner_lookup`) reads the current owner's **name, entity type, and mailing address** from RentCast's `/properties` record (sourced from public county records) using the existing `RENTCAST_API_KEY`. No per-record fee. It writes `ownerNames`, `ownerType`, `ownerMailingAddress`, `ownerLookup` (provider + source URL/date), and `absenteeOwner` (owner-occupied = false) onto the lead. Mailing address is the TCPA-safe outreach channel (direct mail).
- **Skip trace — paid.** Phone numbers are licensed per-record and cannot be sourced free. The "Run skip trace" button / `skip_trace` MCP tool calls Searchbug (requires a funded prepaid balance via `SKIPTRACE_API_KEY` + `SKIPTRACE_ACCOUNT_ID`), and free manual lookups are available as TruePeopleSearch / PeopleFinders deep-links on the lead dossier. Owner approval still gates any dial/export.

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
4. `POST /api/mcp/admin` with the same JSON-RPC body and `Authorization: Bearer $ADMIN_API_KEY` returns the 20-tool admin manifest.
5. Sign in with email OTP on the deployed site.

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
- **Collaborating mid-task:** `shared_thread_post` (post as Odysseus), `shared_thread_read` (full thread), `shared_threads_list` (find threads) via MCP — or the plain REST endpoints `POST/GET /api/shared-thread` and `GET /api/shared-threads` (same `MCP_TOOL_SERVER_SECRET`, no MCP client needed). Post a `REQUEST`/`ESCALATION` whenever you hit something outside your strengths — missing data, blocked gates, unknown sources, or owner-judgment steps — instead of handling it alone. Threads never approve deals.
- **Writing data:** use the admin API above with `ADMIN_API_KEY` (create/update leads, buyers, matches, hot-deals, staging). Approvals are owner-only; the API validates every shape server-side.
- **Code fixes + redeploy:** push to `main` on `github.com/joopyjiop/deal-pipeline-pro`; the Render static site auto-redeploys, and `npx convex deploy` updates the backend. Run `bun tsc -b --noEmit && bun test tests` before pushing.
- **This README is the source of truth** for the schema, admin API, env vars, and deployment. When you change the live app, update the relevant sections here in the same change.
