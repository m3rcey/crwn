# COMPREHENSIVE CRWN CYBERSECURITY AUDIT — 2026-08-12

**STATUS: REMEDIATED (2026-08-12). The findings below are preserved AS WRITTEN; the
remediation status of each is recorded in the disposition table immediately after this header.**

The original investigation is unchanged so the evidence stays auditable. What follows the
disposition table is the audit exactly as it was found. Companion reference:
`docs/CYBERSECURITY_AUDIT_2026-08-12_ROUTE_MANIFEST.md` (full 262-route authorization table).

---

## REMEDIATION DISPOSITION (updated 2026-08-12, after migrations applied)

Score after remediation: **8.5 / 10** (was 4.5). Reasoning at the end of this section.

Shipped on master and live: `0ae065cf` (SEC-001 emergency), `7ec8d679` (SEC-002/003/012 +
Team Split boundary), `70e133ea` (nine-finding batch), `e58e2796` (docs), `3a93542a`
(SEC-002 42P13 repair), `cbcc1270` (migration verification + Team Split funding math),
`2c93f9c4` (SEC-016 open redirect + private thumbnail).

**ALL FOUR MIGRATIONS ARE NOW APPLIED AND VERIFIED CLOSED IN PRODUCTION.** Each was proved by
replaying the audit's exact exploit, not by trusting the SQL editor:

| Migration | Exploit replayed | Before | After |
|---|---|---|---|
| SEC-002 | anon GET `rpc/check_rate_limit` | `25006` (executable, reached the DELETE) | **`42501` denied** |
| SEC-002/011 | anon GET `rpc/redeem_invite` | `25006` | **`42501` denied** |
| SEC-002/V11 | anon GET `rpc/user_passes_artist_gate` | (never revoked) | **`42501` denied** |
| SEC-002 | service-role negative window | would truncate `rate_limits` | **`22023` rejected** (validation installed) |
| SEC-002 | limiter still functions | n/a | returns `true`, no state damaged |
| SEC-003 | authenticated self-approve / email rewrite / role promote | writable | **204 but value UNCHANGED** (silent revert) |
| SEC-004 | anon INSERT `notifications` | `23503` (RLS let it through) | **`42501` denied** |
| SEC-007 | anon INSERT/DELETE `tier_benefits` | succeeded | **`42501` denied**, public read preserved |
| SEC-012 | anon SELECT on 15 money/CRM tables | readable or RLS-only | **`42501` on all 15** |
| SEC-001 | anon GET `/api/admin/approvals?userId=<real admin>` | `200` + full dump | **`403`** |

SEC-003 required an authenticated caller, so a throwaway user was created and deleted (the
same pattern as the onboarding canary). Legitimate profile writes still land; the one 42501
observed on a legitimate write was `Prefer: return=representation` selecting `*`, which names
revoked columns, i.e. the documented trap and not a regression.

`npm run verify:migrations` now covers these permanently under the OPPOSITE contract to a
normal probe: a security migration is proved applied by access becoming DENIED, so `42501` is
the pass and anything else fails the run. That distinction matters because an anon-executable
volatile RPC answers `25006` over GET, which the generic loop would have filed under "unclear"
and stayed green over an open hole.

