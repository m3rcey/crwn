# CRWN API Route Authorization Manifest (2026-08-12)

**FINDINGS ONLY / REFERENCE ARTIFACT - NOT SHIPPED. No product code was changed.**

Companion to `docs/CYBERSECURITY_AUDIT_2026-08-12.md` (audit section 51). For every one of the
262 API routes: who can call it, and how is that proved. `src/middleware.ts` excludes `/api/`, and
246 of 262 routes construct a service-role client that bypasses RLS, so each route's own code is its
ONLY authorization boundary. This is a reference input to remediation and to a future route-authorization
drift invariant; it is NOT evidence the current state is secure. Built from three alphabetical slices.

---

## Slice A - routes a-f (118)

# CRWN API Security Audit — Slice A (top-level dirs `a`–`f`)

Repo: `/home/merce/workspace-crwn` (branch `claude/rise-mode-full-journey`)
Date: 2026-08-12. **Read-only audit. No repository file was modified.**

Total `src/app/api/**/route.ts` in repo: **262**
Routes in slice A (top-level dir starts a–f): **118** — all 118 covered below.

## Structural facts that govern every verdict

- `src/middleware.ts:124` matcher is `'/((?!_next/static|_next/image|api/|favicon.ico|...).*)'` — **`/api/` is excluded**. No upstream auth exists for any route below.
- Every route that builds `createClient(..., SUPABASE_SERVICE_ROLE_KEY)` **bypasses RLS**. Its authorization is therefore only whatever it does itself.
- Shared helpers: `src/lib/apiAuth.ts` (`requireArtistOwner`, session-derived, cross-checks `artist_profiles.id = artistId AND user_id = session.user.id`) and `src/lib/auth/requireAdmin.ts` (session-derived `profiles.role === 'admin'`).
- `src/lib/architecture/exceptions.ts` registers 7 admin routes that skip `requireAdmin`. One of those registrations (`admin/approvals`) makes a claim the code does not support — see VIOLATION 1.

Legend for columns: **SR** = constructs service-role client. **CID** = accepts a client-controlled resource id that selects the row(s). **RL** = rate limit. **IV** = input validation. **Sens** = money/data sensitivity.

---

## 1. `abandoned-checkouts`, `account`, `acquisition`, `action-plan`

| Route | Methods | Intended caller | AuthN | AuthZ | SR | CID | RL | IV | Side effects | Sens | Flag | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `abandoned-checkouts/route.ts` | GET | artist owner | `auth.getUser()` | artist row resolved from session (`.eq('user_id', user.id)`), all reads `.eq('artist_id', artist.id)` | yes | no | no | n/a | none | medium | no | OK |
| `account/deactivate/route.ts` | POST | authenticated self | `auth.getUser()` | writes `.eq('id', user.id)` only | yes | no | no | n/a | none | low | no | OK |
| `account/reactivate/route.ts` | POST | authenticated self | `auth.getUser()` | writes `.eq('id', user.id)` only | yes | no | no | n/a | none | low | no | OK |
| `account/set-starter-tier/route.ts` | POST | artist self | `auth.getUser()` | reads/writes `.eq('user_id', user.id)`; refuses if a paid plan exists (409) | yes | no | no | n/a | none | high (billing) | no | OK |
| `acquisition/unsubscribe/route.ts` | GET, POST | public (email recipient) | **HMAC** `verifyUnsubscribe(email, sig)` | signature is the authorization | yes | email+sig (signed) | no | yes | writes `email_suppressions` | low | no | OK |
| `action-plan/route.ts` | GET | artist owner | `auth.getUser()` | artist resolved from session; every query `.eq('artist_id', artistId)` | yes | no | no | n/a | none (read-only) | medium | no | OK |

## 2. `admin/*` (40 routes)

All rows below call `requireAdmin()` as the first statement of every exported handler unless noted. Admin is authorized platform-wide, so client-supplied ids inside admin routes are not IDOR.

| Route | Methods | Intended caller | AuthN | AuthZ | SR | CID | RL | Side effects | Sens | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| `admin/acquisition/route.ts` | GET, POST | admin | `requireAdmin()` (L26, L262) | role from session | yes | yes (admin scope) | no | writes `admin_settings` | medium | OK |
| `admin/agent/analyze/route.ts` | POST | admin | `requireAdmin()` (L106) | role | yes | `scope` (allowlisted L108) | no | AI (Kimi) | medium | OK |
| `admin/agent/autonomous-stats/route.ts` | GET | admin | `requireAdmin()` (L11) | role | yes | no | no | none | low | OK |
| `admin/agent/autonomous/route.ts` | POST | cron/internal | **Bearer `CRON_SECRET`** (L27) | secret | yes | no | no | auto-executes LOW-risk actions | high | OK (registered exception) |
| `admin/agent/briefing/route.ts` | GET | cron | **Bearer `CRON_SECRET`** (L37) | secret | yes | no | no | AI + `auth.admin.listUsers()` | high | OK (registered exception) |
| `admin/agent/execute/route.ts` | POST | admin | `requireAdmin()` (L443) | role | yes | yes | no | calls autonomous route w/ CRON_SECRET | high | OK |
| `admin/approvals/route.ts` | GET, POST | admin | **client-supplied `userId` / `adminUserId`** (L22, L51) | `isAdmin(<caller-supplied uuid>)` | yes | **yes — the caller's own claimed identity** | no | approves users, mints invite codes, flips `artist_gate` | high | **VIOLATION** |
| `admin/avatar-cohorts/route.ts` | GET | admin | `requireAdmin()` (L65) | role | yes | filters | no | none | medium | OK |
| `admin/crm/import/route.ts` | POST | admin | `requireAdmin()` (L53) | role | yes | rows | no | `auth.admin.getUserById` | medium | OK |
| `admin/crm/outreach/route.ts` | GET, POST | admin | `requireAdmin()` (L16, L31) | role | yes | yes | no | sends outreach email | medium | OK |
| `admin/crm/outreach/track/[sendId]/route.ts` | GET | public (email recipient) | **none** | none | yes | `sendId` (uuid) + **`url`** | no | writes `crm_outreach_sends`; **`NextResponse.redirect(url)` L43** | low | **SUSPECT (open redirect)** |
| `admin/crm/outreach/unsubscribe/[sendId]/route.ts` | GET | public (email recipient) | **none** | none | yes | `sendId` | no | writes `crm_outreach_unsubscribes` | low | SUSPECT (unsigned GET-mutation) |
| `admin/crm/route.ts` | GET, POST | admin | `requireAdmin()` (L11, L93) | role | yes | yes | no | none | medium | OK |
| `admin/email-health/route.ts` | GET | admin | `requireAdmin()` (L11) | role | yes | no | no | none | low | OK |
| `admin/experiment-analytics/route.ts` | GET | admin | `requireAdmin()` (L23) | role | yes | filters | no | none | medium | OK |
| `admin/experiments/route.ts` | GET, POST | admin | `requireAdmin()` (L20, L58) | role | yes | yes | no | mutates experiment config | medium | OK |
| `admin/frl/engagements/route.ts` | GET, POST | admin | `requireAdmin()` (L29, L147) | role | yes | yes | no | none | high (economics) | OK |
| `admin/frl/engagements/[id]/route.ts` | GET, PATCH | admin | `requireAdmin()` (L41, L120) | role | yes | `id` | no | none | high | OK |
| `admin/frl/engagements/[id]/checklist/route.ts` | POST | admin | `requireAdmin()` (L24) | role | yes | `id` | no | none | high | OK |
| `admin/frl/engagements/[id]/evidence/route.ts` | GET, PUT | admin | `requireAdmin()` (L32, L49) | role | yes | `id` | no | none | high | OK |
| `admin/frl/engagements/[id]/work/route.ts` | POST, PATCH, DELETE | admin | `requireAdmin()` (L66, L109, L144) | role | yes | `id` | no | none | high | OK |
| `admin/funnel-events/route.ts` | GET | admin | `requireAdmin()` (L26) | role | yes | allowlisted group-by | no | none | medium | OK |
| `admin/funnel/route.ts` | GET | admin | `requireAdmin()` (L11) | role | yes | filters | no | none | medium | OK |
| `admin/lead-magnet-dashboard/route.ts` | GET | admin | `requireAdmin()` (L31) | role | yes | filters | no | none | medium | OK |
| `admin/manager-ops/route.ts` | GET | admin | `requireAdmin()` (L54) | role | yes | no | no | none | medium | OK |
| `admin/metrics/route.ts` | GET | admin | `requireAdmin()` (L37) | role | yes | period | no | reads `stripe_connect_id` (L78, admin client — correct) | high | OK |
| `admin/milestone/route.ts` | POST | artist self | re-export of `artist/milestone` | session-derived artist | no | no | no | none | low | OK (documented compat wrapper) |
| `admin/notes/route.ts` | GET, POST | admin | `requireAdmin()` (L11, L28) | role | yes | yes | no | none | medium | OK |
| `admin/opportunity/route.ts` | GET | admin | `requireAdmin()` (L34) | role | yes | filters | no | none | medium | OK |
| `admin/partners/route.ts` | GET, PATCH | admin | `requireAdmin()` (L11, L105) | role | yes | yes | no | none | medium | OK |
| `admin/pipeline/route.ts` | GET | admin | `requireAdmin()` (L11) | role | yes | no | no | `auth.admin.getUserById` | high | OK |
| `admin/platform-sequences/route.ts` | GET, POST | admin | inline `requireAdmin()` (L10–16, **session-derived**) | role | yes | yes | no | none | medium | OK (duplicate helper; consolidate) |
| `admin/prospect-nurture/route.ts` | GET | admin | inline `requireAdmin()` (L13–19, **session-derived**) | role | yes | no | no | none | medium | OK (duplicate helper) |
| `admin/quests-sync/route.ts` | POST | admin | `requireAdmin()` (L18) | role | yes | no | no | rewrites quest catalog | medium | OK |
| `admin/settings/route.ts` | GET, PUT | admin | `requireAdmin()` (L12, L26) | role | yes | key/value | no | flips feature flags | high | OK |
| `admin/stack-replacement/route.ts` | GET | admin | `requireAdmin()` (L33) | role | yes | filters | no | none | high (competitor data) | OK |
| `admin/support-chat/route.ts` | GET, POST | admin | `requireAdmin()` (L23, L70) | role | yes | `conversationId` | no | sends email to user | medium | OK |
| `admin/support/route.ts` | POST | admin | `requireAdmin()` (L110) | role | yes | slug/id | no | AI | high | OK |
| `admin/team-splits/route.ts` | GET, PATCH | admin | `requireAdmin()` (L14, L34) | role | yes | yes | no | none | high (money) | OK |
| `admin/track/route.ts` | POST | internal (middleware) | **`x-internal-secret` = `INTERNAL_TRACK_SECRET`; FAILS OPEN when unset (L29)** | conversion path additionally requires `user.id === markConverted.userId` (L117) | yes | `visitorHash`, `userId`, `artistSlug`, `recruiterCode` | no | writes `site_visits`, `artist_page_visits`, `referral_clicks`, `profiles.last_active_at`, `funnel_events` | medium (feeds recruiter payouts) | **SUSPECT** |

