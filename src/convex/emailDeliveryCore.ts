/**
 * Pure helpers for purchase-confirmation email delivery (CSV build, lead
 * export gates, retry scheduling). No Convex or Node imports so this file is
 * unit-testable from tests/ (the Convex bundle never sees bun:test).
 *
 * The CSV builder is used to attach the customer's matched-lead data to the
 * purchase-confirmation email sent after Stripe checkout.session.completed.
 * It follows the repo's non-negotiable export rules: fabricated/SEED rows are
 * never exported, and only VERIFIED + APPROVED leads may leave the pipeline.
 */

/** One row of the matched-lead CSV attached to the purchase email. */
export type LeadCsvRow = {
  id: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcelId?: string;
  sourceUrl: string;
  sourceRef: string;
  sourceDate: string;
  distressScore: number;
  verificationStatus: string;
  pipelineStatus: string;
  absenteeOwner: boolean;
  arv?: number;
  repairs?: number;
  mao?: number;
  acquisitionPrice?: number;
  estimatedProfit?: number;
  matchScore?: number;
  confidence?: string;
  buyBoxSummary?: string;
};

/** Max send attempts per delivery (initial + 4 retries). */
export const MAX_DELIVERY_ATTEMPTS = 5;

/** Backoff minutes by attempt count: 1st retry +5m, then 15m, 1h, 6h. */
export const RETRY_DELAYS_MINUTES = [5, 15, 60, 360] as const;

/** True when a raw Mongo lead doc may be exported (fabricated rows never export). */
export function isExportableLead(lead: Record<string, unknown>): boolean {
  if (lead.fabricated === true) return false;
  if (lead.sourceType === "SEED") return false;
  if (lead.verificationStatus !== "VERIFIED") return false;
  if (lead.pipelineStatus !== "APPROVED") return false;
  return true;
}

/**
 * Escape a single CSV cell: null/undefined → "", quote-escape embedded
 * quotes, and prefix formula-like cells (=, +, -, @) with a single quote so
 * opening the CSV in Excel can never execute a formula injected via source
 * data (CSV-injection guard).
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** [CSV header, LeadCsvRow key] pairs — headers are snake_case, keys camelCase. */
const CSV_COLUMNS: Array<[string, keyof LeadCsvRow]> = [
  ["lead_id", "id"],
  ["property_address", "propertyAddress"],
  ["city", "city"],
  ["state", "state"],
  ["zip", "zip"],
  ["county", "county"],
  ["parcel_id", "parcelId"],
  ["source_url", "sourceUrl"],
  ["source_ref", "sourceRef"],
  ["source_date", "sourceDate"],
  ["distress_score", "distressScore"],
  ["verification_status", "verificationStatus"],
  ["pipeline_status", "pipelineStatus"],
  ["absentee_owner", "absenteeOwner"],
  ["arv", "arv"],
  ["repairs", "repairs"],
  ["mao", "mao"],
  ["acquisition_price", "acquisitionPrice"],
  ["estimated_profit", "estimatedProfit"],
  ["match_score", "matchScore"],
  ["confidence", "confidence"],
  ["buy_box_summary", "buyBoxSummary"],
];

/** Build the matched-leads CSV (header + rows). Always ends with a newline. */
export function buildLeadsCsv(rows: LeadCsvRow[]): string {
  const lines = [CSV_COLUMNS.map(([header]) => csvCell(header)).join(",")];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map(([, key]) => csvCell(row[key])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/**
 * When the next retry is allowed. `attempts` is the number of failed attempts
 * already recorded. Returns null when retries are exhausted (the delivery is
 * then flagged permanently failed and needs owner attention).
 */
export function nextRetryAtMs(attempts: number, now: number): number | null {
  if (attempts < 1 || attempts > RETRY_DELAYS_MINUTES.length) return null;
  return now + RETRY_DELAYS_MINUTES[attempts - 1]! * 60_000;
}

/** Owner-facing view of a delivery record (no CSV payload, no error stack). */
export function toPublicDelivery(doc: Record<string, unknown>): Record<string, unknown> {
  return {
    id: String(doc._id),
    kind: doc.kind,
    checkoutSessionId: doc.checkoutSessionId,
    userId: doc.userId,
    email: doc.email,
    priceId: doc.priceId,
    subscriptionId: doc.subscriptionId,
    status: doc.status,
    attempts: doc.attempts,
    error: doc.error,
    leadCount: doc.leadCount,
    providerId: doc.providerId,
    sentAt: doc.sentAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    nextAttemptAt: doc.nextAttemptAt,
  };
}
