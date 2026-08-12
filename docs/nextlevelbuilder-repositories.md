# nextlevelbuilder repository registry

Reviewed from: https://github.com/orgs/nextlevelbuilder/repositories

This project is a Vite/React/Convex application. The organization contains a mixture of skill packs, developer tools, services, plugins, and event documentation. Compatible guidance is vendored under `skills/nextlevelbuilder/`; standalone applications are intentionally not copied into the app or installed as dependencies.

| Repository | Handling in this project | Source |
| --- | --- | --- |
| `ui-ux-pro-max-skill` | Imported as `skills/nextlevelbuilder/ui-ux-pro-max/SKILL.md`; used for interface and responsive-design work. | [GitHub](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) |
| `agentwiki-skills` | Imported as `skills/nextlevelbuilder/agentwiki/SKILL.md`; used for durable project notes and operational runbooks. | [GitHub](https://github.com/nextlevelbuilder/agentwiki-skills) |
| `skillx` | Reviewed as a skill-authoring/reference tool. Not merged into runtime code; use its upstream authoring guidance when creating or converting additional skills. | [GitHub](https://github.com/nextlevelbuilder/skillx) |
| `agentbrain-cli` | Optional external CLI/reference. Not installed; it is not required by the web app runtime. | [GitHub](https://github.com/nextlevelbuilder/agentbrain-cli) |
| `goclaw-mcp` | Optional external MCP service/reference. Not embedded in Convex or the browser bundle. | [GitHub](https://github.com/nextlevelbuilder/goclaw-mcp) |
| `goclaw` | Standalone Go application/service. Not merged because it would introduce a separate runtime and deployment boundary. | [GitHub](https://github.com/nextlevelbuilder/goclaw) |
| `goclaw-cli` | Standalone Go CLI. Not installed as an application dependency. | [GitHub](https://github.com/nextlevelbuilder/goclaw-cli) |
| `goclaw-plugin-webchat` | Optional external webchat plugin for GoClaw. Not embedded in the existing React UI. | [GitHub](https://github.com/nextlevelbuilder/goclaw-plugin-webchat) |
| `f2u-cli` | Standalone CLI/tooling repository. Not needed for the current lead pipeline and not installed. | [GitHub](https://github.com/nextlevelbuilder/f2u-cli) |
| `goclaw-docs` | Documentation repository only; referenced for external GoClaw deployments, not copied into the product source. | [GitHub](https://github.com/nextlevelbuilder/goclaw-docs) |
| `openclaw-event-2026` | Event/content repository, not an application dependency or skill needed by this project. | [GitHub](https://github.com/nextlevelbuilder/openclaw-event-2026) |

## Why the repositories are not all copied into the app

Copying the Go services, CLIs, plugins, and external infrastructure into this frontend/backend repository would create duplicate runtimes, deployment ambiguity, and unused code. The registry preserves the complete inventory and source links while keeping the application maintainable.

To adopt one of the optional repositories later, make it an explicit integration with its own deployment, credentials, health check, and owner approval. Do not place its secrets in browser code or n8n Code nodes.
