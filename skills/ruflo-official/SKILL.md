---
name: ruflo-official-compatible
description: Use when evaluating or operating Ruflo as an external multi-agent harness for this project, including swarm planning, memory, MCP clients, testing, and cost/security controls.
metadata:
  source: https://github.com/ruvnet/ruflo
  compatibility: client-neutral
  runtime-boundary: external-agent-harness
license: MIT
---

# Ruflo compatibility guidance

Ruflo is an external agent meta-harness for Claude Code and Codex. It provides MCP tools, agent routing, swarms, memory, hooks, plugins, and optional federation. It is not a React component library, Convex backend, or dependency that should be bundled into this application.

## Safe routing for this project

```text
request
  -> define scope and owner authorization
  -> choose one bounded agent role
  -> use read/research agents first
  -> inspect proposed edits and tool calls
  -> run project checks
  -> owner reviews any external or irreversible action
```

Use the smallest Ruflo surface that matches the task:

- `ruflo-core` for routing, health checks, and general agents;
- `ruflo-swarm` for parallel analysis with explicit agent and token limits;
- `ruflo-testgen` for test-gap discovery, followed by human review;
- `ruflo-security-audit` and `ruflo-aidefence` for security and PII review;
- `ruflo-cost-tracker` for budget visibility;
- `ruflo-rag-memory` or AgentDB only when the memory contents and retention policy are understood;
- `ruflo-browser` only for permitted, bounded browser work that follows this project's source and anti-bypass rules.

## Do not run Ruflo init in this product repository

The upstream CLI initialization writes agent-specific files such as `.claude/`, `.claude-flow/`, `CLAUDE.md`, hooks, MCP registration, daemon state, and memory stores. Keep Ruflo in a separate operator/agent workspace unless the owner explicitly requests and reviews those files.

Do not add Ruflo's large dependency graph to `package.json` merely to obtain agent tooling. The web app remains Vite/React/Convex, with owner-gated server actions as its application runtime.

## MCP boundary

Ruflo may consume this project's protected MCP endpoint as an external client only when all of the following are true:

- the endpoint is deployed over HTTPS;
- the owner has configured the project MCP secret server-side;
- the client sends the secret through its credential mechanism, never a prompt, source file, URL, or memory record;
- the tool set is limited to the project's documented, owner-authorized operations;
- returned lead data remains subject to fabricated-row, evidence, verification, and approval guards.

A successful MCP connection does not authorize lead approval, export, dialing, scraping around access controls, or autonomous external communication.

## Swarm and memory safeguards

- Start with read-only analysts and a small bounded swarm.
- Do not allow parallel agents to mutate the same source, lead, buyer, or match without an idempotency key and owner-gated write path.
- Keep agent memory free of API keys, deploy keys, webhook secrets, raw buyer contact data, and unverified seller PII.
- Set token, time, and worker limits; stop runaway loops and idle workers.
- Treat agent summaries as recommendations. Preserve original source URLs, dates, quoted evidence, and review status.
- Verify every proposed change with the project's Bun typecheck and relevant tests.
