// Coordinated team of specialized agents (pure TypeScript, no Convex imports).
//
// Each agent owns one stage of the pipeline: sourcing evidence, title/lien
// verification, rental underwriting, ARV/repairs, and buyer matching. Agents
// only ever read data the lead already carries or inputs the owner provided —
// nothing is invented. The readiness gate aggregates the blocking data gaps
// across all agents so an incomplete deal is flagged, never presented as ready.
//
// Shared by mongodb.ts (runAgentTeam / runBuyerMatches actions) and unit tests.

import { arvFromComps, rentalUnderwriting, repairEstimate, median } from "./underwriting";
import type { DataGap, RepairTier, RentalUnderwritingInput, RentalUnderwritingResult } from "./underwriting";

export type AgentName = "SOURCING" | "VERIFICATION" | "UNDERWRITING" | "ARV_REPAIRS" | "BUYER_MATCHING";

export const AGENT_ORDER: AgentName[] = ["SOURCING", "VERIFICATION", "UNDERWRITING", "ARV_REPAIRS", "BUYER_MATCHING"];

export const AGENT_LABELS: Record<AgentName, string> = {
  SOURCING: "Sourcing agent",
  VERIFICATION: "Verification agent",
  UNDERWRITING: "Underwriting agent",
  ARV_REPAIRS: "ARV & repairs agent",
  BUYER_MATCHING: "Buyer matching agent",
};

export type AgentReport = {
  agent: AgentName;
  status: "COMPLETED" | "BLOCKED";
  summary: string;
  findings: string[];
  dataGaps: DataGap[];
};

export type ReadinessReport = {
  ready: boolean;
  status: "READY" | "INCOMPLETE";
  gaps: DataGap[];
  categories: Record<AgentName, "FOUND" | "MISSING">;
  ranAt: number;
};

export type DueDiligenceEntryLike = {
  status?: string;
  summary?: string;
  sourceUrl?: string;
};

export type DueDiligenceLike = {
  titleAndLiens?: DueDiligenceEntryLike;
  saleHistory?: DueDiligenceEntryLike;
  condition?: DueDiligenceEntryLike;
  occupancy?: DueDiligenceEntryLike;
};

export type AgentLead = {
  _id: string;
  propertyAddress?: string;
  city?: string;
  state?: string;
  zip?: string;
  county?: string;
  parcelId?: string;
  sourceType?: string;
  sourceUrl?: string;
  sourceRef?: string;
  sourceDate?: string;
  distressScore?: number;
  distressSignals?: Array<{
    type?: string;
    evidence?: string;
    verified?: boolean;
    sourceUrl?: string;
    sourceDate?: string;
  }>;
  dueDiligence?: DueDiligenceLike;
  fabricated?: boolean;
  squareFeet?: number;
  arv?: number;
  repairs?: number;
  mao?: number;
  acquisitionPrice?: number;
  estimatedProfit?: number;
};

function gap(category: string, detail: string, blocksReady: boolean): DataGap {
  return { category, detail, blocksReady };
}

function report(agent: AgentName, blocked: boolean, summary: string, findings: string[], dataGaps: DataGap[]): AgentReport {
  return { agent, status: blocked ? "BLOCKED" : "COMPLETED", summary, findings, dataGaps };
}