## 3. `ai-manager`, `analytics`, `artist/*`, `audience`, `booking-tokens`

| Route | Methods | Intended caller | AuthN | AuthZ | SR | CID | RL | Side effects | Sens | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| `ai-manager/execute/route.ts` | POST | artist owner OR cron | `auth.getUser()` or Bearer `CRON_SECRET` (L301) | loads action by id then `.eq('id', pendingAction.artist_id).eq('user_id', user.id)` (L339–346) | yes | `actionId` | no | executes manager actions (can touch prices) | high | OK |
| `ai-manager/generate/route.ts` | POST | artist owner OR cron | `requireArtistOwner(artistId)` (L56) or Bearer `CRON_SECRET` (L46, guarded by `!!process.env.CRON_SECRET`) | ownership | yes | `artistId` (**verified**) | yes (10/h) | AI model call | medium | OK |
| `analytics/route.ts` | GET | artist owner | `requireArtistOwner(artistId)` (L48) | ownership | yes | `artistId` (**verified**) | no | none | high (private books) | OK |
| `artist/avatar/route.ts` | GET, POST | artist self | `auth.getUser()` | artist resolved from session (L38–42) | yes | no | yes (20/h) | none | low | OK |
| `artist/complete-setup/route.ts` | POST | artist self | `auth.getUser()` | update `.eq('user_id', user.id)` (L37) | yes | no | no | seeds revenue ramp, funnel event | medium | OK |
| `artist/constraint/route.ts` | GET | artist self | `auth.getUser()` | artist from session (L43–47) | yes | no | no | writes issued-recommendation row | medium | OK |
| `artist/launch-partner/route.ts` | GET | artist self | `auth.getUser()` | artist from session (L67–72) | yes | no | no | none | low | OK |
| `artist/milestone/route.ts` | POST | artist self | `auth.getUser()` | artist from session (L38–42); milestone allowlisted (L33) | no | no | no | none | low | OK |
| `artist/movement-stats/route.ts` | GET | **public** | **none** (deliberate) | none | yes | `artistId` | no | none | low | OK (aggregate-only; same numbers the public artist page renders) |
| `artist/roadmap/route.ts` | GET | artist self | `auth.getUser()` | artist from session | yes | no | no | Stripe read | medium | OK |
| `artist/strategy/route.ts` | GET, POST | artist self | `auth.getUser()` (L46, L137) | `requireArtist(user.id)` resolves from session; writes `.eq('id', artist.id)` (L182) | yes | no | no | none | low | OK |
| `artist/tier-evidence/route.ts` | GET | artist owner | `requireArtistOwner(artistId)` (L49) | ownership | yes | `artistId` (**verified**) | no | none | high | OK |
| `audience/route.ts` | GET | artist owner | `auth.getUser()` + `getOwnedArtistIds()` (L25–28) | `owned.includes(artistId)` | yes | `artistId` (**verified**) | no | none | high (fan emails) | OK |
| `booking-tokens/route.ts` | GET, POST | fan self | `auth.getUser()` | all reads/writes `.eq('fan_id', user.id)` (L27, L54) | yes | `artist_id`, `purchase_id`, `token_id` (all narrowed by fan_id) | no | reveals `calendar_link` | medium | OK |

## 4. `bounties`, `campaign-hub`, `campaigns`

| Route | Methods | Intended caller | AuthN | AuthZ | SR | CID | RL | Side effects | Sens | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| `bounties/route.ts` | GET, POST | artist owner / fan | `auth.getUser()` (L13) | artist from session; fan scope keyed on `user.id` | yes | `scope` | no | notifies clippers | low | OK |
| `bounties/[id]/route.ts` | GET, PATCH, DELETE | artist owner | `auth.getUser()` (L13) | every query `.eq('id', id).eq('artist_id', artistId)` (L26, L50, L58, L79) | yes | `id` (**scoped**) | no | notifies clippers | low | OK |
| `bounties/[id]/submissions/route.ts` | POST (clipper), PATCH (artist) | fan / artist owner | `auth.getUser()` (L17) | PATCH checks `bounty.artist_id !== artistId` → 403 (L78); submission narrowed `.eq('bounty_id', bountyId)` (L84) | yes | `id`, `submissionId` (**scoped**) | no | badge award, notification, email | low | OK |
| `campaign-hub/route.ts` | GET | artist owner | `auth.getUser()` (L46) | artist from session (L53–57) | yes | no | no | none (read-only) | high (commission money) | OK |
| `campaigns/route.ts` | GET, POST | artist owner | `auth.getUser()` (L14, L42) | `.eq('id', artistId).eq('user_id', user.id)` (L21–27, L53–58); update also `.eq('artist_id', artistId).eq('status','draft')` | yes | `artistId`, `id` (**verified**) | no | none | medium | OK |
| `campaigns/[id]/send/route.ts` | POST | artist owner | `auth.getUser()` (L192) | campaign loaded, then `.eq('id', campaign.artist_id).eq('user_id', user.id)` (L205–211) | yes | `id` (**verified via parent**) | quota gate | **sends bulk email** | high | OK |
| `campaigns/[id]/stats/route.ts` | GET | artist owner | `auth.getUser()` (L16) | campaign loaded, then ownership on `campaign.artist_id` (L29–36) | yes | `id` (**verified via parent**) | no | none | high (revenue attribution) | OK |
| `campaigns/track/[sendId]/route.ts` | GET | public (email recipient) | **none** | none | yes | `sendId` (uuid) + **`url`** | no | writes `campaign_sends`; **`NextResponse.redirect(url, 302)` L54** | low | **SUSPECT (open redirect)** |
| `campaigns/unsubscribe/[sendId]/route.ts` | GET | public (email recipient) | **none** | none | yes | `sendId` | no | opts fan out of that artist | low | SUSPECT (unsigned GET-mutation) |
| `campaigns/unsubscribe-all/[sendId]/route.ts` | GET | public (email recipient) | **none** | none | yes | `sendId` | no | **opts fan out of EVERY artist** (L50–59) | medium | SUSPECT (unsigned GET-mutation) |

## 5. `city-unlocks`, `command`, `crm`

| Route | Methods | Intended caller | AuthN | AuthZ | SR | CID | RL | Side effects | Sens | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| `city-unlocks/route.ts` | GET, POST | artist owner | `auth.getUser()` (L12) | artist from session; insert stamps `artist_id: artistId` | yes | no | no | none | low | OK |
| `city-unlocks/[id]/route.ts` | GET (public+owner), PATCH, DELETE | public read / artist owner write | `auth.getUser()` (L12) | GET hides non-active from non-owners (L27); PATCH/DELETE `.eq('id', id).eq('artist_id', artistId)` (L68, L78, L88); `cityBreakdown` owner-only (L45) | yes | `id` (**scoped on write**) | no | none | low | OK |
| `city-unlocks/[id]/contribute/route.ts` | POST | fan self | `auth.getUser()` (L17) | contribution keyed on `user.id`; revenue value summed server-side from `earnings` (L47–54, explicitly not client-supplied) | yes | `id` | no | notifications to artist + all contributors | low | OK |
| `command/route.ts` | GET | fan self | `auth.getUser()` (L23) | every query `.eq('fan_id', user.id)` | yes | no | no | none | low | OK |
| `crm/actions/route.ts` | POST | artist owner | `auth.getUser()` (L13) | artist from session; **`fanId` from body is never checked against the artist's audience** (L32–57) | yes | **`fanId`, `metadata.badgeKey/label/icon`** | **no** | `awardFanBadge` → `createNotification` to arbitrary user | medium | **VIOLATION** |
| `crm/fan/route.ts` | GET | artist owner | `auth.getUser()` (L16) | artist from session; all reads `.eq('artist_id', artistId).eq('fan_id', fanId)` | yes | `fanId` (**narrowed by artist_id**, except `fan_badge_awards` `.or('artist_id.is.null')` L40 which returns platform-wide badges) | no | none | medium | SUSPECT (minor: arbitrary-`fanId` platform-badge probe) |
| `crm/notes/route.ts` | POST, DELETE | artist owner | `auth.getUser()` (L12) | insert stamps caller's `artist_id`; delete `.eq('artist_id', caller.artistId)` (L57) | yes | `fanId` (unvalidated), `id` (**scoped**) | no | none | low | SUSPECT (minor: note attachable to any uuid) |
| `crm/suggestions/route.ts` | GET | artist owner | `auth.getUser()` (L23) | artist from session; read-only | yes | no | no | none | medium | OK |

## 6. `cron/*` (25 routes)

Every route: **GET only**, gated by `req.headers.get('authorization') !== \`Bearer ${process.env.CRON_SECRET}\`` → 401. **None reads any query param or request body** (verified by grep: zero `searchParams` / `req.json()` hits under `src/app/api/cron/`). All construct a service-role client. Intended caller: Vercel cron. Verdict for all: **OK**, with the systemic hardening note below.

| Route | Line of secret check | External side effect | Sens |
|---|---|---|---|
| `cron/activation-nudges/route.ts` | L49 | email | medium |
| `cron/agent-health/route.ts` | L28 | email | low |
| `cron/ai-manager/route.ts` | L241 | AI + self-fetch w/ CRON_SECRET | medium |
| `cron/clipper-rate-drops/route.ts` | L19 | notifications | low |
| `cron/constraint-outcomes/route.ts` | L33 | none | medium |
| `cron/fan-digest/route.ts` | L14 | bulk email | medium |
| `cron/inactive-subscribers/route.ts` | L16 | email | medium |
| `cron/lead-scoring/route.ts` | L25 | none | medium |
| `cron/onboarding-health/route.ts` | L34 | creates+deletes canary user, email | high |
| `cron/onboarding-reminder/route.ts` | L18 | email | low |
| `cron/outcome-measure/route.ts` | L36 | none | medium |
| `cron/platform-crm/route.ts` | L64 | email | medium |
| `cron/platform-sequences/route.ts` | L18 | email | medium |
| `cron/prospect-nurture/route.ts` | L43 | email | medium |
| `cron/recruiter-qualify/route.ts` | L26 | none | high (payouts) |
| `cron/recruiter-recurring/route.ts` | L58 | none | high (payouts) |
| `cron/rls-canary/route.ts` | L113 | none (anon-key probe) | high (security canary) |
| `cron/scheduled-campaigns/route.ts` | L12 | bulk email | high |
| `cron/scheduled-releases/route.ts` | L18 | mutates `allowed_tier_ids` | high (entitlement) |
| `cron/sequence-conversions/route.ts` | L24 | none | medium |
| `cron/sequences/route.ts` | L15 | email | medium |
| `cron/sync-opportunities/route.ts` | L115 | none | medium |
| `cron/team-split-accruals/route.ts` | L19 | money accruals | high |
| `cron/team-split-selfcheck/route.ts` | L19 | none | high |
| `cron/weekly-report/route.ts` | L15 | email | low |

