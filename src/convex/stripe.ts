/**
 * Stripe subscription integration for the Deal Forge marketing site.
 *
 * This file is `"use node"`, so it may only contain **actions** (Convex rule:
 * only actions can run in Node.js). The DB read/write functions for
 * subscription state live in `subscriptions.ts` (default runtime); the
 * verified webhook in `http.ts` calls `internal.subscriptions.upsertSubscription`.
 *
 * - `createCheckoutSession` — server-side action that creates a hosted Stripe
 *   Checkout Session (subscription mode) for the signed-in user and returns
 *   the redirect URL. Reads `STRIPE_SECRET_KEY` from the Convex env only.
 *
 * Uses the Stripe REST API directly (fetch) rather than the SDK to keep the
 * dependency footprint zero, matching the other provider adapters in the repo
 * (rentcast.ts, scrapegraph.ts, …).
 */
"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";

const STRIPE_API = "https://api.stripe.com/v1";

export function stripeSecretKey(): string {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured on the Convex deployment");
  }
  return key;
}

type StripeCheckoutSession = {
  url: string | null;
  id: string;
};

async function stripeRequest<T>(path: string, form: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(form).toString();
  const response = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const error = payload?.error;
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as Record<string, unknown>).message)
        : response.statusText;
    throw new Error(`Stripe ${path} failed (${response.status}): ${message}`);
  }
  return payload as T;
}

/**
 * Create a hosted Stripe Checkout Session for a monthly subscription and
 * return its URL. Requires a signed-in user so the subscription is attached to
 * an account (client_reference_id = Convex user id, customer_email = their
 * email). The `successUrl`/`cancelUrl` are supplied by the caller (the
 * browser's own origin) and used by Stripe for the post-checkout redirect.
 */
export const createCheckoutSession = action({
  args: {
    priceId: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Sign in to subscribe");
    }
    const session = await stripeRequest<StripeCheckoutSession>("/checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": args.priceId,
      "line_items[0][quantity]": "1",
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      client_reference_id: identity.subject,
      "metadata[userId]": identity.subject,
      ...(identity.email ? { customer_email: identity.email } : {}),
    });
    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL — check the price ID");
    }
    return { url: session.url };
  },
});
