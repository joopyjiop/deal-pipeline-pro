---
name: agentwiki
description: Use when turning project decisions, operational procedures, repository findings, or integration notes into durable, searchable documentation.
---

# AgentWiki guidance

Source repository: https://github.com/nextlevelbuilder/agentwiki-skills

Use this skill to capture durable project knowledge without replacing the repository's source of truth. Documentation should help a future agent or owner understand what was decided, why it was decided, and how to verify it.

## Capture format

For each important topic, record:

- **Context:** the feature, incident, or decision that prompted the note.
- **Decision:** the current supported behavior.
- **Constraints:** security, ownership, compliance, rate limits, and deployment boundaries.
- **Implementation pointers:** relevant routes, Convex functions, pages, env-var names, or skill packs.
- **Verification:** commands, UI checks, or live checks that establish the note is still true.
- **Follow-up:** explicit gaps, owner actions, and conditions for revisiting the decision.

## Rules for this application

- Keep implementation truth in `src/convex/`, `src/pages/`, and project configuration; docs explain it but do not silently redefine it.
- Never place API keys, deploy keys, webhook secrets, private customer data, or raw authentication tokens in documentation.
- Distinguish queued, crawled, staged, reviewed, approved, and written states. A successful HTTP request is not proof that a lead was saved.
- Mark external services and repository references as dependencies or optional integrations; do not imply they are installed when only guidance was imported.
- Prefer dated incident notes and concise runbooks over duplicated prose.
