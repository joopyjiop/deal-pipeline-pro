/**
 * Pure read-only marketplace projections (no Convex imports — unit-testable
 * from tests/). Used by the `marketplaceOverview` action (src/convex/
 * marketplace.ts) to serve the ONLY surface non-owner signed-in users see:
 * approved sellers (verified leads), approved buyers (contact data stripped),
 * and matches (with resolved lead address + buyer name).
 *
 * Rules:
 *  - Sellers: approved + verified, non-fabricated property listings only.
 *  - Buyers: APPROVED intake only, and NEVER phone/email/POF evidence or
 *    purchase history — contact PII stays owner-only.
 *  - Matches: match rows with market-speak summaries, plus the resolved lead
 *    address and buyer name so the card is readable without owner queries.
 */

export type DealSort = "distress" | "matches" | "profit";

/**
 * Shared deterministic deal sort used by both the marketplace (non-owner
 * surface) and the owner dashboard. Deals without an estimated profit rank
 * last on the profit sort; ties always fall back to distress score.
 */
export function sortDeals<T extends { distressScore: number; matchCount?: number; estimatedProfit?: number }>(deals: T[], sortBy: DealSort): T[] {
  const sorted = [...deals];
  if (sortBy === "matches") {
    sorted.sort((a, b) => (b.matchCount ?? 0) - (a.matchCount ?? 0) || b.distressScore - a.distressScore);
  } else if (sortBy === "profit") {
    sorted.sort((a, b) => {
      const profitA = a.estimatedProfit ?? -Infinity;
      const profitB = b.estimatedProfit ?? -Infinity;
      if (profitA !== profitB) return profitB > profitA ? 1 : -1;
      return b.distressScore - a.distressScore;
    });
  } else {
    sorted.sort((a, b) => b.distressScore - a.distressScore);
  }
  return sorted;
}

export interface SellerCard {
  _id: string;
  propertyAddress: string;
  city: string;
  state: string;
  zip: string;
  county: string;
  parcelId?: string;
  sourceType: string;
  sourceUrl: string;
  sourceRef: string;
  sourceDate: string;
  distressScore: number;
  verificationStatus: string;
  arv?: number;
  repairs?: number;
  mao?: number;
  acquisitionPrice?: number;
  /** Estimated gross spread — MAO minus contract price (same formula as the pipeline). */
  estimatedProfit?: number;
  /** Number of active (non-rejected) buyer matches on this deal. */
  matchCount: number;
  updatedAt?: number;
}

export interface BuyerCard {
  _id: string;
  name: string;
  budgetMin: number;
  budgetMax: number;
  targetAreas: string[];
  exitType: string;
  proofOfFundsStatus: string;
  intakeStatus: string;
  verificationStatus: string;
  updatedAt?: number;
}

export interface MatchCard {
  _id: string;
  leadId: string;
  buyerId: string;
  matchScore: number;
  buyBoxSummary: string;
  confidence: string;
  status: string;
  rejectReason?: string;
  updatedAt?: number;
  leadAddress?: string;
  buyerName?: string;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : undefined;
}

/** Approved, verified, non-fabricated lead → public seller card. */
export function toSellerCard(doc: Record<string, unknown>): SellerCard | null {
  const id = str(doc._id);
  const propertyAddress = str(doc.propertyAddress);
  if (!id || !propertyAddress) return null;
  const distressScore = num(doc.distressScore);
  if (distressScore === undefined) return null;
  return {
    _id: id,
    propertyAddress,
    city: str(doc.city) ?? "",
    state: str(doc.state) ?? "",
    zip: str(doc.zip) ?? "",
    county: str(doc.county) ?? "",
    parcelId: str(doc.parcelId),
    sourceType: str(doc.sourceType) ?? "",
    sourceUrl: str(doc.sourceUrl) ?? "",
    sourceRef: str(doc.sourceRef) ?? "",
    sourceDate: str(doc.sourceDate) ?? "",
    distressScore,
    verificationStatus: str(doc.verificationStatus) ?? "UNVERIFIED",
    arv: num(doc.arv),
    repairs: num(doc.repairs),
    mao: num(doc.mao),
    acquisitionPrice: num(doc.acquisitionPrice),
    estimatedProfit: estimatedProfitFrom(doc),
    matchCount: 0,
    updatedAt: num(doc.updatedAt),
  };
}

/** Estimated gross spread — same formula as the pipeline (MAO − contract price). */
export function estimatedProfitFrom(doc: { mao?: unknown; acquisitionPrice?: unknown }): number | undefined {
  return typeof doc.mao === "number" && typeof doc.acquisitionPrice === "number"
    ? doc.mao - doc.acquisitionPrice
    : undefined;
}

/**
 * Count active (non-REJECTED) matches per lead id. Keys are the string ids
 * used in the match rows (`leadId`), which match the serialized lead `_id`.
 */
export function countActiveMatchesByLead(matches: Array<Record<string, unknown>>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of matches) {
    if (match.status === "REJECTED") continue;
    const leadId = str(match.leadId);
    if (!leadId) continue;
    counts.set(leadId, (counts.get(leadId) ?? 0) + 1);
  }
  return counts;
}

/** APPROVED buyer → PII-stripped buyer card (no phone/email/POF evidence). */
export function toBuyerCard(doc: Record<string, unknown>): BuyerCard | null {
  const id = str(doc._id);
  const name = str(doc.name);
  if (!id || !name) return null;
  const budgetMin = num(doc.budgetMin);
  const budgetMax = num(doc.budgetMax);
  if (budgetMin === undefined || budgetMax === undefined) return null;
  return {
    _id: id,
    name,
    budgetMin,
    budgetMax,
    targetAreas: numArray(doc.targetAreas) ?? [],
    exitType: str(doc.exitType) ?? "FLIP",
    proofOfFundsStatus: str(doc.proofOfFundsStatus) ?? "UNVERIFIED",
    intakeStatus: str(doc.intakeStatus) ?? "PENDING",
    verificationStatus: str(doc.verificationStatus) ?? "UNVERIFIED",
    updatedAt: num(doc.updatedAt),
  };
}

/**
 * Match row with resolved lead address + buyer name (from the already-scrubbed
 * lists) so the card is readable without exposing any owner-only queries.
 */
export function toMatchCard(
  doc: Record<string, unknown>,
  sellers: SellerCard[],
  buyers: BuyerCard[],
): MatchCard | null {
  const id = str(doc._id);
  const leadId = str(doc.leadId);
  const buyerId = str(doc.buyerId);
  const matchScore = num(doc.matchScore);
  if (!id || !leadId || !buyerId || matchScore === undefined) return null;
  const seller = sellers.find((candidate) => candidate._id === leadId);
  const buyer = buyers.find((candidate) => candidate._id === buyerId);
  return {
    _id: id,
    leadId,
    buyerId,
    matchScore,
    buyBoxSummary: str(doc.buyBoxSummary) ?? "",
    confidence: str(doc.confidence) ?? "LOW",
    status: str(doc.status) ?? "PENDING",
    rejectReason: str(doc.rejectReason),
    updatedAt: num(doc.updatedAt),
    leadAddress: seller ? `${seller.propertyAddress}, ${seller.city}, ${seller.state} ${seller.zip}` : undefined,
    buyerName: buyer?.name,
  };
}
