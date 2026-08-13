/**
 * RentCast property-data client.
 *
 * Official REST API (https://api.rentcast.io/v1) authenticated with the
 * X-Api-Key header. The key is read server-side only (process.env), never from
 * browser code. Request builders and response parsers are pure so the contract
 * can be unit-tested without a live account.
 *
 * Endpoints used (verified against the RentCast API reference):
 *  - GET /properties?address=...&limit=1            → property record
 *  - GET /avm/rent/long-term?address=...            → rent estimate + subject property
 *  - GET /properties?address=...&radius&saleDateRange&limit → sold comparables
 */

export const RENTCAST_BASE_URL = "https://api.rentcast.io/v1";

export type RentcastProperty = {
  id: string;
  formattedAddress?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  county?: string;
  propertyType?: string;
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  lotSize?: number;
  yearBuilt?: number;
  assessorID?: string;
  lastSaleDate?: string;
  lastSalePrice?: number;
  propertyTaxes?: Record<string, { year?: number; total?: number }>;
};

export type RentcastRentEstimate = {
  rent?: number;
  rentRangeLow?: number;
  rentRangeHigh?: number;
  subjectProperty?: RentcastProperty;
};

export type RentcastSoldComps = {
  radiusMiles: number;
  saleDateRangeDays: number;
  properties: RentcastProperty[];
  /** Numeric sold prices from the returned records, newest first. */
  soldPrices: number[];
};

export function rentcastApiKey() {
  const key = process.env.RENTCAST_API_KEY?.trim();
  if (!key) {
    throw new Error("RENTCAST_API_KEY is not configured on the Convex deployment");
  }
  return key;
}

/** Pure: builds the query string for the /properties endpoint. */
export function buildPropertyQuery(params: {
  address: string;
  radius?: number;
  saleDateRange?: number;
  propertyType?: string;
  limit?: number;
}): Record<string, string> {
  const query: Record<string, string> = { address: params.address };
  if (params.radius !== undefined) query.radius = String(params.radius);
  if (params.saleDateRange !== undefined) query.saleDateRange = String(params.saleDateRange);
  if (params.propertyType) query.propertyType = params.propertyType;
  if (params.limit !== undefined) query.limit = String(params.limit);
  return query;
}

/** Pure: normalizes one RentCast property record, tolerating missing fields. */
export function parsePropertyRecord(value: unknown): RentcastProperty | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "";
  if (!id) return null;
  const numberField = (key: string) => (typeof record[key] === "number" ? (record[key] as number) : undefined);
  const stringField = (key: string) => (typeof record[key] === "string" ? (record[key] as string) : undefined);
  const taxesRaw = record.propertyTaxes;
  let propertyTaxes: RentcastProperty["propertyTaxes"];
  if (taxesRaw && typeof taxesRaw === "object" && !Array.isArray(taxesRaw)) {
    propertyTaxes = {};
    for (const [year, entry] of Object.entries(taxesRaw as Record<string, unknown>)) {
      if (entry && typeof entry === "object") {
        const entryRecord = entry as Record<string, unknown>;
        propertyTaxes[year] = {
          year: typeof entryRecord.year === "number" ? entryRecord.year : Number(year),
          total: typeof entryRecord.total === "number" ? entryRecord.total : undefined,
        };
      }
    }
  }
  return {
    id,
    formattedAddress: stringField("formattedAddress"),
    addressLine1: stringField("addressLine1"),
    city: stringField("city"),
    state: stringField("state"),
    zipCode: stringField("zipCode"),
    county: stringField("county"),
    propertyType: stringField("propertyType"),
    bedrooms: numberField("bedrooms"),
    bathrooms: numberField("bathrooms"),
    squareFootage: numberField("squareFootage"),
    lotSize: numberField("lotSize"),
    yearBuilt: numberField("yearBuilt"),
    assessorID: stringField("assessorID"),
    lastSaleDate: stringField("lastSaleDate"),
    lastSalePrice: numberField("lastSalePrice"),
    propertyTaxes,
  };
}