**Systemic hardening note (not a per-route verdict):** all 25 compare against a template literal without first asserting the env var exists. If `CRON_SECRET` were ever unset on a deployment, the expected header becomes the literal string `Bearer undefined` and anyone can trigger all 25 (bulk email, entitlement mutation, money accruals). `ai-manager/generate/route.ts:46` shows the correct shape: `!!process.env.CRON_SECRET && authHeader === ...`. Evidence says the secret IS set in production (the crons run), so this is latent, not live.

## 7. `discount-codes`, `earn`, `emails`, `experiments`, `explore`

| Route | Methods | Intended caller | AuthN | AuthZ | SR | CID | RL | Side effects | Sens | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| `discount-codes/route.ts` | GET, POST, DELETE | artist owner | `auth.getUser()` (L13, L41, L128) | `.eq('id', artistId).eq('user_id', user.id)` on all three (L20–26, L51–57, L134–140); writes also `.eq('artist_id', artistId)` | yes | `artistId`, `id` (**verified**) | no | none | high (pricing) | OK |
| `discount-codes/validate/route.ts` | POST | authenticated fan | `auth.getUser()` (L13) | none needed (per-fan use count keyed on `user.id` L58) | yes | `code`, `artistId` | **no** | none | medium | SUSPECT (unthrottled code-guessing oracle) |
| `earn/route.ts` | GET | fan self | `auth.getUser()` (L21) | every query `.eq('referrer_fan_id', user.id)` | yes | no | no | none | high (money) | OK |
| `emails/route.ts` | POST | authenticated self | `auth.getUser()` (L12) | recipient forced to `user.email` (L26); `type` allowlisted (L34–48) | no | no | yes (3/60s) | email | low | OK |
| `emails/artist-new-post/route.ts` | POST | authenticated fan | `auth.getUser()` (L30) | **no check the caller has any relationship to `artistId`** (L38–61); sender name server-derived (L45–50); body HTML-escaped (L15–22, L80) | yes | `artistId`, `postPreview` | yes (5/60s) | **sends email to any artist** | low | SUSPECT |
| `experiments/track/route.ts` | POST | public | none (deliberate) | variant derived server-side from `aid` (L57); user linked from session only (L59–67) | yes | `aid`, `experienceKey`, `eventName` (all validated L49) | yes (300/h per IP) | none | low | OK |
| `explore/route.ts` | GET | public | none (deliberate) | track rows read through the **request-scoped** client against `tracks_public` (L20, documented) so audio redaction keys off `auth.uid()` | yes | `q` | no | none | low | OK |

## 8. `fan-campaigns`, `fan-contacts`, `fan`, `funnel`

| Route | Methods | Intended caller | AuthN | AuthZ | SR | CID | RL | Side effects | Sens | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| `fan-campaigns/route.ts` | GET, POST | artist owner | `auth.getUser()` (L51) | artist from session, **no artistId parameter exists**; constraint gate fails closed (L73–76) | yes | no | no | none | medium | OK |
| `fan-campaigns/[id]/route.ts` | PATCH | artist owner | `auth.getUser()` (L37) | `campaign.artist_id !== artist.id` → **404** (L49–51); every transition guarded on `from` status | yes | `id` (**verified**) | no | badge awards | medium | OK |
| `fan-campaigns/active/route.ts` | GET | public + optional session | optional `auth.getUser()` (L71) | payload is a hand-written **allowlist** (L53–66); drafts never visible; `you` block is caller-only | yes | `slug` | no | none | medium | OK |
| `fan-campaigns/join/route.ts` | POST | fan self | `auth.getUser()` (L31) | participant is `user.id`, no fanId param; role from archetype not request (L71) | yes | `campaignId` | yes (10/60s) | none | low | OK |
| `fan-contacts/route.ts` | GET | artist owner | `auth.getUser()` (L12) | `.eq('id', artistId).eq('user_id', user.id)` (L18–24) | yes | `artistId` (**verified**) | no | none | high (PII: emails, phones) | OK (note: `select('*')` L32 returns every contact column incl. phone) |
| `fan-contacts/import/route.ts` | POST | artist owner | `auth.getUser()` (L27) | `.eq('id', artistId).eq('user_id', user.id)` (L52–58); attestation required (L44) | yes | `artistId`, `rows` (**verified**, capped 5000 L60) | no | none | high (PII) | OK |
| `fan/unsubscribe-all/route.ts` | POST | fan self | `auth.getUser()` (L12) | every read/write `.eq('fan_id', user.id)` | yes | no | no | none | low | OK |
| `funnel/track/route.ts` | POST | authenticated | `auth.getUser()` (L48) | identity from session, never body (documented L5–6); `stage` allowlisted (L40) | yes | `stage`, `dedupeKey`, `metadata` | yes (120/h) | recomputes opportunity ledger | low | OK |

---

## Verdict tally (118 routes)

| Verdict | Count |
|---|---|
| OK | 106 |
| SUSPECT | 10 |
| VIOLATION | 2 |

SUSPECT routes: `admin/crm/outreach/track/[sendId]`, `admin/crm/outreach/unsubscribe/[sendId]`, `admin/track`, `campaigns/track/[sendId]`, `campaigns/unsubscribe/[sendId]`, `campaigns/unsubscribe-all/[sendId]`, `crm/fan`, `crm/notes`, `discount-codes/validate`, `emails/artist-new-post`.
VIOLATION routes: `admin/approvals`, `crm/actions`.

---

## AUTH-002 analysis: service-role + client-supplied artist id

Routes in slice A that accept an artist/fan/campaign id from the client **and** read/write with the service-role client:

