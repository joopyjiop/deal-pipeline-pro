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

import { vly } from '../lib/vly-integrations';
import { action } from "./_generated/server";

export const generateAIResponse = action({
  handler: async (ctx, args) => {
    // AI Completions
    const completion = await freebuff.com.completion({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' }
      ],
      temperature: 0.7,
      maxTokens: 150
    });
    
    return completion;
  }
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
  to: 'user@example.com',
  subject: 'Welcome!',
  html: '<h1>Welcome to our service!</h1>',
  text: 'Welcome to our service!'
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

1. Add a **Schedule Trigger** node and choose the polling interval.
2. Provide a list of public source URLs and source types, for example `AUCTION_COM`, `PROBATE`, `OFF_MARKET`, `SHERIFF_SALE`, or `TAX_SALE`.
3. Add an **HTTP Request** node configured as:
   - Method: `POST`
   - URL: `https://YOUR_CONVEX_DEPLOYMENT.convex.site/api/n8n/source`
   - Header: `x-convex-n8n-secret` with the same value as `CONVEX_N8N_WEBHOOK_SECRET`
   - Header: `content-type: application/json`
   - JSON body: `{ "url": "{{$json.url}}", "sourceType": "{{$json.sourceType}}", "idempotencyKey": "{{$json.sourceType}}:{{$json.url}}" }`
4. Publish the workflow. A successful response is `202` with a queued task ID.
5. Leave the existing Convex automation cycle enabled in `/toolkit`; it fetches, stages, qualifies, and records the result.

The endpoint accepts only the supported source types and public URLs, deduplicates retries, and never promotes a candidate past `SOURCED`. Review and approval still happen in `/operations`. The UI refreshes on demand because MongoDB changes are not reactive Convex subscriptions.