// Sourcing agent: checks the source packet for the explicit facts a real deal
// requires. It only audits what the lead already carries; it never fabricates
// addresses, owners, dates, or references.
export function sourcingAgent(lead: AgentLead): AgentReport {
  const findings: string[] = [];
  const dataGaps: DataGap[] = [];

  if (lead.fabricated === true) {
    return report("SOURCING", true, "This record is flagged as fabricated and cannot enter the verified pipeline.", [], [
      gap("FABRICATED", "Fabricated rows are tombstoned and never surfaced.", true),
    ]);
  }

  const location = [lead.propertyAddress, lead.city, lead.state, lead.zip, lead.county];
  if (location.some((value) => !value?.trim())) {
    dataGaps.push(gap("LOCATION", "Property address, city, state, ZIP, and county are required to source a deal.", true));
  } else {
    findings.push(`Location packet complete (${lead.propertyAddress}, ${lead.city}, ${lead.state} ${lead.zip}, ${lead.county} County).`);
  }

  if (!lead.sourceUrl?.trim() || !lead.sourceRef?.trim() || !lead.sourceDate?.trim()) {
    dataGaps.push(gap("SOURCE_EVIDENCE", "A source URL, source reference, and source date are required to attribute the deal.", true));
  } else {
    findings.push(`Source attributed (${lead.sourceType} · ref ${lead.sourceRef} · ${lead.sourceDate}).`);
  }

  const signals = Array.isArray(lead.distressSignals) ? lead.distressSignals : [];
  const verifiedSignals = signals.filter((signal) => signal.verified === true && signal.evidence?.trim());
  if (signals.length === 0) {
    dataGaps.push(gap("DISTRESS_EVIDENCE", "No distress signals recorded; the sourcing agent cannot confirm why this property is a candidate.", true));
  } else if (verifiedSignals.length === 0) {
    dataGaps.push(gap("DISTRESS_EVIDENCE", "Distress signals exist but none are verified with dated evidence; the owner must confirm them before approval.", true));
  } else {
    findings.push(`${verifiedSignals.length} verified distress signal${verifiedSignals.length === 1 ? "" : "s"} on record.`);
  }

  const blocked = dataGaps.some((item) => item.blocksReady);
  return report(
    "SOURCING",
    blocked,
    blocked
      ? "Source packet is incomplete; the deal cannot be sourced honestly yet."
      : "Source packet is complete enough to proceed to verification.",
    findings,
    dataGaps,
  );
}

const VERIFICATION_CATEGORIES: Array<{ key: keyof DueDiligenceLike; label: string; blocksReady: boolean }> = [
  { key: "titleAndLiens", label: "TITLE_AND_LIENS", blocksReady: true },
  { key: "saleHistory", label: "SALE_HISTORY", blocksReady: true },
  { key: "condition", label: "CONDITION", blocksReady: true },
  { key: "occupancy", label: "OCCUPANCY", blocksReady: false },
];

// Verification agent: title/lien status, sale history + comparables, condition,
// and occupancy. It reports the due-diligence record as found/missing and never
// claims to have browsed the assessor, Zillow, or Realtor.com itself.
export function verificationAgent(dueDiligence: DueDiligenceLike | undefined): AgentReport {
  const findings: string[] = [];
  const dataGaps: DataGap[] = [];
  for (const category of VERIFICATION_CATEGORIES) {
    const entry = dueDiligence?.[category.key];
    if (entry?.status === "FOUND") {
      findings.push(`${category.label}: evidence on record.`);
    } else {
      const sourceHint = entry?.sourceUrl ? ` (see ${entry.sourceUrl})` : "";
      dataGaps.push(
        gap(
          category.label,
          `${category.label} has not been verified${sourceHint}. Check the county assessor, recorder/clerk, listing photos, or public records.`,
          category.blocksReady,
        ),
      );
    }
  }
  const blocked = dataGaps.some((item) => item.blocksReady);
  return report(
    "VERIFICATION",
    blocked,
    blocked
      ? "Verification is incomplete — title/lien, comparables, or condition are unconfirmed."
      : "Verification record is complete for the categories that gate readiness.",
    findings,
    dataGaps,
  );
}

export type ArvRepairsAgentInput = {
  squareFeet?: number;
  compPrices: number[];
  repairTier?: RepairTier;
  yearBuilt?: number;
};

