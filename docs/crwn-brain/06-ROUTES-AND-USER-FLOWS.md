# 06 — Routes & User Flows

> Route inventory + step-by-step flows. Grounded in `src/app/**`, `src/middleware.ts`. `Confirmed` unless noted.

## 1. Route groups
- **`(auth)/`** — `login`, `signup`, `onboarding`(dead). Redirect to `/home` if authed.
- **`(main)/`** — protected app shell (sidebar): `home`, `explore`, `library`, `messages`, `profile` (+ `profile/artist`, `profile/notifications`), `earn`, `impact`, `command`, `my-missions`, `my-calendar`, `recruit`(+`/dashboard`), `studio`.
- **Artist information architecture (three surfaces).** `profile/artist` is **Rise Mode only**; the 16-tab dashboard strip it used to be is gone, and every tab is now its own route.
  - Bottom tab bar / desktop sidebar (`buildNavItems`): Home, Explore, [Studio|Earn], Messages, [Rise|Library]. This is for doing the work.
  - Hamburger `AccountHub` (top-left): manage the business. `account/profile`, `account/tiers`, `account/payouts`, `account/billing`, `account/referrals`.
  - `studio`: the toolbox. `studio/music`, `studio/albums`, `studio/shop`, `studio/live`, `studio/analytics`, `studio/manager`, `studio/sync`, `studio/team`, `studio/promise`, `studio/fans`, plus the connector tools.
  - All of the above wear `HubPage` (X in the top left). `?from=hub` makes that X return to the hamburger; without it the X is a `smartBack`. `src/lib/dashboardRoutes.ts` maps every legacy `?tab=` id to its new route and `profile/artist` redirects through it, so links in old emails and `notifications.link` rows still resolve.
- **`/` (the marketing homepage)** — since 2026-08-01 the homepage runs the **Opportunity Calculator** funnel, by mounting the SAME production component as `/tools/opportunity-calculator` (`PublicToolClient` with the registry config) rather than owning a second calculator. `src/app/page.tsx` → `src/app/HomeFunnel.tsx` = `HomeNav` + `<PublicToolClient config={opportunity-calculator} surface="homepage" below={<HomeMarketing />} />`. **Rebuilt 2026-08-13 (Zero to One homepage), corrected 2026-08-14 (pre-traffic pass):** the funnel is untouched (photo hero → one primary CTA smooth-scrolling to the wizard → wizard → result → transition → builder → save/signup boundary, with the call-request hand-raiser below the builder), and the marketing page begins only AFTER it. The lower page is `src/app/HomeMarketing.tsx`, **eight** sections in order: fragmentation problem → first-revenue path (Consolidate/Build/Convert/Prove/Expand, activation = first paid member) → operating loop in customer language **plus the trust strip merged into it** (your numbers / assumptions you can check / the reason for the move, and the insufficient-evidence statement; no fabricated proof, case studies slot in later) → First Revenue Launch (canonical First Paid Member Guarantee) → **four** capabilities mapped to economic jobs → pricing rendered from `TIER_PRICING`/`TIER_LIMITS` → **five**-question ICP FAQ → one final CTA. The "one next move" claim is made ONCE, in the operating-loop section. The generic tool showcase (`ToolShowcase`/`CrwnShowcase`) is gated to `surface === 'tool'`, so it never stacks a second feature parade on the homepage; the old `WorthExperience marketingOnly` embed and its homepage-only sections were deleted (the /worth calculator surfaces are unchanged). `HomeNav` is CRWN + How it works + Pricing anchors + Log in + one funnel CTA. Contract pinned by `pageComposition.test.ts`.

  **The homepage CTAs resolve against the funnel, never the top of the page** (corrected again 2026-08-14). `PublicToolClient` exports `PLAN_ANCHOR_ID` (the builder), `QUALIFY_ANCHOR_ID` (the `CallRequestCard` wrapper) and `WIZARD_ANCHOR_ID` (the calculator), and stamps them on those elements; `HomeMarketing` and `HomeNav` scroll to them. **Every CTA that means "go and run this" targets the CALCULATOR**: the nav's "See my opportunity", the First Revenue Launch CTA when no result exists yet, and the closing CTA before completion. The top-of-document fallback survives only for the case where no wizard is mounted (a finished visitor), because the top is then their own result. Also 2026-08-14: the **homepage hero drops the eyebrow and the "Takes about N. Free." line** (`ToolHero` takes both as optional and `PublicToolClient` passes neither when `surface === 'homepage'`), which hands that height to the photograph; `timeToComplete` remains registry data because `/tools` and the automation dispatcher read it, and the tool routes are unchanged. The hero photo's mobile crop is height-aware (4:3 above 700px of viewport height, 16:9 below it) so the CTA stays above the fold on short phones; desktop keeps the flex construction and is never aspect-derived. **"See if I qualify"** scrolls to the hand-raiser when a result is on screen, and otherwise returns the visitor to the calculator, because qualification is scored server-side from those answers (`decideCallRequest`): it never asserts eligibility, opens a scheduler, or posts an application. **The closing CTA** reads "See what my fans are worth" and returns to the calculator before completion, and "Back to my plan" returning to the builder after it. Completion is ONE bit passed down: `below` accepts a function and receives `{ completed }` from the component that actually knows. Before this pass both CTAs called `window.scrollTo(top)`, which left the hand-raiser off screen thousands of pixels away while the button claimed to open it. The `below` slot also renders OUTSIDE the funnel's phase-width wrapper, so the narrative no longer shrinks from `max-w-2xl` to `max-w-lg` for a visitor who finished the calculator. Homepage differences remain chrome and attribution only: no "All tools" back control, and `surface: 'homepage'` on the shared funnel events (allowlisted in `sanitizeOpportunityMeta`) so homepage and tool traffic stay separable without renaming an event. The Streaming Loss Calculator still lives at `/worth`, unchanged. Authed visitors are redirected to `/home` by the middleware.
