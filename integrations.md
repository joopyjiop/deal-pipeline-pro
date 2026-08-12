# VLY Integrations

First-order integrations for AI, email, and payments with automatic usage billing through VLY integration keys.

## Environment Variables

The following environment variables are automatically set during project creation:

- `VLY_INTEGRATION_KEY`: Your unique integration key (format: `sk_*`)
- `VLY_INTEGRATION_BASE_URL`: The base URL for the integration gateway (default: `https://integrations.freebuff.com/`)

## Installation

The `@vly-ai/integrations` package is already included in package.json.

## Usage in Convex Actions

```typescript
"use node";

import { vly } from "../lib/vly-integrations";
import { action } from "./_generated/server";

export const generateAIResponse = action({
  handler: async (ctx, args) => {
    // AI Completions
    const completion = await freebuff.com.completion({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ],
      temperature: 0.7,
      maxTokens: 150,
    });

    return completion;
  },
});
```

## Available Features

### AI Integration

```typescript
// Create completion
const completion = await freebuff.com.completion({
  model: 'gpt-4o-mini', // or 'gpt-4o', 'claude-3-haiku', etc.
  messages: [...],
  temperature: 0.7,
  maxTokens: 150
});

// Stream completion
await freebuff.com.streamCompletion(
  request,
  (chunk: string) => console.log(chunk)
);

// Generate embeddings
const embeddings = await freebuff.com.embeddings("Your text here");
```

### Email Integration

```typescript
// Send email
const emailResult = await vly.email.send({
  to: "user@example.com",
  subject: "Welcome!",
  html: "<h1>Welcome to our service!</h1>",
  text: "Welcome to our service!",
});

// Send batch emails
const batchResult = await vly.email.sendBatch([...emails]);
```

### Payments Integration

```typescript
// Create payment intent
const paymentIntent = await vly.payments.createPaymentIntent({
  amount: 2000, // $20.00 in cents
  currency: 'usd',
  description: 'Premium subscription',
  customer: {
    email: 'customer@example.com'
  }
});

// Create subscription
const subscription = await vly.payments.createSubscription({...});

// Create checkout session
const session = await vly.payments.createCheckoutSession({...});
```

## Error Handling

All methods return an ApiResponse object:

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    credits: number;
    operation: string;
  };
}
```

Example error handling:

```typescript
const result = await freebuff.com.completion({ ... });

if (result.success) {
  console.log('Response:', result.data);
  console.log('Credits used:', result.usage?.credits);
} else {
  console.error('Error:', result.error);
}
```

## Important Notes

1. The integration key (`VLY_INTEGRATION_KEY`) is automatically injected during project creation
2. All API calls are automatically billed to your deployment based on usage
3. Must be used in Convex actions with `"use node"` directive
4. The integration key should never be exposed to the client

## Checking Integration Status

To verify the integration is properly configured:

```typescript
const hasIntegration = !!process.env.VLY_INTEGRATION_KEY;
if (!hasIntegration) {
  console.error("VLY integration key not found");
}
```

## n8n source-ingestion handoff

n8n is used as the scheduler and retry layer; Convex remains the security boundary and MongoDB remains the source of truth. n8n does not receive or store `MONGODB_URI`, cannot approve leads, and cannot write directly to MongoDB.

### Convex environment variable

Add this server-only variable in the Convex Environment vars panel:

- `CONVEX_N8N_WEBHOOK_SECRET` — generate a long random secret and keep it private.

The existing `MONGODB_URI` remains server-only and is not needed in n8n.

### n8n workflow

1. Create one workflow with a **Schedule Trigger**. Start with once daily (or twice daily) rather than a separate workflow for each source; this keeps the free-trial execution count low.
2. Provide a list of public source URLs and source types, for example `AUCTION_COM`, `PROBATE`, `OFF_MARKET`, `SHERIFF_SALE`, or `TAX_SALE`.
3. Add one **HTTP Request** node configured as:
   - Method: `POST`
   - URL: `https://YOUR_CONVEX_DEPLOYMENT.convex.site/api/n8n/source`
   - Header: `x-convex-n8n-secret` with the same value as `CONVEX_N8N_WEBHOOK_SECRET`
   - Header: `content-type: application/json`
   - JSON body: `{ "url": "{{$json.url}}", "sourceType": "{{$json.sourceType}}", "idempotencyKey": "{{$json.sourceType}}:{{$json.url}}" }`
4. Run one manual test, then publish the workflow. A successful response is `202` with a queued task ID. Reusing the same `idempotencyKey` is safe and does not create duplicate tasks.
5. Leave the existing Convex automation cycle enabled in `/toolkit`; it fetches, stages, qualifies, and records the result. Set `Tasks per cycle` to a small value such as 3–5 so one run cannot create a large burst of source requests.

The owner can also use **Queue Allen County** in `/toolkit` to seed a direct Auction.com listing for 5214 Eicher Dr plus the official 2026 Allen County sheriff-sale and tax-sale pages into the same queue. The preset uses stable idempotency keys, so repeated clicks do not create duplicate pending tasks. The Auction.com listing is the first-pass candidate because it is an itemized property page; its opening bid, market value, condition, auction timing, and title status still require verification. These are source-page seeds, not approvals: pages with no explicit address, location, date, and case/parcel/sale reference are rejected rather than converted into leads.

The endpoint accepts only the supported source types and public URLs, deduplicates retries, and never promotes a candidate past `SOURCED`. Review and approval still happen in `/operations`. The UI refreshes on demand because MongoDB changes are not reactive Convex subscriptions.

## AI consultant court

