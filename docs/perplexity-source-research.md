# Perplexity-assisted source research

This is the applied workflow for the `skills/perplexity-cli/` pack.

## Purpose

Use Perplexity's `pplx` CLI to discover and narrow public real-estate source pages before running the owner-only Camofox crawler. Perplexity is a research assistant; it is not the source of truth and it does not create or approve leads.

## Full-domain lead task

For a lead-finding task, provide a complete site origin, for example `https://www.auction.com/`, rather than a single property listing URL. The crawler should use that origin to discover the homepage's public listing surfaces, sitemap/pagination/category links, and every reachable relevant listing page within its per-run limit. Each batch must preserve the original page URL, retrieval date, and quoted evidence; one batch must never be described as the entire site when the site is larger than the cap.

If access is blocked, do not bypass CAPTCHA, robots rules, rate limits, login walls, paywalls, or other access controls. Check permitted alternatives first: an official API/feed/export, a documented sitemap or partner endpoint, or a maintained compliant connector. If those paths fail, collect buyer criteria—location, target price range, property type, condition/distress requirements, timeline, and other constraints—then use buyer-first fallback to search only matching seller sources.

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
2. Select a reusable default website such as Auction.com, or paste the complete domain into **Custom starting links**.
3. Keep the page cap bounded and same-site filtering enabled; repeat reviewed batches for larger sites.
4. Capture the pages and review the evidence snapshot and original page.
5. Qualify a candidate only when the required address/location, source reference, date, and distress evidence are explicit.
6. Approve manually; only then can the normal lead and buyer-match workflow continue.

## Non-negotiable boundary

Do not import Perplexity snippets directly into leads, hot deals, exports, or contact paths. Do not use it to fabricate names, addresses, phones, emails, ownership, distress, or verification status. If the official page cannot be opened or the evidence is incomplete, leave the record unqualified.
