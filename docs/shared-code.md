# Shared code — Website ↔ Odysseus (v2, frozen)

A compact, unambiguous language the website and Odysseus use inside shared
conversation threads (`docs/odysseus-briefing.md` → "Shared conversation") so
the two sides cannot misread each other and so raw PII is not restated in the
thread log.

Status: **v2 — frozen**. Co-authored with Odysseus: v0 was posted to
`ops:shared-code`, v1 folded in the vocabulary observed in Odysseus's real
thread traffic (see §9), and v2 applies Odysseus's explicit confirmation and
amendments (see §8). Both sides now speak this code.

## 1. Thread references (unchanged)

```
deal:<leadId>   task:<stagedId>   buyer:<buyerId>   ops:<topic>
```

## 2. Ops verbs (`OP`)

| Verb | Meaning |
| --- | --- |
| `REQ` | I need you to do/answer something. |
| `ESC` | I am blocked; here is the exact gate + missing data. |
| `RES` | Resolved; here is the outcome. |
| `INFO` | Status only, no action requested. |
| `OWNER` | Owner decision required (approve / reject / dial / export). |
| `WAIT` | Waiting on external input (provider, human, cron). |

## 3. Field codes (`F <code>=<value>`, one fact per line)

| Code | Meaning |
| --- | --- |
| `ADDR CITY ST ZIP CTY PARCEL` | Property location. |
| `OWNER` | Owner name(s). Prefer `@ref` (see §5). |
| `MAIL` | Owner mailing address. Prefer `@ref`. |
| `ABS` | Absentee owner — `0`/`1`. |
| `SRC SRCURL SRCREF SRCDATE` | Source evidence. |
| `DSTR` | Distress score `0-100`. |
| `SIG` | Distress signal list. |
| `VFY` | Verification status — `U`/`P`/`V`. |
| `PIPE` | Pipeline status — `S`/`C`/`A`/`R`. |
| `RDY` | Ready for a buyer — `0`/`1`. |
| `ARV REP MAO ACQ SPREAD` | Underwriting numbers. |
| `DD:T` | Due-diligence gate — title (liens, encumbrances). |
| `DD:S` | Due-diligence gate — sales/comps verification. |
| `DD:C` | Due-diligence gate — condition/repairs. |
| `DD:O` | Due-diligence gate — ownership (owner + chain). |
| `MARG` | Estimated spread in dollars (ARV − repairs − purchase). |
| `TTL` | Days until the relevant deadline (auction/close). |
| `GAPS` | Count of blocking gaps. |
| `COMPS` | Sold comparable count (0 = none). |
| `COMPR` | Comps radius in miles. |
| `COMPD` | Comps look-back in days. |
| `SCORE` | Match / buyer-fit score `0-100`. |
| `BID` | Buyer id (matches `buyer:<id>`). |
| `BOX` | Buyer buy-box summary (budget, areas, exit). |
| `HOT` | Hot-deals feed flag — `0`/`1`. |

## 4. Status tokens

```
Verification: U unverified · P partial · V verified
Pipeline:     S sourced · C critiqued · A approved · R rejected
Diligence:    OK verified · NO missing/blocked · ? not checked
```

`DD:T`, `DD:S`, `DD:C`, and `DD:O` are independent gates — Odysseus and the
website check each one separately, and a lead is only `RDY=1` when all four
read `OK`. An `ESC` names the exact gate that blocked, never a lumped
"due diligence".

## 5. PII rule (privacy)

Never inline raw PII (names, addresses, phones, emails) in a thread. Point at
the record instead:

```
OWNER=@deal:abc123    → the owner name lives on that lead; go read it
MAIL=@deal:abc123     → the mailing address lives on that lead
```

If a fact must be inline (a brand-new number from a lookup), it goes in the
**secret envelope** (§7), never in plaintext. Secrets (API keys, webhook
secrets, `MONGODB_URI`) are never posted in any form.

## 6. Confidence

```
CONF 0.0-1.0   0 = unverified guess · 1 = source-verified
```

## 7. Envelope

Plaintext fact:

```
CTX deal:abc123 | OP REQ | F DD:S=? | CONF 0.8 | ASK pull comps within 3mi
```

Secret (private) fact:

```
CTX deal:abc123 | OP INFO | ENC <base64( AES-256-GCM( plaintext ) )>
```

The secret envelope is AES-256-GCM with a key derived (PBKDF2-SHA256) from the
shared `THREAD_CIPHER_KEY` secret held only by the website and Odysseus. The
owner UI decrypts it for display. Anyone without the key sees only ciphertext.

## 8. Odysseus's confirmation (v1 → v2)

Odysseus replied in `ops:shared-code` and confirmed the proposal with the
following adjustments, all applied in v2:

| Item | Odysseus's answer | Applied |
| --- | --- | --- |
| Verb set (`REQ ESC RES INFO OWNER WAIT`) | Keep. | ✓ |
| v1 field set (incl. `RDY COMPS COMPR COMPD SCORE BID BOX HOT`, DD gates) | Keep. | ✓ |
| PII `@ref` rule | Keep — never inline raw PII, reference `@deal:<leadId>`. | ✓ |
| Secret envelope | AES-GCM + PBKDF2 as proposed. | ✓ |
| New field `MARG` (estimated spread $) | Add, for quick deal-screening. | ✓ §3 |
| New field `TTL` (days until auction/close) | Add, for urgency. | ✓ §3 |
| Split `DD:O` (ownership) from `DD:T` (title) | Add — they are hit independently. | ✓ §3/§4 |
| `ESC` rule | Keep — names exact gate + missing fact + one `ASK`. | ✓ §9 |

## 9. v1 additions — vocabulary observed in Odysseus's threads

Folded in from Odysseus's own messages (so the two sides share one dictionary
for the things it actually asks about):

| Odysseus's wording | Code |
| --- | --- |
| "SALE_HISTORY cannot be verified … no comps in 12 months within 3 miles" | `ESC` + `F DD:S=NO` + `F COMPR=3` + `F COMPD=365` + `F COMPS=0` |
| "flag missing data" / "cannot verify from here" | `ESC` + the gate field (`DD:T/S/C/O`) |
| "escalate to you when I need a capability" | `ESC` |
| "score buyer fit" | `REQ` + `F SCORE=<0-100>` |
| "create matches" | `OWNER` (a match needs owner approval; report it, don't create it) |
| "which lead should I look at next" | `REQ` + `ASK next` → the website answers `RDY`/`DSTR`/`GAPS` ranked |
| "summarize the pipeline readiness" | `REQ` + `ASK brief` → the website answers the pipeline brief |

**Escalation rule (both sides):** an `ESC` must name the exact gate
(`DD:T/S/C/O`), the missing fact, and the single thing the other side should
do — one `ASK`, never a wish-list.

## 10. v2 additions — Odysseus's explicit amendments

Folded in from Odysseus's confirmation reply in `ops:shared-code`:

- `MARG` — estimated spread in dollars (`ARV − REP − ACQ`), used for quick
deal-screening.
- `TTL` — days until the deadline (auction or close), used for urgency
ranking.
- `DD:O` (ownership) split out from `DD:T` (title) — the two are checked
independently, so a thread can be blocked on exactly one.

Freeze: Odysseus offered `RES | CONF 1` to freeze; the website posted the
acceptance and this document is now the single source of truth for the code.
