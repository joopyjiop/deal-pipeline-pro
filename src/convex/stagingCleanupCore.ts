// Pure, testable helpers for the staged-source cleanup actions
// (src/convex/stagingCleanup.ts). Deliberately free of Convex and MongoDB
// imports so unit tests (tests/staging-cleanup.test.ts) can exercise the
// rules directly.

export type StagedRowLike = {
  sourceUrl?: unknown;
  sourceRef?: unknown;
  sourceDate?: unknown;
  title?: unknown;
  excerpt?: unknown;
  rawJson?: unknown;
  [key: string]: unknown;
};

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * A staged source is EMPTY GARBAGE when it has no source URL anywhere (neither
 * top-level nor inside rawJson) and no readable content at all (no title or
 * excerpt anywhere). Such a row can never be reviewed, filled with evidence,
 * or promoted — the only honest action is to delete it. Rows with a URL or any
 * content are kept: they are actionable evidence, even when status is
 * NEEDS_EVIDENCE.
 */
export function isEmptyStagingRow(row: StagedRowLike): boolean {
  const raw = row.rawJson && typeof row.rawJson === "object" ? (row.rawJson as Record<string, unknown>) : {};
  const hasUrl = Boolean(stringValue(row.sourceUrl) || stringValue(raw.url));
  const hasContent = Boolean(
    stringValue(row.title) ||
      stringValue(raw.title) ||
      stringValue(row.excerpt) ||
      stringValue(raw.excerpt),
  );
  return !hasUrl && !hasContent;
}
