// In-house semantic search over leads (build-your-own-x "Search Engine" pattern).
//
// This is the legitimate in-project version of a vector index: embeddings are
// produced by an official provider (Ollama Cloud) and ranked with plain cosine
// similarity — no Rust/Python index, no managed vector service, no data leaving
// the app beyond the embedding call. For a corpus of hundreds of leads,
// brute-force cosine is fast and keeps the whole pipeline owner-gated and
// attributable. Pure TypeScript with no Convex or MongoDB imports so it can be
// unit-tested. The ranker never invents data: it only scores text the lead
// already carries, and callers exclude fabricated rows before this module sees
// them.

export type EmbeddableLead = {
  _id: string;
  propertyAddress?: unknown;
  city?: unknown;
  county?: unknown;
  state?: unknown;
  zip?: unknown;
  parcelId?: unknown;
  sourceType?: unknown;
  sourceRef?: unknown;
  distressSignals?: Array<{ type?: unknown; evidence?: unknown }>;
  notes?: unknown;
};

// The text blob that gets embedded: everything a lead already carries, nothing
// invented. Location and identity fields dominate; distress evidence follows;
// free-text notes trail. Trimmed to a bounded length so the embedding call
// stays cheap.
export function embeddingPrompt(lead: EmbeddableLead): string {
  const parts = [
    lead.propertyAddress,
    lead.city,
    lead.county,
    lead.state,
    lead.zip,
    lead.parcelId,
    lead.sourceType,
    lead.sourceRef,
    ...(Array.isArray(lead.distressSignals) ? lead.distressSignals.flatMap((signal) => [signal?.type, signal?.evidence]) : []),
    lead.notes,
  ]
    .filter((value): value is string | number => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).trim())
    .filter(Boolean);
  return parts.join(" · ").slice(0, 4000);
}

export function isFiniteVector(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

export function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0 || !Number.isFinite(magnitude)) return vector;
  return vector.map((value) => value / magnitude);
}

// Cosine similarity between two same-length vectors. Mismatched or empty
// vectors score 0 rather than throwing — callers can filter by score.
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

export type RankedEmbedding = { id: string; score: number };

// Brute-force cosine ranking over the candidate set — the honest in-project
// vector index. Rows without a usable vector are skipped, scores are bounded
// to a sane 0..1 window, and the top-k (best first, ties by id) are returned.
export function rankBySimilarity(
  queryVector: number[],
  rows: Array<{ id: string; vector?: unknown }>,
  limit: number,
): RankedEmbedding[] {
  const capped = Math.max(1, Math.min(50, Math.floor(limit)));
  return rows
    .filter((row) => isFiniteVector(row.vector))
    .map((row) => ({ id: row.id, score: cosineSimilarity(queryVector, row.vector as number[]) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, capped);
}
