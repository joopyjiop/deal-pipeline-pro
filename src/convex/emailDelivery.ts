/**
 * Purchase-confirmation email delivery for Deal Forge (Stripe → customer).
 *
 * When Stripe fires `checkout.session.completed`, the verified webhook in
 * `http.ts` schedules `sendPurchaseEmail` (via ctx.scheduler.runAfter so the
 * webhook never blocks Stripe). This module:
 *
 *  1. Looks up the customer's approved buyer profile by email and pulls their
 *     matched, VERIFIED + APPROVED, non-fabricated leads (export gates are
 *     also enforced in `emailDeliveryCore.isExportableLead`).
 *  2. Builds the matched-leads CSV and sends it as an attachment via Resend
 *     (REST API, no SDK — matching the repo's other provider adapters).
 *  3. Logs every delivery in the Mongo `email_deliveries` collection:
 *     SENT/FAILED, attempt count, error, provider id. Failures are retried by
 *     the `retryFailedDeliveries` cron (and can be re-triggered via
 *     `POST /api/admin/email-deliveries/retry`), so failed sends are
 *     identifiable and retryable.
 *
 * Every delivery is deduped by checkoutSessionId — Stripe redelivering the
 * same event can never send the customer a second email.
 */
"use node";

import { MongoClient, ObjectId, type Document } from "mongodb";
import { v } from "convex/values";
import { internalAction, action, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  MAX_DELIVERY_ATTEMPTS,
  buildLeadsCsv,
  isExportableLead,
  nextRetryAtMs,
  toPublicDelivery,
  type LeadCsvRow,
} from "./emailDeliveryCore";

const EMAIL_DELIVERIES = "email_deliveries";
const LEADS = "leads";
const BUYERS = "buyers";
const MATCHES = "property_matches";
const KIND_PURCHASE = "PURCHASE_CONFIRMATION";
const RESEND_API = "https://api.resend.com/emails";
const SUPPORT_EMAIL = "support@dealforge.homes";

let clientPromise: Promise<MongoClient> | null = null;

function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!clientPromise) {
    clientPromise = new MongoClient(uri).connect().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }
  return clientPromise;
}

async function getDatabase() {
  return (await getMongoClient()).db();
}

function toObjectId(value: string): ObjectId | string {
  return ObjectId.isValid(value) ? new ObjectId(value) : value;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resendApiKey(): string {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    throw new Error("RESEND_API_KEY is not configured on the Convex deployment");
  }
  return key;
}

