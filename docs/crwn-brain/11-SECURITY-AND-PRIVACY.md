# 11 — Security & Privacy

> Documentation-focused review. **No code was changed. No secret values appear here.** Findings are graded Critical / High / Medium / Low / Informational, each with evidence, file path, why it matters, and remediation. Many findings are marked `Confirmed` (code read directly); a few are `Strongly inferred`.
>
> **Context:** CRWN's money + entitlement surface has been hardened repeatedly after *real* production incidents (paid-audio leak, entitlement-oracle outage, fan-email leak, cashout-RPC lockdown). Two live canaries (`rls-canary`, `onboarding-health`) probe these paths daily from the outside. The findings below are what remained visible at commit `614b958`.

---

## Positive controls already in place (Confirmed)

- **Auth:** Supabase `@supabase/ssr` cookie sessions (`sameSite:lax, secure`), PKCE code-exchange in middleware. Browser client uses anon key + RLS; service-role client is API-route-only.
- **Role integrity:** `profiles.role`, `platform_tier`, `stripe_connect_id` are **frozen at the column level** (`schema-phase2-rls-column-restrictions.sql`) — a client cannot self-promote. fan→artist promotion is a server-side SECURITY DEFINER trigger.
- **Admin enforcement is server-side on every `/api/admin/*` route** — `requireAdmin.ts` (derives identity from session, never a client id) on 8 routes, equivalent inline checks on the rest; internal/cron admin routes gated by `CRON_SECRET` / `INTERNAL_TRACK_SECRET`.
- **Entitlement oracle:** paid track audio and gated community posts are redacted **in Postgres** via SECURITY DEFINER functions + redacting views (`tracks_public`, `community_posts_feed`); routes prove entitlement with the RLS-scoped client, and a NULL column *is* the 403.
- **Idempotent, signature-verified Stripe webhook**; atomic cashout RPCs (`atomic_fan_cashout`, `atomic_team_split_cashout`) with EXECUTE revoked from anon/authenticated.
- **DB-backed rate limiting** (`checkRateLimit` / `check_rate_limit` RPC) on 26+ sensitive routes (cashout, checkout, messaging, support).
- **Upload validation** (`validateUpload`: MIME + extension allowlist + size caps) exercised by the daily canary.
- **Security headers** in `next.config.ts`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera/mic/geo off).
- **Bot filtering** in middleware is analytics-only (does not gate access).

---

## Findings

### 🔴 HIGH-1 — Four webhook endpoints accept unauthenticated POSTs that mutate state
**Files:** `src/app/api/webhooks/resend/route.ts`, `src/app/api/outreach/webhook/route.ts`, `src/app/api/outreach/inbound/route.ts`, `src/app/api/sms/webhook/route.ts`. `Confirmed`.
- **Evidence:** each parses `req.json()`/form fields and writes via the service-role client with **no signature check**. Resend signs via Svix headers (`svix-id/-signature/-timestamp`) — none checked. `sms/webhook` (inbound STOP/YES) has no `X-Twilio-Signature` check, unlike its sibling `sms/status` which correctly verifies HMAC-SHA1.
- **Why it matters:** an attacker can forge `type:'email.complained'` to **mass-suppress arbitrary email addresses platform-wide** (killing transactional + marketing email delivery), or forge Twilio fields to opt phone numbers in/out of SMS lists, or inject fake outreach leads/replies.
- **Remediation:** verify the Svix signature on the two Resend routes (Resend/Svix SDK provides a verifier); add the same Twilio HMAC check `sms/status` already uses to `sms/webhook`.