- **`(public)/`** — `welcome`, `worth`, `tools`(directory), `tools/[slug]` (17 registry lead-magnet tools, SSG; `worth` is an `EXTERNAL_TOOLS` entry living at `/worth`, so `/tools/worth` 404s), `tools/[slug]/result/[token]` (tokenized result), `survey/[token]`, `link/[slug]`, `getting-started`(+guides), legal (`terms`, `privacy`, `dmca`, `artist-agreement`, `live-agreement`, `submission-agreement`), `forgot-password`, `reset-password`, `support` (since 2026-07-31 a full help center: guide search across the 14 getting-started guides, live chat, contact form; see the support flow below). Artist-side mirror: `artist/tools`, `artist/tools/[slug]`, `artist/tools/saved`.
- **`[slug]/`** — canonical public artist pages + `track/[id]`, `album/[id]`, `post/[id]`, `playlist/[id]`, `live/[sessionId]`, `book(/success)`, `demand/[testId]`, `r/[code]`, `suggest-mission`.
- **`artist/[slug]/`** — LEGACY redirect + dead duplicate subroutes.
- **Top-level** — `setup`, `admin`(+`/team-splits`), `offers(/new)`, `missions(/new,/suggestions)`, `squads(/new)`, `my-squads`, `bounties(/new,/[id])`, `my-bounties`, `campaigns(/new,/[id])`, `campaign-hub`, `city-unlocks(/new,/[id])`, `city/[id]`, `playbooks/[runId]`, `proof-of-demand(/new,/[id])`, `clip-controls`, `action-plan` (**LEGACY PATH — the surface is "Needs You"**: events, deadlines and unfinished attention. Kept because the tour id, existing links and historical analytics all resolve through it; do not rename), `team(/[id],/invite/[token])`, `embed/[trackId]`, `join/[code]`, `verify`, `about`, `partner`.
- **`api/`** — 241 handlers. Notable groups: `stripe/*` (~20), `cron/*` (25), `admin/*` (23), `live/*` (12), `messages/*`, `team-splits/*`, `sequences/*`, `campaigns/*`, `quests/*`, `missions/*`, `squads/*`, `bounties/*`, `notifications/*`, `support/*` (`/api/support`, `/api/support/chat`, `/api/admin/support-chat`, added 2026-07-31). The `sms/*` group was deleted with the SMS removal 2026-07-31.

