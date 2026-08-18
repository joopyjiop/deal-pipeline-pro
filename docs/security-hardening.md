# Security hardening runbook — owner-only infrastructure items

Everything below is **account/DNS/infrastructure configuration that only the owner can do** — none of it lives in code. The code-side controls (constant-time secret checks, SSRF guard, admin IP allow-list env var, CI secret scan) are already in place and documented in `README.md → Security hardening`.

Checklist at a glance:

| # | Control | Where it's enforced | Status |
|---|---------|--------------------|--------|
| 1 | Constant-time secret comparisons | `src/convex/networkGuard.ts` (`constantTimeEqual`) + tests | ✅ done in code |
| 2 | Outbound SSRF protection | `assertPublicOutboundUrl` on every server-side fetch | ✅ done in code |
| 3 | Lockfile checked in / dep pinning | `bun.lock` + `package-lock.json`, CI `--frozen-lockfile` | ✅ done in code |
| 4 | CI secrets scan (gitleaks, full history) | `.github/workflows/security.yml` | ✅ done in code |
| 5 | Pre-commit secret scan | `.githooks/pre-commit` | ✅ file in repo — **you run one install command** (below) |
| 6 | Admin IP allow-list | `ADMIN_ALLOWED_IPS` env var (defense-in-depth) | ⚠️ code reads proxy headers; **authoritative gate is yours** (§2) |
| 7 | DNS CAA records | Your DNS provider | 🏗️ **you** (§3) |
| 8 | Separate registrar MFA | Your registrar account | 🏗️ **you** (§4) |
| 9 | Canary tokens | canarytokens.org + your alerting channel | 🏗️ **you** (§5) |
| 10 | Device-fingerprint-bound sessions | Not implemented (Convex Auth is stateless JWT; auth files are frozen) | ⚠️ options in §6 |

---

## 1. Pre-commit secret scan (one-time, per machine)

The hook is already in the repo at `.githooks/pre-commit` (runs `gitleaks protect --staged` on every commit; warns instead of blocking if gitleaks isn't installed). Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

Install gitleaks if missing:

```bash
brew install gitleaks          # macOS
go install github.com/gitleaks/gitleaks/v8@latest   # any OS with Go
```

Test it works (should pass cleanly):

```bash
gitleaks detect --source . --no-git   # scans working tree, no history needed
```

If you ever need to bypass a broken hook temporarily: `git commit --no-verify` — but the CI scan still runs on push, so it can't sneak past silently.

---

## 2. Authoritative IP allow-listing for the admin API

The app-level `ADMIN_ALLOWED_IPS` env var (Convex Keys panel) reads `x-forwarded-for` / `x-real-ip` / `cf-connecting-ip`, which a direct client can spoof. It is **defense-in-depth only**. The hard gate must sit in front of the app:

- **If you serve the app through Cloudflare** (custom domain in front of the frontend + proxied API routes): add a WAF custom rule — e.g. `(http.request.uri.path starts_with "/api/admin" or http.request.uri.path starts_with "/api/mcp/admin") and not ip.src in {203.0.113.0/24}` → **Block**. Use your real office/VPN IP range.
- **If the API stays on `*.convex.site` directly** (no proxy in front): you can't put a WAF in front of Convex's edge, so the header-based `ADMIN_ALLOWED_IPS` check plus the `ADMIN_API_KEY` is what you have. Strongest practical add-ons: (a) rotate `ADMIN_API_KEY` to a long random value and store it only in the Keys panel, (b) only ever call `/api/admin` from your VPN'd machine, (c) watch for 401 bursts via your alerting channel (§5).

---

## 3. DNS CAA records (restrict which CA can issue certs for your domains)

**Applies only to domains you control in your own DNS provider** — the `keen-aardvark-333.convex.site` / `.convex.cloud` zones are Convex-managed; you can't (and don't need to) set CAA there. If you have a custom domain (e.g. `dealproof.com` pointed at the frontend), add CAA there.

Using Let's Encrypt (free, what most hosts use):

```
dealproof.com.   CAA 0 issue "letsencrypt.org"
dealproof.com.   CAA 0 issuewild "letsencrypt.org"
dealproof.com.   CAA 0 iodef "mailto:you@example.com"
```

