---
name: n8n-official-lead-runs
description: Use when designing or reviewing n8n workflows that schedule Deal Pipeline Pro source crawls, pace requests, handle failures, deduplicate sources, and verify per-lead database writes.
---

# Official n8n patterns for Deal Pipeline Pro

Use the official n8n skill family from `n8n-io/skills` when building the external workflow. The workflow must remain bounded, observable, and permission-aware.

## Recommended workflow

1. **Schedule Trigger** — choose the recurring interval in n8n. Do not create an in-app infinite loop.
2. **Seed Data** — keep a small, owner-reviewed list of complete public domains and source types. Never seed individual listings as the normal input.
3. **Data Table deduplication** — store a normalized source URL, source type, last-attempted time, next-eligible time, and idempotency key.
4. **Loop Over Items** — process one source at a time.
5. **Wait** — pause between sources and between retries. Use a conservative delay rather than concurrent requests.
6. **HTTP Request** — call the authenticated queue endpoint:
   `POST /api/n8n/source`
   with `x-convex-n8n-secret` and `{ url, sourceType, idempotencyKey }`.
7. **Wait** — allow the bounded Convex worker to process the queue before triggering the next cycle.
8. **Cycle trigger** — call the authenticated run endpoint once it exists; never start overlapping cycles.
9. **Result inspection** — require a structured run result containing `runId`, `processed`, `failed`, `leadsFound`, `leadsWritten`, `leadWrites`, and `warning`.
10. **Per-lead verification** — treat each `leadWrites[]` entry as its own outcome. Log its non-sensitive identifying details, status, and error if present.
11. **Warning branch** — visibly alert when `leadsFound === 0`, `leadsWritten === 0`, or any individual write has `status === "FAILURE"`.
12. **Error Trigger** — route transport errors, authentication errors, HTTP 4xx/5xx responses, and malformed result bodies to a failure log. Do not report a successful run merely because the workflow did not crash.

## Safety rules

- Use only public, permitted sources and respect robots, rate limits, access controls, and site terms.
- Do not use anti-bot bypasses, CAPTCHA solving, login-wall circumvention, or fabricated fallback data.
- Camofox/Firecrawl output is evidence for owner review, not automatic approval.
- Never put MongoDB credentials, Convex deploy keys, or provider API keys in Code nodes or URLs.
- Use n8n credentials or environment-backed secrets, and keep `CONVEX_N8N_WEBHOOK_SECRET` server-side.
- Preserve idempotency so retries do not duplicate tasks or leads.
- A lead is not considered written until the backend reads it back and records `SUCCESS` for that specific lead.

## Pacing defaults

Start conservatively:

- one source at a time;
- at least 10–30 seconds between source requests, adjusted to the site's published limits;
- one Convex cycle at a time;
- bounded page/task caps;
- exponential backoff for 429, 502, 503, and 504 responses;
- stop the run after repeated failures and emit a visible warning.

These are starting points, not permission to exceed a site's rules.