## 2. Route protection
`middleware.ts` guards the `protectedPaths` page list (redirect `/login` if no auth cookie), redirects authed users away from `/login`,`/signup`, returns early on PKCE `code` param, and **excludes `/api/`** (routes self-authenticate). Bot-filtered visitor hashing is analytics-only. `Confirmed`.

## 3. Webhook & callback routes
| Route | Source | Verified? |
|---|---|---|
| `/api/stripe/webhook` | Stripe | ✅ signature |
| `/api/live/egress-webhook` | LiveKit | ✅ signature |
| `/api/webhooks/resend`, `/api/outreach/webhook`, `/api/outreach/inbound` | Resend | ❌ **unverified (HIGH)** |
| ~~`/api/sms/status`, `/api/sms/webhook`~~ | Twilio | Routes deleted 2026-07-31 with the SMS removal |
| `/api/notifications/new-artist-hook` | internal (`NEW_ARTIST_WEBHOOK_SECRET`) | secret |
| `/api/cron/*` (25) | Vercel Scheduler | `CRON_SECRET` bearer |
| PKCE auth callback | Supabase (via middleware `exchangeCodeForSession`) | code param |

## 3b. Fan testimonial routes (2026-08-12, live)

| Route | Who | Authority |
|---|---|---|
| `GET/POST /api/testimonials` | fan | `session.user.id` IS the author. Actions: `submit`, `decline`, `withdraw`. No parameter can name a different fan; the request row supplies the artist and the context |
| `GET/POST /api/artist/testimonials` | artist | artist resolved from `artist_profiles.user_id = session.user.id`. Actions: `feature`, `unfeature`, `hide`, `unhide`, `set-automation`. **No body parameter exists**, so an artist can never edit a quote |
| `GET /api/cron/testimonial-requests` | cron | `Bearer $CRON_SECRET`, fails closed with 401 (verified against production) |

Fan flow: the daily generator creates ONE ask, delivered by the `fan_share_experience` pop-up
(priority 10, the catalog floor) and by the persistent card on `/command`. The fan answers one
question, picks a display identity, and ticks (or does not tick) publication consent. Artist flow:
`/studio/testimonials`, hamburger-only, feature or hide. Public: one section on `/[slug]`, rendered
only for rows the artist featured AND the fan consented to.

## 4. Key flows

