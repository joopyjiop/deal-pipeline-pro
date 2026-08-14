# Free local agents on Android

The app's `/local-agents` page supports three bounded modes: a browser-to-phone local model server, your AI gateway (default: local OmniRoute at `https://localhost:20128/v1`) through an owner-gated Convex proxy, or both together for independent comparison. Neither mode writes leads or sends captured evidence to the database automatically.

## What runs where

```text
Android browser → local OpenAI-compatible server on the same phone
                         ↓
                 local model inference
```

The default endpoint is:

```text
http://127.0.0.1:11434/v1
```

The default model field is `qwen3:4b`; replace it with the exact model identifier reported by the server.

## Secured AI gateway mode

Every server-side model call routes through the OpenAI-compatible gateway configured by `AI_BASE_URL` (default `https://localhost:20128/v1`, i.e. your local OmniRoute). The app does not put any gateway key in the browser. Set these server-side variables in the Keen Convex deployment's Keys/API keys panel:

```text
AI_BASE_URL=https://localhost:20128/v1
AI_API_KEY=<optional bearer key if your gateway expects one>
```

Then open **Local agents**, choose **AI gateway** or **Both / compare**, click the connection test, select a reported model, and run the bounded agent. The Convex action verifies the signed-in owner, limits message size, calls `POST {AI_BASE_URL}/chat/completions` over HTTPS, and returns only the model response. Model names are passed through as selectors: OmniRoute routes them to whichever provider you configure there (Ollama, OpenAI, etc.).

## Android requirements

- An Android app or Termux setup that can run a local model server.
- An OpenAI-compatible `GET /v1/models` endpoint.
- An OpenAI-compatible `POST /v1/chat/completions` endpoint.
- CORS enabled for the Deal Pipeline app origin.
- A small quantized model appropriate for the phone's available RAM.

Termux plus a llama.cpp-compatible server is one possible free route. The exact binary and model format depend on the phone architecture, so use the server's own Android instructions rather than downloading an untrusted binary. An Android app that already exposes the two endpoints above can be used instead.

## Setup

1. Install and start the local model server on the phone.
2. Confirm the server works in the phone browser or its own client:
   - `GET http://127.0.0.1:11434/v1/models`
   - `POST http://127.0.0.1:11434/v1/chat/completions`
3. Configure the server to allow the deployed app's origin in CORS. Do not use `*` if the server supports an explicit origin list.
4. Sign in to the app and open **Toolkit → Local agents**, or visit `/local-agents`.
5. Enter the base URL and exact model name, then click **Test local connection**.
6. Paste only the evidence or question needed for the selected bounded role and click **Run locally**.

Settings are kept in that browser's local storage. They are not Convex settings and are not shared with other devices or browsers.

## HTTPS and localhost caveat

If the app is hosted over HTTPS, the browser may block a request from the secure page to an insecure remote `http://` server. `127.0.0.1` is the safest same-device target, but browser mixed-content and CORS rules still apply. If the browser reports a mixed-content or CORS error, use a local server/app that supports a secure origin or a trusted same-device bridge; do not expose an unauthenticated model endpoint to the public internet.

If the app is opened on a different device, `127.0.0.1` points to that other device, not the Android phone. A LAN address requires explicit CORS, firewall rules, and authentication, and is not enabled by this feature.

## Safety boundary

Local and gateway agent responses are recommendations only. In **Both / compare** mode, the app runs independent reviews and labels partial failures; it does not merge agreement into a verified fact. The page intentionally has no database mutations, approvals, exports, dial actions, scraping actions, or automatic lead creation. Do not paste API keys, deploy keys, webhook secrets, or unnecessary private contact data into the prompt. Gateway mode sends the prompt to the AI gateway (`AI_BASE_URL`); use phone mode when the evidence must remain entirely on-device.
