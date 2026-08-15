// Skip-trace data helpers for the wholesale pipeline. Pure and unit-testable;
// the Convex action that performs the network call and persists the result
// lives in mongodb.ts (`skipTraceLead`), which owns the Mongo client and the
// owner gate.
//
// Data honesty: skip-trace results are sourced contact data from the provider,
// stored with a source URL + date. They never fabricate PII, and owner approval
// is still required before any dial/export path uses the numbers.

export const SEARCHBUG_ENDPOINT = "https://data.searchbug.com/api/search.aspx";
export const PEOPLEFINDERS_ADDRESS_URL = "https://www.peoplefinders.com/address";

export type SkipTraceSearch = {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  /** Street only, no unit number (provider constraint). */
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

export type SkipTracePhone = {
  number: string;
  type?: string;
  carrier?: string;
  listingName?: string;
  score?: number;
  possibleSubject?: boolean;
};

export type SkipTraceContact = {
  provider: "searchbug";
  reportToken?: string;
  names: Array<{ first?: string; middle?: string; last?: string }>;
  phones: SkipTracePhone[];
  emails: string[];
  addresses: Array<{ line1?: string; city?: string; state?: string; zip?: string }>;
};

// Search fields only — the action adds the provider credentials (CO_CODE/PASS)
// server-side so the secret never reaches this module or the browser.
export function buildSearchbugForm(search: SkipTraceSearch): Record<string, string> {
  const form: Record<string, string> = { TYPE: "api_ppl", FORMAT: "JSON", LIMIT: "25" };
  if (search.firstName?.trim()) form.FNAME = search.firstName.trim();
  if (search.middleName?.trim()) form.MNAME = search.middleName.trim();
  if (search.lastName?.trim()) form.LNAME = search.lastName.trim();
  if (search.address?.trim()) form.ADDRESS = search.address.trim();
  if (search.city?.trim()) form.CITY = search.city.trim();
  if (search.state?.trim()) form.STATE = search.state.trim();
  if (search.zip?.trim()) form.ZIP = search.zip.trim();
  return form;
}

export function formatPropertyAddress(input: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): string {
  const line2 = [input.state, input.zip].filter((value) => value?.trim()).join(" ");
  return [input.address, input.city, line2].filter((value) => value?.trim()).join(", ");
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Detects Searchbug's error envelope. The provider reports failures as
// {"Status":"Error","Data":null,"Error":"..."} (account/plan problems, bad
// credentials, etc.) rather than via an HTTP status, and some paths also return
// an {"error": ...} node. Returns the message when the payload is a provider
// error, else undefined. This must run before parseSearchbugResult so an error
// payload is never persisted as an empty ("no records") contact.
export function extractSearchbugError(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const record = raw as Record<string, unknown>;
  const status =
    typeof record.Status === "string"
      ? record.Status
      : typeof record.status === "string"
        ? record.status
        : undefined;
  const errorField = record.Error ?? record.error;
  const isErrorStatus = typeof status === "string" && status.toLowerCase() === "error";
  if (!isErrorStatus && !("Error" in record) && !("error" in record)) return undefined;
  if (typeof errorField === "string" && errorField.trim()) return errorField.trim();
  if (errorField && typeof errorField === "object") {
    const message = (errorField as { message?: string }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return isErrorStatus ? "Unknown provider error" : undefined;
}

// Normalizes a Searchbug "Enhanced People Search" JSON response into the flat
// contact shape persisted on leads. Defensive: the provider's JSON mirrors its
// XML (names/addresses/phones/reportToken) and may omit any node.
export function parseSearchbugResult(raw: unknown): SkipTraceContact {
  const root = asObject(raw);
  const nested = asObject(root.response);
  const body = Object.keys(nested).length > 0 ? nested : root;

  const names = asArray(body.names).map((item) => {
    const name = asObject(item);
    return {
      first: text(name.firstName),
      middle: text(name.middleName),
      last: text(name.lastName),
    };
  });

  const seen = new Set<string>();
  const phones: SkipTracePhone[] = asArray(body.phones)
    .map((item) => {
      const phone = asObject(item);
      const number = text(phone.phoneNumber) ?? "";
      return {
        number,
        type: text(phone.phoneType),
        carrier: text(phone.carrier),
        listingName: text(phone.listingName),
        score: typeof phone.score === "number" ? phone.score : undefined,
        possibleSubject: text(phone.possibleSubjectPhone)?.toLowerCase() === "yes",
      };
    })
    .filter((phone) => {
      if (!phone.number || seen.has(phone.number)) return false;
      seen.add(phone.number);
      return true;
    });

  const emails: string[] = [];
  for (const item of asArray(body.emails)) {
    const email = asObject(item);
    const value = text(email.email) ?? text(email.emailAddress) ?? text(item);
    if (value && !emails.includes(value)) emails.push(value);
  }

  const addresses = asArray(body.addresses).map((item) => {
    const address = asObject(item);
    return {
      line1: text(address.line1),
      city: text(address.city),
      state: text(address.state),
      zip: text(address.zip),
    };
  });

  return {
    provider: "searchbug",
    reportToken: text(body.reportToken),
    names,
    phones,
    emails,
    addresses,
  };
}