### Sign-up → artist activation
```mermaid
flowchart TD
    S[/signup: email+pw, emailRedirectTo=/verify, capture ?recruiter/?invite to localStorage/] --> V[/verify: PKCE exchange -> Email verified success screen -> forward by onboarding state/]
    V --> SET[/setup wizard: 11 one-field screens; opens on the identity screens/]
    SET --> Name[artist-name* with a Continue-as-supporter escape] --> Link[artist-link* -> POST /api/onboarding/identity]
    Name -->|supporter escape| H[/home]
    Link --> AP[server route: session-client artist_profiles insert from chosen handle -> trg_promote_to_artist flips role server-side; admin-client profiles update sets display_name + onboarding_completed]
    AP --> Photo[photo* -> avatar_url] --> Tier[tier name/price/benefits] --> Track[track audio*/title] --> Prod[product type/title/price]
    Prod --> Share[share screen -> Start Rise Mode]
    Share --> Complete[POST /api/artist/complete-setup sets setup_completed=true server-side]
    Complete --> J[GET /api/lead-results/post-setup-destination -> resolveJourneyDestination]
    J -->|claimed calculator result| B[prefilled builder: /offers/new, /studio/live, /own-your-fans/plan, /missions/new, /proof-of-demand/new or /plan/tool]
    J -->|no claimed result| D[/profile/artist; Rise Mode slot shows the StarterOfferCard recommendation while the Quest Engine is dark]
```
Mandatory: identity (name + link) + photo + one track. Monetize/Shop skippable. Completion is DB-derived; hard gate in `(main)/layout.tsx` bounces incomplete artists back to `/setup`. **The `/welcome` page was retired 2026-07-30** (it now redirects to `/setup`): the wizard's first two screens collect the artist name and an editable `thecrwn.app/[handle]` link (auto-filled from the name via the shared `src/lib/slugify.ts` until edited, validated against reserved handles and Postgres 23505 unique collisions, saved by `POST /api/onboarding/identity`); the slug is created from the chosen handle, not the legal display name. The identity route writes `profiles` with the service-role client because browser-side `profiles` updates 42501 until `schema-phase2-fix-profiles-update-permission.sql` runs, but keeps the `artist_profiles` INSERT on the user session so the RLS publish path (guarded by the onboarding canary) stays real. Phone is no longer collected at onboarding. Finishing the wizard writes `setup_completed=true` via the service-role `POST /api/artist/complete-setup` route (`markComplete()` throws on failure); this replaced a silent client `.update()` that could fail and bounce the artist from the dashboard back into `/setup`. Recruiter/invite codes redeemed post-auth (`redeemPendingInvite`, `/api/admin/track`). `Confirmed`.

### Email verification
Signup `emailRedirectTo` points at `/verify`. `/verify` runs the PKCE exchange and shows an "Email verified" success screen with a forward button routed by onboarding state (`/setup` for new users, `/home` when a session exists, "Continue to login" when none). On PKCE exchange **failure** for the `/verify` path (cross-browser/webview case, e.g. Gmail in-app browser with no code-verifier cookie), `src/lib/supabase/middleware.ts` preserves `?verified=true` so those users still see the verified banner on `/login` instead of a blank login page. `Confirmed`.

### Login
`/login` → Supabase email/pw (or magic link / Google / Apple) → `useAuth` loads profile → if `onboarding_completed` false → `/setup`, else `/home`. `Confirmed`.

### Password reset
`(public)/forgot-password` → Resend email w/ PKCE link → middleware `exchangeCodeForSession` → `(public)/reset-password`. `Confirmed`.

### Fan subscription purchase
`/[slug]` SubscribeSection → `POST /api/stripe/checkout` (auth, rate-limited; free tier short-circuits to a direct upsert) → Stripe Checkout (platform acct, `transfer_data.destination`, `application_fee_percent`) → `data.url` redirect → `checkout.session.completed` webhook upserts `subscriptions`, writes `earnings`, notifies artist, enrolls sequences. `Confirmed`.

### One-time purchase (track/product/booking/live ticket)
Buy button → matching `*-checkout` route (`application_fee_amount`, pending record inserted for booking/live) → Stripe payment → webhook flips record to completed, writes `earnings`, grants entitlement (`purchases`/`booking_tokens`/`live_ticket_purchases`). `Confirmed`.

### Content access (paid audio)
Player requests `/api/tracks/[id]/stream` → RLS-scoped read of `tracks_public` (`can_play_track` redacts audio to NULL if not entitled) → NULL = 403; else `signAudioValue()` mints a 1-hr signed R2 URL. `Confirmed`.

### Content publishing (track)
Artist Music tab → `TrackUploadForm` → `validateUpload` → upload to R2/`audio` bucket → insert `tracks` (`is_free`/`allowed_tier_ids`/`price`); scheduled releases via `scheduled-releases` cron. `Confirmed`.