When AI access is enabled and the automation mode is `BOTH`, every queued source is reviewed by four stages inside the Convex action:

1. Evidence auditor — checks whether the source contains explicit, usable facts.
2. Underwriting analyst — checks whether ARV, repairs, offer, and spread evidence is sufficient without inventing numbers.
3. Risk/compliance consultant — flags source-quality, verification, privacy, duplicate, and compliance concerns.
4. Judge — reconciles the three reports into `PROCEED`, `HOLD`, or `PASS`, with confidence, score, risks, and missing evidence.

The court accepts only exact quotes found in the staged source excerpt and the matching source URL. Its verdict is saved as `aiCourtVerdict` in MongoDB staging and on the candidate lead. A candidate cannot be approved until a completed court verdict exists, but the verdict never approves a deal automatically. The owner remains the final decision-maker.

To activate the court, add at least one of these server-only Convex variables:

- `SAMBANOVA_API_KEY` — primary consultant and judge provider.
- `SAMBANOVA_MODEL` — optional; defaults to `Meta-Llama-3.3-70B-Instruct`.
- `OLLAMA_API_KEY` — secured Ollama Cloud fallback when SambaNova returns HTTP 429, or the primary provider when SambaNova is not configured.
- `OLLAMA_COURT_MODEL` — optional Ollama Cloud court model; otherwise `OLLAMA_MODEL` or `gpt-oss:20b` is used.

The court makes four model calls per reviewed source, in parallel for the three consultants and then one judge call. This does not consume n8n executions; it uses the configured AI provider instead. When both keys are present, Ollama is used automatically for a SambaNova HTTP 429 response. If neither key is configured, the candidate stays unapproved and the Toolkit reports that the court is waiting for setup. Provider agreement is still only a recommendation; source evidence and owner approval remain authoritative.

## Odysseus MCP Tool Server

The app now exposes a protected remote MCP endpoint for an external AI agent such as Odysseus:

- Endpoint: `https://YOUR_CONVEX_DEPLOYMENT.convex.site/api/mcp`
- Transport: Streamable HTTP
- Authentication: `Authorization: Bearer <MCP_TOOL_SERVER_SECRET>`
- Convex environment variable: `MCP_TOOL_SERVER_SECRET`

Generate a new long random secret and add it in the Convex Environment vars panel. Do not reuse `MONGODB_URI`, `SAMBANOVA_API_KEY`, or the n8n secret, and do not put any of them in Odysseus.

In Odysseus's **Settings → Integrations → MCP Tool Server** form, enter the endpoint above, choose Streamable HTTP if asked, and set the bearer/API-key secret to the exact value of `MCP_TOOL_SERVER_SECRET`. The server supports `initialize`, `tools/list`, and `tools/call`.

The connected agent can call:

1. `queue_source` — send a public source URL into the same pending queue used by the website and n8n.
2. `scrape_source` — fetch a public, attributable URL and stage bounded evidence.
3. `list_pipeline` — read non-fabricated sourced and approved leads with evidence and underwriting fields.
4. `list_staged_sources` — read bounded staged evidence and court results.
5. `list_buyer_buy_boxes` — read approved buy-box constraints without buyer contact details.
6. `list_match_board` — read match scores, confidence, status, and summaries without buyer contact details.
7. `estimate_deal` — calculate ARV, repairs, MAO, and estimated spread from explicit inputs.
8. `consultant_court` — run the evidence, underwriting, risk/compliance, and judge review for a staged source.

It cannot access MongoDB directly, submit or approve buyers, approve or reject leads, export data, dial anyone, run n8n, or bypass owner review. Queueing only creates pending source work; the owner still approves every lead. Candidate approval remains a human owner action in `/operations`. If the MCP secret is missing or wrong, the endpoint returns `401` and does not run a tool.

## Admin API

The server also exposes a MongoDB-backed CRUD API for external owner-controlled automation. Add a long random value as the server-only Convex environment variable `ADMIN_API_KEY`. Every request must send `Authorization: Bearer <ADMIN_API_KEY>`; missing, malformed, or incorrect credentials return `401`. The key is never read by the frontend.

Base URL: `https://YOUR_CONVEX_DEPLOYMENT.convex.site/api/admin`

Resources and operations:

- `GET /leads` — list leads. Optional query filters: `status`, `verificationStatus`, `minDistressScore`, `maxDistressScore`, `limit`.
- `GET /leads/{id}` — fetch one lead by MongoDB `_id`.
- `POST /leads` — create a lead; body is the Lead shape (`propertyAddress`, `city`, `state`, `zip`, `county`, `sourceType`, `sourceUrl`, `sourceRef`, `sourceDate`, `distressScore`, `distressSignals`, `verificationStatus`, `pipelineStatus`, plus the remaining lead fields).
- `PATCH /leads/{id}` — update any editable lead fields with a partial JSON body.
- `DELETE /leads/{id}` — delete a lead.

The same five operations are available for:

- `/buyers` — Buyer shape; list filters: `status`, `proofOfFundsStatus`.
- `/matches` — PropertyMatch shape; list filters: `status`, `confidence`, `minMatchScore`.
- `/hot-deals` — HotDeal shape; list filters: `status`, `minDistressScore`. Non-fabricated hot deals must be verified with distress score at least 80.
- `/import-staging` — ImportStaging shape; list filter: `status`.

For create/update requests use `Content-Type: application/json`. `PUT` is accepted as an alias for `PATCH`. MongoDB IDs belong in the final URL path, not in the request body. Seed/fabricated lead and hot-deal records remain marked `fabricated: true` and cannot be silently reactivated.
