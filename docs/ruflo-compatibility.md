# Ruflo compatibility boundary

Reviewed source: https://github.com/ruvnet/ruflo

Ruflo is an agent meta-harness with MCP tools, swarm coordination, memory, hooks, plugins, testing, security, and optional federation. It targets Claude Code/Codex-style operator environments rather than the Vite/React/Convex application runtime.

## What was added

The project includes client-neutral guidance at:

```text
skills/ruflo-official/SKILL.md
```

This applies Ruflo's routing and verification ideas without copying its CLI, daemon, hooks, `.claude-flow` state, or large dependency graph into the application.

## Recommended deployment boundary

```text
Separate Ruflo operator workspace
          |
          | protected HTTPS MCP request
          v
Deal Pipeline Pro /api/mcp
          |
          v
Owner-gated Convex actions and evidence workflow
```

If Ruflo is connected to the project's MCP endpoint, use a server-side `MCP_TOOL_SERVER_SECRET` credential. Never put that secret in a Ruflo prompt, skill, source file, URL, or persistent memory. The MCP server's recommendations do not bypass owner approval, fabricated-data exclusion, source evidence requirements, or contact/export safeguards.

## Deliberately not imported

Do not run `npx ruflo init` in this product repository by default. Upstream initialization creates agent configuration, hooks, MCP registration, daemon state, and memory files intended for an agent workspace. It would create a second operational runtime and could cause autonomous work to run outside the app's owner-gated paths.

If the owner later wants Ruflo installed, use a separate operator repository or workspace, pin the Ruflo version/commit, review its generated files, and give it only the minimum MCP tools required for the task.

## External source notes

The upstream repository currently describes two installation surfaces:

- a lighter Claude Code plugin path that adds slash commands and agent definitions but does not register the full MCP server;
- a CLI initialization path that adds the full loop, MCP server, hooks, and daemon.

Neither path is a runtime dependency of this application.