- `issue` = allow this CA to issue; `issuewild` = allow wildcard certs; `iodef` = email me on issuance attempts (useful tripwire).
- **Multiple CAA records are ANDed** — if *any* record says a CA isn't allowed, that CA can't issue. If you use a different CA (DigiCert/Sectigo via a reseller), use their exact domain: `digicert.com`, `sectigo.com`, `ssl.com`, `buypass.com`.
- Don't add `issuewild ";"` (blocks *all* wildcard issuance) unless you're certain you never use wildcard certs.

Verify (propagation can take minutes):

```bash
dig +short CAA dealproof.com
dig +short CAA dealproof.com @8.8.8.8      # bypass local resolver cache
nslookup -type=CAA dealproof.com
```

---

## 4. Separate MFA on the domain registrar account

- Enable a **second, independent** 2FA factor on your registrar account (Namecheap/GoDaddy/Cloudflare/etc.) — a *different* authenticator app (or hardware key) than the one used for email/other logins, so one stolen phone doesn't unlock everything.
- Turn on **registrar lock / transfer lock** and (if offered) **domain privacy** + account recovery PIN.
- If the registrar supports passkeys/security keys, prefer a hardware key (YubiKey) over SMS.
- Store the recovery codes somewhere not in your email account (a safe/paper).

Why: the registrar account can transfer domains and repoint DNS — a full hijack of the site, separate from any code or hosting breach.

---

## 5. Canary tokens (tripwires that page you on touch)

Free hosted service: **canarytokens.org** (Thinkst). You generate a token, plant it somewhere an attacker would look, and get alerted (email — or point the alert at your existing `ODYSSEUS_NOTIFY_WEBHOOK_URL` sink if you self-host canarytokens) the moment it's triggered.

Good plants for this app:

| Token type | Where to plant | What it catches |
|---|---|---|
| **URL token** | In a private-looking note that references the app's API (e.g. a docs snippet or gist that appears to contain a "recovery key") | Someone exfiltrating credentials/notes |
| **DNS token** | As a subdomain record in your DNS zone (e.g. `canary.dealproof.com`) | Infrastructure scanning / zone enumeration |
| **AWS keys token** | Anywhere a leaked credential stash would land | Credential harvesting bots |
| **Word/PDF token** | A "deal package" template | Phishing of your business docs |

Rules of thumb:

- **Never plant a token where it can be mistaken for a real credential** by you or a legitimate tool — a canary that fires on your own automation is noise, and a decoy that looks real in a real config location is a hazard. Keep decoys clearly labeled in your own head, and *never* put a canary inside an actual env var or config file the app reads.
- Set the alert to a dedicated inbox/webhook, and treat **any** token fire as a breach signal: rotate `ADMIN_API_KEY`, `MCP_TOOL_SERVER_SECRET`, `MONGODB_URI` immediately.
- Check the token's "last triggered" page occasionally to confirm the alerting path itself works.

---

## 6. Session/device binding — why it's not in, and options

Convex Auth issues **stateless JWT sessions** (no server-side session store), and the auth files (`src/convex/auth.ts`, `auth.config.ts`, `auth/emailOtp.ts`) are frozen per project rules. Binding a token to a device fingerprint would require a session store the current architecture doesn't have. Practical alternatives, in increasing effort:

1. **Short session lifetime** — set a short token TTL so a stolen token decays fast (config in the auth setup).
2. **Re-auth on sensitive actions** — the owner-only gates already sit server-side on every write; add a one-time OTP prompt for high-risk actions (export, approval) if you want belt-and-suspenders.
3. **Custom session layer** — front a proxy with its own session cookie + fingerprint, issuing short-lived Convex tokens behind it. Real work; only worth it if the threat model demands it.

---

## 7. Residual DNS-rebinding note (SSRF)

The code guard checks the URL's *host string*, not the DNS-resolved IP. A malicious hostname that resolves to a public IP at check time and a private IP at fetch time (DNS rebinding) is the one theoretical gap. If that threat model matters to you, route outbound fetches through an egress proxy (e.g. a small Cloudflare Workers/`fetch` proxy or Squid instance) that blocks private IPs at resolution time. Not needed for a typical wholesale pipeline.
