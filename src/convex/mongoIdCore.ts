export type MongoIdLookup = {
  kind: "string" | "objectId";
  value: string;
};

/**
 * Mongo documents in this app can have native ObjectId values or legacy literal
 * string IDs. The UI serializes both as strings, so delete actions must try the
 * literal form first and the native ObjectId form when the value is hex-shaped.
 */
export function mongoIdLookups(id: string): MongoIdLookup[] {
  const value = id.trim();
  const lookups: MongoIdLookup[] = [{ kind: "string", value }];
  if (/^[0-9a-f]{24}$/i.test(value)) lookups.push({ kind: "objectId", value });
  return lookups;
}