### Subscription cancel / pause
Manage → `/api/subscriptions/pause` (Stripe `pause_collection` 30d, keeps access) or `/api/subscriptions/cancel` (`cancel_at_period_end`, records `cancellation_reasons`) → optionally Stripe portal. `Confirmed`.

### Payout setup & payout
Artist Payouts tab → `/api/stripe/connect` (Express onboarding) → return to `/api/stripe/connect/status` (on `charges_enabled`: milestone + `backfillTierPrices`). Artist bank payouts are **Stripe's**, on each Express account's own automatic daily schedule; CRWN initiates none (`weekly-payout` retired 2026-08-11). The one CRWN-initiated artist payout is manual `/api/stripe/cashout` ($2 fee). Fan/collaborator cash out via `fan-cashout`/`team-split-cashout` ($25 min). `Confirmed`.

### Team Split lifecycle
Artist `TeamSplitBuilder` → invite → collaborator `accept-invite` → deliverables submit/approve → daily accrual cron accrues capped, held earnings from `earnings` → artist `release` (`held`→`released`) → collaborator cashout. Disputes freeze the deal. `Confirmed`.

### Notification flow
Server events (webhook/API) call `src/lib/notifications.ts` (`notifyNewSubscriber`, etc.) → insert `notifications` → `NotificationBell` shows via Supabase Realtime. Fan-facing artist broadcasts via `POST /api/notifications/notify-subscribers`. No push; foreground only. ⚠️ `notifyNewPost/Comment` link to non-existent `/community`. `Confirmed`.

### Live streaming
Artist accepts agreement → `/api/live/session` (Pro-gated) starts room + best-effort egress → fans join via `/api/live/token` (tier/ticket/slot-cap checked) → chat via Realtime → on end, egress webhook flips `vod_status`; VOD watched via `/api/live/watch` (signed R2 URL). `Confirmed`.

### Account deactivation
`/api/account/deactivate` sets `profiles.is_active=false`; that flag is now READ on public paths so a deactivated artist is hidden. `src/app/[slug]/page.tsx` calls `notFound()` when the joined `profile.is_active === false`, and `(main)/home/page.tsx` filters deactivated artists out of discovery (only `is_active===false` hides; null/true both mean active). Enforced at the app layer, not RLS. The deactivate modal (`(main)/profile/page.tsx`) awaits the API, shows a spinner, then a confirmation screen before signing out (previously signed out immediately with no confirmation). Reactivation is wired: `src/app/api/account/reactivate/route.ts` is now called by `useAuth.tsx` on the first authenticated profile load when `is_active===false`, so logging back in reactivates. No hard-delete/GDPR-erasure path found. `Confirmed`.

### Admin moderation / ops
`/admin` (client role gate → server `requireAdmin` on every data route) → Metrics/Pipeline/Funnel/Sequences/CRM/Email. Autonomous agent proposes actions; low-risk auto-execute (whitelist), rest escalate for approval via `/api/admin/agent/execute`. `Confirmed`.

### Acquisition (recruiter/partner)
`/partner` apply (or `/recruit` pitch) → unique `join/[code]` link → `referral_clicks` on visit → artist signup within 30d marks conversion → qualification crons pay flat + recurring commission via Stripe Connect; funnel visible at `/recruit/dashboard`. `Confirmed` (live activation `Needs founder confirmation`).