**Ownership correctly proven (13):**
`analytics` and `artist/tier-evidence` (`requireArtistOwner`); `audience` (`getOwnedArtistIds` + `.includes`); `ai-manager/generate` (`requireArtistOwner`); `ai-manager/execute` (parent row's `artist_id` cross-checked against session); `campaigns`, `campaigns/[id]/send`, `campaigns/[id]/stats`, `discount-codes`, `fan-contacts`, `fan-contacts/import` (all `.eq('id', artistId).eq('user_id', user.id)` before any admin-client read); `bounties/[id]*`, `city-unlocks/[id]`, `fan-campaigns/[id]` (child scoped by `.eq('artist_id', <session-derived>)` or explicit `!==` → 404).

**Ownership NOT proven:** `crm/actions` (`fanId`), `crm/notes` (`fanId`), `emails/artist-new-post` (`artistId`), `admin/approvals` (`adminUserId`/`userId` — the identity itself). Detailed below.

**Correct-by-construction (no id parameter exists at all):** `action-plan`, `campaign-hub`, `fan-campaigns`, `artist/constraint`, `artist/strategy`, `artist/roadmap`, `artist/avatar`, `artist/launch-partner`, `command`, `earn`, `crm/suggestions`, `crm/fan` (artist side), `abandoned-checkouts`. This is the strongest pattern in the codebase and is used consistently for artist-private surfaces.

## IDOR/BOLA analysis: nested resources

Checked every nested route in the slice for "proves the child exists but not that it belongs to the caller":

- `bounties/[id]/submissions` PATCH — **safe**: `bounty.artist_id !== artistId` → 403 (L78) *and* submission narrowed `.eq('bounty_id', bountyId)` (L84).
- `campaigns/[id]/stats` and `campaigns/[id]/send` — **safe**: campaign loaded first, then ownership asserted on `campaign.artist_id`.
- `fan-campaigns/[id]` — **safe**, and deliberately returns 404 rather than 403 so existence is not confirmed.
- `city-unlocks/[id]` PATCH/DELETE — **safe**: `.eq('id', id).eq('artist_id', artistId)`.
- `admin/frl/engagements/[id]/*` — admin-only, so `[id]` needs no per-caller scoping.
- `campaigns/track|unsubscribe|unsubscribe-all/[sendId]`, `admin/crm/outreach/*/[sendId]` — **no ownership model at all by design** (public email links). Covered as SUSPECT below.

No true nested-resource IDOR was found in this slice.

## Routes with NO auth that mutate state

1. `admin/crm/outreach/track/[sendId]` — writes `crm_outreach_sends.status/opened_at/clicked_at`.
2. `admin/crm/outreach/unsubscribe/[sendId]` — writes `crm_outreach_unsubscribes`.
3. `campaigns/track/[sendId]` — writes `campaign_sends.status/opened_at/clicked_at`.
4. `campaigns/unsubscribe/[sendId]` — writes `fan_communication_prefs` / `fan_contacts.is_subscribed_email`.
5. `campaigns/unsubscribe-all/[sendId]` — writes `fan_communication_prefs` for **every** artist the fan touches.
6. `acquisition/unsubscribe` — mutates, but is **HMAC-verified**; this is the correct pattern and the counter-example to 1–5.
7. `admin/track` — mutates, gated only by an internal header that **fails open** if unset.

## Over-fetch of sensitive fields

- No `select('*')` on `profiles` or `artist_profiles` anywhere in the slice. Every read of `stripe_connect_id` / `platform_stripe_subscription_id` uses the **admin** client (`account/set-starter-tier` L21, `admin/metrics` L78, `admin/pipeline` L17, `admin/support` L52/L85, `artist/roadmap` L132) — this is the required pattern, since naming those columns from a session client 42501s the whole statement.
- `fan-contacts/route.ts:32` — `select('*')` on `fan_contacts` returns every column (email, phone, consent metadata) to the owning artist. Owner-only, so not a leak, but wider than the UI needs.
- `admin/support-chat` GET returns `user_email` per conversation and `admin/pipeline` calls `auth.admin.getUserById` — both admin-gated, appropriate.


---

## Slice B - routes g-p (69)

# CRWN API Security Audit — Slice B (top-level dirs `g`–`p`)

Read-only audit. Scope: every `src/app/api/<dir>/**/route.ts` where `<dir>` starts with a letter
g–p. **69 routes**, all covered (enumerated via
`find src/app/api -mindepth 2 -name route.ts | awk -F/ '$1 ~ /^[g-p]/'`).

Verdict counts: **OK 59 · SUSPECT 7 · VIOLATION 3**

Shared facts that make these routes dangerous by default (from `src/lib/apiAuth.ts` and
`src/middleware.ts`): middleware EXCLUDES `/api/`, so nothing upstream authenticates; the
service-role client bypasses RLS, so nothing downstream authorizes. A route's authorization is
exactly what it does itself.

---

## Per-route manifest

Legend: SR = constructs a `SUPABASE_SERVICE_ROLE_KEY` client. CID = accepts a client-controlled
resource id that selects which row is read/written. RL = rate limit. Val = input validation.
Sens = money/data sensitivity.

| # | Route | Methods | Intended caller | AuthN present | AuthZ present | SR | CID | RL | Val | External effect | Sens | Flag gate | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `impact/route.ts` | GET | authenticated fan (self) | `auth.getUser()` | session-scoped only (`fanId = user.id`) | yes | no | no | n/a | none | medium (earnings) | no | OK |
| 2 | `integrations/calcom/webhook/route.ts` | POST | third-party webhook (Cal.com) | HMAC over raw body (`verifyCalcomRequest`) | n/a | yes | no (ids resolved server-side) | no | body size cap + trigger allowlist | none | medium | no | OK |
| 3 | `integrations/manychat/webhook/route.ts` | POST, GET | third-party webhook (ManyChat) | shared secret + `sent_at` freshness | never reads PII back, never sets `user_id` | via libs | contact id (write-only) | yes (per contact) | schema per event type | none | medium | `acquisition_engine` | OK |
| 4 | `invite/redeem/route.ts` | POST | authenticated user | `auth.getUser()` | RPC takes `p_user = user.id` from session | yes | code only | no | type check | none | medium (artist approval) | no | OK |
| 5 | `lead-magnets/admin/route.ts` | GET | admin | `auth.getUser()` | `profiles.role === 'admin'` | yes | no | no | n/a | none | low (aggregates only) | no | OK |
| 6 | `lead-magnets/analytics/route.ts` | POST | public (beacon) | none (by design) | n/a; append-only allowlisted fields | yes | no | no | event allowlist, attribution re-normalized, avatar id validated | none | low | no | OK |
| 7 | `lead-magnets/call-request/route.ts` | POST | public | none (by design) | n/a | yes | `publicToken` (scoped by `tool_slug`) | yes (IP 5/h) | tool allowlist, consent required, inputs sanitized, score recomputed server-side | Resend (founder only) | medium | no | OK |
| 8 | `lead-magnets/capture/route.ts` | POST | public | none (by design) | n/a | yes | no | yes (IP 30/h) | email validated, result recomputed server-side, attribution re-normalized | Resend (to submitted address) | medium | no | OK |
| 9 | `lead-magnets/email/route.ts` | POST | public (token) or authenticated owner | token / `auth.getUser()` | recipient is FIXED (lead email or session email), owner check on `artist_profiles` | yes | `token` / `resultId` | yes (10/h IP, 20/h user) | yes | Resend | medium | no | OK |
| 10 | `lead-magnets/results/route.ts` | GET, POST | artist owner | `requireArtistOwner` | ownership on `artistId` | yes | `artistId` (cross-checked) | no | tool + result server-recomputed | none | medium | no | OK |
| 11 | `lead-magnets/results/[id]/route.ts` | GET, PATCH, DELETE | public (token) or artist owner | token / `auth.getUser()` | `ownerCheck` joins `artist_profiles.user_id` | yes | `id`, `token` | no | yes | none | medium | no | OK |
| 12 | `lead-results/[token]/claim/route.ts` | POST | authenticated user | `auth.getUser()` | identity from session only; body ignored | via lib | `token` | yes (20/h) | opaque failure (no oracle) | none | high (binds a result to an account) | no | OK |
| 13 | `lead-results/[token]/recalculate/route.ts` | POST | public (capability token) | token IS the authorization | token scopes to one result | yes | `token` | yes (20/min per token) | `clampInt` bounds, server recompute | none | low | no | OK |
| 14 | `lead-results/auto-claim/route.ts` | POST | authenticated user | `auth.getUser()` | reads NOTHING from body; verified email + `user_metadata` token | yes | no | yes (40/h) | n/a | none | high | no | OK |
| 15 | `lead-results/post-setup-destination/route.ts` | GET | authenticated artist | `auth.getUser()` | artist row resolved from session | yes | `returnTo`, `aid` (validated `AID_RE`, variant re-derived) | no | yes | none | low | `quest_engine` | OK |
| 16 | `leaderboard/route.ts` | GET | public | none (deliberate) | n/a | yes | `artistId` | no | n/a | none | medium | no | OK (spend + score deliberately withheld, `leaderboardPrivacy.ts`) |
| 17 | `leads/calculator/route.ts` | POST | public | none | n/a | yes | no | **NO** | email regex only | Resend to caller-chosen address | medium | no | **SUSPECT** |
| 18 | `live/agreement/route.ts` | GET, POST | authenticated artist | `auth.getUser()` | `artistId` verified owned before storing | yes | `artistId` (cross-checked) | no | yes | none | medium (liability record) | no | OK |
| 19 | `live/chat/route.ts` | POST, PATCH | fan with session access / owner | `auth.getUser()` | `canParticipate` re-runs the token gate; PATCH = author or owner | yes | `sessionId`, `messageId` | yes (30/min) | 500-char cap | none | low | no | OK |
| 20 | `live/egress-webhook/route.ts` | POST | third-party webhook (LiveKit) | LiveKit `WebhookReceiver` signature | n/a | yes | `egressId` (from signed body) | no | terminal-state filter | none | medium | no | OK |
| 21 | `live/leave/route.ts` | POST | authenticated fan (self) | `auth.getUser()` | update filtered `.eq('user_id', user.id)` | yes | `sessionId` | no | minimal | none | none | no | OK |
| 22 | `live/session/route.ts` | POST | artist owner | `auth.getUser()` | `artist_profiles.id = session.artist_id AND user_id = user.id` | yes | `sessionId` (cross-checked) | no | action allowlist | LiveKit egress start/stop, room teardown | medium | plan tier `allowsLive` + agreement version | OK |
| 23 | `live/thumbnail-url/route.ts` | POST | artist owner | `auth.getUser()` | ownership on `artistId` via RLS client | no | `artistId` (cross-checked) | no | `image/*` enforced | R2 signed PUT | low | no | OK |
| 24 | `live/thumbnail/route.ts` | GET | public (teaser, by design) | none | none | yes | `sessionId` | no | none | R2 signed GET + 302 | low | no | **SUSPECT** (private sessions included) |
| 25 | `live/tips/route.ts` | GET | public | none (deliberate) | none | yes | `sessionId` | no | n/a | none | medium (per-fan tip amounts + fan UUIDs) | `live_tips` | **SUSPECT** |
| 26 | `live/token/route.ts` | POST | authenticated fan or owner | `auth.getUser()` | broadcaster grant requires owned `artist_profiles`; viewer requires tier or paid ticket; slot cap | yes | `sessionId` (gate applied) | no | yes | LiveKit token mint | high | session `status === 'live'` | OK |
| 27 | `live/upload-url/route.ts` | POST | artist owner | `auth.getUser()` | ownership on `artistId` via RLS client | no | `artistId` (cross-checked) | no | `video/*` enforced, filename sanitized in `generateFileKey` | R2 signed PUT | low | no | OK |
| 28 | `live/vod/route.ts` | GET | owner / clipper / entitled fan | `auth.getUser()` | owner check first; `visibility==='private'` short-circuits BEFORE the clipper branch | yes | `sessionId` | no | filename sanitized | R2 signed GET | high | no | OK |
| 29 | `live/watch/route.ts` | POST | owner or entitled fan | `auth.getUser()` | owner, then private-block, then tier/ticket | yes | `sessionId` | no | yes | R2 signed GET | high | no | OK |
| 30 | `marketing-costs/route.ts` | GET, POST, PUT, DELETE | artist owner | `auth.getUser()` | `getArtistIdForUser(user.id)` compared to `artistId` / row's `artist_id` | yes | `artistId`, `id` (both cross-checked) | no | category allowlist, amount > 0 | none | medium | no | OK (`select('*')` is own-row only) |
| 31 | `messages/route.ts` | GET, POST | fan / artist participant | `auth.getUser()` | `getOwnedArtistIds` + `convo.fan_id === user.id`; `fanCanMessage` tier gate | yes | `conversationId`, `artistId`, **`audioUrl`** | yes (20/min) | body length; **`audioUrl` only checked for `https?://`** | none | high | Pro plan `allowsDMs` | **VIOLATION** |
| 32 | `messages/[conversationId]/route.ts` | GET, PATCH | participant | `auth.getUser()` | `authorize()` = fan_id match or owned artist; mute restricted to artist | yes | `conversationId` (cross-checked) | no | action allowlist | none | high | no | OK |
| 33 | `messages/[conversationId]/voice-urls/route.ts` | POST | participant | `auth.getUser()` | `conversationRole()`; ids scoped to the conversation | yes | `conversationId`, `ids[]` (scoped) | no | max 50 ids | Supabase Storage signed URL | high | no | **VIOLATION** (signs whatever `audio_url` holds) |
| 34 | `messages/broadcast/route.ts` | GET, POST | artist owner | `auth.getUser()` | `getOwnedArtistIds` includes `artistId`; segment scoped `.eq('artist_id', artistId)` | yes | `artistId`, `segmentId` (cross-checked) | yes (10/h + 5/day) | audience allowlist, 2000-char cap | none | high | Pro `allowsDMs` | OK (same `audioUrl` weakness as #31, but artist-only) |
| 35 | `milestones/route.ts` | GET | artist owner | `requireArtistOwner` | ownership on `artistId` | yes | `artistId` (cross-checked) | no | n/a | none | medium (revenue bracket) | no | OK |
| 36 | `mission-suggestions/route.ts` | POST | authenticated fan | `auth.getUser()` | self-suggest rejected; `suggested_by = user.id` | yes | `artistId`, `targetId` (target validated at review) | yes (5/day) | type/target/goal/length allowlists | notification to artist | low | no | OK |
| 37 | `mission-suggestions/[id]/review/route.ts` | POST | artist owner | `auth.getUser()` | `artist_profiles.id = suggestion.artist_id AND user_id = user.id`; target ownership re-verified per table | yes | `id` (cross-checked) | no | reward/audience allowlists | notification to fan | medium | no | OK |
| 38 | `missions/[id]/route.ts` | DELETE | artist owner | `auth.getUser()` | `.eq('artist_id', artistId)` on read AND write | yes | `id` (cross-checked) | no | n/a | none | low | no | OK |
| 39 | `missions/[id]/join/route.ts` | POST | authenticated fan | `auth.getUser()` | `fan_id = user.id` always; audience gate enforced | yes | `id` | yes (20/min) | action allowlist | none | none | mission `status === 'active'` | OK |
| 40 | `missions/participant-counts/route.ts` | GET | public | none (deliberate) | none | yes | `ids[]` (UUID-validated, max 50) | no | UUID regex | none | none (counts only) | no | OK |
| 41 | `my-calendar/route.ts` | GET | authenticated fan (self) | `auth.getUser()` | projection scoped to `user.id` | yes | no | no | n/a | none | low | no | OK |
| 42 | `notifications/new-artist-hook/route.ts` | POST | internal (pg_net trigger) | shared secret `x-webhook-secret` | n/a | yes | `user_id` from trigger | no | slug required, canary skipped | Resend x2, `auth.admin.getUserById` | medium | no | OK |
| 43 | `notifications/notify-subscribers/route.ts` | POST | artist owner | `auth.getUser()` | ownership on `artistId` via RLS client | yes | `artistId` (cross-checked) | yes (5/min + 8/day) | **none on `type`/`title`/`message`/`link`** | writes N notification rows | medium | no | **SUSPECT** |
| 44 | `onboarding/avatar/route.ts` | POST | authenticated user (self) | `auth.getUser()` | writes only `.eq('id', user.id)`; URL must be inside caller's own avatars folder | yes | `avatarUrl` (prefix-locked) | no | yes | none | low | no | OK |
| 45 | `onboarding/identity/route.ts` | POST | authenticated user (self) | `auth.getUser()` | `user_id` is ALWAYS the session user; existing artist row cannot be downgraded | yes | `handle`, `recruiterCode` | no | slug validated + reserved list, email-like name rejected | Resend welcome | high | no | OK |
| 46 | `opportunity-drafts/route.ts` | POST | public (anonymous pre-signup) | none (by design) | row lands unclaimed (`user_id NULL`) | yes | no | yes (60/h IP) | spec-driven field allowlist, `<>` stripped | none | low | no | OK |
| 47 | `opportunity-drafts/[token]/route.ts` | GET, PUT | public (capability token) | token | `loadUnclaimed` requires `user_id IS NULL`, re-asserted in the UPDATE | yes | `token` | yes (120/h, 180/h) | `isDraftToken`, spec sanitizers | none | low | no | OK |
| 48 | `outreach/inbound/route.ts` | POST | third-party webhook (Resend) | Svix signature, fails closed | n/a | yes | sender email (from signed body) | no | type filter | none | medium | no | OK |
| 49 | `outreach/webhook/route.ts` | POST | third-party webhook (Resend) | Svix signature, fails closed | n/a | yes | recipient email (from signed body) | no | type filter | none | medium (suppression list) | no | OK |
| 50 | `partner/apply/route.ts` | POST | public | none | n/a | yes | no | yes (IP 3 / 5min) | presence checks only; **no email format / length validation** | Resend x2 (founder + applicant) | low | no | **SUSPECT** |
| 51 | `platform/limits/route.ts` | GET | artist owner | `auth.getUser()` | `artist.user_id !== user.id` → 403 | yes | `artistId` (cross-checked) | no | n/a | none | medium (plan + catalog size) | no | OK |
| 52 | `playbooks/route.ts` | GET, POST | artist owner | `auth.getUser()` | artist id derived from session, never from body | yes | `playbookId` (registry-checked) | no | `PLAYBOOK_MAP` lookup | none | medium | no | OK |
| 53 | `playbooks/runs/[id]/route.ts` | GET, PATCH | artist owner | `auth.getUser()` | `.eq('artist_id', artistId)` on read AND write | yes | `id` (cross-checked) | no | status allowlist | none | low | no | OK |
| 54 | `playbooks/runs/[id]/steps/route.ts` | PATCH | artist owner | `auth.getUser()` | run scoped to artist, step scoped `.eq('run_id', runId)`; inserts use server-derived `artistId` | yes | `id`, `stepId` (both cross-checked) | no | action allowlist; payload is server-generated, not client-sent | creates squad/mission/bounty/city rows | medium | no | OK |
| 55 | `popups/route.ts` | GET, POST | authenticated user (self) | `auth.getUser()` | context built from `user.id` only | yes | `popupKey` (registry-checked) | no | action + popup allowlist | Resend on low survey score | low | `popup_engine` | OK |
| 56 | `producer/analytics/route.ts` | GET | artist owner | `auth.getUser()` | `ownsSession()` | yes | `sessionId` (cross-checked) | no | n/a | none | medium (revenue) | `producer_sessions` (indirect) | OK |
| 57 | `producer/flag/route.ts` | GET | public | none | none | yes | no | no | n/a | none | none (boolean) | `producer_sessions` | OK |
| 58 | `producer/polls/route.ts` | GET, POST, PATCH | GET: any / POST+PATCH: artist owner | POST/PATCH `auth.getUser()`; **GET optional** | POST/PATCH `ownsSession()`; **GET: none** | yes | `sessionId`, `pollId` | no | question/option caps, stable option ids | none | low–medium | `producer_sessions` | **SUSPECT** (GET) |
| 59 | `producer/polls/vote/route.ts` | POST | fan with session access | `auth.getUser()` | `canSubmitToSession()`; option id validated against the poll | yes | `pollId`, `optionId` (validated) | yes (30/min) | yes | none | none | `producer_sessions` | OK |
| 60 | `producer/submissions/file/route.ts` | GET | submitting fan or owner | `auth.getUser()` | `sub.fan_id === user.id` OR `ownsSession()` | yes | `id` (cross-checked) | no | filename sanitized | R2 signed GET | medium | no | OK |
| 61 | `producer/submissions/route.ts` | GET, POST, PATCH | fan (own) / artist owner | `auth.getUser()` | GET falls back to `.eq('fan_id', user.id)`; PATCH requires `ownsSession()`; **`fileKey` must start with `producer-submissions/<sessionId>/<user.id>/`** | yes | `sessionId`, `submissionId`, `fileKey` (all cross-checked) | yes (20/h) | kind + status allowlists, consent version echo | none | medium | `producer_sessions` | OK |
| 62 | `producer/submissions/upload-url/route.ts` | POST | fan with session access | `auth.getUser()` | `canSubmitToSession()`; key derived server-side from `sessionId` + `user.id` | yes | `sessionId` | yes (20/h) | size cap, filename sanitized | R2 signed PUT | low | `producer_sessions` | OK |
| 63 | `promise-calendar/route.ts` | GET | artist owner | `auth.getUser()` | artist row from session | yes | no | no | n/a | none | medium | no | OK |
| 64 | `promise-calendar/events/[id]/route.ts` | PATCH | artist owner | `auth.getUser()` | event read `.eq('artist_id', artistId)` | yes | `id` (cross-checked), `completionSourceId` (unvalidated, stored only) | no | action allowlist, date validated | inserts notifications for fans | medium | no | **SUSPECT** (sink for #66) |
| 65 | `promise-calendar/health/route.ts` | GET | artist owner | `auth.getUser()` | all queries `.eq('artist_id', artist.id)` | yes | no | no | n/a | none | low | no | OK |
| 66 | `promise-calendar/obligations/route.ts` | GET, POST, PATCH | artist owner | `auth.getUser()` | GET/PATCH scoped `.eq('artist_id', artistId)`; **POST does NOT validate `audienceId`/`sourceTierId`/`sourceProductId`** | yes | `audienceId`, `sourceTierId`, `sourceProductId`, `id` | **no** | recurrence/type/audience-kind allowlists; ids unvalidated | none directly | medium | no | **VIOLATION** |
| 67 | `promise-calendar/ramp/route.ts` | POST | artist owner | `auth.getUser()` | artist row from session, never from body | yes | no | no | n/a | none | low | no | OK |
| 68 | `proof-of-demand/respond/route.ts` | POST | authenticated fan | `auth.getUser()` | `fan_id = user.id`; audience gate enforced | yes | `testId` | yes (20/min) | yes; unique constraint dedupes | none | none (money-free) | test `status === 'active'` | OK |
| 69 | `prospect-nurture/unsubscribe/[token]/route.ts` | GET, POST | public (one-click, RFC 8058) | opaque token IS the authorization | token scopes to one enrollment | yes | `token` | yes (IP 60/h) | unknown token = same response (no enumeration) | none | low | no | OK |

---

## AUTH-002 review: how ownership is proven on every service-role route touching artist resources

Every route in this slice that accepts an artist-scoped id proves ownership with one of four
patterns, all of which cross-check the SESSION user:

| Pattern | Routes |
|---|---|
| `requireArtistOwner(artistId)` (`src/lib/apiAuth.ts`) | milestones, lead-magnets/results |
| `getOwnedArtistIds(admin, user.id).includes(artistId)` | messages, messages/[conversationId], messages/broadcast |
| Inline `.eq('id', artistId).eq('user_id', user.id)` | live/token, live/session, live/watch, live/vod, live/chat, live/agreement, live/upload-url, live/thumbnail-url, notifications/notify-subscribers, platform/limits, mission-suggestions/[id]/review, lead-magnets/results/[id], lead-magnets/email |
| Artist id **derived** from session (id never accepted from the request) | playbooks (all 3), promise-calendar (all 5), missions/[id], marketing-costs, impact, my-calendar, lead-results/post-setup-destination, lead-results/auto-claim, promise-calendar/ramp |

**No route in this slice takes `artistId`/`ownerId` from the body or query and uses it without a
cross-check.** `auth.getUser()`-only routes exist (live/leave, missions/[id]/join,
proof-of-demand/respond, popups, onboarding/*) but every one of them writes only rows keyed to
`user.id`, which is the correct use of that pattern.

The two authorization defects found are NOT the "artistId from the body" shape. They are:
(a) a value that is *stored* by an authorized caller and later *consumed* by a privileged signer
without re-validation (finding 1), and (b) a foreign-key id accepted from an authorized artist and
later used to select *another* artist's fan set (finding 2).

## LiveKit token minting (question 4) — traced

`src/app/api/live/token/route.ts`.

- **Publish/broadcaster grant**: reachable only through lines 53–74, which require
  `artist_profiles WHERE id = session.artist_id AND user_id = user.id`. A viewer cannot obtain it;
  `role` is never read from the request. Grant construction is entirely server-side
  (`liveProvider.mintToken({ room: session.room_name, identity: user.id, role })`); `room` comes
  from the DB row, never the client, so an arbitrary room cannot be joined.
- **Arbitrary room**: not possible. The client supplies `sessionId` only; `room_name` is read from
  `live_sessions`. `status !== 'live'` → 409, `is_active === false` → 404.
- **Access after refund**: `hasPaidLiveTicket` (`src/lib/live/access.ts:19-33`) matches
  `status = 'paid'`. `src/lib/webhookHandlers.ts:2103-2110` flips a ticket to `refunded` on
  `charge.refunded`, but **only on a FULL refund** — the comment states this is deliberate ("a
  partial refund is not a cancelled seat"). So: full refund revokes room, chat, VOD and submission
  access; partial refund intentionally keeps it. No defect.
- **Slot cap** is enforced server-side with a reconnect carve-out; broadcaster does not consume a
  slot. Correct.

## Over-fetching review

`select('*')` appears in: messages (dm_conversations — caller's own rows only), messages/[id]
(same), mission-suggestions/[id]/review (own suggestion), marketing-costs (own rows),
playbooks/runs (own rows), promise-calendar/events + obligations (own rows),
lead-magnets/results/[id] (after owner check). **None reaches a revoked column** — no route in this
slice selects `stripe_connect_id`, `platform_stripe_*`, `tracks.audio_url_*`, or `profiles.email`
from a browser/user-session client. `popups/route.ts:150` selects `stripe_connect_id` but uses the
service-role client, which is correct.


---

## Slice C - routes q-z (75)

# CRWN API Security Audit — Slice C (top-level dir starting q–z)

Repo: `/home/merce/workspace-crwn` (UNC: `\\wsl.localhost\Ubuntu\home\merce\workspace-crwn`)
Total `src/app/api/**/route.ts` in repo: **262**. Slice C (alphabetical q–z): **75**. All 75 reviewed, none sampled.

Baseline facts established for the whole slice:
- `src/middleware.ts:123-125` matcher excludes `api/`, so **no upstream auth exists on any route here**.
- The service-role client bypasses RLS. A service-role route's authorization is only what it does itself (`src/lib/apiAuth.ts:1-14`).
- `requireArtistOwner()` (`src/lib/apiAuth.ts:42`) is the correct helper; only **1** route in this slice uses it (`sync-opportunities` GET).

Verdicts: **62 OK · 9 SUSPECT · 4 VIOLATION**

Legend for columns: SR = service-role client used; CID = client-controlled resource id; RL = rate limit; Val = input validation; Ext = external side effect.

| # | Route | Methods | Intended caller | AuthN present | AuthZ present | SR | CID | RL | Val | Ext | Sensitivity | Flag | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `quests/build` | POST | artist self | `auth.getUser()` | owns `artist_profiles` row | Y | no | none | build key allowlist (`ARTIST_BUILD_MAP`) | none | low | — | OK |
| 2 | `quests/complete` | POST | user self | `auth.getUser()` | `instance.user_id === user.id` + `kind==='manual'` hard guard | Y | questId | none | questId presence | XP grant (idempotent) | med (XP) | `quest_engine` | OK |
| 3 | `quests/event` | POST | fan self | `auth.getUser()` | fanId from session; artist existence checked | Y | artistId (scope only) | none | eventType allowlist (money events excluded) | XP | med | `quest_engine` | OK |
| 4 | `quests/live` | POST, GET | artist self / any viewer | `auth.getUser()` (GET optional) | POST: owns artist row; GET: public read of an active live quest | Y | sessionId | none | template must be `onDemand` + artist role | none | low | `quest_engine` | OK |
| 5 | `quests/role` | POST | fan self | `auth.getUser()` | own progression row | Y | no | none | `FAN_ROLE_MAP` + `selectable` | none | low | — | OK |
| 6 | `quests` | GET | user self | `auth.getUser()` | all queries scoped to `user.id` | Y | no | none | n/a | funnel events | low | `quest_engine` | OK |
| 7 | `api/route.ts` | — | — | n/a | n/a | N | n/a | n/a | n/a | none | none | — | OK (placeholder, `export {}`) |
| 8 | `recruit/connect-stripe` | POST | recruiter self | `auth.getUser()` | `recruiters.user_id = user.id` | Y | no | none | n/a | **Stripe account create + login link** | HIGH (payout) | — | OK |
| 9 | `recruit/dashboard` | GET | recruiter self | `auth.getUser()` | `recruiters.user_id = user.id` | Y | no | none | n/a | none | HIGH (financials) | — | OK |
| 10 | `recruit/signup` | POST | user self | `auth.getUser()` | own profile; `referral_code = own username` | Y | no | none | username required | welcome email | med | — | OK |
| 11 | `referrals/artist/clipper` | POST | artist owner | `auth.getUser()` | `artist_profiles.id = artistId AND user_id = user.id` | Y (write) | artistId (checked) | none | rate clamped 0–100, schedule sanitized | none | HIGH (commission %) | — | OK |
| 12 | `referrals/artist/commission` | POST | artist owner | `auth.getUser()` | same ownership check | Y (write) | artistId (checked) | none | `Number.isFinite` + clamp 0–50 | none | HIGH (commission %) | — | OK |
| 13 | `referrals/artist` | GET | artist owner | `auth.getUser()` | ownership checked before any read | Y | artistId (checked) | none | presence | none | med (fan earnings roster) | — | OK |
| 14 | `referrals` | GET | fan self | `auth.getUser()` | every query `.eq(referrer_fan_id, user.id)` | Y | no | none | n/a | none | med (own balance) | — | OK |
| 15 | `release-credits` | GET, POST | artist owner | `auth.getUser()` | `resolveOwnedArtist()` resolves release → artist → owner | Y | releaseId (checked) | 10/60s (POST) | type allowlist; credited fans filtered to benefit-eligible set | notifications + fan emails | med | — | OK |
| 16 | `road-campaigns` | GET, POST | artist self | `auth.getUser()` | artistId derived from session, never body | Y | no | none | goal type map, `goal_value` clamped | none | low | — | OK |
| 17 | `road-campaigns/active` | GET | public | none (optional session) | public by design (Movement hero); only `active`/`reached` | Y | artistId | none | presence | none | low (public) | — | OK |
| 18 | `road-campaigns/[id]` | GET, PATCH, DELETE | public read / artist write | `auth.getUser()` for writes | GET hides non-active from non-owners; PATCH/DELETE `.eq('artist_id', artistId)` | Y | id (scoped) | none | status allowlist; `goal_value` clamped | none | med | — | OK |
| 19 | `road-campaigns/[id]/support` | POST | fan self | `auth.getUser()` | fanId from session; unique upsert prevents double-count | Y | id | none | status/goal_type/deadline checks | artist notification | low | — | OK |
| 20 | `royalty-readiness` | GET, POST, DELETE | user self | `auth.getUser()` | every query `.eq('user_id', user.id)` | Y | no | none | `sanitizeAnswers()` drops unknown keys | none | med (private business) | `royalty_readiness` | OK |
| 21 | `segments` | GET, POST, DELETE | artist self | `auth.getUser()` | artistId derived from session; writes `.eq('artist_id', artist.id)` | Y | segment id (scoped) | none | name required | none | low | — | OK |
| 22 | `sequences` | GET, POST | artist owner | `auth.getUser()` | ownership checked on session client before admin write | Y | artistId (checked), sequence id | none | name/artistId presence only | none | med (email content) | — | OK |
| 23 | `sequences/[id]/toggle` | POST | artist owner | `auth.getUser()` | sequence → artist_id → ownership | Y | id (checked) | none | n/a | mass enrollment cancel | med | — | OK |
| 24 | `sequences/seed-defaults` | POST | artist owner | `auth.getUser()` | ownership checked | Y | artistId (checked) | none | n/a | creates active sequences | med | — | OK |
| 25 | `sequences/track/[sendId]` | GET | email recipient (public) | **none** | **none** | Y | sendId + **`?url=` redirect target** | none | **none** | **302 to arbitrary URL** | HIGH (phishing) | — | **VIOLATION** |
| 26 | `sequences/unsubscribe/[enrollmentId]` | GET | email recipient (public) | none | knowledge of enrollment UUID only | Y | enrollmentId | none | none | writes prefs + unsubscribe event | med | — | SUSPECT |
| 27 | `smart-links` | GET, POST | artist owner | `auth.getUser()` | ownership checked; update `.eq('artist_id', artistId)` | Y | artistId (checked), link id | none | slug sanitized/length-capped | none | low | — | OK |
| 28 | `smart-links/capture` | POST | public visitor | **none** | **link.artist_id never compared to body artistId** | Y | **linkId + artistId (unchecked pair)** | **none** | **none** (email/name/phone raw) | writes `smart_link_captures` + `fan_contacts` | med (PII, list poisoning) | — | **VIOLATION** |
| 29 | `squads` | GET, POST | artist self / fan self | `auth.getUser()` | artistId from session; fan scope `.eq('fan_id', user.id)` | Y | no | none | type map, name required | none | low | — | OK |
| 30 | `squads/[id]` | GET, PATCH, DELETE | artist owner | `auth.getUser()` | `ownedSquad()` = `.eq('id').eq('artist_id')` | Y | id (checked) | none | status/visibility allowlists | none | low | — | OK |
| 31 | `squads/[id]/members` | POST, PATCH | artist owner / fan self | `auth.getUser()` | owner branch checked; fan branch `member.fan_id === user.id`; apply gated on visibility | Y | fanId (owner-supplied, unverified user) | none | role/status allowlists | notifications | low | — | SUSPECT |
| 32 | `squads/[id]/missions` | POST, DELETE | artist owner | `auth.getUser()` | squad owned **and** mission `.eq('artist_id')` | Y | squadId, missionId (both checked) | none | presence | none | low | — | OK |
| 33 | `starter-offer` | GET | artist self | `auth.getUser()` | artist resolved from session only | Y | no | none | n/a | none | low | — | OK |
| 34 | `stripe/balance` | POST | artist/fan self | `auth.getUser()` | `getConnectAccountByUserId(user.id)` | Y | no | none | n/a | Stripe balance read | HIGH | — | OK |
| 35 | `stripe/booking-checkout` | POST | fan | `auth.getUser()` | destination + fee derived from the session's real artist; **`artistId` from body written to metadata + `booking_purchases`** | Y | **artistId (unchecked)**, sessionId | 5/60s | ids present only | **Stripe checkout** | HIGH (earnings ledger) | — | **VIOLATION** |
| 36 | `stripe/cashout` | POST | artist self | `auth.getUser()` | own Connect account; amount = live Stripe balance | Y (read) | no | 1/60s | balance floor $2 | **Stripe payout** | HIGH | — | OK |
| 37 | `stripe/checkout` | POST | fan | `auth.getUser()` | tier → artist derived server-side; destination service-role | Y | tierId | 5/60s | referral code regex; fee+cut clamped ≤100%; founder cap/deadline | **Stripe subscription** | HIGH | — | OK |
| 38 | `stripe/connect` | GET | artist self | `auth.getUser()` | artist row `.eq('user_id')` | Y (write) | `returnTo` | none | **`returnTo` validated: must start `/`, not `//`** | Stripe account + link | HIGH | — | OK |
| 39 | `stripe/connect/status` | GET | artist self | `auth.getUser()` | artist from session | Y | no | none | n/a | `accounts.retrieve` | HIGH | — | OK |
| 40 | `stripe/create-price` | POST | artist owner | `auth.getUser()` | `.eq('id', artistId).eq('user_id', user.id)` | Y (id read) | artistId (checked) | 3/60s | discount clamped 0–50; **`price`/`name` unvalidated** | Stripe product+price | med | — | SUSPECT |
| 41 | `stripe/fan-cashout` | POST | fan self | `auth.getUser()` | own `profiles.stripe_connect_id`; `atomic_fan_cashout` RPC does the balance check | Y | no | 1/60s | $25 min in RPC | **Stripe transfer** | HIGH | — | OK |
| 42 | `stripe/fan-connect` | POST | fan self | `auth.getUser()` | own profile row | Y (write) | no | none | n/a | Stripe account + link | HIGH | — | OK |
| 43 | `stripe/fan-portal` | POST | fan self | `auth.getUser()` | customer id read from **caller's own** subscription | Y | artistId (scope), **`artistSlug` → return_url** | none | **`artistSlug` unvalidated** | Stripe billing portal | HIGH | — | SUSPECT |
| 44 | `stripe/free-subscribe` | POST | fan self | `auth.getUser()` | tier verified active + `price === 0`; fanId from session | Y | tierId | 10/60s | price/active checks | artist notification | low | — | OK |
| 45 | `stripe/live-checkout` | POST | fan | `auth.getUser()` | artist derived from the live session row | Y | sessionId | 5/60s | active/ended/price checks, dupe-ticket check | Stripe checkout | HIGH | — | OK |
| 46 | `stripe/live-tip-checkout` | POST | fan | `auth.getUser()` | artist derived from session; self-tip blocked | Y | sessionId | 5/60s | `normalizeTipAmount` $1–$500, message normalized | Stripe checkout | HIGH | `live_tips` | OK |
| 47 | `stripe/login-link` | POST | artist/fan self | `auth.getUser()` | account id resolved from `user.id` only | Y | no | none | n/a | Stripe login link | HIGH | — | OK |
| 48 | `stripe/platform-checkout` | POST | artist self | `auth.getUser()` | artist from session; **Stripe is the double-charge authority** | Y | tierId, cycle, partnerCode | 5/60s | tier/cycle allowlists; **live price amount verified vs `TIER_PRICING`** | Stripe checkout | HIGH | — | OK |
| 49 | `stripe/platform-portal` | POST | artist self | `auth.getUser()` | `getPlatformCustomerId(user.id)` | Y | no | none | n/a | billing portal | HIGH | — | OK |
| 50 | `stripe/platform-status` | GET | artist self | `auth.getUser()` | artist from session, never a param | Y | no | none | n/a | Stripe reconcile | HIGH | — | OK |
| 51 | `stripe/product-checkout` | POST | fan | `auth.getUser()` | `artist_id` read off the product row | Y | productId, discountCode | 5/60s | expiry/sold-out; discount server-validated; fixed discount floored at $0.50 | Stripe checkout | HIGH | — | OK |
| 52 | `stripe/subscription-update` | POST | fan self | `auth.getUser()` | subscription `.eq('fan_id', user.id)`; new tier `.eq('artist_id', artistId)` | Y | newTierId, artistId | 3/60s | tier scoped to artist + active | Stripe subscription update | HIGH | — | SUSPECT (`debug` object echoed on 404, line 41) |
| 53 | `stripe/team-split-cashout` | POST | collaborator self | `auth.getUser()` | own `stripe_connect_id`; `atomic_team_split_cashout` RPC | Y | no | 1/60s | $25 min in RPC | **Stripe transfer** | HIGH | — | OK |
| 54 | `stripe/track-checkout` | POST | fan | `auth.getUser()` | `artist_id` read off the track row | Y | trackId | 5/60s | not-free/price>0; already-owned check | Stripe checkout | HIGH | — | OK |
| 55 | `stripe/webhook` | POST | Stripe | **`constructEvent` on `req.text()`** | signature | Y | n/a | n/a | livemode-vs-prod-DB guard; **atomic idempotency claim on `UNIQUE(event_id)`** | all money writes | HIGH | — | OK |
| 56 | `subscriptions/cancel` | POST | fan self / artist self | `auth.getUser()` | fan: `.eq('fan_id', user.id)`; platform: `.eq('user_id', user.id)` | Y | subscriptionId (scoped) | none | context allowlist, reasons array | Stripe cancel | HIGH | — | OK |
| 57 | `subscriptions/pause` | POST | fan self | `auth.getUser()` | `.eq('fan_id', user.id)` | Y | subscriptionId (scoped) | none | action allowlist | Stripe pause | med | — | OK |
| 58 | `support` | POST | public | **none** | **none** | N | **`email` = recipient**, name/message | 3/300s per IP | **none; raw HTML interpolation** | **sends 2 emails from `hello@thecrwn.app`** | HIGH (phishing/relay) | — | **VIOLATION** |
| 59 | `support/chat` | GET, POST | user self | `auth.getUser()` | conversation `.eq('user_id', user.id)`; foreign id falls through to a new thread | Y | conversationId (scoped) | 15/60s | action allowlist, 2000-char cap, rating 1–5 | DeepSeek call + founder email (plain text) | med | — | OK |
| 60 | `surveys` | POST | token holder (public) | HMAC-SHA256 token | token binds respondent+artist+type; dupe check | Y | none (all from token) | none | token expiry; `answers` unvalidated blob; **non-constant-time compare** (`surveyTokens.ts:44`) | none | low | — | SUSPECT |
| 61 | `sync-opportunities` | GET, POST | artist owner / cron | GET `requireArtistOwner`; POST `CRON_SECRET` | GET: ownership + **tier read from DB, not `?tier=`** | Y | artistId (checked) | none | POST fields defaulted | none | med | — | OK |
| 62 | `team-splits` | GET, POST | artist self / collaborator self | `auth.getUser()` | list scoped by `artist_id` or `collaborator_user_id`; create requires artist | Y | revenueSourceId (ownership verified for track/campaign) | none | pct 0–100; revenue fence; `all_earnings` requires cap; self-deal blocked | invite email | HIGH (money split) | — | OK |
| 63 | `team-splits/[id]` | GET, PATCH | deal party / artist | `auth.getUser()` | `getDealForUser()` — party check; PATCH requires `isArtist` | Y | id (checked) | none | action allowlist; milestone dedupe | accrual insert | HIGH | — | OK |
| 64 | `team-splits/[id]/deliverables` | POST | artist | `auth.getUser()` | `isArtist` | Y | id (checked) | none | title required | none | low | — | OK |
| 65 | `team-splits/[id]/deliverables/[deliverableId]` | PATCH | collaborator / artist | `auth.getUser()` | submit → `isCollaborator`; approve/reject → `isArtist`; deliverable `.eq('deal_id', id)` | Y | deliverableId (scoped) | none | action allowlist; reject needs a reason | notifications | med | — | OK |
| 66 | `team-splits/[id]/disputes` | POST | either party | `auth.getUser()` | `getDealForUser()` | Y | id (checked) | none | description required | admin alert; freezes deal | med | — | OK |
| 67 | `team-splits/[id]/release` | POST | artist | `auth.getUser()` | `isArtist` only | Y | id (checked) | none | deliverable gate; `.gt('commission_amount', 0)`; `.is('released_at', null)` | makes money cashable | HIGH | — | OK |
| 68 | `team-splits/[id]/respond` | POST | collaborator | `auth.getUser()` | `isCollaborator` only; status must be sent/viewed/changes_requested | Y | id (checked) | none | action allowlist; agreement required | notification | HIGH | — | OK |
| 69 | `team-splits/accept-invite` | POST | invited collaborator | `auth.getUser()` | 192-bit `invite_token`; self-accept blocked; already-claimed 409 | Y | token | none | presence | binds payout relationship | HIGH | — | SUSPECT (token bearer, invite email never verified) |
| 70 | `tier-benefits` | GET, POST | public read / artist owner write | POST `auth.getUser()` | POST: tier → artist → `user_id === user.id`; GET uses the RLS session client | N (session client) | tier_id (checked on POST) | none | none on benefit shape | obligation sync | low | — | OK |
| 71 | `tier-events` | POST | public beacon | none (session optional) | **artist_id read off the tier row, never from body**; `visitor_hash` from headers | Y | tierId | implicit (dedupe + 12 cap) | id length ≤64, batch ≤12, source allowlist | none | low | — | OK |
| 72 | `tiers/check-limit` | POST | artist (intended) | **none** | **none** | Y (inside `checkArtistLimit`) | **artistId (unchecked)** | none | presence | none | low (leaks `platform_tier` + paid-tier count) | — | SUSPECT |
| 73 | `tracks/[id]/stream` | GET | entitled listener | session client (RLS on) | **`tracks_public` view + `can_play_track()` is the gate**; NULL url = 403 | admin only inside `signAudioValue` after entitlement | track id | none | active check | signed URL, 
short TTL | HIGH (content) | — | OK |
| 74 | `tracks/check-limit` | POST | artist (intended) | **none** | **none** | Y | **artistId (unchecked)** | none | presence | none | low (leaks `platform_tier` + track count) | — | SUSPECT |
| 75 | `webhooks/resend` | POST | Resend | **`verifySvixSignature` over `req.text()`** | signature, **fails closed (403)** | Y | send ids from signed payload | n/a | type branches | global email suppression | HIGH | — | OK |

---

## Detailed findings

### VIOLATION 1 — Unauthenticated open redirect in the sequence click tracker
`src/app/api/sequences/track/[sendId]/route.ts:39-55`
```ts
if (url) {
  await supabaseAdmin.from('sequence_sends').update({ status: 'clicked', ... }).eq('id', sendId)...
  return NextResponse.redirect(url, 302);
}
```
`url` comes straight from `req.nextUrl.searchParams.get('url')` (line 20) with no allowlist, no same-origin check, no auth. Contrast `stripe/connect/route.ts:78-80`, which does validate its redirect target.
**Attack:** `https://thecrwn.app/api/sequences/track/00000000-0000-0000-0000-000000000000?url=https://evil.example/login` — a link on the real CRWN domain that lands on an attacker page. Phishing artists/fans for CRWN or Stripe credentials, and it launders reputation for any outbound link.
**Secondary:** the same handler accepts unauthenticated `opened`/`clicked` writes on any guessed `sendId`, so sequence engagement metrics are forgeable.

### VIOLATION 2 — `smart-links/capture` never checks the link belongs to the artist
`src/app/api/smart-links/capture/route.ts:9-69`
```ts
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { linkId, artistId, name, email, phone } = body;
  ...
  const { data: link } = await supabaseAdmin.from('smart_links')
    .select('id, collect_email').eq('id', linkId).eq('is_active', true).single();
  ...
  await supabaseAdmin.from('smart_link_captures').insert({
    smart_link_id: linkId, artist_id: artistId, name, email, phone, ip_address: ip, ...
  });
  ...
  await supabaseAdmin.from('fan_contacts').upsert({ artist_id: artistId, email: ..., source: 'smart_link' }, ...);
}
```
No session, no rate limit, no email/phone validation, and `link.artist_id` is selected out of the query so it can never be compared to the caller-supplied `artistId`.
**Attack:** POST any active `linkId` with `artistId` = **any other artist's UUID** and arbitrary PII. Rows land in that artist's `smart_link_captures` and `fan_contacts`. Unbounded loop = list poisoning, fabricated smart-link conversion analytics, and third-party PII (real people's emails/phones) planted in an artist's CRM.
**Mitigating fact (verified):** the contacts sender requires `.not('consent_attested_at', 'is', null)` (`src/app/api/campaigns/[id]/send/route.ts:481-482`), and this route does not set it, so injected contacts cannot be mailed. The damage is data integrity + PII, not mail-bombing.

### VIOLATION 3 — `booking-checkout` writes a client-supplied `artistId` into the earnings ledger (AUTH-002)
`src/app/api/stripe/booking-checkout/route.ts:21, 59, 96-121`
```ts
const { sessionId, artistId } = body;                       // :21
const artistIdFromArtist = (session.artist as ...).id || ''; // :59  ← real artist
...
transfer_data: { destination: artistStripeAccountId },       // :96-98 derived from artistIdFromArtist — CORRECT
metadata: { booking_session_id: session.id, buyer_id: user.id, artist_id: artistId, ... }, // :103-109 ← FORGEABLE
...
await supabase.from('booking_purchases').insert({ ..., artist_id: artistId, ... });        // :113-121
```
`artistId` is never compared to `artistIdFromArtist`. The **money destination is safe**; the **ledger is not**. `src/lib/webhookHandlers.ts:1326-1434` trusts that metadata verbatim:
```ts
const { booking_session_id, buyer_id, artist_id } = metadata;   // :1333
const feePercent = await getArtistFeePercent(artist_id);        // :1367
await supabaseAdmin.from('earnings').insert({ artist_id, ... }) // :1382-1385
await checkAndAwardMilestones(artist_id, artistProfile.user_id) // :1420
await recordFirstPaidConversion(supabaseAdmin, { artistId: artist_id, kind: 'booking', ... }) // :1427
```
**Attack:** authenticate, POST `{ sessionId: <any artist A's booking session>, artistId: <victim artist B> }`, complete the (cheap) Stripe payment. Artist A receives the money; artist B gets a fabricated `earnings` row, an "earning" notification, a milestone award, and a **`first_paid_conversion` funnel event** — the platform's definition of activation.
**Attacker gain / escalation, in order of severity:**
1. `earnings` is the input to the Team Splits accrual cron (`src/app/api/cron/team-split-accruals/route.ts:60` → `getQualifyingEarnings(supabaseAdmin, deal)`), which writes `team_split_earnings` and ultimately funds `stripe/team-split-cashout` — a real transfer out of CRWN's platform balance. Requires the victim artist to have an active percentage deal and to press Release, so it is not one-click, but the forged row is real money in a real payout ledger.
2. Road-campaign money-goal progress is `SUM(earnings.gross_amount)` (`road-campaigns/route.ts:22-24`) — goals can be pushed to "reached" by an outsider.
3. Trailing-30-day GMV drives the Pro/Scale break-even upgrade pop-ups and the admin money-model; activation milestones and `first_paid_conversion` become attacker-writable.
Cost to the attacker is 1:1 with the forged amount, so this is integrity/telemetry corruption with a money-path tail, not free theft. The fix is one line: reject when `artistId !== artistIdFromArtist` (or just drop the body field and use `artistIdFromArtist`).

### VIOLATION 4 — `/api/support` is an unauthenticated arbitrary-recipient mailer with raw HTML injection
`src/app/api/support/route.ts:13-87`
```ts
const { name, email, category, message, context } = await request.json();
if (!name || !email || !category || !message) { ...400... }
...
await resend.emails.send({ from: FROM_EMAIL, to: 'support@thecrwn.app', cc: 'joshn.wms@gmail.com',
  replyTo: email, subject: `[${category}] Support request from ${name}`,
  html: `... <td ...>${name}</td> ... <p ...>${message}</p> ${contextHtml}` });
await resend.emails.send({ from: FROM_EMAIL, to: email,     // ← attacker-chosen recipient
  subject: 'We received your support request: CRWN',
  html: `... <p style="color:#ffffff;">Hi ${name},</p> ... <p ...>${message}</p> ...` });
```
No authentication. `email` is not validated and is used directly as the `to:` of the second send. `name`, `category` and `message` are interpolated into HTML with no escaping.
**Attack A (spoofed mail from a trusted domain):** POST `{ email: "victim@bank.example", name: "<a href='https://evil/'>Verify your CRWN payout</a>", message: "<h1>Action required...</h1>", category: "x" }`. The victim receives a **fully SPF/DKIM-aligned email from `CRWN <hello@thecrwn.app>`** whose body is attacker-authored HTML. That is a phishing relay wearing CRWN's domain reputation, and it burns the sending domain's deliverability for every artist campaign.
**Attack B (HTML injection into the founder's inbox):** the same payload renders inside the support email to `support@thecrwn.app` + `joshn.wms@gmail.com`, so links/markup of the attacker's choosing are presented as an internal CRWN notification.
**Limit:** `checkRateLimit('ip:'+ip, 'support', 300, 3)` — 3 per 5 minutes per source IP, trivially parallelised across IPs.
Note the contrast: `support/chat`'s founder alert uses `text:` (`support/chat/route.ts:145-152`) and is not injectable.

---

## SUSPECT details (in priority order)

1. **`tiers/check-limit` + `tracks/check-limit` — zero authentication** (`tiers/check-limit/route.ts:4-11`, `tracks/check-limit/route.ts:10-17`). Both read `{ artistId }` from the body and call `checkArtistLimit()` (`src/lib/platformTier.ts:167-211`), which uses a service-role client to read `artist_profiles.platform_tier` and count `tracks` / paid `subscription_tiers`. Any anonymous caller learns which plan any artist is on and how much catalog they have, for an enumerated artist id. No ownership check exists on either route; every sibling limit surface has one.
2. **`stripe/fan-portal` — unvalidated `artistSlug` into `return_url`** (`fan-portal/route.ts:14, 41`): `return_url: \`${baseUrl}/${artistSlug}\``. The `baseUrl` prefix prevents host substitution, so this is not an open redirect, but a hostile slug shapes the post-portal landing path and can throw on an invalid URL. It should be slug-validated like `stripe/connect` validates `returnTo`.
3. **`sequences/unsubscribe/[enrollmentId]` — unauthenticated GET that mutates** (`route.ts:9-60`): cancels the enrollment, flips `fan_communication_prefs.email_marketing` to false, and inserts an unsubscribe event, keyed only on knowing an enrollment UUID. Standard one-click-unsubscribe practice, but there is no confirmation POST, so an email prefetcher/scanner silently unsubscribes fans and depresses every artist's reachable audience.
4. **`team-splits/accept-invite` — bearer-token binding with no email match** (`route.ts:22-40`). The token is strong (`crypto.randomBytes(24)`, `src/lib/teamSplits/server.ts:9-11`) and self-accept/already-claimed are both blocked, but the account that accepts is never checked against `collaborator_email`. A forwarded or leaked invite binds a payout relationship to the wrong person.
5. **`stripe/create-price` — `price` reaches Stripe unvalidated** (`route.ts:21, 56-77`): `unit_amount: price` and `Math.round(price * 12 * (1 - discountPct/100))` with no `Number.isFinite`, no integer check, no bounds. Only the artist's own tier is affected (ownership is checked at line 30-35), so this is self-harm plus noisy Stripe errors, not cross-tenant. `name`/`description` are also unvalidated.
6. **`stripe/subscription-update` — internal detail echoed to the client** (`route.ts:41`): `return NextResponse.json({ error: 'No active subscription found', debug: { fanId, artistId, subError } }, ...)`. Leaks the raw PostgREST error object.
7. **`surveys` — non-constant-time signature compare** (`src/lib/surveyTokens.ts:44`): `if (signature !== expectedSig) return null;`. Practical exploitation over HTTP is unrealistic, but this is the token that authorizes an unauthenticated write; use `crypto.timingSafeEqual`. `answers` is also stored as an unvalidated JSON blob.
8. **`squads/[id]/members` POST — artist can add an arbitrary `fanId`** (`route.ts:83-113`). The owner check passes, but `fanId` is never verified as a consenting or even related user, and the route fires a notification to them. Low-grade unsolicited-notification vector.

## Notable things that are RIGHT (checked, not assumed)
- `stripe/webhook`: signature over `req.text()`, test-mode-vs-production-DB refusal, and an **atomic** idempotency claim via `UNIQUE(event_id)` rather than check-then-insert (`route.ts:51-110`).
- `webhooks/resend`: Svix signature over the raw body and an explicit **403 fail-closed** when the secret is unset (`route.ts:38-53`).
- No route in this slice accepts a client-supplied connected-account id, fee percent, price id, or `application_fee`. Every destination is read service-side from the resource's own artist row. `stripe/checkout` clamps `platformFee + attributedCut ≤ 100%` (`route.ts:190-193`) and `platform-checkout` verifies the live Stripe price against `TIER_PRICING` before selling (`route.ts:178-185`).
- Team Splits: a collaborator can never edit terms (`[id]/route.ts:68` gates PATCH on `isArtist`), an outsider can never read a deal (`getDealForUser` returns null unless party, `src/lib/teamSplits/server.ts:143-166`), percentage is bounded 0–100, `all_earnings` requires a cap, and cashout races are handled by the `atomic_team_split_cashout` RPC.
- Referral self-dealing is blocked in `stripe/checkout:180` (`referrer.id !== fanId`) and self-tipping in `live-tip-checkout:84`.
- `tracks/[id]/stream` refuses to re-derive entitlement, delegating to `tracks_public` + `can_play_track()` and treating a NULL url as the 403.
- `sync-opportunities` GET reads the plan tier from the DB rather than a `?tier=` param, and `quests/event` refuses money-bearing event types from the client.