| ID | Severity | Status | Evidence |
|---|---|---|---|
| SEC-001 | CRITICAL | **FIXED + VERIFIED IN PRODUCTION** | `requireAdmin()` (session) replaces the query-string identity; caller-supplied id parameter deleted; `updated_by` now the session actor. Live probe: real admin UUID went from HTTP 200 + full user/invite dump to **403**; random UUID 403; no param 403. Drift test rewritten to assert authority SOURCE and mutation-tested. |
| SEC-002 | CRITICAL | **FIXED + VERIFIED IN PRODUCTION** | anon EXECUTE now `42501` on `check_rate_limit`, `redeem_invite` and `user_passes_artist_gate` (all were `25006`). Negative window rejected `22023`. Limiter still returns `true`. The migration first failed with `42P13` because production declared parameter defaults the repo never described; rebuilt signature-agnostically via `pg_get_function_arguments()` rather than DROP FUNCTION, which would have left a window with no limiter (it fails closed, so every rate-limited route would 429 real users). |
| SEC-003 | CRITICAL | **FIXED + VERIFIED IN PRODUCTION** | Authenticated throwaway user could not self-approve, rewrite `email`, or promote `role`: all returned 204 with values unchanged (the freeze trigger's silent revert). App half also live: `collaborator_user_id` binds only at accept-invite against the VERIFIED auth email. |
| SEC-004 | HIGH | **FIXED + VERIFIED IN PRODUCTION** | anon INSERT on `notifications` now `42501`, was `23503` (RLS letting the write through, only a fake uuid stopping it). |
| SEC-005 | HIGH | **FIXED (LIVE)** | Client `artistId` removed; metadata and `booking_purchases` use the server-derived owner; `handleBookingPurchase` re-reads the artist from the booking row, closing the in-flight window. Pinned by `ledgerIntegrity.test.ts`, mutation-tested. |
| SEC-006 | HIGH | **FIXED (LIVE)** | Gross is now the charged amount (`session.amount_total`; `invoice.amount_paid` for renewals, which had the same bug). `??` not `||` so a real $0 charge books as 0. Mutation-tested. |
| SEC-007 | HIGH | **FIXED + VERIFIED IN PRODUCTION** | anon INSERT and DELETE on `tier_benefits` now `42501`; anon SELECT still returns rows, so the storefront is preserved. Writes are owner-only via a SECURITY DEFINER helper (avoids the revoked-column policy trap). |
| SEC-008 | HIGH | **FIXED (LIVE)** | All interpolated values escaped and bounded; recipient must be one well-formed address; the confirmation carries NO submitter-authored content (escaping alone would still have delivered attacker prose from an aligned domain); added a per-recipient rate limit. |
| SEC-009 | HIGH | **FIXED (LIVE)** | Stored audio values are now the bare owned key bound to the sender; the signer refuses caller-supplied absolute URLs. Also repaired DM voice notes, which were broken (the recorder returns a bare path the old http-only check rejected, so the only accepted values were attacker-shaped). |
| SEC-010 | HIGH | **FIXED (LIVE)** | Three layers outside the model: action-type allowlist, `validateActionParams` (shape/enums/bounds/no unknown keys), and `verifyActionSignature` proving the executed params are the ones the server proposed. Approval card renders the exact `{type, params}`. Bulk stage move bounded. Autonomous loop deliberately left failing closed. |
| SEC-011 | HIGH | **FIXED + VERIFIED IN PRODUCTION** | `redeem_invite` anon EXECUTE now `42501`. `user_passes_artist_gate` had the identical `REVOKE ... FROM PUBLIC` defect (surfaced by the new SEC-RPC invariant, not by the original audit) and is locked the same way. |
| SEC-012 | HIGH | **FIXED + VERIFIED IN PRODUCTION** | All 15 service-role-only money/CRM tables answer `42501` to anon, including the five CRM tables whose migration wrongly claimed "No RLS needed". `earnings` and `recruiters` deliberately excluded: they have browser readers and need real SELECT policies rather than a bare RLS enable, which would have broken an artist's own earnings view. Tracked in TODO.md. |
| SEC-013 | HIGH | **FIXED (LIVE)** | The smart link's own `artist_id` is now the only authority; body `artistId` ignored. Added the missing rate limit, format validation, and an incidental `capture_count` correctness fix. |
| SEC-014 | HIGH | **FIXED (LIVE)** | `audienceId` ownership proven on write; the squad lookup is scoped to the artist, matching the tier branch. |
| SEC-018 | HIGH/MED | **FIXED (LIVE)** | `fanIsInArtistAudience()` checks subscriptions / earnings / fan_contacts before a badge or notification can target a user. |
| SEC-019 | HIGH | **FIXED (LIVE)** | Per-IP and per-recipient rate limits; strict email validation; `name` bounded (this is the text the admin agent later reads, so it is also SEC-010 defense in depth). |
| Unsigned unsubscribe | MEDIUM | **FIXED** | The GET now only RENDERS a confirmation page; the mutation needs a POST carrying a server-minted HMAC token bound to recipient AND scope, plus a rate limit. That is what actually defeats a link-prefetching mail client, which was the reported vector. A token for one artist cannot be replayed onto another or onto "all". Unsigned legacy links stay honored behind an explicit flag because stranding a real unsubscribe is a compliance failure; the confirm step protects them until the flag flips. Still one click, still no login. |
| `producer/polls` unauthenticated | MEDIUM | **FIXED** | Now 401s and delegates to the canonical producer access resolver (the same one `vote` and `submissions` use) instead of re-deriving the rules a fourth time. Paid and private Executive Producer Session polls are no longer readable by anyone holding a session UUID. |
| `live/tips` per-fan spend | MEDIUM | **FIXED** | Exact per-fan amounts against raw fan UUIDs are no longer published to unauthenticated callers. Brought in line with `leaderboardPrivacy.ts`, which had already settled that a fan never agreed to publish what they spend. The on-stream alert and the artist's own reporting still work. |
| Notification `link` unvalidated | MEDIUM | **FIXED** | `link` goes through `safeInternalPath` (the strictest of the canonical validator's three policies), `type` is checked against an allowlist DERIVED from the notification taxonomy rather than restated, title/message are capped, and the render side is hardened so a legacy row already in the database cannot produce a dangerous href. |
| `check-limit` enumeration | MEDIUM | **FIXED** | Both routes now use `requireArtistOwner`, matching how `platform/limits` was fixed for this same class. |
| `earnings`/`recruiters` SELECT policies | MEDIUM | **MIGRATION WRITTEN, PENDING APPLY** | `schema-phase2-sec-earnings-recruiters-select-policies.sql`. They were excluded from SEC-012 on purpose (browser readers, so a bare RLS enable would break an artist's own earnings view). Protected in production today; the migration makes that protection reproducible from the repo. |
| Dependency (`sharp`/`next`) | INFO→**FIXED** | **FIXED** | next 16.3.0 / sharp 0.35.3. Closes the four libvips CVEs reachable UNAUTHENTICATED via `/_next/image` plus the image SVG DoS, postcss and nanoid. `npm audit` 6 high → 2, and both survivors verified dev-only (`npm ls --omit=dev` returns empty; they reach the tree only through eslint). The blocking premise was DISPROVEN: the 9 type errors reproduced on the untouched 16.2.9 baseline, so the checker was identical and only `next build`'s file coverage changed. The real finding is that the build had silently not been type-checking committed test files, hiding 9 defects including one genuine unhandled optional. That gap is now closed permanently. |
| CSP Report-Only | LOW | **FIXED (Report-Only), enforcement DEFERRED** | Verified LIVE in production this session, header captured in full below. No external `script-src` origin, because the code proves Stripe/Calendly are never loaded as scripts. Enforcement deliberately deferred: `script-src` still needs `'unsafe-inline'` for the App Router bootstrap, so it provides no XSS containment yet, and there is no report collector. Documented rather than overstated. |
| SEC-021 service worker | MEDIUM | **FIXED** | Authenticated navigations are network-only and never cached; `CACHE_NAME` bumped to purge pages already sitting on devices. |
| HSTS `includeSubDomains` | LOW | **DEFERRED, PLATFORM-LEVEL** | Production STS comes from the Vercel edge, not from code. Emitting a second header risks two competing values where a browser processes only one, so adding it in app code could WEAKEN HSTS. Belongs in the Vercel dashboard. Founder action, recorded in TODO.md. |
| Hard delete / data export | n/a | **DEFERRED FOR PRIVACY/RETENTION POLICY** | Unchanged. Financial, fraud, tax and dispute records may need retention; deactivate/reactivate remain safe and self-scoped. Does not block security completion. |
| F-3 Team Split funding | HIGH (structural) | **FUNDING BOUNDARY ENFORCED, RAIL SAFELY CLOSED** | Topology confirmed at the Stripe level: CRWN sells through DESTINATION charges (`transfer_data.destination` + `application_fee_percent`), so Stripe settles gross minus the fee straight into the ARTIST's Connect account and leaves only the fee with CRWN. Paying a collaborator therefore spent CRWN's own money. `src/lib/teamSplits/funding.ts` computes the charge-time reserve using the referral rail's proven pattern, and 18 tests assert conservation (CRWN revenue + commission + collaborator funding + artist proceeds == what the fan paid) across plans, discounts, referrals, caps, concurrent deals, over-allocation and refunds, in integer cents. NOT wired in and `cashoutFundingReady` stays false: see FUNDING_OPEN_QUESTIONS. Production still holds 0 deals, 0 accruals, 0 payouts. |
| SEC-016 open redirect | MEDIUM | **FIXED** | `src/lib/safeRedirect.ts` (3 policies) wired into all three email click-tracking routes. Origins are compared by PARSING, never string-matching, because `https://evil.example\@thecrwn.app/` reads as thecrwn.app to a person and evil.example to a parser. 17 adversarial tests cover scheme case, whitespace/tab/newline-in-scheme, percent-encoded schemes, NUL and Unicode separators, protocol-relative, backslash tricks, suffix/path/credential confusion, and signature replay. An origin allowlist was deliberately NOT used: artists legitimately link out (evidence: `appendUtmParams` short-circuits on `!url.includes('thecrwn.app')`), so the fix removes the hostile SCHEME and the SILENT hop, not the destination. |
| SEC-015 private live thumbnail | MEDIUM | **FIXED** | `live/thumbnail` now reads `visibility` and requires ownership for private sessions, answering 404 rather than 403 so a private session does not confirm it exists. Its own redirect was already safe (server-generated signed R2 URL, not request input). |
| Hard delete / data export | n/a | **DEFERRED FOR PRIVACY/RETENTION POLICY** | Per the ratified direction: security must not wait on deletion design, and financial/fraud/tax/dispute records may need retention. Deactivate/reactivate remain safe and self-scoped. |

### Update, second continuation (2026-08-12): score **9 / 10**

Every reachable finding is now closed. The remaining gap is not an unfixed vulnerability, it is
that CSP is Report-Only and therefore contains nothing yet, plus two platform/policy items that
are deliberately not code changes.

**Team Split funding is now enforced rather than merely designed.** The three ratified decisions
collapsed into ONE mechanism: an earning may only produce an accrual if that earning carries proof
a reserve was withheld (`earnings.metadata.team_split_reserved`), and the accrual is capped at what
was withheld. That single check enforces the effective-date rule, the no-pre-deal-accrual rule and
the no-unfunded-accrual rule at once, because an earning predating the deal simply has no reserve.
The failure mode is "the collaborator is owed nothing", never "owed money nobody funded". The
cashout rail stays closed, but it is now closed over a system where an unfunded payout is
**structurally impossible** rather than merely forbidden. Production still holds 0 deals, 0
accruals, 0 payouts.

**Why 9 and not 10.** CSP is Report-Only with `script-src 'unsafe-inline'`, so there is still no
XSS containment and no report collector; enforcement needs a middleware nonce. HSTS
`includeSubDomains` is a Vercel dashboard action that must not be faked in code. Hard delete
remains a retention-policy decision. The Team Split rail is safely disabled rather than correctly
funded end to end, because proving the Stripe source needs a canary that cannot be run without
real money. And one migration (`earnings`/`recruiters` SELECT policies) is written but not yet
applied. None of these is a reachable exploit; all are honest residual.

---

**Why 8.5 and not higher (first continuation, superseded above).** Every CRITICAL and every HIGH is
closed and, where observable, verified in production by replaying the original exploit. The live
open redirect is dead. What held the score down at that point:

- **CSP has no `script-src`.** The enforced policy is still `frame-ancestors` only, so there is no
  containment if an XSS ever lands. Cookies are `SameSite=Lax` with `httpOnly:false` (inherent to
  `@supabase/ssr`, since JS must read the token), which raises the cost of that gap.
- **A MEDIUM tail is open**: unsigned unsubscribe links (an email prefetcher can silently
  unsubscribe a fan, and `unsubscribe-all` covers every artist), `producer/polls` reading paid and
  private session polls unauthenticated, `live/tips` publishing exact per-fan spend against raw fan
  UUIDs, unvalidated notification `link`, and unauthenticated plan/catalog enumeration on the two
  `check-limit` routes.
- **Team Split funding is proven but not wired**, so the rail is disabled rather than correct. A
  disabled money rail is safe, not finished.
- **`earnings` and `recruiters` still lack explicit SELECT policies** (deliberately: they have
  browser readers, and a bare RLS enable would have broken an artist's own earnings view).
- **`sharp`/`next` advisory is unpatched**, reachable unauthenticated through `/_next/image` with
  wildcard `remotePatterns`.
- Residual and irreducible: third-party provider risk, and observability is thin (no CSP report
  collector, no security alerting on the new denial paths).

**Why not lower.** No credential was ever exposed, git history and the supply chain are clean, all
the original positive controls survived, every migration was verified by exploit replay rather than
by trusting the SQL editor, and the drift system that once certified a broken route as safe now
asserts authority sources across nine classes with every invariant mutation-tested.

---

Method: 9 parallel evidence streams over the full repo (262 API routes, 162 migrations, 407 lib
files), plus read-only production probes with the PUBLIC anon key and safe unauthenticated GET/HEAD.
No mutation was performed against production. RPC executability was proven with a GET (PostgREST runs
GET in a READ-ONLY transaction, so an anon-executable volatile function fails `25006` on its write
without writing anything; a denied one returns `42501` first). Confidence tags: **confirmed** =
quoted code + reproduced behavior this session; **high** = quoted code, behavior inferred;
**medium/low** = evidence but a gap remains.

---

## Security score: 4.5 / 10

Rationale. The platform has genuinely strong *primitives*: webhook signatures are correct and
fail-closed on every provider, the livemode guard is present and unbypassable, Stripe money
*destinations* are always server-derived (no client-supplied amount/fee/connected-account/currency
reaches Stripe on any rail), the cashout RPCs use advisory locks with `EXECUTE` revoked from anon,
`requireAdmin`/`requireArtistOwner` are correctly session-derived and re-read per request, the
sensitive Stripe-ID columns are revoked at the column level (verified `42501` in production), and
there is no `dangerouslySetInnerHTML` sink anywhere in the app.

It scores below the midpoint anyway because the *boundary* those primitives are supposed to defend
is porous in ways that are exploitable today. One admin route authenticates from a query-string UUID
that is anonymously discoverable, giving unauthenticated full admin capability. The platform's only
rate-limiter is an anon-executable Postgres function that a single unauthenticated call can truncate.
`profiles` and several money/CRM tables have `UPDATE`/RLS gaps that Supabase's default grants turn
into privilege and integrity holes. The money ledger can be poisoned from the client (`artistId` and
discount gross) and Team Split commissions are structurally paid from CRWN's own balance. And the
drift-prevention system, which reads as assurance, certifies the single worst route as safe because
its test asserts a *string* (`role === 'admin'`) rather than an authorization property. The score is
"good engineers, correct instincts, but the authorization surface was never audited exhaustively" —
which is exactly what AUTH-002 deferred to this audit.

Why not higher: the CRITICALs are unauthenticated and reachable now. Why not lower: no confirmed
secret exposure, clean git history, clean supply chain, money *theft* requires multiple preconditions
that mostly do not hold yet (0 active Team Split deals, digital-product files null, public R2 domain
disabled), and the data-read path for the money ledger and PII is genuinely closed to anon.

## Finding counts

| Severity | Count |
|---|---|
| CRITICAL | 3 |
| HIGH | 14 |
| MEDIUM | 18 |
| LOW | 13 |
| INFORMATIONAL | 8 |

## Executive verdict

CRWN is one query-string away from anonymous admin takeover in production **today** (SEC-001,
confirmed live), and one unauthenticated call away from disarming all platform rate limiting
(SEC-002, confirmed). Neither requires a stolen session. Both exist because the same structural fact
runs through the whole codebase: middleware does not guard `/api/`, and 246 of 262 routes use a
service-role client that bypasses RLS, so **each route is its own and only authorization boundary** —
and a handful of them get it wrong. The money rails are better built than the access-control layer,
but the ledger is poison-able from the client and Team Split payouts are funded from the wrong
balance. The AI systems are correctly designed (authorization lives outside the model, no cross-tenant
leakage, no secret in any prompt), with one real exception: attacker-controlled text can reach the
admin agent and a poisoned action is approvable because the approval card renders the model's prose
but hides the actual `params`. Fix order is dominated by dependencies, not raw severity: close the two
unauthenticated CRITICALs and the RLS/grant gaps first, because several money and abuse findings are
only "not exploitable yet" because those gates happen to hold.

## Top 10 security findings

1. **SEC-001 (CRITICAL, confirmed live)** — `/api/admin/approvals` authenticates from a caller-supplied
   `userId`/`adminUserId`; the admin's UUID is anonymously discoverable (`profiles?role=eq.admin`).
   Unauthenticated full admin capability. The drift registry falsely certifies it safe.
2. **SEC-002 (CRITICAL, confirmed)** — `check_rate_limit` is anon-`EXECUTE`-able and a negative
   `p_window_seconds` deletes the entire `rate_limits` table: one unauthenticated call disables all
   platform rate limiting; a chosen `p_user_id` can also 429-lock any victim.
3. **SEC-003 (CRITICAL, high)** — `profiles.email` (+ `phone`, `full_name`, `is_approved`) are
   self-writable (freeze trigger + column revoke cover only 3 columns), and Team Splits binds a
   collaborator by `profiles.email`, so a user who pre-claims a producer's email can receive that
   producer's real payout.
4. **SEC-004 (HIGH, confirmed live)** — `notifications` INSERT policy is `WITH CHECK (true)` without
   `TO service_role`, i.e. `PUBLIC`: anonymous callers inject notifications (attacker `title`/`message`/`link`)
   into any user's feed. In-product phishing channel.
5. **SEC-005 (HIGH, confirmed)** — `booking-checkout` writes a client-supplied `artistId` into the
   `earnings` ledger, milestones, and `first_paid_conversion` while paying the real artist; poisons
   activation metrics and can feed forged rows into recruiter/team-split payouts.
6. **SEC-006 (HIGH, confirmed)** — subscription earnings record the tier's **sticker price**, not the
   amount charged, so a 100%-off code mints full-price `earnings` that fund real platform payouts.
7. **SEC-007 (HIGH, confirmed)** — `tier_benefits` has no CREATE migration and no RLS; anon reads all
   rows and the browser writes it, so paid-tier entitlements (incl. DM access) and Promise obligations
   are tamperable.
8. **SEC-008 (HIGH, confirmed)** — `/api/support` is an unauthenticated mailer that sends attacker HTML
   from CRWN's SPF/DKIM-aligned domain to any recipient, and injects raw HTML into the founder's inbox.
9. **SEC-009 (HIGH, confirmed)** — private `audio` bucket IDOR: `voice-urls` signs any stored value
   containing the bucket prefix with the service role, bypassing `can_play_track` for track masters.
10. **SEC-010 (HIGH, confirmed)** — indirect prompt injection into the admin agent: anonymous text
    (`crm_contacts.name` via `/api/leads/calculator`) reaches the agent prompt, and the approval card
    renders `action.label`/`description` but never `action.params`, so a destructive bulk mutation is
    approvable behind benign prose.

## Immediate action (emergency)

- **SEC-001 is the only true emergency.** It is unauthenticated, reachable in production now (verified:
  the route 403s a random UUID and the real admin UUID returns HTTP 200 to the anon key), and grants
  full admin capability including disabling the artist gate and minting invite codes. Recommend gating
  `/api/admin/approvals` with `requireAdmin` **before** the next deploy window. Fix belongs to the
  remediation task, but this is the one finding worth an out-of-band patch.
- **No credential rotation is required by this audit.** No secret is exposed in the client bundle, in
  git history, or in any API response. `NEXT_PUBLIC_CRON_SECRET` was already removed and rotated
  (commit `2461f6ea`, 2026-07-12). The two CRITICALs are code/authorization bugs, not leaked secrets.
- **No production shutdown is warranted.** The data-read path for money and PII is closed to anon; the
  exposure is write/authorization, addressable by fixes rather than takedown.

---

## Previous security findings revalidated (`11-SECURITY-AND-PRIVACY.md`)

| Prior finding | Verdict | Proof (current code) |
|---|---|---|
| HIGH unsigned webhooks | **FIXED (3/4) + OBSOLETE (1/4, SMS removed)** | `webhookSignatures.ts:33-56` Svix HMAC, 300s window, `timingSafeEqual`, false-on-unset; used by resend/outreach/inbound webhooks |
| HIGH `NEXT_PUBLIC_CRON_SECRET` + ai-manager | **FIXED** | only 2 stale comments remain; route now `requireArtistOwner` + 10/hr; 0 bundle chunks; value rotated 2026-07-12 |
| HIGH live entitlement drift | not in scope (auth audit) | — |
| MEDIUM ownership-helper adoption (AUTH-002) | **STILL OPEN, was deferred to THIS audit** | `invariants.ts:654-664` AUTH-002 `enforcement:'doc'`; see AUTH-002 section |
| MEDIUM booking-checkout client `artistId` | **STILL VULNERABLE** (= SEC-005) | `stripe/booking-checkout/route.ts:21,106,116` |
| MEDIUM `/api/platform/limits` unauth | **FIXED on that route; class survives** | fixed at `platform/limits:21-33`; same leak unauth at `tracks/check-limit` + `tiers/check-limit` |
| LOW smart-links capture | **STILL VULNERABLE, upgraded** (= SEC-013) | `smart-links/capture/route.ts:11,57-68` |
| LOW no CSP/HSTS | **PARTIALLY FIXED** | prod has HSTS `max-age=63072000` + full header set; CSP is `frame-ancestors` only (no `script-src`) |
| LOW SMS quiet hours | **OBSOLETE** (feature deleted) | — |
| LOW `/api/admin/milestone` naming | **ACCEPTED** (registered exception, re-export) | `exceptions.ts:64-70` |
| INFO Connect ID via `useAuth select('*')` | **DOC STALE — was fixed** | `useAuth.tsx:86-93` explicit columns; column privileges revoke `stripe_connect_id` |
| INFO paid-audio leak | **CONSISTENT / FIXED** | `tracks_public` + `can_play_track` + `signedAudio.ts`; anon `42501` on `audio_url_*` verified |
| PRIVACY deletion/deactivation | **PARTIALLY** | only deactivate/reactivate exist, both self-scoped; no user-facing hard delete |
| PRIVACY logging | **CONSISTENT / LOW** | no secrets found in console output |

**Now-false canonical statements:** `11-SECURITY-AND-PRIVACY.md:13` and `03-USER-ROLES-AND-PERMISSIONS.md:51`
both assert admin is enforced server-side on *every* `/api/admin/*` route (SEC-001 disproves this). Six
Brain docs still flag `NEXT_PUBLIC_CRON_SECRET` as an open 🔴 HIGH though it is fixed (stale red flags).

**`invariants.ts` is a contract registry, not evidence.** Three concrete contract/implementation gaps:
(1) `exceptions.ts:71-77` certifies the vulnerable `approvals` route as "semantics identical to
requireAdmin" — false; `requireAdmin` is session-derived, the route is query-string-derived; and
`authorization.test.ts:42` "verifies" it with the regex `/role === 'admin'/`, which the vulnerable code
passes, so `verify:architecture` is green on a broken auth route. (2) AUTH-002 is `enforcement:'doc'`
with the manifest explicitly deferred to this audit — no mechanical enforcement. (3) AUTH-003 is enforced
by a migration probe that cannot see that the approval gate is bypassed in code.

`CLAUDE_PROMPT_FRAMEWORK.md`: **absent** from the repository (searched once, as instructed).

---

## Threat model (summary)

18 threat-actor classes were modeled (full table in the audit workpapers). The load-bearing structural
fact: `artist_gate` is OFF (open signup), so "artist" is not a trust boundary — anyone on the internet
can stand behind any artist-only control for free. Combined with middleware excluding `/api/` and
246/262 routes bypassing RLS via the service role, the authorization of the entire API is exactly what
each route file does, nothing more. The highest-leverage actors are: **A (anonymous)** — reaches every
route, both CRITICALs, and the RLS/RPC gaps with no account; **R (indirect prompt-injection)** — plants
text that later steers a privileged admin AI context (SEC-010); **F (collaborator)** — the Team Split
money boundary (SEC-003, F-3); **E (artist→admin)** — SEC-001 collapses this to "anyone".

## Crown jewels (ranked)

1 service-role key · 2 Stripe secret key · 3 admin privileges/session · 4 CRON_SECRET/internal secrets
· 5 user sessions · 6 Connect accounts/payout destinations · 7 earnings/Team Split/recruiter/fan
payout ledgers · 8 private paid/unreleased audio + private VOD + Producer files · 9 fan PII / artist
fan lists / imported contacts · 10 R2 creds · 11 LiveKit creds · 12 Resend secrets · 13 DeepSeek/OpenAI
creds · 14 private DMs + support conversations · 15 attribution/offer/tier ownership · 16 feature flags
· 17 AI system prompts + privileged AI context · 18 admin analytics.

---

## API authorization audit

- **Total routes:** 262 (`src/app/api/**/route.ts`).
- **Construct a service-role client (bypass RLS):** 246. **Use the shared ownership helper
  (`requireArtistOwner`/`getOwnedArtistIds`):** 10. **With no auth mechanism at all:** 0 (positive control).
- **By intended caller (approx):** public ~40 · authenticated/fan-self ~120 · artist-owner ~55 · admin
  ~40 · cron ~25 · third-party webhook ~7 · internal ~3.
- **Verdicts across the three slices:** OK 227 · SUSPECT 26 · VIOLATION 9.
- **Violations:** `admin/approvals` (SEC-001); `crm/actions` badge/notify-any-user (SEC-018);
  `sequences/track` + `campaigns/track` + `admin/crm/outreach/track` open redirects (SEC-016);
  `smart-links/capture` cross-artist contact injection (SEC-013); `booking-checkout` ledger forgery
  (SEC-005); `/api/support` mailer (SEC-008); messages `voice-urls` private-audio IDOR (SEC-009);
  `promise-calendar/obligations`→`events` cross-artist notification injection (SEC-014).

Full per-route table: `docs/CYBERSECURITY_AUDIT_2026-08-12_ROUTE_MANIFEST.md`.

## AUTH-002 result (the deferred deliverable)

AUTH-002 asked for a complete ownership manifest of every service-role route on artist-owned resources.
Result: **route-boundary ownership discipline is genuinely strong** — `requireArtistOwner` and
`getOwnedArtistIds` are used correctly wherever they appear, the strongest artist-private routes take no
id parameter at all (deriving the artist from the session), and no *confidentiality* IDOR across artist
data was found in the manifest (an artist cannot read another artist's fans/earnings/campaigns via a
swapped `artistId`). The failures are a different, narrower shape and are enumerated as findings:
(a) client `artistId` written into a ledger without a session cross-check (SEC-005); (b) a value an
authorized caller stored earlier, consumed later by a privileged signer without re-deriving trust
(SEC-009); (c) a foreign-key id (`audienceId`, `fanId`) used to select another tenant's fan set
(SEC-014, SEC-018). AUTH-002 should now become a mechanical invariant (see Regression Plan), because it
currently has no enforcement beyond this manifest.

## RLS verdict

180 relations classified. RLS-on-zero-policy deny-all tables (`fan_payouts`, `referrals`,
`referral_earnings`, `processed_webhook_events`, `invite_codes`, `partner_applications`, `rate_limits`)
are correct. The money-ledger *read* path is closed to anon (verified: `earnings` 0/55, `subscriptions`
0/19, `notifications` 0/183, `fan_contacts` empty, all `[]` to anon). The problems are on the *write*
and *grant* side, where Supabase's default `GRANT ALL TO anon, authenticated` turns any missing
`REVOKE`/RLS into a hole: `notifications` public INSERT (SEC-004), `tier_benefits` no-RLS
(SEC-007), `profiles` incomplete `UPDATE` freeze (SEC-003), and 15 money/CRM tables with no reproducible
CREATE migration that would come up RLS-off on any rebuild (SEC-012). Two migration comments assert the
opposite of the truth (`crm-contacts.sql:85` "No RLS needed", `artist-approval-gate.sql:83` "Only the
service-role API route may call this").

## SECURITY DEFINER / RPC verdict

Both cashout RPCs are correctly locked (anon `42501`, advisory lock, pending reservation). But three
functions leave the default anon/authenticated grants intact because they `REVOKE ... FROM PUBLIC`
(which does not remove role grants) or never revoke: **`check_rate_limit`** (SEC-002, confirmed
anon-exec), **`redeem_invite`** (SEC-011, confirmed anon-exec), and **`toggle_favorite`**
(anon-exec, caller-supplied user). `can_read_community_channel`/`can_post_community_channel`/
`user_passes_artist_gate` still honor a caller-supplied `p_user` (the entitlement-oracle fix reached
`can_play_track` but not these siblings). `atomic_fan_cashout`, `atomic_team_split_cashout`, and
`handle_new_user()` lack a pinned `search_path` (hardening gap, not currently exploitable).

## Financial security verdict

Rails are well-built where it counts: no client-supplied amount/currency/quantity/fee/destination
reaches Stripe; percentages clamped at every write and capped at `100 - fee`; self-referral, self-tip,
duplicate-ticket blocked; both cashouts race-safe; livemode guard unbypassable. Defects: SEC-005
(booking ledger forgery), SEC-006 (discount gross → phantom earnings), **F-3 (Team Split commissions
paid from CRWN's own Stripe balance** — no `source_transaction`, no fee add; $0 today at 0 active deals,
real on the first deal; HIGH-structural), plus MEDIUM/LOW: cashout sums all currencies as USD (F-4);
`?src=clipper` with no `?ref=` charges an uncollected commission (F-5); a mid-handler failure permanently
drops a paid event because the idempotency claim isn't released on error (F-6); recruiter self-referral
(F-7); no Stripe idempotency keys on any transfer/payout (F-8); cashout marks `failed` on any throw,
risking double payout (F-9); discount `uses_count` read-then-write race (F-11).

## Stripe verdict

Webhook signature over raw body, atomic `UNIQUE(event_id)` idempotency claim, livemode guard verified
present and unbypassable, ManyChat shared-secret constant-time compared and fails closed. `booking-checkout`
is the single client-`artistId` outlier (SEC-005). No inline Stripe client trusts a client-supplied
connected account, price id, or `application_fee`.

## Team Splits verdict

Authorization is clean (collaborator cannot edit terms, outsiders cannot read a deal, % bounded 0-100,
cashout race-safe). Two real issues: **funding comes from CRWN's balance not the artist's** (F-3), and
the **collaborator-binding key `profiles.email` is self-writable** (SEC-003), which is the money-theft
path. `award_milestone` lets an artist mint an arbitrary held accrual on the same rail (LOW).

## Referral / recruiter verdict

Referral/clipper commissions are correctly artist-funded (added to `application_fee_percent`) and
self-referral is blocked at checkout. Recruiter self-referral is possible because `recruited_by` is
client-written and not frozen (F-7, LOW, barely profitable). No campaign/attribution dimension reaches a
money row (positive control per the Fan-Drives architecture). Post-Win `artist_ref` does not enter
recruiter economics.

## Private-content / entitlement verdict

Track audio is well-gated (`tracks_public` + `can_play_track`, `audio_url_*` revoked, verified `42501`).
Gaps: `voice-urls` will sign any audio-bucket path (SEC-009); `tier_benefits` entitlements are tamperable
(SEC-007); `products.file_url` and `live_sessions.vod_url`/`vod_key` are anon-readable (SEC-015) — the
VOD locator returns a real `crwn-media.r2.dev` URL, but that public domain answers HTTP 500 for every
object today, so it is a latent bypass, not a live leak; `live/thumbnail` mints signed URLs for private
sessions unauthenticated (MEDIUM).

## Live / LiveKit verdict

Token minting, room identity, tickets, refund-revokes-entitlement, and egress webhook signature are all
correct. Issues are at the edges: `live/thumbnail` ignores `visibility`, `producer/polls` GET has no
session gate (anon reads paid/private session polls + tallies), and `live/tips` publishes exact per-fan
spend keyed to raw fan UUIDs (privacy, contradicts the leaderboard-privacy design).

## Upload / storage verdict

Weakest defensive area. All upload validation is client-side; no server route re-checks bytes/magic
numbers, and `validateUpload` is not a server gate. Paid digital-product deliverables upload to the
**public `album-art` bucket** with no validator/size cap and `[slug]/page.tsx` does `select('*')`, so
`file_url` ships to anonymous visitors (SEC-017; damped only because all sampled `file_url` are null and
the public R2 domain is off). No `storage.objects` RLS policy exists in the repo, so object-ownership /
overwrite risk is undeterminable from source (UNKNOWN).

## Webhook verdict

**All webhooks are signed and fail-closed** (Stripe, Resend, outreach, inbound, Cal.com HMAC+32KB cap,
LiveKit `WebhookReceiver`, ManyChat sha256 shared-secret). Resend returns 403 when the secret is unset.
This is a clear positive-control area. The historical Resend webhook-registration gap could not be
verified from source (provider-side config); UNKNOWN.

## Cron / internal-secret verdict

25 cron routes, all GET-only, service-role, all compare `Bearer ${CRON_SECRET}` with a plain `!==` and
**no presence guard**, so an unset secret yields the literal `Bearer undefined` accepting all callers
(F-10, latent — crons run in prod so the secret is set). `admin/track` fails **open** if
`INTERNAL_TRACK_SECRET` is unset (registered exception, but it writes `funnel_events` and
`profiles.last_active_at` for a caller-named id). `ai-manager/execute:301` lacks the presence guard its
sibling `generate:46` has. Only `ai-manager/generate` has the correct `!!process.env.CRON_SECRET &&`
shape. `cron_run_log` has no migration.

## Client-secret verdict

**Clean.** 8 `NEXT_PUBLIC_*` vars, all safe (anon key verified `"role":"anon"`, not service_role);
`NEXT_PUBLIC_SITE_URL` is dead. No server secret reaches the browser, no API response echoes a secret.
One footgun: `next.config.ts` has an `env:` block that inlines values into client JS **regardless of
prefix** (currently only the safe `pk_*` Stripe key, but `STRIPE_SECRET_KEY` is one line away with no
lint error). Informational.

## Secret-history scan verdict

**Clean.** `.gitignore` covers `.env*` from the initial commit; no env file was ever committed
(`--diff-filter=A` empty; `eyJhbGciOi` has zero hits across all history, so no Supabase JWT was ever
committed). Every high-entropy `-S` hit traced to a doc placeholder, a build dummy, a Postgres role
name, or an SDK constant. No rotation required.

## Dependency / supply-chain verdict

Zero install lifecycle scripts, zero non-registry sources, 727/727 integrity hashes. One genuinely
reachable advisory: **`sharp` 0.34.5 libvips CVEs** via `next/image` with wildcard `remotePatterns`
(`*.supabase.co`, `*.cloudflarestorage.com`) — an attacker can route a malformed image through
`/_next/image`. 6 of Next's 9 advisories are inert (no Server Actions, no rewrites). One non-breaking
fix (`npm update next` → 16.3.0) closes next+sharp+postcss+nanoid; also narrow `remotePatterns`.

## XSS verdict

No DOM sink: `dangerouslySetInnerHTML` = 0, `innerHTML` = 0, no HTML/markdown renderer, admin views are
escaped JSX. The real XSS is a stored **`javascript:` URL**: `SmartLinkCapture.tsx:61`
`window.location.href = destinationUrl` bypasses React's URL sanitizer and the write path has no scheme
check (SEC-020); because cookies are `httpOnly:false` and there is no `script-src`, this yields the
session. `notify-subscribers` `link` and `AiManagerCard` `action_url` are the same class (MEDIUM).
Email HTML injection is `/api/support` (SEC-008), not DOM.

## CSRF verdict

**No application-level CSRF defense** across 262 routes: cookies are `SameSite=Lax; httpOnly=false`, no
Origin/Referer/token check anywhere. `Lax` blocks subresource GETs (so `<img>`-triggered GET mutations
don't fire), but state-changing GET routes reachable by top-level navigation (the open-redirect/tracking/
unsubscribe endpoints) are CSRF-able, and any future GET mutation is unprotected. MEDIUM (mitigated by
Lax, not eliminated).

## SSRF verdict

**No user-facing SSRF surface** — no unfurl/link-preview/media-import/proxy/og endpoint; `_next/image`
is a 4-entry allowlist. Positive control. One internal issue: `middleware.ts` posts
`INTERNAL_TRACK_SECRET` to a Host-header-controlled origin (LOW).

## CSP / security-header verdict

Production headers (observed 2026-08-12): HSTS `max-age=63072000` (no `includeSubDomains`),
`X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `Permissions-Policy` locking camera/mic/geo, and CSP =
`frame-ancestors 'self'` only. The gap is a real `script-src` (no XSS containment), `includeSubDomains`
on HSTS, and COOP/COEP where relevant. A correct CSP must allow: `self`, Supabase REST+`wss://*.supabase.co`,
`js.stripe.com`+`api.stripe.com`+`checkout.stripe.com` (frame), `wss://` LiveKit, R2/`*.r2.dev` +
`*.supabase.co` images/media. Roll out `Content-Security-Policy-Report-Only` first (MEDIUM).

## Rate-limit / abuse verdict

The limiter is Postgres-backed and fails closed (good) — but it is itself anon-executable and
truncatable (SEC-002), and several costly routes have no limit at all: `/api/leads/calculator`
(unauth mailer, SEC-019), `/api/support` (3/5min/IP, distributed-bypassable), escalation email
(~7 founder emails/min/account, S-1). Denial-of-wallet exposure: Resend quota, DeepSeek tokens (incl.
an orphaned `/api/admin/support` that still spends), R2 storage.

## Email / Resend verdict

Sending is signature-verified inbound and consent-gated outbound (campaign sender requires
`consent_attested_at IS NOT NULL`, which is why the smart-links/capture injection cannot be mailed).
But `/api/support` and `/api/leads/calculator` are unauthenticated senders from the CRWN domain
(SEC-008, SEC-019), and four unsubscribe endpoints use a bare row id with no HMAC (an email prefetcher
silently unsubscribes; `unsubscribe-all` opts out of every artist) — the correct HMAC pattern already
exists at `acquisition/unsubscribe` (SEC-016 family, MEDIUM).

## CRM / contact privacy verdict

`fan_contacts`/`crm_contacts` reads are closed to anon in production. Injection write paths exist
(`smart-links/capture` SEC-013; `leads/calculator`), but injected contacts cannot be mailed (consent
gate). No CSV formula-injection sanitization was found on export (LOW). Cross-artist contact *read* via
swapped id was not found.

## AI security verdict

9 AI call sites inventoried (the "Manager has two calls" trap is correctly wired — both take
`canonicalBrief`). Authorization lives outside the model everywhere: support chat scopes to
`.eq('user_id', session)`, Manager to `.eq('artist_id')` with `actionValidity` re-deriving ownership+TTL
and a code-level `SAFE_ACTION_TYPES` allowlist that beats any model-set risk, and **no env var or secret
is ever interpolated into any prompt**. No cross-user or cross-artist leakage. System-prompt extraction
is possible but harmless (the "knowledge base" is the public pricing + public guide pages). The one real
failure is the admin-agent approval boundary (SEC-010): attacker text reaches the prompt and the
approval UI hides `action.params`. Two accidental safeguards (dead autonomous loop, missing partner
column) are the only reason it needs an admin click today, and both are fragile.

## SUPPORT CHAT PROMPT-INJECTION VERDICT

- Extract the system prompt? **YES — but it is harmless** (public pricing/guide digest, no secret, no user data).
- Extract confidential support knowledge? **NO** (the KB *is* the public guides).
- Impersonate admin via prompt text? **NO** (authority is only `profiles.role` from the DB).
- Extract another user's support conversation? **NO** (a foreign `conversationId` returns null and starts a new thread; queries scope to the session user).
- Extract another artist's private data? **NO** (cross-artist channel was removed parameter-and-all).
- Cause privileged application actions? **YES, indirectly** — via the admin agent, not support chat itself (SEC-010).
- Can stored attacker content reach an admin AI context? **YES** (`crm_contacts.name`/`display_name`/cancel-feedback → `scopes.ts:592` etc.).
- Model output → XSS or dangerous links? **Narrowly YES** — `AiManagerCard` `router.push(action_url)` and `notify-subscribers` link have no scheme allowlist; no DOM HTML sink.
- Denial-of-wallet? **Partly** — DB limiter fails closed, but escalation-email amplification and the orphaned `/api/admin/support` spend are real.
- If the support model is fully jailbroken, max blast radius? **A bad text reply plus founder-inbox
  noise.** Support chat itself cannot read another user's data, move money, or change permissions — the
  desired property HOLDS for support chat. It FAILS for the **admin agent**, where the boundary is the
  approval click, and the fix is to render `action.params` and bound the two unscoped bulk handlers.

## Support / admin-input verdict

Attacker-controlled support/bug-report content is escaped in the admin JSX view (no stored XSS there),
but `/api/support` is unauthenticated and mails raw HTML to the founder (SEC-008), and support/CRM text
is the injection source for SEC-010. Treat all support content as a privileged-render + privileged-AI
boundary.

## Admin security verdict

Admin = `profiles.role === 'admin'` only (`ADMIN_EMAIL` unused, no `is_admin` column). `requireAdmin` is
correct and re-reads role per request (no stale-privilege window — a genuine strength), and self-promotion
is blocked by a BEFORE UPDATE trigger. 31/40 admin routes use it; the hole is `approvals` (SEC-001). The
admin agent's bulk write handlers (`execute/route.ts`) are the highest-blast-radius admin writes and are
under-guarded at the approval UI (SEC-010).

## Feature-flag / server-gate verdict

Flags are read from `admin_settings` and (per the reconciliation) some feature routes lack a flag check
(producer analytics/submission-file, royalty-readiness DELETE). Since all flags are ON, not exploitable
now — but server-side disablement is NOT trustworthy for those routes, and `admin_settings` itself is
writable via SEC-001 (disable the artist gate). Flag state should not be assumed to gate a route unless
the route checks it.

## PWA / service-worker verdict

`public/sw.js` caches authenticated navigations and API responses with deploy-only invalidation; there
is no `caches.delete` in `src/` and `signOut` doesn't clear caches. On a shared device, a previous user's
rendered admin/PII page can be served after logout (SEC-021, MEDIUM).

## Privacy / data-lifecycle verdict

Only deactivate/reactivate exist (both self-scoped); there is no user-facing hard-delete or fan-data
export endpoint. `is_active` cannot function as a ban flag (`useAuth` auto-reactivates). These are
product-policy decisions, not vulnerabilities, and are flagged for founder awareness, not as findings.

---

## Attack-surface coverage matrix

| Surface | AuthN | AuthZ | Input | Rate limit | Data exposure | Money | Ext integ | AI/injection | Tested | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Auth/session | OK | OK | OK | partial | OK | - | Supabase | - | code+prod | Strong; cookie `Secure`/`script-src` gaps |
| Artist APIs | OK | **mostly OK** | mixed | partial | OK | n/a | - | - | code | AUTH-002 largely holds; SEC-005/009/014 |
| Fan APIs | OK | OK | mixed | partial | OK | n/a | - | - | code | OK |
| Admin | **FAIL** | **FAIL(1)** | OK | n/a | high | n/a | - | SEC-010 | code+prod | SEC-001 critical |
| Stripe | sig | OK | OK | OK | OK | **SEC-005/006** | Stripe | - | code | Strong minus ledger poisoning |
| Team Splits | OK | OK | OK | n/a | OK | **F-3/SEC-003** | Stripe | - | code | Funding + email-bind flaws |
| Referrals/recruiter | OK | OK | OK | partial | OK | F-7 | Stripe | - | code | Minor |
| Campaigns/CRM | OK | OK | weak | partial | OK | n/a | Resend | - | code | Injection writes, consent-gated |
| Contacts | OK | OK | weak | partial | OK | n/a | Resend | - | code+prod | SEC-013 |
| Live/LiveKit | OK | OK | OK | partial | med | ticket ok | LiveKit | - | code | Edge leaks (thumbnail/polls/tips) |
| Live Tips | OK | mixed | OK | none | **per-fan spend** | clamped | Stripe | - | code | Privacy leak |
| Producer Sessions | mixed | **gap** | OK | partial | med | n/a | R2 | - | code | polls GET unauth |
| Royalty Readiness | OK | OK | OK | n/a | OK | n/a | - | - | code | DELETE lacks flag check |
| Support | **FAIL** | OK | **weak** | weak | OK | n/a | Resend/DeepSeek | SEC-010 src | code | SEC-008 |
| DMs | OK | OK | **weak** | partial | **SEC-009** | n/a | R2 | - | code | Private-audio IDOR |
| Uploads | mixed | UNKNOWN | **client-only** | partial | **SEC-017** | n/a | R2 | - | code | Weakest area |
| R2/media | n/a | OK(audio) | n/a | n/a | SEC-015 | n/a | R2 | - | code+prod | Audio strong; product/vod locators leak |
| Email/Resend | sig | consent | weak | **gaps** | OK | n/a | Resend | - | code | Unauth senders, unsigned unsub |
| AI Manager | OK | OK | ok | 10/hr | OK | n/a | DeepSeek | contained | code | Strong |
| Admin Agent | admin | admin | **inject** | caps | OK | writes | DeepSeek | **SEC-010** | code | Approval-UI param hiding |
| Support AI | OK | OK | scoped | 15/60s | OK | n/a | DeepSeek | contained | code | Property holds |
| Cron | secret | n/a | none | n/a | OK | n/a | - | - | code | Fail-open latent |
| Webhooks | **sig** | n/a | raw | n/a | OK | settle | all | - | code | Positive control |
| PWA/SW | n/a | n/a | n/a | n/a | **stale cache** | n/a | - | - | code | SEC-021 |
| Attribution | n/a | n/a | normalizer | n/a | reporting | isolated | - | - | code | Reporting-only, isolated |

---

## Complete findings

Format is abbreviated for the long tail; full 16-field treatment for CRITICAL/HIGH.

### SEC-001 — CRITICAL — Unauthenticated admin takeover via query-string identity
- **Files:** `src/app/api/admin/approvals/route.ts:10-53`; false-cert at `src/lib/architecture/exceptions.ts:73-77`; ineffective test at `src/lib/architecture/authorization.test.ts:42`.
- **Actor:** A (anonymous). **Preconditions:** none beyond one anon read.
- **Evidence (confirmed live):** `isAdmin()` is called with `searchParams.get('userId')` (GET) and `body.adminUserId` (POST); no `auth.getUser()` in the file; service-role client. Anon probe `profiles?select=id,role&role=eq.admin` → HTTP 200 `[{id:612fa313…, role:admin}]`. Route negative control: random UUID → 403, no UUID → 403 (deployed, id-gated only).
- **Attack path:** GET `profiles?role=eq.admin` with the bundled anon key → admin UUID → `POST /api/admin/approvals {adminUserId:<uuid>, action:'setGate', enabled:false}` (disable artist gate) / `setApproval` (self-approve) / `mintCode` (invite codes); GET dumps 100 profiles + all invite codes.
- **Attacker gain / blast radius:** full admin capability; platform-wide.
- **Existing mitigations:** none effective. The drift test passes because it regex-matches a string.
- **Fix:** replace `isAdmin(bodyOrQuery)` with `requireAdmin(req)`; delete the `exceptions.ts` entry; change the test to assert session-derivation, not a string.
- **Regression test:** a source-scan invariant that every `/api/admin/*` route calls `requireAdmin` (or a registered exception whose authority is a *cron/internal secret or webhook signature* — never an inline role check on a request-supplied id); mutation-tested.
- **Rotation:** no. **Data remediation:** review `admin_settings.artist_gate`, recent `invite_codes`, and `profiles.is_approved` changes for tampering. **Founder decision:** no (pure bug). **Confidence:** confirmed.

### SEC-002 — CRITICAL — `check_rate_limit` is anon-executable and truncatable
- **Files:** `supabase/schema-phase2-rate-limit.sql:70-71,95`; caller `src/lib/rateLimit.ts:20-24`.
- **Actor:** A (anonymous). **Preconditions:** the public anon key (shipped in JS).
- **Evidence (confirmed):** anon GET `rpc/check_rate_limit` → `25006 cannot execute DELETE in a read-only transaction` (privilege check PASSED; contrast cashout `42501`). Body deletes `rate_limits WHERE created_at < now() - make_interval(secs => p_window_seconds*10)`. Grant is `TO service_role` only; defaults never revoked.
- **Attack path:** POST `rpc/check_rate_limit {p_window_seconds:-1000000, …}` → future timestamp → predicate matches all → whole table deleted → platform rate limiting off. Or set `p_user_id`/IP-hash bucket to 429-lock a victim out of signup/support/lead magnets.
- **Blast radius:** all abuse controls, platform-wide, unauthenticated; enables downstream denial-of-wallet + brute force (e.g. discount-code oracle).
- **Fix:** `REVOKE EXECUTE ON FUNCTION check_rate_limit(...) FROM anon, authenticated;` and reject `p_window_seconds <= 0` in the body.
- **Regression test:** invariant asserting every SECURITY-relevant RPC revokes EXECUTE from anon+authenticated by name (not FROM PUBLIC); a prod probe line per RPC.
- **Rotation:** no. **Data remediation:** no (idempotent). **Founder decision:** no. **Confidence:** confirmed.

### SEC-003 — CRITICAL/HIGH — `profiles` UPDATE freeze is incomplete → Team Split payout hijack + self-approval
- **Files:** `supabase/schema-phase2-fix-profiles-update-permission.sql:62-96` (freeze covers only `is_active`,`stripe_connect_id`,`role`; policy bare ownership); `schema-phase2-profiles-column-privileges.sql:47-48` (REVOKE **SELECT** only); consumer `src/app/api/team-splits/route.ts:148-154` (`ilike('email')`); `src/lib/teamSplits/notify.ts:18-20`.
- **Actor:** B/F (any signed-up user). **Preconditions:** know a producer's email an artist will add; claim it before the producer signs up (email unique constraint).
- **Evidence (confirmed static):** freeze trigger reverts 3 columns; no `REVOKE UPDATE` on `profiles` anywhere (only `lead_profiles`). So `email`,`phone`,`full_name`,`is_approved` are self-writable under the ownership UPDATE policy.
- **Attack path (money):** set own `profiles.email` to `producer@x` → artist adds that email to a split → `collaboratorUserId` binds to attacker → `atomic_team_split_cashout` pays attacker; notifications also go to attacker. **Attack path (gate):** `PATCH profiles?id=eq.self {is_approved:true}` self-approves.
- **Blast radius:** a collaborator's real revenue share (money); the approval gate (integrity). $0 today (0 active deals, gate OFF) but real when either turns on.
- **Fix:** extend the freeze trigger to `email`/`phone`/`is_approved` (and require verified email change), or bind Team Splits by verified `auth.users` identity rather than a self-writable `profiles.email`.
- **Regression test:** trigger-level test that protected columns cannot be self-updated; a test that Team Split binding uses a non-self-writable key.
- **Rotation:** no. **Data remediation:** audit `profiles.email` changes vs Team Split bindings. **Founder decision:** yes (identity-binding model for Team Splits). **Confidence:** high (write not attempted).

### SEC-004 — HIGH — Public INSERT policy on `notifications`
- **Files:** `supabase/schema-phase2-notifications.sql:29` (`WITH CHECK (true)` without `TO service_role`). **Actor:** A. **Evidence (confirmed live):** anon INSERT rejected with `23503` FK (not `42501`) — RLS let it through; only the fake uuid stopped it. `profiles.id` anon-enumerable. **Attack:** POST `/rest/v1/notifications {user_id:<real>, title/message/link:<attacker>}` → in-product phishing + spam. **Fix:** `FOR INSERT TO service_role WITH CHECK (true)` (and drop the browser's ability to write it). **Regression:** anon-insert-denied probe. Confidence: confirmed.

### SEC-005 — HIGH — `booking-checkout` client `artistId` poisons the earnings ledger
- **Files:** `src/app/api/stripe/booking-checkout/route.ts:21,59,106,116`; `src/lib/webhookHandlers.ts:1333,1382,1420,1427`. **Actor:** authenticated fan. **Evidence (confirmed):** `:59` derives the real artist for the transfer, but `:106`/`:116` write the client `artistId` into metadata + `booking_purchases`; the webhook trusts metadata into `earnings`, milestones, `first_paid_conversion`. Money destination is safe. **Attack:** pay for artist A's session with `artistId=B` → B gets a fabricated earning/milestone/activation; can feed recruiter/team-split payouts. **Fix:** drop the body field; use `artistIdFromArtist`, or assert equality. **Regression:** a test that no webhook-settled ledger writer trusts a client-supplied artist id. Confidence: confirmed.

### SEC-006 — HIGH — Subscription earnings book sticker price, not amount charged
- **Files:** `src/lib/webhookHandlers.ts:133` (`grossAmount = tierData?.price`) vs the correct product rail `:833` (`amount_total`). **Actor:** artist (self-issued 100%-off code) or benign promo. **Evidence (confirmed).** **Attack:** issue 100%-off code, self-subscribe from throwaways → full-price `earnings`/net with $0 charged → funds recruiter (1% net) / Team Split (up to 100% net) real transfers; inflates GMV/milestones/break-even pop-ups. **Fix:** record `session.amount_total`. **Regression:** earnings-gross-equals-amount-charged test. Confidence: confirmed.

### SEC-007 — HIGH — `tier_benefits` has no RLS and is browser-writable
- **Files:** no CREATE/RLS in `supabase/*.sql`; writer `src/components/artist/TierManager.tsx:227,236`; entitlement reader `src/lib/messaging.ts:105-107`. **Actor:** anonymous/any user. **Evidence:** anon reads 52/52 rows (confirmed); write exposure inferred (not attempted). **Attack:** DELETE any tier's benefits (wipe promises) or INSERT `direct_messaging` onto a free tier to gain DM entitlement. **Fix:** create the table with RLS in a migration, artist-scoped write, service/anon read as designed. **Regression:** RLS-on probe for `tier_benefits`. Confidence: read confirmed, write high.

### SEC-008 — HIGH — `/api/support` unauthenticated phishing relay + HTML into founder inbox
- **Files:** `src/app/api/support/route.ts:13-88`. **Actor:** A. **Evidence (confirmed):** no auth; `resend.emails.send({to: email})` (attacker-chosen) from `hello@thecrwn.app`; `name`/`message`/`context.page`/`userAgent` interpolated raw into HTML including the founder-cc'd mail. 3/5min/IP limit distributed-bypassable. **Attack:** send attacker HTML from CRWN's aligned domain to any victim; inject HTML into the founder's inbox. **Fix:** require auth or CAPTCHA, escape all interpolation, never send arbitrary body to an arbitrary `to`. **Regression:** a test that user text is escaped and the confirmation recipient is the authenticated user. Confidence: confirmed.

### SEC-009 — HIGH — Private `audio` bucket IDOR via arbitrary object signing
- **Files:** `src/lib/storage/signedAudio.ts:61-107`; injection `src/app/api/messages/route.ts:161,251`; sink `src/app/api/messages/[conversationId]/voice-urls/route.ts:60-75`. **Actor:** any DM-capable user. **Evidence (confirmed):** `storagePathFromAudioValue` signs any value containing `/storage/v1/object/public/audio/`, guarding only `..` and bucket. voice-urls checks conversation membership, not path ownership. **Attack:** store `audioUrl` = an audio-bucket path on own DM row, call voice-urls → service-role-signed URL to track masters / others' voice notes, bypassing `can_play_track`. Friction: path must be known (`<artistProfileId>/<epochMs>`). **Fix:** only sign paths the caller provably owns (bind to a row the system wrote), or store storage keys never raw URLs. **Regression:** a test that voice-urls refuses a path not written by the system for this conversation. Confidence: confirmed.

### SEC-010 — HIGH — Indirect prompt injection → admin-agent one-click destructive bulk action
- **Files:** injection source `src/app/api/leads/calculator/route.ts` (unauth, no cap) → `crm_contacts.name`; prompt `src/app/api/admin/agent/scopes.ts:592`; approval UI `src/components/admin/AgentInsights.tsx:343-344` (renders label/description, never `params`); sink `src/app/api/admin/agent/execute/route.ts:84-87` (bulk `pipeline_stage` update over every matching artist), `:141`,`:235`. **Actor:** R (indirect injection) + O (admin who clicks). **Evidence (confirmed):** all four points quoted. **Attack:** plant a benign-looking lead name that steers the model to emit an action whose `params` carry `{from_stage:'paid',to_stage:'churned'}`; admin approves seeing only prose. **Blast radius:** platform-wide pipeline/CRM corruption + emails; no exfiltration (tables admin-only). **Current dampers (fragile):** autonomous loop 403s; `partner_applications.full_name` doesn't exist. **Fix (highest ratio):** render `action.params` in the approval card; bound the two unscoped bulk handlers; delimit untrusted text in the prompt; do NOT re-enable the autonomous loop until done. **Regression:** a test that the approval payload rendered == the payload executed. Confidence: confirmed.

### SEC-011 — HIGH — `redeem_invite` anon-executable
`schema-phase2-artist-approval-gate.sql:84-85` `REVOKE ... FROM PUBLIC` leaves anon/authenticated grants. Anon GET → `25006 ... UPDATE` (confirmed). Burn all invite-code uses; set `is_approved=true` on arbitrary accounts. Damped by `artist_gate` OFF. Fix: revoke EXECUTE from anon+authenticated by name. Confidence: confirmed.

### SEC-012 — HIGH(structural) — 15 money/CRM tables have no reproducible CREATE migration
`earnings`(37 callers),`referrals`,`referral_earnings`,`recruiters`,`recruiter_payouts`,`partner_codes`,`artist_referrals`,`fan_payouts`,`milestones`,`sync_opportunities`,`cron_run_log`,`listening_history`, 5 `outreach_*`. Prod is fine today, but any rebuild/branch/PITR comes up RLS-off and anon-writable by Supabase default, and `verify:migrations` can't see it (no probe line). Fix: author CREATE+RLS migrations; add probe lines. Confidence: high (prod reads 0 to anon; the risk is reproducibility).

### SEC-013 — HIGH — `smart-links/capture` cross-artist contact injection
`src/app/api/smart-links/capture/route.ts:11,18-23,57-68`: unauth, `artistId` from body never compared to the link owner; upserts `fan_contacts`. Inject PII into any artist's CRM + forge conversion analytics. Damped: consent gate blocks mailing. Fix: derive `artist_id` from `smart_links.artist_id`. Confidence: confirmed.

### SEC-014 — HIGH — Cross-artist notification injection via `promise-calendar` `audienceId`
`src/app/api/promise-calendar/obligations/route.ts:62-79` writes an unvalidated `audienceId`; `events/[id]/route.ts:44-73` squad branch queries `artist_squad_members` by `squad_id` with no `artist_id` predicate; `auto_create_fan_items` defaults true. Artist A pushes an attacker-titled notification to artist B's squad, bypassing both notification governors. Fix: validate `audienceId` belongs to `artistId`; scope the squad query by artist. Confidence: high (quoted).

### MEDIUM (abbreviated)
- **SEC-015** — `products.file_url`, `live_sessions.vod_url`/`vod_key` anon-readable (confirmed); latent paid-content bypass, damped (public R2 domain 500s today).
- **SEC-016** — Open redirects + unsigned unsubscribe: `campaigns/track`,`sequences/track`,`admin/crm/outreach/track` (`NextResponse.redirect(url)` unvalidated); `campaigns/unsubscribe-all/[sendId]` opts out of all artists with no HMAC. Correct HMAC pattern exists at `acquisition/unsubscribe`.
- **SEC-017** — Paid digital-product deliverables upload to the public `album-art` bucket, `select('*')` ships `file_url`; damped (nulls + R2 off). Weakest area: all upload validation is client-side.
- **SEC-018** — `crm/actions` badge/notify: any artist writes a badge + attacker-titled notification to any user UUID, no rate limit, bypassing the notification governor.
- **SEC-021** — SW caches authenticated pages/API responses; no logout invalidation → stale admin/PII on a shared device.
- Cookie `Secure` missing on ssr-set session cookie (`httpOnly:false` inherent) + no `script-src` CSP + HSTS no `includeSubDomains`.
- `live/thumbnail` mints signed URLs for private sessions unauth; `producer/polls` GET unauth reads paid/private polls; `live/tips` exposes exact per-fan spend by UUID.
- `notify-subscribers` unvalidated `type`/`link` (`javascript:` reaches the anchor) to all subscribers.
- Cashout sums all currencies as USD (F-4); `?src=clipper` uncollected commission (F-5); webhook drops a paid event on mid-handler failure (F-6).
- CSRF: no Origin/Referer/token check anywhere (mitigated by SameSite=Lax, not eliminated).
- `tracks/check-limit` + `tiers/check-limit` unauth artist plan/catalog enumeration.
- `discount-codes/validate` unauth-of-rate-limit brute-force oracle.
- `middleware.ts` leaks `INTERNAL_TRACK_SECRET` to a Host-header-controlled origin; `admin/track` fails open.
- `bundle_items` RLS infinite recursion (availability 500, not a leak).

### LOW (abbreviated)
Recruiter self-referral (F-7); no Stripe idempotency keys on transfers/payouts (F-8); cashout marks `failed` on any throw → double-payout risk (F-9); cron `Bearer undefined` fail-open latent (F-10); discount `uses_count` race (F-11); internal sales-intelligence columns (`platform_lead_score`,`pipeline_stage`,`projected_monthly_gmv`,`clipper_commission_rate`…) anon-readable (V10); `can_read/post_community_channel`+`user_passes_artist_gate` honor caller-supplied `p_user` (V11); unpinned `search_path` on cashout RPCs + `handle_new_user` (V12); prod-only RPCs unaudited, `toggle_favorite` anon-exec with caller-supplied user (V13); `STRIPE_PUBLISHABLE_KEY` inlined via `next.config.ts` env block (footgun; `STRIPE_SECRET_KEY` one line away); `emails/artist-new-post` + `partner/apply` nuisance mailers; support escalation-email amplification (~7/min/account); `AiManagerCard` `router.push(model action_url)` no scheme allowlist.

### INFORMATIONAL
Orphaned `/api/admin/support` still spends DeepSeek; `sharp`/`next` advisory (one-command fix); upgrade prorations never ledgered (F-12); dispute matching narrower than refund matching (F-13); 64/162 migrations lack self-verify blocks and every `pg_policies`-existence assertion passes vacuously as superuser (use `has_*_privilege` template); repo-to-prod drift in the safe direction (two dangerous `USING(true)` policies present in migration files are absent in prod); `cron_run_log` missing migration; `NEXT_PUBLIC_SITE_URL` dead var.

---

## Positive controls (survived the audit)

Webhook signatures on every provider, fail-closed; Stripe livemode guard present + unbypassable; atomic
`UNIQUE(event_id)` idempotency; no client-supplied amount/currency/fee/connected-account/price on any
Stripe rail; both cashout RPCs `EXECUTE`-revoked (anon `42501`, verified) + advisory-locked; `requireAdmin`
/`requireArtistOwner` session-derived, re-read per request (no stale-privilege window); role/`is_active`/
`stripe_connect_id` frozen by trigger; `stripe_connect_id`/`audio_url_*` column-revoked (verified `42501`);
money-ledger + PII read path closed to anon (verified `[]`); no `dangerouslySetInnerHTML` sink; no
user-facing SSRF surface; admin views escaped; clean git history; clean supply chain; AI authorization
outside the model with no cross-tenant leakage and no secret in any prompt; consent gate on the campaign
sender; self-referral/self-tip/duplicate-ticket blocked; `NEXT_PUBLIC_CRON_SECRET` fully remediated + rotated.

---

## Security regression plan (specs only — do NOT build yet)

Turn these classes into mutation-tested `sourceScan` invariants alongside their fixes:
1. **Admin-route authority** — every `/api/admin/*` calls `requireAdmin`, or a registered exception whose authority is a cron/internal secret or webhook signature; NEVER an inline role check on a request-supplied id. (Rewrites the broken AUTH-001 test.)
2. **AUTH-002 service-role ownership** — every service-role route on an artist-owned resource proves ownership against the session (helper or `.eq('user_id', user.id)`), never a bare client `artistId` into a read/write/ledger.
3. **Webhook signature** — every webhook-like public route verifies a signature over the raw body and fails closed (already largely true; pin it).
4. **Public mutation** — enumerate every unauthenticated state-changing route; each must carry a signature/HMAC/consent token (unsubscribe, tracking, capture, support).
5. **Cron secret** — every cron route uses the presence-guarded, timing-safe compare shape.
6. **Client/server secret separation** — no server-only env var reachable from a `'use client'` import chain; `next.config.ts` `env:` block allowlist pinned.
7. **RLS on new tables** — every table in a migration enables RLS; a prod probe line per table.
8. **SECURITY DEFINER grants** — every security-relevant RPC revokes EXECUTE from anon+authenticated by name and pins `search_path`.
9. **Money-destination ownership** — every transfer/payout destination is server-derived from the resource row; every ledger writer uses a server-derived artist id.
10. **Private-media gating** — signers only sign paths the caller provably owns; locators (`file_url`,`vod_url`,`audio_url_*`) are column-revoked from anon.
11. **AI tool authority + context** — model output is never a control signal; approval UI renders the exact executed payload; no secret/other-user data in any prompt.
12. **Support→admin-AI data flow** — untrusted stored fields entering a privileged AI prompt are delimited/escaped and can never carry instructions that change behavior.

## Recommended remediation sequence

- **PHASE 0 (emergency, unauthenticated + reachable):** SEC-001, SEC-002. (SEC-003's write-side and SEC-011 also revoke here — same one-line grant class.)
- **PHASE 1 (authz/RLS/IDOR):** SEC-003, SEC-004, SEC-007, SEC-009, SEC-012, SEC-013, SEC-014, SEC-018; profiles freeze extension; AUTH-002 invariant.
- **PHASE 2 (payments/webhooks/integrations):** SEC-005, SEC-006, F-3 funding, F-4/F-5/F-6, cron presence-guard, idempotency keys.
- **PHASE 3 (injection/AI/XSS/CSRF/uploads/private content):** SEC-010, SEC-008, SEC-019, SEC-020, SEC-015, SEC-016, SEC-017, SEC-021.
- **PHASE 4 (rate-limit/privacy/CSP/supply chain):** CSP `script-src` rollout (Report-Only first), `npm update next`, `Secure` cookie, escalation-email limit, header hardening.
- **PHASE 5 (permanent coverage):** the 12 regression invariants above.

Dependencies over raw severity: Phase 0 gates several Phase 2/4 findings that are "not exploitable yet"
only because those grants/flags currently hold.

## Founder decisions genuinely required

1. Team Split identity binding (SEC-003): bind by verified `auth.users` identity, not self-writable `profiles.email` — a data-model change.
2. Team Split funding (F-3): decide whether the collaborator's share is deducted from the artist's take (add to `application_fee` / use `source_transaction`) before any deal is accepted.
3. CSP `script-src` rollout: some inline scripts/third-party origins may need nonces — a controlled deploy, not a one-liner.
4. Hard-delete / data-export endpoints (privacy posture) — product policy, not a vuln.

## Production actions performed (all read-only / safe)

Anon-key SELECT probes (limit 1) of `profiles`(role/id), `artist_profiles`(user_id + revoked column),
`tier_benefits`, `products`, `live_sessions`, `earnings`/`fan_contacts`/`admin_settings`/`invite_codes`/
`support_conversations`; GET-based (read-only-txn) RPC executability probes of `check_rate_limit`,
`redeem_invite`, `atomic_fan_cashout`; unauthenticated `/api/admin/approvals` negative controls (random +
no UUID → 403); HEAD/GET of one `crwn-media.r2.dev` object (500) and production security headers on `/`
and `/login`; `npm audit`; git-history secret scan. No write, no mutation, no money movement, no
enumeration; the admin-takeover mutation was deliberately NOT executed.

## Tests / build / probes (baseline, unchanged before and after)

`npm run verify:architecture` 36 files / 559 tests PASS · `npm test` 105 files / 1737 tests PASS ·
`npm run build` PASS · `npm run verify:migrations` (2 expected pending: membership-strategy, track-waterfall) ·
`npm run verify:flags` (all ON except `artist_gate` OFF, matches brief). `npm audit`: one reachable
advisory (`sharp` via `next/image`).

## Files changed

Only two audit artifacts, both non-behavioral:
- `docs/CYBERSECURITY_AUDIT_2026-08-12.md` (this document)
- `docs/CYBERSECURITY_AUDIT_2026-08-12_ROUTE_MANIFEST.md` (full 262-route authorization table)

No change under `src/`, `supabase/`, `public/`, `package.json`, `package-lock.json`, or `vercel.json`.

## Next task

**Execute the Comprehensive CRWN Cybersecurity Audit Findings** — starting with Phase 0 (SEC-001, SEC-002).

**CYBERSECURITY AUDIT COMPLETE**