// ARV & repairs agent: ARV from the sold-comp median (conservative/median/
// aggressive scenarios) and a repair estimate from square feet. Missing comps,
// square feet, or condition are flagged, never guessed.
export function arvRepairsAgent(input: ArvRepairsAgentInput): AgentReport {
  const findings: string[] = [];
  const dataGaps: DataGap[] = [];

  if (input.squareFeet === undefined || input.squareFeet <= 0) {
    dataGaps.push(gap("SQUARE_FEET", "Square footage is required to estimate repairs and normalize comps.", true));
  }
  const compValues = (input.compPrices ?? []).filter((value) => value > 0);
  if (compValues.length === 0) {
    dataGaps.push(gap("SOLD_COMPS", "No sold comparable prices were provided. ARV cannot be estimated — pull 3-5 recent sales nearby.", true));
  } else {
    const arv = arvFromComps(compValues);
    if (arv) {
      findings.push(`ARV scenario from ${arv.compCount} comps (median ${formatMoney(arv.compMedian)}): ${formatMoney(arv.conservative)}–${formatMoney(arv.aggressive)}.`);
    }
  }

  if (input.squareFeet !== undefined && input.squareFeet > 0) {
    const tier = input.repairTier ?? "MEDIUM";
    if (input.repairTier === undefined) {
      findings.push("Repair tier assumed at MEDIUM; replace with the owner's confirmed scope.");
    }
    const repairs = repairEstimate(input.squareFeet, tier, input.yearBuilt);
    findings.push(`Repair estimate ${formatMoney(repairs.total)} (${tier} tier · ${formatMoney(repairs.ratePerSquareFoot)}/SF).`);
  }

  const blocked = dataGaps.some((item) => item.blocksReady);
  return report(
    "ARV_REPAIRS",
    blocked,
    blocked
      ? "ARV cannot be estimated: comparable sales or square footage are missing."
      : "ARV and repair scenarios are ready from sourced comps.",
    findings,
    dataGaps,
  );
}

// Underwriting agent: wraps the rental model (rent estimate, NOI, debt service,
// DSCR, cap rate, cash flow). All gaps come from the model itself.
export function underwritingAgent(input: RentalUnderwritingInput): AgentReport {
  const model = rentalUnderwriting(input);
  return underwritingAgentFromModel(model);
}

export function underwritingAgentFromModel(model: RentalUnderwritingResult): AgentReport {
  const findings: string[] = [];
  if (model.rentEstimate !== undefined) findings.push(`Rent estimate ${formatMoney(model.rentEstimate)}/mo.`);
  if (model.netOperatingIncome !== undefined) findings.push(`Net operating income ${formatMoney(model.netOperatingIncome)}/yr.`);
  if (model.dscr !== undefined) findings.push(`DSCR ${model.dscr} on ${formatMoney(model.debtService.annual ?? 0)}/yr debt service.`);
  if (model.capRate !== undefined) findings.push(`Cap rate ${model.capRate}%.`);
  if (model.annualCashFlow !== undefined) findings.push(`Cash flow ${formatMoney(model.annualCashFlow)}/yr (${formatMoney(model.monthlyCashFlow ?? 0)}/mo).`);
  if (model.assumptions.length > 0) findings.push(`Assumptions: ${model.assumptions.join(" ")}`);

  const blocked = model.status === "BLOCKED";
  return report(
    "UNDERWRITING",
    blocked,
    model.status === "READY"
      ? "Full rental underwriting is complete (rent, NOI, DSCR, cap rate, cash flow)."
      : model.status === "PARTIAL"
        ? "Rental model is partial: NOI and cap rate are ready, but debt-service inputs are missing for DSCR and cash flow."
        : "Rental underwriting is blocked by missing key data.",
    findings,
    model.dataGaps,
  );
}

export type BuyerLike = {
  _id: string;
  budgetMin: number;
  budgetMax: number;
  targetAreas: string[];
  exitType: "ASSIGN" | "FLIP" | "BUY_HOLD";
  proofOfFundsStatus: "NONE" | "SELF_REPORTED" | "VERIFIED";
};

export type ScoredBuyerMatch = {
  buyerId: string;
  matchScore: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  components: { area: number; budget: number; exit: number; pofBoost: number };
  summary: string;
  rejectReason?: string;
};

function normalizeArea(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/ county$/i, "");
}

