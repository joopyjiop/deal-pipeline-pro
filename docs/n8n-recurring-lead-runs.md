# n8n recurring lead runs

This playbook applies the official `n8n-io/skills` guidance to Deal Pipeline Pro.

## Workflow shape

```text
Schedule Trigger
  -> seed Data Table
  -> deduplicate / eligibility check
  -> Loop Over Items
  -> Wait (pacing)
  -> POST /api/n8n/source
  -> Wait for bounded processing
  -> run-cycle request
  -> inspect per-lead write results
  -> success or visible warning branch
```

The seed table should contain complete public domains, source type, target location/criteria, and an owner-approved idempotency key. For a blocked full-domain source, use the established buyer-first fallback only after permitted alternatives fail and only with explicit buyer criteria.

## Required result contract

Every run should produce:

- `runId`
- `processed`
- `failed`
- `leadsFound`
- `leadsWritten`
- `leadWrites[]`
- `warning` when no lead was found/written or a write failed

Each `leadWrites[]` record should include the lead ID, property/source identifier, `SUCCESS` or `FAILURE`, and an error when applicable. Do not log seller phone, email, or other unnecessary PII in n8n.

## Current boundary

The repository currently exposes the authenticated source queue at `/api/n8n/source`. The durable cycle-result endpoint and backend per-lead write audit still need to be completed before activating an unattended recurring workflow. Do not configure n8n to claim success from the queue response alone.