### Lead magnet / opportunity funnel (the acquisition path)
`(public)/tools/[slug]` renders `PublicToolClient`: hero → the SAME-page wizard → result → **builder** → save boundary → optional email capture. The builder IS the CTA; no signup link, email gate or booking block may appear before it. Save writes an anonymous draft (`/api/opportunity-drafts`, unclaimed-only) and routes to `/signup?tool=<slug>&result=<token>`, where `DraftContinuation` restates the number and what was already built. After auth, the existing auto-claim binds the draft by verified-email match plus the signup `user_metadata` token, and `resolveJourneyDestination` sends the artist through the account gate → setup gate → the prefilled builder from `buildDraftConfig`. **The all-in-one calculator** (`tools/opportunity-calculator`) additionally accepts `?from=<tool-slug>`, which reorders its wizard so a single-opportunity video leads with its own questions, asks the 40% qualification question (`monetization_status`) on its proof step, and renders the optional `CallRequestCard` hand-raiser BELOW the builder: phone + explicit versioned consent → `POST /api/lead-magnets/call-request` (server recomputes qualification, one request per phone per day, founder EMAIL alert for `sales_priority` only since the SMS removal 2026-07-31, optionally mirrored to a carrier email-to-SMS gateway via `FOUNDER_ALERT_SMS_EMAIL`, uniform `{ok:true}` response). Since 2026-08-24 the card also renders the A2P 10DLC point-of-opt-in disclosure under its consent box (frequency, message and data rates, STOP/HELP, links to `/privacy` and `/terms`); the founder authorized an internal-recipient-only Twilio alert campaign, but no Twilio sending code exists yet and the alert channel is unchanged. `Confirmed`.

### Launch transition (post-publish)
`/offers/new` done screen → "choose who should see it first": import CTA (`/studio/fans`, `FanImportModal` with permission attestation), small-test-group invite CTA (`/studio/fans?view=compose&audience=contacts` → `CampaignComposer` contacts audience → `/api/campaigns/[id]/send` contacts branch), copy launch link (`thecrwn.app/[slug]`), plus a "Connect Stripe so fans can purchase this offer" step whenever the status check answered charges-off for a paid offer. Funnel stages recorded along the way: `stripe_connected`, `fans_imported`, `fan_invited`, `first_paid_conversion` (Stripe webhook, deduped per artist). `Confirmed`.

### Lead-gen (smart links / pre-save)
`(public)/link/[slug]` → `SmartLinkCapture`/`PreSaveCapture` collects email/phone → `/api/smart-links/capture` → `smart_link_captures`; pre-save release-day email via `scheduled-releases` cron. The SMS consent checkbox on lead capture was removed 2026-07-31 with the SMS feature. `Confirmed`.

### Artist next action (Constraint Engine, shipped 2026-08-03)
`/profile/artist` renders ONE next move (`NextMoveCard`, 2026-08-13; `ConstraintCard` and
`RoadmapCard` are deleted). It calls `GET
/api/artist/constraint`, which takes **no parameters**: the artist is resolved from the SESSION,
so the request cannot name a subject and one artist can never read another's evidence (a fan
session has no `artist_profiles` row and gets 403). The route assembles evidence
(`src/lib/constraint/assembler.ts`, reusing `evaluateCondition`, `readTierEvidence`,
`summarizePromiseHealth` and `computeChurn`), runs the pure engine, and returns ONLY the result:
the raw snapshot carries visitor hashes and tier ids that never cross the wire. Any failure
returns `{constraint: null}` with a 200, and the card renders nothing, so the roadmap below is
never the casualty of a broken engine. Nothing on this path writes. `Confirmed`.

### Tier interaction evidence (shipped 2026-08-03)
Views: the artist page's tier cards report through `useTierViewTracker` (IntersectionObserver at
half-card visibility) → `POST /api/tier-events`, which derives `visitor_hash` from the request
headers with the same hash middleware uses for page visits and reads `artist_id` off the tier
row. Bots resolve to a null hash and are dropped. Checkout starts: recorded server-side in
`/api/stripe/checkout` AFTER `sessions.create` resolves, so a session that fails to create
records nothing, and the free-tier path returns before it. Read back by `GET
/api/artist/tier-evidence` (owner-gated by `requireArtistOwner`). `Confirmed`.

