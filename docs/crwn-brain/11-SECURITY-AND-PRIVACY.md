# 11 — Security & Privacy

> Documentation-focused review. **No code was changed. No secret values appear here.** Findings are graded Critical / High / Medium / Low / Informational, each with evidence, file path, why it matters, and remediation. Many findings are marked `Confirmed` (code read directly); a few are `Strongly inferred`.
>
> **Context:** CRWN's money + entitlement surface has been hardened repeatedly after *real* production incidents (paid-audio leak, entitlement-oracle outage, fan-email leak, cashout-RPC lockdown). Two live canaries (`rls-canary`, `onboarding-health`) probe these paths daily from the outside. The findings below are what remained visible at commit `614b958`.

---

## Positive controls already in place (Confirmed)

- **Auth:** Supabase `@supabase/ssr` cookie sessions (`sameSite:lax, secure`), PKCE code-exchange in middleware. Browser client uses anon key + RLS; service-role client is API-route-only.
- **Role integrity:** `profiles.role`, `platform_tier`, `stripe_connect_id` are **frozen at the column level** (`schema-phase2-rls-column-restrictions.sql`) — a client cannot self-promote. fan→artist promotion is a server-side SECURITY DEFINER trigger.
- **Admin enforcement is server-side on every `/api/admin/*` route** — `requireAdmin.ts` derives identity from the SESSION, never a client-supplied id. Internal/cron admin routes are gated by `CRON_SECRET` / `INTERNAL_TRACK_SECRET` and are registered exceptions.
  - **This claim was FALSE until 2026-08-12 (SEC-001).** `/api/admin/approvals` looked up the role of whatever user id the request carried (`?userId=`, `body.adminUserId`) and called `auth.getUser()` nowhere, so any unauthenticated caller who knew an admin's UUID held full admin authority: dump every profile and invite code, self-approve, mint codes, and switch the artist gate off. The UUID was not secret (`profiles?select=id,role&role=eq.admin` returns it to the anon key). Fixed and verified dead in production.
  - **"Equivalent inline checks" is no longer an accepted authority.** An inline role check is only equivalent if the identity it reads came from the session. The AUTH-001 suite now asserts the authority SOURCE: a role lookup must be accompanied by proven authority (session, a secret the caller must possess, or a provider signature), no admin route may accept a caller-supplied identity parameter, and no exception may claim a bare role check as its authority. Previously it regex-matched the string `role === 'admin'`, which the vulnerable code contained, so the suite stayed green over an unauthenticated admin route.
- **Entitlement oracle:** paid track audio and gated community posts are redacted **in Postgres** via SECURITY DEFINER functions + redacting views (`tracks_public`, `community_posts_feed`); routes prove entitlement with the RLS-scoped client, and a NULL column *is* the 403.
- **Idempotent, signature-verified Stripe webhook**; atomic cashout RPCs (`atomic_fan_cashout`, `atomic_team_split_cashout`) with EXECUTE revoked from anon/authenticated.
- **DB-backed rate limiting** (`checkRateLimit` / `check_rate_limit` RPC) on 26+ sensitive routes (cashout, checkout, messaging, support). The RPC's `p_user_id` is a **uuid**; unauthenticated routes key on a string (`ip:1.2.3.4`), so `checkRateLimit` hashes any non-uuid key into a stable uuid. Passing a raw string used to error (`22P02`) and fail closed, 429ing every visitor (fixed 2026-07-11, see CHANGELOG). The limiter still fails closed on an RPC error, but now logs it.
- **Upload validation** (`validateUpload`: MIME + extension allowlist + size caps) exercised by the daily canary.
- **Security headers** in `next.config.ts`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (camera/mic/geo off).
- **Bot filtering** in middleware is analytics-only (does not gate access).

---

## Findings

