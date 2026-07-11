# 06 — Routes & User Flows

> Route inventory + step-by-step flows. Grounded in `src/app/**`, `src/middleware.ts`. `Confirmed` unless noted.

## 1. Route groups
- **`(auth)/`** — `login`, `signup`, `onboarding`(dead). Redirect to `/home` if authed.
- **`(main)/`** — protected app shell (sidebar): `home`, `explore`, `library`, `messages`, `profile` (+ `profile/artist` dashboard, `profile/notifications`), `earn`, `impact`, `command`, `my-missions`, `my-calendar`, `recruit`(+`/dashboard`), `studio`.
- **`(public)/`** — `welcome`, `worth`, `survey/[token]`, `link/[slug]`, `getting-started`(+guides), legal (`terms`, `privacy`, `dmca`, `artist-agreement`, `live-agreement`), `forgot-password`, `reset-password`, `support`.
- **`[slug]/`** — canonical public artist pages + `track/[id]`, `album/[id]`, `post/[id]`, `playlist/[id]`, `live/[sessionId]`, `book(/success)`, `demand/[testId]`, `r/[code]`, `suggest-mission`.
- **`artist/[slug]/`** — LEGACY redirect + dead duplicate subroutes.
- **Top-level** — `setup`, `admin`(+`/team-splits`), `offers(/new)`, `missions(/new,/suggestions)`, `squads(/new)`, `my-squads`, `bounties(/new,/[id])`, `my-bounties`, `campaigns(/new,/[id])`, `campaign-hub`, `city-unlocks(/new,/[id])`, `city/[id]`, `playbooks/[runId]`, `proof-of-demand(/new,/[id])`, `clip-controls`, `action-plan`, `team(/[id],/invite/[token])`, `embed/[trackId]`, `join/[code]`, `verify`, `about`, `partner`.
- **`api/`** — ~190 handlers. Notable groups: `stripe/*` (~20), `cron/*` (25), `admin/*` (23), `live/*` (12), `messages/*`, `team-splits/*`, `sequences/*`, `campaigns/*`, `quests/*`, `missions/*`, `squads/*`, `bounties/*`, `sms/*`, `notifications/*`.

## 2. Route protection
`middleware.ts` guards the `protectedPaths` page list (redirect `/login` if no auth cookie), redirects authed users away from `/login`,`/signup`, returns early on PKCE `code` param, and **excludes `/api/`** (routes self-authenticate). Bot-filtered visitor hashing is analytics-only. `Confirmed`.

## 3. Webhook & callback routes
| Route | Source | Verified? |
|---|---|---|
| `/api/stripe/webhook` | Stripe | ✅ signature |
| `/api/live/egress-webhook` | LiveKit | ✅ signature |
| `/api/sms/status` | Twilio (delivery) | ✅ HMAC |
| `/api/webhooks/resend`, `/api/outreach/webhook`, `/api/outreach/inbound`, `/api/sms/webhook` | Resend/Twilio | ❌ **unverified (HIGH)** |
| `/api/notifications/new-artist-hook` | internal (`NEW_ARTIST_WEBHOOK_SECRET`) | secret |
| `/api/cron/*` (25) | Vercel Scheduler | `CRON_SECRET` bearer |
| PKCE auth callback | Supabase (via middleware `exchangeCodeForSession`) | code param |

## 4. Key flows

### Sign-up → artist activation
```mermaid
flowchart TD
    S[/signup: email+pw, emailRedirectTo=/verify, capture ?recruiter/?invite to localStorage/] --> V[/verify: PKCE exchange -> Email verified success screen -> forward by onboarding state/]
    V --> W[/welcome: display_name, phone, role, editable CRWN link/handle for artists/]
    W -->|role=fan| H[/home]
    W -->|role=artist| AP[insert artist_profiles from chosen handle -> trg_promote_to_artist flips role server-side]
    AP --> SET[/setup wizard: 9 one-field screens]
    SET --> Photo[photo* -> avatar_url] --> Tier[tier name/price/benefits] --> Track[track audio*/title] --> Prod[product type/title/price]
    Prod --> Share[share screen -> Start Rise Mode]
    Share --> Complete[POST /api/artist/complete-setup sets setup_completed=true server-side]
    Complete --> D[/profile/artist dashboard; post-setup tour is replay-only, does not auto-start]
```
Mandatory: photo + one track. Monetize/Shop skippable. Completion is DB-derived; hard gate in `(main)/layout.tsx` bounces incomplete artists back to `/setup`. At `/welcome` artists set an editable `thecrwn.app/[handle]` link (auto-filled from the name via `slugify` until edited, validated against reserved handles and Postgres 23505 unique collisions); the slug is created from the chosen handle, not the legal display name. Finishing the wizard writes `setup_completed=true` via the service-role `POST /api/artist/complete-setup` route (`markComplete()` throws on failure); this replaced a silent client `.update()` that could fail and bounce the artist from the dashboard back into `/setup`. Recruiter/invite codes redeemed post-auth (`redeemPendingInvite`, `/api/admin/track`). `Confirmed`.

### Email verification
Signup `emailRedirectTo` points at `/verify`. `/verify` runs the PKCE exchange and shows an "Email verified" success screen with a forward button routed by onboarding state (`/welcome` for new users, `/home` when a session exists, "Continue to login" when none). On PKCE exchange **failure** for the `/verify` path (cross-browser/webview case, e.g. Gmail in-app browser with no code-verifier cookie), `src/lib/supabase/middleware.ts` preserves `?verified=true` so those users still see the verified banner on `/login` instead of a blank login page. `Confirmed`.

### Login
`/login` → Supabase email/pw (or magic link / Google / Apple) → `useAuth` loads profile → if `onboarding_completed` false → `/welcome`, else `/home`. `Confirmed`.

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
Artist Payouts tab → `/api/stripe/connect` (Express onboarding) → return to `/api/stripe/connect/status` (on `charges_enabled`: milestone + `backfillTierPrices`). Weekly `weekly-payout` cron pays full Connect balance; manual `/api/stripe/cashout` ($2 fee). Fan/collaborator cash out via `fan-cashout`/`team-split-cashout` ($25 min). `Confirmed`.

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

### Lead-gen (smart links / pre-save)
`(public)/link/[slug]` → `SmartLinkCapture`/`PreSaveCapture` collects email/phone → `/api/smart-links/capture` → `smart_link_captures`; pre-save release-day email via `scheduled-releases` cron. `Confirmed`.

---

*See also: [02-FEATURE-MAP.md](02-FEATURE-MAP.md) · [07-BUSINESS-RULES.md](07-BUSINESS-RULES.md) · [03-USER-ROLES-AND-PERMISSIONS.md](03-USER-ROLES-AND-PERMISSIONS.md)*