### Support (help center, shipped 2026-07-31)
`/support` = guide search (14 getting-started guides) + link to `/getting-started` + live chat + contact form (CCs joshn.wms@gmail.com, accepts auto-captured context). Chat: user posts via `POST /api/support/chat` (session-auth, service-role writes); AI reply from DeepSeek `deepseek-chat` with a knowledge prompt built from real guide content (`src/lib/supportKnowledge.ts`). Client reads the conversation via RLS + realtime on `support_conversations`/`support_messages` (migration `schema-phase2-support-chat.sql` PENDING; UI falls back to the contact form until it runs). Escalation (no `DEEPSEEK_API_KEY`, AI flags the question, or "Talk to a human") sets status `human_requested` and emails the founder a link to `/admin?tab=support` (SupportChatView); admin replies email the user. A global `BugReportButton` (root layout, hidden on auth/setup screens) posts to `/api/support` with category Bug Report + auto-captured page URL/user agent/user id. `Confirmed`.

### The daily artist flow (one operating flow, 2026-08-11)
`/profile/artist` is the operating home (unchanged route: it is where login, the setup gate, the
bottom nav "Rise" slot and every legacy `?tab=` link already land). It fetches
`/api/artist/constraint` once and composes the existing owners around the answer.

**Launch-gated** (engine Stage 0 refuses and names what is missing): a panel states that the page
cannot take money yet and lists the blockers, the Constraint card renders nothing, and the Roadmap
holds the only gold CTA. **Post-launch diagnosed:** the Constraint card holds the only gold CTA with
its evidence, and the Roadmap drops to "Go to this when you are ready". **Steady** (nothing
blocking) and **unknown** (read failed): the Roadmap leads, exactly as before, and no priority is
invented.

Both canonical CTAs carry `?returnTo=/profile/artist`, so completing the action returns the artist
here and the engine re-reads on the next load. There is no cached or persisted priority, so a
completed action simply stops being diagnosed.

### Fan Drive (Virality Engine V1, shipped dark 2026-08-11)
Artist: `/fan-campaigns` (one page, `HubBackControl`, listed in AccountHub under Reach and fans) →
`GET /api/fan-campaigns` returns the artist's drives with results AND the constraint verdict. If the
canonical diagnosis is FULFILLMENT or RETENTION, or there is no diagnosis, the page shows THAT
priority and its action and `POST /api/fan-campaigns` refuses with 409: the gate is server-side, not
a UI suggestion. Otherwise the artist gets a prefilled drive (title, window, three toolkit fields)
and `POST` creates it active. A drive cannot launch with a required toolkit slot empty
(`checkLaunchReady`). `PATCH /api/fan-campaigns/[id]` is the only mutation (launch / end / archive /
edit a draft); it loads the campaign server-side and 404s when `artist_id` is not the session
artist's.

Fan: `/{slug}/campaign` → `GET /api/fan-campaigns/active?slug=`, a service-role route returning a
field-by-field allowlist (the row is never publicly readable, because `source_constraint` is private
commercial evidence and RLS is row-level). A draft is invisible. `POST /api/fan-campaigns/join`
takes only the campaign id; the participant is the session user, the role comes from the archetype,
the artist cannot join their own drive, and UNIQUE (campaign_id, fan_id) makes a repeat join a
no-op. The participant then sees their EXISTING referral link (no campaign-specific link and no
second attribution system) and their own verified paying-member count for the window.

Ending a drive grants the existing `promoter` badge to participants the referral rail has already
credited with a paying member. Nothing on this path writes to `referrals`, `referral_earnings`,
`earnings`, `subscriptions` or any payout table. `Confirmed` (dark until
`supabase/schema-phase3-fan-campaigns.sql` runs).

---

*See also: [02-FEATURE-MAP.md](02-FEATURE-MAP.md) · [07-BUSINESS-RULES.md](07-BUSINESS-RULES.md) · [03-USER-ROLES-AND-PERMISSIONS.md](03-USER-ROLES-AND-PERMISSIONS.md)*