### 🔴 HIGH-2 — `NEXT_PUBLIC_CRON_SECRET` is a client-bundled variable gating a cron-secret code path
**Files:** `src/components/artist/AiManagerCard.tsx:194`, `src/app/api/ai-manager/generate/route.ts:17`. `Confirmed` pattern; `Strongly inferred` exploitability (env values not readable).
- **Evidence:** the dashboard "Refresh" button sends `Authorization: Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`; the route checks it against `Bearer ${process.env.CRON_SECRET}` — the **same env var name that gates all 25 cron routes** (including `weekly-payout`, `team-split-accruals`). `NEXT_PUBLIC_*` is bundled into every browser. If the two are set equal (required for the button to work), the master cron secret is extractable from client JS. Separately, `/api/ai-manager/generate` does **no ownership check** on the body `artistId` — only the bearer token gates it.
- **Why it matters:** if the secrets match, any visitor could invoke any cron endpoint (force payouts/accruals). Even if not, anyone with the public value can trigger AI generation against arbitrary artists.
- **Remediation:** switch `/api/ai-manager/generate` to normal session auth (`requireArtistOwner`); eliminate the `NEXT_PUBLIC_CRON_SECRET` ↔ `CRON_SECRET` naming/value coupling and rotate.

### 🟠 MEDIUM-1 — Ownership-check helper adoption is very low
**File:** `src/lib/apiAuth.ts` (`requireArtistOwner`). `Confirmed`.
- **Evidence:** the canonical, well-documented ownership helper is imported by only ~3 of 195 service-role routes; every other route hand-rolls an equivalent inline check (`getOwnedArtistIds`, `getDealForUser`, etc.). No inconsistency was found in the sampled routes, but correctness rests on each author remembering the pattern.
- **Why it matters:** middleware skips `/api/` and the admin client bypasses RLS, so a single forgotten check = an IDOR/leak. This is the class of bug that already produced the `/api/audience` incident.
- **Remediation:** consolidate onto one audited helper; add a lint/review checklist item for any new service-role route.

### 🟠 MEDIUM-2 — `booking-checkout` trusts a client-supplied `artistId` for the purchase record
**File:** `src/app/api/stripe/booking-checkout/route.ts` (~lines 106, 116). `Confirmed`.
- **Evidence:** the Stripe transfer/fee correctly use the server-verified `artistIdFromArtist`, but `metadata.artist_id` and the `booking_purchases` insert use the **client body `artistId`**. Funds route correctly, but a mismatched id corrupts the purchase record / webhook metadata (wrong artist credited/notified).
- **Remediation:** use the verified artist id for all writes.

