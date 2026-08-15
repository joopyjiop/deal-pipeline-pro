// Pure, testable helpers for the import-staging evidence gate (NON-NEGOTIABLE
// #4: every live lead needs a real sourceUrl, sourceRef, and sourceDate).
//
// This module is deliberately free of Convex and MongoDB imports so unit tests
// (tests/staging-evidence.test.ts) can exercise the rules directly. The
// authoritative enforcement points live in src/convex/mongodb.ts (promotion
// gate) and src/convex/admin.ts (admin CRUD), which both call into these
// helpers so the rules stay in one place.

export const STAGING_EVIDENCE_FIELDS = ["sourceUrl", "sourceRef", "sourceDate"] as const;

// Terminal review statuses. A staged source in one of these states is closed:
// it can never be promoted and its evidence status is preserved rather than
// recomputed. ARCHIVED is written once a NEW row has been promoted to a lead.
export const TERMINAL_STAGING_STATUSES = new Set(["DUPLICATE", "REJECTED", "ARCHIVED"]);

export type StagingRowLike = {
  sourceType?: unknown;
  sourceUrl?: unknown;
  sourceRef?: unknown;
  sourceDate?: unknown;
  distressScore?: unknown;
  rawJson?: unknown;
  [key: string]: unknown;
};

/** A valid evidence URL is a non-empty https:// URL with a hostname. */
export function isValidSourceUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

/** A valid evidence date is a parseable date that is not in the future. */
export function isValidSourceDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return parsed.getTime() <= endOfToday.getTime();
}

/** Names of the three evidence fields that are missing or invalid on a row. */
export function missingEvidenceFields(row: StagingRowLike): string[] {
  const missing: string[] = [];
  if (!isValidSourceUrl(row.sourceUrl)) missing.push("sourceUrl");
  if (typeof row.sourceRef !== "string" || !row.sourceRef.trim()) missing.push("sourceRef");
  if (!isValidSourceDate(row.sourceDate)) missing.push("sourceDate");
  return missing;
}

export function isEvidenceComplete(row: StagingRowLike): boolean {
  return missingEvidenceFields(row).length === 0;
}

/**
 * The status a staged source should carry given its evidence fields. Complete
 * evidence → NEW (promotable); anything missing/blank/invalid → NEEDS_EVIDENCE
 * (the promotion gate rejects it). Terminal statuses (DUPLICATE/REJECTED/
 * ARCHIVED) are handled by callers, which preserve them instead of recomputing.
 */
export function computeStagingStatus(row: StagingRowLike): "NEW" | "NEEDS_EVIDENCE" {
  return isEvidenceComplete(row) ? "NEW" : "NEEDS_EVIDENCE";
}

// Phrases that assert the opposite of distress in a source excerpt. When a row
// carries a high distress score but its cited source says one of these, the
// score contradicts the source.
const NO_DISTRESS_PHRASES = [
  "no distress",
  "not distressed",
  "no signs of distress",
  "owner occupied",
  "owner-occupied",
  "no liens",
  "no foreclosure",
  "not in foreclosure",
  "not delinquent",
  "no tax liens",
  "free and clear",
];

// Phrases that imply distress. STRONG phrases are ones a low distress score
// would directly contradict (a sheriff/tax/foreclosure/auction record is
// distress by definition).
const DISTRESS_PHRASES = [
  "foreclos",
  "sheriff sale",
  "tax sale",
  "tax delinquent",
  "delinquent",
  "pre-foreclosure",
  "preforeclosure",
  "probate",
  "vacant",
  "abandoned",
  "bank owned",
  "reo",
  "lis pendens",
  "short sale",
  "lien",
  "auction",
];

const STRONG_DISTRESS_PHRASES = [
  "foreclos",
  "sheriff sale",
  "tax sale",
  "tax delinquent",
  "pre-foreclosure",
  "bank owned",
  "lis pendens",
  "short sale",
  "auction",
];

/**
 * Flags a row whose distressScore contradicts its cited source text:
 *   - score ≥ 60 but the source says "no distress" (and has no strong distress
 *     signal) → the score looks inflated;
 *   - score ≤ 20 but the source carries strong distress signals → the score
 *     looks deflated.
 * Returns "SCORE_MISMATCH" or null when there is nothing to judge.
 */
export function detectScoreMismatch(args: { distressScore?: unknown; sourceText?: unknown }): "SCORE_MISMATCH" | null {
  const score = typeof args.distressScore === "number" ? args.distressScore : NaN;
  if (!Number.isFinite(score)) return null;
  const text = typeof args.sourceText === "string" ? args.sourceText.toLowerCase() : "";
  if (!text.trim()) return null;

  const hasNoDistress = NO_DISTRESS_PHRASES.some((phrase) => text.includes(phrase));
  const strongDistress = STRONG_DISTRESS_PHRASES.some((phrase) => text.includes(phrase));
  const distressHits = DISTRESS_PHRASES.filter((phrase) => text.includes(phrase)).length;

  if (score >= 60 && hasNoDistress && !strongDistress) return "SCORE_MISMATCH";
  if (score <= 20 && (strongDistress || distressHits >= 2)) return "SCORE_MISMATCH";
  return null;
}

/** Title + excerpt from a staged source's rawJson, for the sanity heuristic. */
export function stagingSourceText(row: StagingRowLike): string {
  const raw = row.rawJson && typeof row.rawJson === "object" ? (row.rawJson as Record<string, unknown>) : {};
  const title = typeof raw.title === "string" ? raw.title : "";
  const excerpt = typeof raw.excerpt === "string" ? raw.excerpt : "";
  return `${title} ${excerpt}`.trim();
}

/** Convenience wrapper: score-mismatch check straight off a staging row. */
export function stagingScoreMismatch(row: StagingRowLike): "SCORE_MISMATCH" | null {
  return detectScoreMismatch({ distressScore: row.distressScore, sourceText: stagingSourceText(row) });
}