### ✅ HIGH-1 — FIXED 2026-07-14. Four webhook endpoints accepted unauthenticated POSTs that mutate state
**Files:** `src/app/api/webhooks/resend/route.ts`, `src/app/api/outreach/webhook/route.ts`, `src/app/api/outreach/inbound/route.ts`, `src/app/api/sms/webhook/route.ts`.
- **Was:** each parsed `req.json()`/form fields and wrote via the service-role client with **no signature check**. A forged `type:'email.complained'` could mass-suppress arbitrary addresses platform-wide (and opt a fan out of email from *every* artist they subscribe to); forged Twilio fields could fabricate `sms_consent_log` rows (the record of a fan's consent to be texted) or send STOP as any fan.
- **Now:** all four verified in `src/lib/webhookSignatures.ts` (hand-rolled HMAC via node `crypto`; no SDK added). Twilio = HMAC-SHA1 over the sorted params against the **public** url (never `req.url`: behind Vercel that carries an internal host and would never match). Resend = Svix HMAC-SHA256 over `${id}.${timestamp}.${rawBody}` with a 5 min replay window, hashing the **raw body** (re-serialising the parsed object reorders keys and breaks the digest). Verified against Twilio's and Svix's official published test vectors.
- **All four fail CLOSED**, including when the secret is simply unset. Rejecting is deliberate: Resend retries for hours so a config gap only delays events, whereas accepting unsigned POSTs means anyone can suppress an artist's email forever.
- **Secrets (one per Resend endpoint; Svix secrets are per-endpoint):** `RESEND_WEBHOOK_SECRET` (fan campaigns/sequences), `RESEND_OUTREACH_SECRET` (outreach bounces), `RESEND_INBOUND_SECRET` (lead replies). Twilio reused the existing `TWILIO_AUTH_TOKEN`.
- **2026-07-31 update:** `src/app/api/sms/webhook/route.ts` (and every other `/api/sms/*` route) was deleted with the SMS feature removal, so the Twilio half of this finding no longer applies. The three Resend endpoints remain as described.

### ✅ HIGH-2 — FIXED. `NEXT_PUBLIC_CRON_SECRET` was a client-bundled variable gating a cron-secret code path
**Files:** `src/components/artist/AiManagerCard.tsx`, `src/app/api/ai-manager/generate/route.ts`. `Confirmed` pattern; `Strongly inferred` exploitability (env values not readable).
- **Remediation shipped, re-verified 2026-08-11:** `NEXT_PUBLIC_CRON_SECRET` appears **nowhere in
  `src/`** except two historical comments. The Refresh button sends no `Authorization` header at
  all; it proves identity with the session cookie the browser already has. The route accepts EITHER
  the cron bearer (server to server) OR a session, and the session path runs `requireArtistOwner`
  plus a 10-per-hour rate limit, so the "no ownership check on body `artistId`" half is closed too.
  `src/lib/brainContract.test.ts` pins the ownership check so this cannot silently regress.
- **Evidence:** the dashboard "Refresh" button sends `Authorization: Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`; the route checks it against `Bearer ${process.env.CRON_SECRET}` — the **same env var name that gates all 25 cron routes** (including `weekly-payout`, `team-split-accruals`). `NEXT_PUBLIC_*` is bundled into every browser. If the two are set equal (required for the button to work), the master cron secret is extractable from client JS. Separately, `/api/ai-manager/generate` does **no ownership check** on the body `artistId` — only the bearer token gates it.
- **Why it matters:** if the secrets match, any visitor could invoke any cron endpoint (force payouts/accruals). Even if not, anyone with the public value can trigger AI generation against arbitrary artists.
- **Remediation:** switch `/api/ai-manager/generate` to normal session auth (`requireArtistOwner`); eliminate the `NEXT_PUBLIC_CRON_SECRET` ↔ `CRON_SECRET` naming/value coupling and rotate.

### ✅ HIGH-3 — FIXED 2026-07-24. Entitlement drift on live sessions (access kept after refund; private VOD readable by clippers)
**Files:** `src/lib/live/access.ts` (new), `src/app/api/live/{token,watch,chat,vod}/route.ts`, `src/components/live/LiveWatchRoom.tsx`, `src/lib/calendarReminders.ts`, `src/lib/webhookHandlers.ts`. `Confirmed`.
- **Was, three distinct bugs from one cause.** "Ticket = access" was re-implemented at six gates and they drifted. (a) Only the token mint, the prerecorded watch route and the sessions list honored a paid ticket, so a buyer with no subscription tier was shown the Subscribe wall by `LiveWatchRoom` and **never reached the token route that would have admitted them** — they paid and could not enter, chat, replay, or get a reminder. (b) `handleChargeRefunded` wrote a negative earning but never moved `live_ticket_purchases` off `'paid'`, the row the token mint reads, so **a refund returned the money and kept the access** (the `'refunded'` status existed in the CHECK constraint and was written by nothing). (c) In `/api/live/vod` the `visibility === 'private'` check sat **after** the clipper branch, so any fan holding one `source='clipper'` referral could download an artist's unreleased private footage. Clipper status is self-service, so that set is not artist-vetted.
- **Now:** one resolver (`hasPaidLiveTicket` / `hasTierAccess` / `paidTicketBuyersBySession`) that every gate calls. Full refunds revoke the ticket; partial ones do not, since a partial refund is not a cancelled seat. Private VOD is owner-only and checked first, so nothing below can widen it (an artist who wants a recording clipped makes it public — a deliberate behavior change from the previous "clippers can read private footage" comment).
- **Rule for future work:** any new live gate MUST call `src/lib/live/access.ts`. Six independent copies is what caused this.

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

### ✅ LOW-3: RESOLVED BY REMOVAL 2026-07-31. SMS quiet-hour sends were silently dropped
**File (deleted):** `src/app/api/sms/send/route.ts:155` (`// TODO: implement deferred send queue`). Messages during 9pm–9am were counted but never queued/sent. The entire SMS feature was removed 2026-07-31, so this gap no longer exists.

### 🟡 LOW-4 — Misleading route naming (`/api/admin/milestone`)
**File:** `src/app/api/admin/milestone/route.ts`. `Confirmed`. Lives under `/api/admin/` but is self-service (any authenticated user, self-scoped) — not a vulnerability, but the path implies admin-only. Remediation: move/rename.

### ℹ️ INFORMATIONAL
- **`/api/audience` fan-email leak is confirmed FIXED** (session + ownership check before `buildAudience`); the in-code comment documents the historical bug. `Confirmed`.
- **Paid-track audio leak is fixed** — private bucket + `tracks_public` redaction + signed URLs; `rls-canary` probes it daily. Confirm no CDN edge still serves the stale public object.
- **Entitlement-oracle outage** (`revoke-entitlement-oracle-execute.sql`) is fixed (`fix-entitlement-oracle-via-authuid.sql`); re-read that pair before touching EXECUTE grants on SECURITY DEFINER functions used in views.
- **`profiles.stripe_connect_id`** column privilege is **deliberately deferred** — it leaks via `useAuth` doing `select('*')`. Known, documented in `schema-phase2-stripe-id-column-privs.sql`. `Needs founder confirmation` on acceptable risk.
- **Methodology caveat:** the 195-file `SUPABASE_SERVICE_ROLE_KEY` surface was **sampled across every risk category, not exhaustively audited** — no leak found in anything reviewed, but a full sweep of the remaining files is a reasonable follow-up.

---

## Fan testimonials — verified closed, 2026-08-12

The testimonial base tables are the second family (after the SEC-012 money/CRM tables) shipped
CLOSED to every browser Data API role rather than RLS-filtered. Probed against production with the
ANON key on 2026-08-12:

- `fan_testimonials` and `fan_testimonial_requests` answer **42501** to `select(*)` AND to each of
  `body`, `fan_id`, `consent_scope`, `moderation_status`, `verification_evidence_id` named
  individually. Naming one revoked column fails the whole statement, which is the intended shape.
- `fan_testimonials_public` answers **200**. It is the entire client-readable surface, and its
  production column list is exactly `id, artist_id, body, context_kind, submitted_at, display_name,
  verification_label, tenure_label`.
- `artist_profiles.testimonial_requests_enabled` answers **42501** to anon: an artist's operating
  settings are not public.

**Invertibility, demonstrated rather than asserted.** A canary testimonial from a fan on a
1000-cent tier rendered publicly as "Verified supporter" + "Supporter for 3+ months". Neither the
tier name nor the price appears in the payload, so the pair that would reveal lifetime spend
cannot be assembled. This is the `leaderboardPrivacy.ts` lesson applied structurally: the price is
collapsed to a boolean inside a LATERAL join and never enters the view's SELECT list.

**Authorship freeze, verified by read-back.** A service-role UPDATE of `body`, `display_identity`
and `fan_id` returned success and changed nothing. The status code proves nothing here; the
read-back is the evidence. Same lesson as the SEC-003 identity freeze.

**Not provable through the Data API:** `relrowsecurity` on the two base tables. The grant closure is
the operative control (Postgres checks table privileges before RLS) and was proved; the RLS enable
rests on the migration's self-verify block, which raises rather than warns.

## Privacy & data-handling notes

- **PII stored:** fan/artist email, display name, phone, city/state/country, spend history, engagement scores, IP-derived visitor hashes. Emails/spend are exposed only to the owning artist (audience/CRM routes) or admin. `Confirmed`.
- **Visitor tracking:** middleware stores a **SHA-256 hash of `IP:UA`** (no raw PII), bot-filtered. `Confirmed` (`src/middleware.ts`).
- **Account deletion / deactivation:** `/api/account/deactivate` + `/reactivate` mutate only the caller's own row (soft state). Deactivation now genuinely hides the artist publicly, enforced at the **app layer** (not RLS): the `[slug]` page calls `notFound()` and home discovery filters the artist out when `profile.is_active === false` (only `false` hides; null/true both mean active). The deactivate modal now awaits the API and shows a confirmation screen before signing out (was an immediate sign-out), and `useAuth` calls the previously-dead `/api/account/reactivate` on first authenticated load when `is_active === false`, so logging back in reactivates. Still no full hard-delete/GDPR-erasure flow: the daily canary hard-deletes its throwaway user via admin client, but there's no user-facing "delete my account and data" path confirmed. `Needs founder confirmation`.
- **Service-role setup completion:** the new `POST /api/artist/complete-setup` (sets `artist_profiles.setup_completed = true`) follows the service-role-route-with-explicit-auth pattern: admin client, explicit `getUser`, confirms a row matched. `Confirmed`.
- **Suppression/consent:** `email_suppressions` and `fan_communication_prefs` implement email unsubscribe/suppression. `sms_consent_log` (and the other `sms_*` tables) are DORMANT since the SMS removal 2026-07-31: kept only as historical consent records, nothing reads or writes them. **The 2026-08-24 internal alert authorization did NOT reopen them.** The artist's consent to be contacted rides `acquisition_events` (versioned `CALL_CONSENT_TEXT` + timestamp, written by the call-request route). The internal recipient's consent to receive operational alerts is a BUSINESS RECORD held outside the product, which is what A2P 10DLC accepts for non-web opt-in; no consent table, UI or management system was built for one internal recipient, deliberately. `Confirmed`.
- **Import/invite consent (2026-07-30):** fan-contact import requires an explicit versioned permission attestation stored per row (`consent_attested_at`/`consent_attestation_version`); unattested contacts are NEVER emailable, contact invites re-check attestation + `is_subscribed_email` + global suppression at send time, and the contact unsubscribe link flips the contact row itself. Imported data is never equated with marketing consent. `Confirmed`.
- **SMS legal surface (2026-08-24):** `/privacy` section 8 and `/terms` section 13 carry the A2P 10DLC disclosures the JNW Creative Enterprises, Inc. campaign is vetted against: the verbatim non-sharing statement for mobile numbers and messaging consent, message frequency, "message and data rates may apply", STOP/HELP, the internal-only recipient description, and the processors that legitimately touch a number (Twilio, Supabase, Resend) stated as disclosure to a processor rather than a false "we never share" claim. `CallRequestCard` carries the same disclosures AT the point of opt-in, which is where Twilio's reviewer looks. Pinned by `src/lib/legal/legalPages.test.ts` inside `npm run verify:architecture`, mutation-verified. `Confirmed`.
- **Call-request qualification (2026-07-30):** `/api/lead-magnets/call-request` never reads a client band/score — it re-sanitizes the calculator answers against the tool's own input definitions and recomputes through the canonical `scoreLead`; the response is uniform (`{ok:true}`) so the scoring model cannot be probed; alerts are DB-claimed (one per phone per day) on `acquisition_events`. Since the SMS removal 2026-07-31 the alert is email to the founder (plus the optional `FOUNDER_ALERT_SMS_EMAIL` carrier gateway, also server-only and never echoed); no Twilio credentials exist anymore. `Confirmed`.
- **Support chat (2026-07-31):** `support_conversations`/`support_messages` follow the correct split: client READS via RLS + realtime only; ALL writes go through service-role routes (`/api/support/chat` with session auth on the user side, `/api/admin/support-chat` behind `requireAdmin`). The bug-report widget posts to `/api/support` with auto-captured page URL/user agent/user id. `Confirmed`.
- **Logging:** `console.error` in 142 files, `console.log` in 18; no external log sink. Spot-check did not find secrets logged, but there is no policy preventing it. `Low`.
- **No rate limit / signature on the unauthenticated webhooks** compounds HIGH-1.

## AI surfaces — the model is never the security boundary (2026-08-12)

Full inventory in `10-INTEGRATIONS.md`; operating rules in `15-AI-AGENT-INSTRUCTIONS.md`. Nine
model call sites, three providers (DeepSeek, OpenAI, Anthropic). The governing rule: **a security
property that disappears when the model ignores its system prompt was never a security property.**
Every claim below names its non-model control, and `src/lib/ai/agentSecurityBoundaries.test.ts`
asserts those controls rather than prompt wording.

| Claim | Non-model control |
|---|---|
| Support cannot read another user's conversation | every `support_conversations` read is `.eq('user_id', <session user>)`; the caller-supplied `conversationId` is ANDed with it, never trusted alone |
| Support cannot perform a privileged action | the completion is given **no tools**; its only outputs are `reply` and `needs_human` |
| Support cannot seize a thread from a human | `escalate()` returns early unless status is `ai`/`closed`, so the model can only move toward a human, never away |
| Admin agent cannot exceed approved capability | action-type allowlist → `validateActionParams` → `verifyActionSignature` → human approval showing the actual params → authorization rechecked at execution |
| Acquisition model cannot escalate | forced `tool_choice` (prose is not a legal output) → `validateDecision` against server-side allowlists → deterministic `fallbackDecision` |
| Sync opportunities cannot inject a link | `registration_url` comes from the server-side `SYNC_PLATFORMS` constant; `event_url` is pinned `null` |
| No provider receives secrets | no `process.env` value, service-role key, admin dataset or cross-artist row is assembled into any model context |

**Jailbreak blast radius.** If the support model is fully compromised, it can produce misleading
TEXT within one authenticated user's own conversation, and it can summon a human. It cannot read
another user or artist, reach admin data, move money, change a subscription or Team Split, flip a
flag, or invoke a tool, because it has none. That is a property of the route, not of the prompt.
The prompt rules exist because misleading text is itself harmful: a bot that says it issued a
refund stops the user chasing a real one.

**Autonomous Manager remains DORMANT** (the activation query selects on a column that does not
exist in production). Re-enabling it is a founder decision, guarded by `managerBoundaries.test.ts`.

## Dependency / supply-chain notes
- No `npm audit`/lockfile-scan output in repo; `package-lock.json` present. (The raw-fetch Twilio note that used to live here is moot: Twilio was removed entirely 2026-07-31.) `@google/genai` is an unused dependency (attack surface with no benefit) — candidate for removal. `Informational`.

---

*See also: [05-DATABASE.md](05-DATABASE.md) (RLS/entitlement detail) · [03-USER-ROLES-AND-PERMISSIONS.md](03-USER-ROLES-AND-PERMISSIONS.md) · [10-INTEGRATIONS.md](10-INTEGRATIONS.md) · [17-OPEN-QUESTIONS.md](17-OPEN-QUESTIONS.md)*
