# Perplexity-assisted source research

This is the applied workflow for the `skills/perplexity-cli/` pack.

## Purpose

Use Perplexity's `pplx` CLI to discover and narrow public real-estate source pages before running the owner-only Camofox crawler. Perplexity is a research assistant; it is not the source of truth and it does not create or approve leads.

## One bounded research pass

```sh
pplx search web "public foreclosure auction listings <county> <state>" \
  --domains auction.com,<official-county-domain> \
  -n 10 \
  --output-dir source-research \
  --stdout-preview=240
```

Then inspect the returned JSON and retain only pages that are:

- public and permitted to access;
- clearly relevant to auction, sheriff, tax, assessor, recorder, or court-sale research;
- linked to a real source domain;
- specific enough to carry a source date, location, sale/reference number, or other evidence field.

For a shortlist of pages:

```sh
pplx content snippets \
  "address sale date parcel or case reference auction status" \
  <reviewed-url-1> <reviewed-url-2> \
  --max-tokens 512 \
  --max-tokens-per-page 256
```

Check each snippet's `error` field. Save the original URLs and retrieval timestamp with the research notes.

## Hand off to Deal Pipeline Pro

1. Open **Toolkit → Camofox link crawler**.
2. Select a reusable default website such as Auction.com, or paste the reviewed URLs into **Custom starting links**.
3. Keep the page cap bounded and same-site filtering enabled.
4. Capture the pages and review the evidence snapshot and original page.
5. Qualify a candidate only when the required address/location, source reference, date, and distress evidence are explicit.
6. Approve manually; only then can the normal lead and buyer-match workflow continue.

## Non-negotiable boundary

Do not import Perplexity snippets directly into leads, hot deals, exports, or contact paths. Do not use it to fabricate names, addresses, phones, emails, ownership, distress, or verification status. If the official page cannot be opened or the evidence is incomplete, leave the record unqualified.
