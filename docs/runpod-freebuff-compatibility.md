# RunPod compatibility for this project

The official RunPod agent setup was installed in the agent environment. Because the current Freebuff coding agent is not one of the clients recognized by RunPod's guided installer, this project includes a client-neutral adapter at:

```text
skills/runpod-official/SKILL.md
```

The adapter follows the reverse-skill project's useful client-neutral pattern: route the task first, separate optional client adapters from the core workflow, check scope and credentials before acting, and verify the result externally.

## Current verified state

- RunPod's six official skills are installed in the agent environment.
- The project-local compatibility guidance is present.
- The RunPod hosted MCP endpoint is documented as `https://mcp.getrunpod.io/`.
- No RunPod OAuth session is authenticated in this Freebuff session.
- No RunPod API key, Pod, endpoint, model, or billing setting was created by this adapter.

## Supported handoff paths

### Full control-plane access

Use a supported MCP client and authenticate the RunPod MCP server, or provide a server-side `RUNPOD_API_KEY` through the approved Keys/API keys interface. Keep the key out of source code and browser code.

### Shell-compatible fallback

A client without native MCP support can use `runpodctl` after the owner explicitly configures `RUNPOD_API_KEY`. The agent must verify `runpodctl user` before creating infrastructure.

## Safety boundary

The adapter does not bypass RunPod authentication, site protections, or billing controls. Before reporting an Ollama or agent service as ready, the workload must answer a health request from outside the Pod and have an explicit idle-cost teardown plan.