### 🟠 MEDIUM-3 — `/api/platform/limits` has no auth at all
**File:** `src/app/api/platform/limits/route.ts`. `Confirmed`.
- **Evidence:** `GET` takes `artistId` from the query string and returns that artist's `platform_tier` + usage counts via the admin client with **zero authentication**.
- **Why it matters:** low-sensitivity business metadata (tier, track/tier counts) leaks to any unauthenticated caller who knows an artist id. Not PII/financial, hence Medium not High.
- **Remediation:** require a session (this data is only needed by the owning artist's dashboard).

### 🟡 LOW-1 — `smart-links/capture` doesn't bind `artistId` to the link owner
**File:** `src/app/api/smart-links/capture/route.ts`. `Confirmed`. Public-by-design write; a forged POST can misattribute a captured lead to the wrong artist (integrity, not confidentiality). Remediation: derive artist from the `linkId`'s owning row.

### 🟡 LOW-2 — No CSP or HSTS header configured in-repo
**File:** `next.config.ts`. `Confirmed`. Vercel's edge may add HSTS by default (not verifiable from source), and there is no `Content-Security-Policy` — reduces defense-in-depth against XSS/clickjacking beyond `X-Frame-Options`. Remediation: add a CSP and explicit HSTS.

### 🟡 LOW-3 — SMS quiet-hour sends are silently dropped
**File:** `src/app/api/sms/send/route.ts:155` (`// TODO: implement deferred send queue`). `Confirmed`. Messages during 9pm–9am are counted but never queued/sent — a reliability gap that could look like a delivered send. Remediation: implement the deferral queue or surface the drop.

### 🟡 LOW-4 — Misleading route naming (`/api/admin/milestone`)
**File:** `src/app/api/admin/milestone/route.ts`. `Confirmed`. Lives under `/api/admin/` but is self-service (any authenticated user, self-scoped) — not a vulnerability, but the path implies admin-only. Remediation: move/rename.

### ℹ️ INFORMATIONAL
- **`/api/audience` fan-email leak is confirmed FIXED** (session + ownership check before `buildAudience`); the in-code comment documents the historical bug. `Confirmed`.
- **Paid-track audio leak is fixed** — private bucket + `tracks_public` redaction + signed URLs; `rls-canary` probes it daily. Confirm no CDN edge still serves the stale public object.
- **Entitlement-oracle outage** (`revoke-entitlement-oracle-execute.sql`) is fixed (`fix-entitlement-oracle-via-authuid.sql`); re-read that pair before touching EXECUTE grants on SECURITY DEFINER functions used in views.
- **`profiles.stripe_connect_id`** column privilege is **deliberately deferred** — it leaks via `useAuth` doing `select('*')`. Known, documented in `schema-phase2-stripe-id-column-privs.sql`. `Needs founder confirmation` on acceptable risk.
- **Methodology caveat:** the 195-file `SUPABASE_SERVICE_ROLE_KEY` surface was **sampled across every risk category, not exhaustively audited** — no leak found in anything reviewed, but a full sweep of the remaining files is a reasonable follow-up.

---

## Privacy & data-handling notes

- **PII stored:** fan/artist email, display name, phone, city/state/country, spend history, engagement scores, IP-derived visitor hashes. Emails/spend are exposed only to the owning artist (audience/CRM routes) or admin. `Confirmed`.
- **Visitor tracking:** middleware stores a **SHA-256 hash of `IP:UA`** (no raw PII), bot-filtered. `Confirmed` (`src/middleware.ts`).
- **Account deletion / deactivation:** `/api/account/deactivate` + `/reactivate` mutate only the caller's own row (soft state). Deactivation now genuinely hides the artist publicly, enforced at the **app layer** (not RLS): the `[slug]` page calls `notFound()` and home discovery filters the artist out when `profile.is_active === false` (only `false` hides; null/true both mean active). The deactivate modal now awaits the API and shows a confirmation screen before signing out (was an immediate sign-out), and `useAuth` calls the previously-dead `/api/account/reactivate` on first authenticated load when `is_active === false`, so logging back in reactivates. Still no full hard-delete/GDPR-erasure flow: the daily canary hard-deletes its throwaway user via admin client, but there's no user-facing "delete my account and data" path confirmed. `Needs founder confirmation`.
- **Service-role setup completion:** the new `POST /api/artist/complete-setup` (sets `artist_profiles.setup_completed = true`) follows the service-role-route-with-explicit-auth pattern: admin client, explicit `getUser`, confirms a row matched. `Confirmed`.
- **Suppression/consent:** `email_suppressions`, `fan_communication_prefs`, `sms_consent_log` implement unsubscribe + quiet-hours + 1-SMS/mo caps. Undermined by HIGH-1 (forgeable suppression writes). `Confirmed`.
- **Logging:** `console.error` in 142 files, `console.log` in 18; no external log sink. Spot-check did not find secrets logged, but there is no policy preventing it. `Low`.
- **No rate limit / signature on the unauthenticated webhooks** compounds HIGH-1.

## Dependency / supply-chain notes
- No `npm audit`/lockfile-scan output in repo; `package-lock.json` present. Notable: raw-fetch Twilio (no SDK) reduces one dependency but means signature verification is hand-rolled. `@google/genai` is an unused dependency (attack surface with no benefit) — candidate for removal. `Informational`.

---

*See also: [05-DATABASE.md](05-DATABASE.md) (RLS/entitlement detail) · [03-USER-ROLES-AND-PERMISSIONS.md](03-USER-ROLES-AND-PERMISSIONS.md) · [10-INTEGRATIONS.md](10-INTEGRATIONS.md) · [17-OPEN-QUESTIONS.md](17-OPEN-QUESTIONS.md)*
