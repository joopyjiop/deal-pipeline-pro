// Deal-credential completeness gate (NON-NEGOTIABLE): no seller or buyer may
// be put up for approval without the credentials needed to actually make a
// deal — seller name, a contact phone, ARV or an offer estimate, and for
// buyers proof of funds plus contact details. Missing data is flagged as
// missing, never guessed.
//
// Pure functions only — no Convex or MongoDB imports — so the Convex actions
// (mongodb.ts), the admin API (admin.ts), and the MCP surface all enforce the
// same rules, and unit tests can import this module directly.

/** Which deal-credential fields a lead is missing, as human-readable labels. */
export function missingLeadDealCredentials(lead: Record<string, unknown>): string[] {
  const missing: string[] = [];

  // Seller name — ownerNames is an array from the owner-lookup path, but
  // accept a plain non-empty string too.
  const ownerNames = lead.ownerNames;
  const hasSellerName = Array.isArray(ownerNames)
    ? ownerNames.some((name) => typeof name === "string" && name.trim().length > 0)
    : typeof ownerNames === "string" && ownerNames.trim().length > 0;
  if (!hasSellerName) missing.push("seller name (ownerNames)");

  // Contact phone — either a publicly listed phone or skip-traced numbers.
  const skipTrace = lead.skipTrace;
  const skipTracePhones = skipTrace && typeof skipTrace === "object"
    ? (skipTrace as { phones?: unknown }).phones
    : undefined;
  const hasSkipTracePhone = Array.isArray(skipTracePhones)
    ? skipTracePhones.some((phone) => phone && typeof phone === "object" && typeof (phone as { number?: unknown }).number === "string" && (phone as { number: string }).number.trim().length > 0)
    : false;
  const hasPhone = lead.listedPhone === true
    || hasSkipTracePhone
    || (typeof lead.ownerPhone === "string" && lead.ownerPhone.trim().length > 0);
  if (!hasPhone) missing.push("a contact phone (listedPhone or skipTrace)");

  // ARV or an offer estimate — enough to price the deal.
  const arv = typeof lead.arv === "number" ? lead.arv : Number.NaN;
  const hasArv = Number.isFinite(arv) && arv > 0;
  const hasEstimate = [lead.repairs, lead.mao, lead.acquisitionPrice].some(
    (value) => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  if (!hasArv && !hasEstimate) missing.push("arv or an offer estimate (arv/repairs/mao/acquisitionPrice)");

  return missing;
}

/** Throws unless the lead carries every deal credential. */
export function assertLeadDealReady(lead: Record<string, unknown>): void {
  const missing = missingLeadDealCredentials(lead);
  if (missing.length > 0) {
    throw new Error(`Lead cannot be approved without deal credentials: ${missing.join(", ")}`);
  }
}

/** Which deal-credential fields a buyer is missing, as human-readable labels. */
export function missingBuyerDealCredentials(buyer: Record<string, unknown>): string[] {
  const missing: string[] = [];
  for (const key of ["name", "phone", "email"] as const) {
    if (typeof buyer[key] !== "string" || !(buyer[key] as string).trim()) missing.push(key);
  }
  if (typeof buyer.proofOfFundsStatus !== "string" || buyer.proofOfFundsStatus === "NONE") {
    missing.push("proof of funds (SELF_REPORTED or VERIFIED)");
  }
  if (!Array.isArray(buyer.targetAreas) || (buyer.targetAreas as unknown[]).length === 0) {
    missing.push("targetAreas");
  }
  return missing;
}

/** Throws unless the buyer carries every deal credential. */
export function assertBuyerDealReady(buyer: Record<string, unknown>): void {
  const missing = missingBuyerDealCredentials(buyer);
  if (missing.length > 0) {
    throw new Error(`Buyer cannot be approved without deal credentials: ${missing.join(", ")}`);
  }
}
