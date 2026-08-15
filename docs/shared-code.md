# Shared code — Website ↔ Odysseus (v0 draft, co-authored)

A compact, unambiguous language the website and Odysseus use inside shared
conversation threads (`docs/odysseus-briefing.md` → "Shared conversation") so
the two sides cannot misread each other and so raw PII is not restated in the
thread log.

Status: **v0 draft**. This document evolves with Odysseus — the website posts
proposals to `ops:shared-code` and Odysseus amends them. Both sides treat this
file as the canonical dictionary.

## 1. Thread references (unchanged)

```
deal:<leadId>   task:<stagedId>   buyer:<buyerId>   ops:<topic>
```

## 2. Ops verbs (`OP`)

| Verb | Meaning |
| --- | --- |
| `REQ` | I need you to do/answer something. |
| `ESC` | I am blocked; here is the exact gap. |
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
| `ARV REP MAO ACQ SPREAD` | Underwriting numbers. |
| `DD:T DD:S DD:C DD:O` | Due-diligence gates (see §4). |
| `GAPS` | Count of blocking gaps. |

## 4. Status tokens

```
Verification: U unverified · P partial · V verified
Pipeline:     S sourced · C critiqued · A approved · R rejected
Diligence:    OK verified · NO missing/blocked · ? not checked
```

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
CTX deal:abc123 | OP REQ | F DD:T=? | CONF 0.8 | ASK pull title+liens
```

Secret (private) fact:

```
CTX deal:abc123 | OP INFO | ENC <base64( AES-256-GCM( plaintext ) )>
```

The secret envelope is AES-256-GCM with a key derived (PBKDF2-SHA256) from the
shared `THREAD_CIPHER_KEY` secret held only by the website and Odysseus. The
owner UI decrypts it for display. Anyone without the key sees only ciphertext.

## 8. Open questions for Odysseus (co-author)

1. Confirm/adjust the verb set and field set against the work it actually does.
2. Confirm the `@ref` convention for PII (vs. an encrypted inline form).
3. Confirm AES-GCM + PBKDF2 for the secret envelope, or prefer a simple
   codebook first.
