---
name: runpod-official-compatible
description: Use when routing RunPod pod, Ollama, endpoint, volume, or serverless tasks from an agent that may not have native RunPod MCP support.
metadata:
  source: https://github.com/runpod/runpod-plugins-official
  compatibility: client-neutral
  routing-inspiration: https://github.com/zhaoxuya520/reverse-skill
license: Apache-2.0
---

# RunPod compatibility adapter

This adapter applies RunPod's official six-lane skill model to a client-neutral agent. It does not claim that MCP tools are connected. It routes the task, checks authentication before infrastructure actions, and requires an external health check before reporting a workload ready.

## Route first

- **Understand or choose an architecture:** use RunPod usage guidance; decide pod versus serverless before provisioning.
- **Manage pods, endpoints, jobs, templates, or volumes:** use RunPod MCP when connected; otherwise use `runpodctl`.
- **Write Python serverless code:** use the Flash SDK lane.
- **Download models, build images, or transfer artifacts:** use companion CLIs.
- **Inspect usage and cost:** use usage guidance or the RunPod dashboard.

## Compatibility contract

The client-neutral fallback is:

```text
request
  -> scope and credential check
  -> route to MCP or runpodctl
  -> provision bounded workload
  -> verify from outside the workload
  -> report URL, health result, cost guard, and teardown path
```

A client without native MCP support must not silently claim MCP authentication. The hosted MCP endpoint is:

```text
https://mcp.getrunpod.io/
```

For full control-plane access, prefer a server-side or terminal credential named:

```text
RUNPOD_API_KEY
```

Never write that value into this skill, source code, browser code, n8n Code nodes, URLs, or documentation.

## Ollama pod defaults

For a first lightweight agent workload:

- use a prebuilt Ollama-compatible image when available;
- use a CPU pod only for small models and development;
- use a GPU pod for responsive 7B/8B multi-agent workloads;
- attach persistent storage before downloading models;
- bind the service to `0.0.0.0` inside the pod;
- expose access through RunPod's authenticated proxy or a protected reverse proxy;
- never expose unauthenticated Ollama port `11434` directly to the public internet;
- stop or terminate idle pods to prevent unexpected charges.

## Verification and reporting

Before saying setup is complete, verify:

1. Authentication works (`runpodctl user` or an actual MCP tool response).
2. The pod or endpoint is running.
3. The service responds from outside the pod.
4. The selected model is present and can answer a small health request.
5. The access URL and authentication boundary are recorded without secrets.
6. A teardown or idle-cost guard is provided.

If OAuth or an API key is missing, report the exact user action required and stop before provisioning. This is a compatibility adapter, not a permission bypass.