async function sendViaResend(options: {
  to: string;
  subject: string;
  html: string;
  text: string;
  csv: string;
}): Promise<{ id: string }> {
  const from = process.env.PURCHASE_EMAIL_FROM?.trim() || `Deal Forge <${SUPPORT_EMAIL}>`;
  const response = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
      attachments: [
        {
          filename: "matched-leads.csv",
          content: Buffer.from(options.csv, "utf8").toString("base64"),
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = payload?.message ? String(payload.message) : response.statusText;
    throw new Error(`Resend ${response.status}: ${message}`);
  }
  return { id: payload?.id ? String(payload.id) : "" };
}

/** The customer's matched, exportable leads: approved matches → verified leads. */
async function buildMatchedLeadRows(db: Awaited<ReturnType<typeof getDatabase>>, email: string): Promise<LeadCsvRow[]> {
  const buyer = await db
    .collection(BUYERS)
    .findOne({ email: { $regex: `^${escapeRegex(email)}$`, $options: "i" }, intakeStatus: "APPROVED" });
  if (!buyer) return [];

  const matches = await db
    .collection(MATCHES)
    .find({ buyerId: String(buyer._id), status: { $in: ["APPROVED", "CONTACTED", "CLOSED"] } })
    .sort({ matchScore: -1 })
    .limit(100)
    .toArray();
  if (matches.length === 0) return [];

  const leadIds = matches.map((match) => toObjectId(String(match.leadId)));
  const leadFilter: Document = {
    _id: { $in: leadIds },
    fabricated: { $ne: true },
    verificationStatus: "VERIFIED",
    pipelineStatus: "APPROVED",
  };
  const leads = await db.collection(LEADS).find(leadFilter).toArray();
  const leadById = new Map(leads.map((lead) => [String(lead._id), lead]));

  return matches
    .map((match): LeadCsvRow | null => {
      const lead = leadById.get(String(match.leadId));
      if (!lead || !isExportableLead(lead)) return null;
      const estimatedProfit =
        typeof lead.estimatedProfit === "number"
          ? lead.estimatedProfit
          : typeof lead.arv === "number" && typeof lead.repairs === "number" && typeof lead.acquisitionPrice === "number"
            ? lead.arv - lead.repairs - lead.acquisitionPrice
            : undefined;
      return {
        id: String(lead._id),
        propertyAddress: String(lead.propertyAddress ?? ""),
        city: String(lead.city ?? ""),
        state: String(lead.state ?? ""),
        zip: String(lead.zip ?? ""),
        county: String(lead.county ?? ""),
        parcelId: lead.parcelId !== undefined ? String(lead.parcelId) : undefined,
        sourceUrl: String(lead.sourceUrl ?? ""),
        sourceRef: String(lead.sourceRef ?? ""),
        sourceDate: String(lead.sourceDate ?? ""),
        distressScore: typeof lead.distressScore === "number" ? lead.distressScore : 0,
        verificationStatus: String(lead.verificationStatus ?? ""),
        pipelineStatus: String(lead.pipelineStatus ?? ""),
        absenteeOwner: lead.absenteeOwner === true,
        arv: typeof lead.arv === "number" ? lead.arv : undefined,
        repairs: typeof lead.repairs === "number" ? lead.repairs : undefined,
        mao: typeof lead.mao === "number" ? lead.mao : undefined,
        acquisitionPrice: typeof lead.acquisitionPrice === "number" ? lead.acquisitionPrice : undefined,
        estimatedProfit,
        matchScore: typeof match.matchScore === "number" ? match.matchScore : undefined,
        confidence: typeof match.confidence === "string" ? match.confidence : undefined,
        buyBoxSummary: typeof match.buyBoxSummary === "string" ? match.buyBoxSummary : undefined,
      };
    })
    .filter((row): row is LeadCsvRow => row !== null);
}

function buildEmailBody(leadCount: number, checkoutSessionId: string) {
  const leadLine =
    leadCount > 0
      ? `Your attached CSV (matched-leads.csv) contains ${leadCount} verified, source-linked lead${leadCount === 1 ? "" : "s"} matched to your buy box. Every row carries its source URL, reference, and date — no fabricated data is ever exported.`
      : "No verified, approved lead matches are attached yet. As matches for your buy box are verified and approved, your next confirmation email will include them.";
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#0f172a">
      <h1 style="font-size:20px;margin:0 0 16px">Thank you — your Deal Forge subscription is active</h1>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Your payment went through and your account now has access to source-verified distressed property leads.</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px">${leadLine}</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px">Reference: <code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">${checkoutSessionId}</code></p>
      <p style="font-size:13px;line-height:1.6;margin:0;color:#475569">Questions? Reply to ${SUPPORT_EMAIL}. You can cancel anytime from your account billing settings or by emailing us — see the Cancellation Policy on our site.</p>
    </div>`;
  const text = `Thank you — your Deal Forge subscription is active.\n\n${leadLine}\n\nReference: ${checkoutSessionId}\n\nQuestions? Reply to ${SUPPORT_EMAIL}. You can cancel anytime — see the Cancellation Policy on our site.`;
  return { html, text };
}

/**
 * Send (or retry) the purchase-confirmation email with the matched-leads CSV.
 * Deduped by checkoutSessionId: a SENT delivery is never sent twice, so
 * Stripe event redelivery is harmless. Any failure is recorded as FAILED with
 * a retry schedule instead of throwing, so the webhook always settles.
 */
export const sendPurchaseEmail = internalAction({
  args: {
    userId: v.string(),
    email: v.string(),
    checkoutSessionId: v.string(),
    priceId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const db = await getDatabase();
    const collection = db.collection(EMAIL_DELIVERIES);
    const now = Date.now();

    const existing = await collection.findOne({ kind: KIND_PURCHASE, checkoutSessionId: args.checkoutSessionId });
    if (existing && existing.status === "SENT") {
      return { ok: true, skipped: true, deliveryId: String(existing._id) };
    }

    if (!args.email || !args.checkoutSessionId) {
      const error = "Missing customer email or checkout session id on the Stripe event";
      if (existing) {
        await collection.updateOne({ _id: existing._id }, { $set: { status: "FAILED", attempts: (existing.attempts ?? 0) + 1, error, updatedAt: now, nextAttemptAt: nextRetryAtMs((existing.attempts ?? 0) + 1, now) } });
      }
      return { ok: false, status: "FAILED", error, deliveryId: existing ? String(existing._id) : undefined };
    }

    let rows: LeadCsvRow[] = [];
    try {
      rows = await buildMatchedLeadRows(db, args.email);
    } catch (error) {
      // Lead lookup failing must not block the confirmation email itself.
      rows = [];
    }
    const csv = buildLeadsCsv(rows);
    const { html, text } = buildEmailBody(rows.length, args.checkoutSessionId);
    const docBase = {
      kind: KIND_PURCHASE,
      checkoutSessionId: args.checkoutSessionId,
      userId: args.userId,
      email: args.email,
      priceId: args.priceId,
      subscriptionId: args.subscriptionId,
      stripeCustomerId: args.stripeCustomerId,
      leadCount: rows.length,
      csv,
    };

    try {
      const provider = await sendViaResend({
        to: args.email,
        subject: "Your Deal Forge purchase confirmation",
        html,
        text,
        csv,
      });
      if (existing) {
        await collection.updateOne(
          { _id: existing._id },
          { $set: { ...docBase, status: "SENT", providerId: provider.id, sentAt: now, error: undefined, nextAttemptAt: undefined, updatedAt: now } },
        );
        return { ok: true, status: "SENT", deliveryId: String(existing._id), leadCount: rows.length };
      }
      const result = await collection.insertOne({ ...docBase, status: "SENT", providerId: provider.id, sentAt: now, attempts: 1, createdAt: now, updatedAt: now });
      return { ok: true, status: "SENT", deliveryId: String(result.insertedId), leadCount: rows.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = existing ? (existing.attempts ?? 0) + 1 : 1;
      const next = nextRetryAtMs(attempts, now);
      if (existing) {
        await collection.updateOne(
          { _id: existing._id },
          { $set: { ...docBase, status: "FAILED", attempts, error: message, nextAttemptAt: next ?? undefined, updatedAt: now } },
        );
        return { ok: false, status: "FAILED", error: message, deliveryId: String(existing._id), leadCount: rows.length };
      }
      const result = await collection.insertOne({ ...docBase, status: "FAILED", attempts, error: message, nextAttemptAt: next ?? undefined, createdAt: now, updatedAt: now });
      return { ok: false, status: "FAILED", error: message, deliveryId: String(result.insertedId), leadCount: rows.length };
    }
  },
});

/**
 * Retry every FAILED delivery whose nextAttemptAt has passed (up to
 * MAX_DELIVERY_ATTEMPTS). Runs on a cron; also exposed to the owner via
 * POST /api/admin/email-deliveries/retry. Resends the exact CSV stored at
 * first attempt, so a retry is faithful to what was originally generated.
 */
export const retryFailedDeliveries = internalAction({
  args: {},
  handler: async () => {
    const db = await getDatabase();
    const collection = db.collection(EMAIL_DELIVERIES);
    const now = Date.now();
    const due = await collection
      .find({
        kind: KIND_PURCHASE,
        status: "FAILED",
        attempts: { $lt: MAX_DELIVERY_ATTEMPTS },
        nextAttemptAt: { $lte: now },
      })
      .limit(20)
      .toArray();

    const results: Array<Record<string, unknown>> = [];
    for (const doc of due) {
      const email = typeof doc.email === "string" ? doc.email : "";
      const csv = typeof doc.csv === "string" ? doc.csv : "";
      if (!email || !csv) {
        await collection.updateOne(
          { _id: doc._id },
          { $set: { status: "FAILED", attempts: MAX_DELIVERY_ATTEMPTS, error: "Delivery record is missing email or CSV payload", updatedAt: now } },
        );
        results.push({ deliveryId: String(doc._id), status: "FAILED", error: "Missing email or CSV payload" });
        continue;
      }
      const attempts = (doc.attempts ?? 0) + 1;
      try {
        const provider = await sendViaResend({
          to: email,
          subject: "Your Deal Forge purchase confirmation",
          html: buildEmailBody(typeof doc.leadCount === "number" ? doc.leadCount : 0, String(doc.checkoutSessionId ?? "")).html,
          text: buildEmailBody(typeof doc.leadCount === "number" ? doc.leadCount : 0, String(doc.checkoutSessionId ?? "")).text,
          csv,
        });
        await collection.updateOne(
          { _id: doc._id },
          { $set: { status: "SENT", attempts, providerId: provider.id, sentAt: now, error: undefined, nextAttemptAt: undefined, updatedAt: now } },
        );
        results.push({ deliveryId: String(doc._id), status: "SENT", attempts });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const next = nextRetryAtMs(attempts, now);
        await collection.updateOne(
          { _id: doc._id },
          { $set: { status: "FAILED", attempts, error: message, nextAttemptAt: next ?? undefined, updatedAt: now } },
        );
        results.push({ deliveryId: String(doc._id), status: "FAILED", attempts, error: message });
      }
    }
    return { checked: due.length, results };
  },
});

/** Recent delivery log (no CSV payload). Auth is enforced at the HTTP boundary. */
export const listEmailDeliveries = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (_ctx, args) => {
    const db = await getDatabase();
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 200)));
    const docs = await db.collection(EMAIL_DELIVERIES).find({ kind: KIND_PURCHASE }).sort({ createdAt: -1 }).limit(limit).toArray();
    return { deliveries: docs.map((doc) => toPublicDelivery(doc)) };
  },
});

/** Owner-gated action so the Dashboard/agent can read the delivery log. */
export const listEmailDeliveriesOwner = action({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const db = await getDatabase();
    const limit = Math.max(1, Math.min(500, Math.floor(args.limit ?? 200)));
    const docs = await db.collection(EMAIL_DELIVERIES).find({ kind: KIND_PURCHASE }).sort({ createdAt: -1 }).limit(limit).toArray();
    return { deliveries: docs.map((doc) => toPublicDelivery(doc)) };
  },
});

// Same owner convention as the rest of the app: role "admin" OR the permanent
// owner email (see src/convex/apiAccess.ts).
const OWNER_EMAIL = "jacobvierra8@gmail.com";

async function requireOwner(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity?.email?.trim().toLowerCase() === OWNER_EMAIL) return;
  const [userId] = (identity?.subject ?? "").split("|");
  if (!userId) throw new Error("Owner access required");
  const user = await ctx.runQuery(internal.users.getUserBySubject, { subject: userId });
  if (user && (user.role === "admin" || user.email?.trim().toLowerCase() === OWNER_EMAIL)) return;
  throw new Error("Owner access required");
}
