/**
 * Source-reference extraction for sourced candidates.
 *
 * Pure and unit-testable (no Convex or database deps) so the qualification
 * logic can be verified without a live deployment. Real case references —
 * cause numbers, clerk file numbers, parcel IDs, sale IDs — always carry a
 * digit; requiring one here also stops prose like "sale should …" or
 * "Sale Date …" from being misread as a reference.
 */

export function extractSourceReference(text: string, sourceType: string, sourceUrl: string): string | undefined {
  // The optional "W - "-style letter prefix handles clerk file records like
  // "CLERK FILE NO. W - 158620" where the numeric reference follows a letter.
  const referenceMatch = text.match(/\b(?:case|cause|parcel|sale|docket|reference|ref|clerk file)\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*(?:[A-Z]\s*[-/]\s*)?([A-Z0-9][A-Z0-9./-]{2,})/i);
  const referenceToken = referenceMatch?.[1];
  if (referenceToken && /\d/.test(referenceToken)) {
    return referenceToken;
  }
  const auctionListingId = sourceType === "AUCTION_COM" ? sourceUrl.match(/(?:-|\/)(\d{5,})(?:[/?#]|$)/i)?.[1] : undefined;
  return auctionListingId;
}