// Buyer matching agent scoring: deterministic 0-100 with documented components.
// 40 area overlap, 30 budget fit, 30 exit-type fit, +5 verified proof of funds.
export function scoreBuyerMatch(
  lead: Pick<AgentLead, "city" | "county" | "state" | "mao" | "arv" | "acquisitionPrice" | "estimatedProfit"> & {
    rentalModel?: { dscr?: number; annualCashFlow?: number; monthlyCashFlow?: number };
  },
  buyer: BuyerLike,
): ScoredBuyerMatch {
  const leadAreaTokens = [lead.city, lead.county, lead.state]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(normalizeArea);
  const targetTokens = (buyer.targetAreas ?? []).map(normalizeArea);

  let area = 0;
  // A target area hits when it matches the lead's city, county, or state token
  // (normalized, so "Fort Wayne", "fort wayne", and "Allen County" all match).
  const areaHit = targetTokens.some((target) =>
    leadAreaTokens.some((areaToken) => areaToken === target || areaToken.includes(target) || target.includes(areaToken)),
  );
  if (areaHit) {
    area = 40;
  }

  const referencePrice = lead.mao ?? lead.acquisitionPrice ?? lead.arv;
  let budget = 10; // unknown or out-of-band pricing — partial credit, flagged in the summary
  if (typeof referencePrice === "number" && referencePrice > 0) {
    if (referencePrice >= buyer.budgetMin && referencePrice <= buyer.budgetMax) {
      budget = 30;
    } else if (referencePrice >= buyer.budgetMin * 0.85 && referencePrice <= buyer.budgetMax * 1.15) {
      budget = 20;
    }
  }

  let exit = 15; // unconfirmed — partial credit, flagged in the summary
  const rentalModel = lead.rentalModel;
  if (buyer.exitType === "BUY_HOLD") {
    if (rentalModel?.dscr !== undefined) {
      exit = rentalModel.dscr >= 1.1 ? 30 : rentalModel.dscr >= 1 ? 25 : 15;
    }
  } else if (typeof lead.estimatedProfit === "number") {
    exit = lead.estimatedProfit > 0 ? 30 : lead.estimatedProfit === 0 ? 15 : 5;
  }

  const pofBoost = buyer.proofOfFundsStatus === "VERIFIED" ? 5 : 0;
  const matchScore = Math.min(100, area + budget + exit + pofBoost);
  const confidence: ScoredBuyerMatch["confidence"] = matchScore >= 80 ? "HIGH" : matchScore >= 60 ? "MEDIUM" : "LOW";

  const summaryParts: string[] = [];
  if (areaHit) summaryParts.push("target area overlap");
  else summaryParts.push("no area overlap");
  if (typeof referencePrice === "number" && referencePrice > 0) summaryParts.push(`price ${formatMoney(referencePrice)} vs budget ${formatMoney(buyer.budgetMin)}–${formatMoney(buyer.budgetMax)}`);
  else summaryParts.push("property pricing not modeled yet");
  summaryParts.push(`${buyer.exitType.replace(/_/g, " ").toLowerCase()} exit`);
  if (rentalModel?.dscr !== undefined && buyer.exitType === "BUY_HOLD") summaryParts.push(`DSCR ${rentalModel.dscr}`);
  if (buyer.proofOfFundsStatus === "VERIFIED") summaryParts.push("verified POF");

  return {
    buyerId: buyer._id,
    matchScore,
    confidence,
    components: { area, budget, exit, pofBoost },
    summary: summaryParts.join(" · "),
    rejectReason: area === 0 && budget <= 10 ? "No area overlap and pricing outside this buyer's buy box." : undefined,
  };
}

// Buyer matching agent: score every approved buyer against one lead and return
// the ranked candidate matches. Recommendations only — the owner approves.
export function buyerMatchingAgent(
  lead: Parameters<typeof scoreBuyerMatch>[0],
  buyers: BuyerLike[],
  minScore = 55,
): { matches: ScoredBuyerMatch[]; skipped: number } {
  const scored = buyers
    .map((buyer) => scoreBuyerMatch(lead, buyer))
    .sort((a, b) => b.matchScore - a.matchScore || a.buyerId.localeCompare(b.buyerId));
  return {
    matches: scored.filter((match) => match.matchScore >= minScore),
    skipped: scored.filter((match) => match.matchScore < minScore).length,
  };
}

// Readiness gate: aggregates every blocking gap across the agent team. An
// incomplete deal is flagged here — nothing surfaces as ready without this pass.
export function readinessReport(reports: AgentReport[]): ReadinessReport {
  const gaps = reports.flatMap((item) => item.dataGaps.filter((dataGap) => dataGap.blocksReady));
  const categories = Object.fromEntries(
    AGENT_ORDER.map((agent) => {
      const item = reports.find((reportItem) => reportItem.agent === agent);
      return [agent, item?.status === "COMPLETED" ? ("FOUND" as const) : ("MISSING" as const)];
    }),
  ) as ReadinessReport["categories"];
  return {
    ready: gaps.length === 0,
    status: gaps.length === 0 ? "READY" : "INCOMPLETE",
    gaps,
    categories,
    ranAt: Date.now(),
  };
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export { median };