/** Pure: normalizes the /avm/rent/long-term response. */
export function parseRentEstimate(value: unknown): RentcastRentEstimate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const numberField = (key: string) => (typeof record[key] === "number" ? (record[key] as number) : undefined);
  return {
    rent: numberField("rent"),
    rentRangeLow: numberField("rentRangeLow"),
    rentRangeHigh: numberField("rentRangeHigh"),
    subjectProperty: parsePropertyRecord(record.subjectProperty) ?? undefined,
  };
}

/** Pure: latest annual property tax total from the record's tax history. */
export function latestAnnualPropertyTax(property: RentcastProperty | null | undefined): number | undefined {
  if (!property?.propertyTaxes) return undefined;
  const years = Object.keys(property.propertyTaxes)
    .map((key) => Number(key))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a);
  for (const year of years) {
    const entry = property.propertyTaxes[String(year)];
    if (typeof entry?.total === "number" && entry.total > 0) return entry.total;
  }
  return undefined;
}

async function rentcastRequest<T>(path: string, query: Record<string, string>): Promise<T> {
  const url = new URL(RENTCAST_BASE_URL + path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "X-Api-Key": rentcastApiKey(),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as Record<string, unknown>).message)
        : response.statusText;
    throw new Error(`RentCast ${path} failed (${response.status}): ${detail}`);
  }
  return payload as T;
}

/** Property record for a specific address (best match of the returned list). */
export async function fetchPropertyRecord(address: string): Promise<RentcastProperty | null> {
  const payload = await rentcastRequest<unknown>("/properties", buildPropertyQuery({ address, limit: 1 }));
  if (Array.isArray(payload)) {
    return parsePropertyRecord(payload[0]);
  }
  return parsePropertyRecord(payload);
}

/** Rent estimate for a property address, including the matched subject property. */
export async function fetchRentEstimate(address: string): Promise<RentcastRentEstimate | null> {
  const payload = await rentcastRequest<unknown>("/avm/rent/long-term", { address });
  return parseRentEstimate(payload);
}

/** Sold comparables near the address: property records with numeric sale prices. */
export async function fetchSoldComps(options: {
  address: string;
  radius?: number;
  saleDateRange?: number;
  limit?: number;
}): Promise<RentcastSoldComps> {
  const radiusMiles = Math.max(0.5, Math.min(25, options.radius ?? 3));
  const saleDateRangeDays = Math.max(30, Math.min(3650, options.saleDateRange ?? 365));
  const limit = Math.max(1, Math.min(50, options.limit ?? 12));
  const payload = await rentcastRequest<unknown>("/properties", buildPropertyQuery({
    address: options.address,
    radius: radiusMiles,
    saleDateRange: saleDateRangeDays,
    limit,
  }));
  const records = Array.isArray(payload) ? payload : [];
  const properties = records
    .map((record) => parsePropertyRecord(record))
    .filter((property): property is RentcastProperty => Boolean(property));
  const soldPrices = properties
    .map((property) => property.lastSalePrice)
    .filter((price): price is number => typeof price === "number" && price > 0)
    .sort((a, b) => b - a);
  return { radiusMiles, saleDateRangeDays, properties, soldPrices };
}

/** Composed fetch: property record + rent estimate + sold comps for one address. */
export async function fetchPropertyData(options: {
  address: string;
  radius?: number;
  saleDateRange?: number;
  compsLimit?: number;
}): Promise<{ property: RentcastProperty | null; rentEstimate: RentcastRentEstimate | null; comps: RentcastSoldComps }> {
  const property = await fetchPropertyRecord(options.address);
  const rentEstimate = await fetchRentEstimate(options.address);
  const comps = await fetchSoldComps({
    address: options.address,
    radius: options.radius,
    saleDateRange: options.saleDateRange,
    limit: options.compsLimit,
  });
  return { property, rentEstimate, comps };
}
