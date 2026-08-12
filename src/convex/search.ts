// In-house full-text search over leads (build-your-own-x "Search Engine" pattern).
//
// No external search service: this module implements a small tokenizer plus a
// BM25-style relevance score (TF-IDF family) and a ranked query pass. It is
// pure TypeScript with no Convex or MongoDB imports so it can be unit-tested
// and shared by the owner dashboard and the authenticated MCP pipeline tool.
//
// The ranker never creates or invents data: it only scores text the lead
// already carries. Fabricated rows are excluded by the callers before this
// module sees them.

export type SearchableLead = {
  _id: string;
  propertyAddress?: unknown;
  city?: unknown;
  state?: unknown;
  zip?: unknown;
  county?: unknown;
  parcelId?: unknown;
  sourceRef?: unknown;
  sourceType?: unknown;
  notes?: unknown;
};

// Field weights: location and identity fields dominate a real-estate search.
// Notes count less so long owner notes do not outrank an exact county match.
const FIELD_WEIGHTS: Record<string, number> = {
  propertyAddress: 2.2,
  county: 1.8,
  city: 1.6,
  state: 1.4,
  zip: 1.6,
  parcelId: 2.0,
  sourceRef: 2.0,
  sourceType: 1.0,
  notes: 0.6,
};

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "with",
  "by", "is", "are", "was", "were", "be", "been", "has", "have", "had",
  "it", "its", "this", "that", "these", "those", "from", "as", "not", "no",
]);

// Split on non-alphanumerics, lowercase, drop stop words and single letters.
// Keeps numeric tokens (ZIPs, parcel ids, street numbers) which matter here.
export function tokenize(text: string): string[] {
  const tokens = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length > 1 && !STOP_WORDS.has(token),
  );
  return Array.from(new Set(tokens));
}

function fieldText(lead: SearchableLead, field: string): string {
  const value = lead[field as keyof SearchableLead];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

// Weighted term frequency for one lead: sum of (field weight * term count)
// across every field the term appears in. Longer fields also produce a longer
// document length, so BM25's length normalization keeps them in check.
function leadTermStats(lead: SearchableLead) {
  const termCounts = new Map<string, number>();
  const fieldMatches = new Map<string, Set<string>>();
  let docLength = 0;
  for (const [field, weight] of Object.entries(FIELD_WEIGHTS)) {
    const text = fieldText(lead, field);
    if (!text) continue;
    for (const token of tokenize(text)) {
      const weighted = weight;
      termCounts.set(token, (termCounts.get(token) ?? 0) + weighted);
      docLength += weighted;
      if (!fieldMatches.has(field)) fieldMatches.set(field, new Set());
      fieldMatches.get(field)!.add(token);
    }
  }
  return { termCounts, fieldMatches, docLength };
}

export type RankedLead = {
  _id: string;
  score: number;
  matchedFields: string[];
};

const K1 = 1.2;
const B = 0.75;

// BM25 scoring with a saturated IDF (avoids negative weights for very common
// terms). Document frequency is computed across the candidate set only, which
// keeps this a bounded, per-request ranking pass.
function bm25Score(
  term: string,
  tf: number,
  docLength: number,
  avgDocLength: number,
  docFrequency: number,
  docCount: number,
) {
  const idf = Math.log(1 + (docCount - docFrequency + 0.5) / (docFrequency + 0.5));
  const denominator = tf + K1 * (1 - B + B * (docLength / Math.max(avgDocLength, 1)));
  return idf * ((tf * (K1 + 1)) / denominator);
}

export type SearchResult = {
  query: string;
  terms: string[];
  total: number;
  ranked: RankedLead[];
};

// Rank leads against a free-text query. Returns a stable, relevance-sorted
// list with the matched fields per lead. An empty/blank query returns the
// leads in input order with score 0 (callers fall back to their own sort).
export function rankLeads(leads: SearchableLead[], query: string): SearchResult {
  const terms = tokenize(query);
  const ranked: RankedLead[] = [];
  if (terms.length === 0) {
    return {
      query,
      terms,
      total: 0,
      ranked: leads.map((lead) => ({ _id: lead._id, score: 0, matchedFields: [] })),
    };
  }

  const stats = leads.map((lead) => ({ lead, stats: leadTermStats(lead) }));
  const docCount = stats.length;
  const totalLength = stats.reduce((sum, item) => sum + item.stats.docLength, 0);
  const avgDocLength = docCount > 0 ? totalLength / docCount : 0;

  // Document frequency: how many candidates contain each query term.
  const docFrequency = new Map<string, number>();
  for (const term of terms) {
    let count = 0;
    for (const item of stats) {
      if (item.stats.termCounts.has(term)) count += 1;
    }
    docFrequency.set(term, count);
  }

  for (const { lead, stats: leadStats } of stats) {
    let score = 0;
    const matched = new Set<string>();
    let matchedAny = false;
    for (const term of terms) {
      const tf = leadStats.termCounts.get(term) ?? 0;
      if (tf > 0) {
        matchedAny = true;
        score += bm25Score(term, tf, leadStats.docLength, avgDocLength, docFrequency.get(term) ?? 0, docCount);
      }
    }
    if (matchedAny) {
      for (const [field, tokens] of leadStats.fieldMatches) {
        if (terms.some((term) => tokens.has(term))) matched.add(field);
      }
      ranked.push({
        _id: lead._id,
        score: Math.round(score * 1000) / 1000,
        matchedFields: Array.from(matched),
      });
    }
  }

  ranked.sort((a, b) => b.score - a.score || a._id.localeCompare(b._id));
  return { query, terms, total: ranked.length, ranked };
}
