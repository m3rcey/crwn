# 10 — Integrations

> Every external service the app talks to, grounded in code. **No secret values appear here — env var names only.** `Confirmed` unless noted.

## Summary table

| Service | Purpose | Status | Webhook verified? |
|---|---|---|---|
| Supabase | Postgres + Auth + Storage + Realtime | Complete | n/a |
| Stripe (Platform + Connect) | All payments, subscriptions, payouts | Complete | ✅ yes |
| Cloudflare R2 (S3 SDK) | Audio masters, art, VOD storage | Complete (audio recently moved to private + signed URLs) | n/a |
| LiveKit | Live streaming + egress→VOD | Complete | ✅ yes |
| Resend | Transactional + marketing email | Complete | ❌ **no (High)** |
| DeepSeek (via `openai` SDK) | AI Manager + admin autonomous agent + /support chat (2026-07-31) | Complete | n/a |
| OpenAI (`gpt-4o-mini`) | `sync-opportunities` cron only | Complete (narrow) | n/a |
| Twilio (raw REST) | SMS/MMS marketing | **REMOVED 2026-07-31** (founder decision: A2P 10DLC compliance cost not worth it) | n/a (routes deleted) |
| Calendly (`react-calendly`) | Booking embed | **Orphaned/unused** | n/a |
| `@google/genai` | — | **Scaffolded, unused by app** | n/a |
| DiceBear | Demo avatars only | Not a real integration | n/a |
| Vercel | Hosting + cron | Complete | n/a |
| Analytics/error monitoring (Sentry/PostHog/GA…) | — | **Absent** (first-party only) | n/a |

---

## Supabase — Postgres / Auth / Storage / Realtime
- **Env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Files:** `src/lib/supabase/client.ts` (browser, anon+RLS), `server.ts` (SSR cookie), `middleware.ts` (PKCE exchange). Every `/api/**/route.ts` builds an admin client inline (no shared factory) with the service-role key (RLS-bypassing).
- **Auth:** two-tier — anon+RLS in components; service-role in API routes only. Sessions are cookie-based (`sameSite: lax, secure, maxAge ~400d`).
- **Email confirmation:** signup `emailRedirectTo` now points at `/verify` (was `/login?verified=true`), an "Email verified" success screen routed by onboarding state. `middleware.ts` preserves `?verified=true` on the `/verify` path when the PKCE code exchange FAILS (cross-browser/webview case) so those users see the verified banner instead of a blank login. `Confirmed`.
- **Storage buckets:** `audio` (now **private**, served via 1-hr signed URLs — `src/lib/storage/signedAudio.ts`), plus public buckets for avatars / album-art / community-media (`CODEBASE.md`).
- **Realtime:** used client-side for live chat and the notification bell (`postgres_changes`), not webhooks.
- **Local dev:** build-safe fallbacks `http://localhost:54321` / `dummy-service-key-for-build` so Vercel static build never crashes on missing envs.

## Stripe — Platform account + Connect
- **Env:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, plus four platform-plan price ids: `STRIPE_CRWN_PRO_PRICE_ID`, `STRIPE_CRWN_PRO_ANNUAL_PRICE_ID`, `STRIPE_CRWN_SCALE_PRICE_ID`, `STRIPE_CRWN_SCALE_ANNUAL_PRICE_ID` (the LABEL/EMPIRE ones were removed 2026-07-31; the checkout route verifies the live Stripe price amount against `TIER_PRICING`, so a stale id fails loudly).
- **Files:** `src/lib/stripe/client.ts` (`apiVersion: '2026-02-25.clover'`), `src/lib/webhookHandlers.ts`, `src/app/api/stripe/**` (~20 routes). ⚠️ ~7 routes instantiate `new Stripe(...)` inline instead of importing the shared client (maintenance smell; same key).
- **Model:** fan subscriptions + prices live on the **platform** account; fan→artist money uses `transfer_data.destination` + `application_fee`. Artist payouts go to per-artist **Connect Express** accounts. See `07-BUSINESS-RULES.md`.
- **Webhook** `/api/stripe/webhook`: **signature-verified** (`stripe.webhooks.constructEvent`). Idempotent via atomic `processed_webhook_events` INSERT (unique-violation = already processed). Handles `checkout.session.completed` (routed by metadata), `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted`, `charge.refunded`, `checkout.session.expired`, `charge.dispute.created`.
- **Failure behavior:** idempotency-insert errors are logged but processing continues (fail-open by design so a schema hiccup never drops a payment event).

## Cloudflare R2 — object storage (S3-compatible)
- **Env:** `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `NEXT_PUBLIC_R2_PUBLIC_URL`.
- **Files:** `src/lib/r2/client.ts` (`@aws-sdk/client-s3` + `s3-request-presigner`; `getSignedUploadUrl` 300s / `getSignedDownloadUrl` 3600s). Reused by LiveKit egress to write recordings directly to R2.
- **Auth:** static S3 access key/secret. **Security note:** `signedAudio.ts` documents a real fixed incident — the `audio` bucket was public and a paid track master returned 200 to a bare curl; now private + short-TTL signed URLs. DB still stores legacy public-URL *locators* (not links); sign only where entitlement is proven. Cloudflare may serve a stale public object for ~1 hr after the flip.

## LiveKit — live streaming + VOD
- **Env:** `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` (+ reuses R2 for egress). `LIVE_PROVIDER` selects provider.
- **Files:** `src/lib/livekit/livekit.ts` (token minting, `RoomServiceClient`, `EgressClient`), `src/app/api/live/*`.
- **Auth:** per-role JWT `AccessToken` (broadcaster/stage/viewer). `/api/live/token` is the sole gate — checks tier + ticket + slot-cap server-side before minting.
- **Webhook** `/api/live/egress-webhook`: **signature-verified** (`WebhookReceiver.receive`). Flips `vod_status` recording→processing→ready/failed.
- **Hardening:** `isPlaceholder()` rejects unfilled `<APIxxxx>` bracketed env values that previously passed truthy checks and only failed after a fan had paid. Recording is best-effort (failure does not block go-live).

## Resend — email
- **Env:** `RESEND_API_KEY`, `FROM_EMAIL` (note: `src/lib/resend.ts` hardcodes `'CRWN <hello@thecrwn.app>'`).
- **Files:** `src/lib/resend.ts`, ~30 templates in `src/lib/emails/*.ts` (welcome, receipt, digest, campaign, sequence, payout, partner…). Two bounce/complaint handlers: `/api/webhooks/resend`, `/api/outreach/webhook`.
- **Behavior:** hard bounces → global `email_suppressions`; spam complaints → opt fan out of all artist marketing. Senders check suppression before sending.
- **✅ Signature gap FIXED 2026-07-14** (an earlier version of this line still called it an open HIGH): all four webhooks verify via `src/lib/webhookSignatures.ts` and **fail closed**, including when the secret is unset. `/api/webhooks/resend` uses `RESEND_WEBHOOK_SECRET`, `/api/outreach/webhook` uses `RESEND_OUTREACH_SECRET`.
- **🔴 OPEN, found 2026-07-30: the webhook was never REGISTERED in the Resend dashboard.** The code is right; nobody ever told Resend to call it. Evidence: the only row in `email_suppressions` is the `victim@example.com` row from the July security test, so no real delivery event has ever arrived. Consequence: hard bounces and spam complaints have never been suppressed in production, which degrades the sending domain that all acquisition email depends on. Fix is founder-side (create the webhook at `resend.com/webhooks`, then set `RESEND_WEBHOOK_SECRET` in Vercel); it is the P0 item in `TODO.md`. **Lesson: a verified, correct, deployed webhook route proves nothing about whether the provider is actually calling it. Check for received data, not for code.**

## DeepSeek + OpenAI — AI (two providers, both via the `openai` npm SDK)
- **Env:** `DEEPSEEK_API_KEY` (baseURL `https://api.deepseek.com`, model `deepseek-chat`), `OPENAI_API_KEY` (`gpt-4o-mini`).
- **DeepSeek powers:** artist **AI Manager** (`src/lib/ai/generateInsights.ts`, `generateActions.ts`), the **admin autonomous agent** (`src/app/api/admin/agent/{analyze,briefing}/route.ts`, `admin/support`), and since 2026-07-31 the **/support live chat** (`/api/support/chat`, `deepseek-chat` with a knowledge prompt generated from the 14 real getting-started guides via `src/lib/supportKnowledge.ts`). If `DEEPSEEK_API_KEY` is unset, or the AI flags the question, or the user taps "Talk to a human", the conversation escalates to `human_requested` and the founder is emailed a link to `/admin?tab=support` (SupportChatView), where admin replies email the user.
- **OpenAI powers:** exactly one place — `src/app/api/cron/sync-opportunities/route.ts` (generates synthetic sync-licensing "opportunity" listings, Mon/Thu).
- **Failure:** all AI calls are try/caught and degrade to empty/fallback results, never throw. The PRD's "Moonshot AI (Kimi)" reference is **stale** — no Moonshot in code.

## Twilio: REMOVED 2026-07-31
The entire SMS feature was removed on 2026-07-31 (founder decision: the A2P 10DLC compliance cost was not worth it). Twilio is no longer an integration.
- **Deleted:** `src/lib/twilio.ts`, all `/api/sms/*` routes (send, webhook, status, provision, upload), `/api/cron/sms-reset` (and its `vercel.json` cron), `/api/admin/twilio-health`, the `SmsSetup` component, the SMS tab in the Fan CRM (AudienceTab), SMS limits in `platformTier.ts`, SMS mentions in tier upgrade emails / `PlatformTierModal` / `PlatformBilling` / the worth page, the SMS consent checkbox on lead capture, the fan SMS marketing toggle, and Terms §13 (SMS Messaging Program) plus the privacy policy's Twilio mention.
- **DB tables kept, dormant:** `artist_phone_numbers`, `sms_subscribers`, `sms_consent_log` were NOT dropped. They preserve historical consent records; nothing reads or writes them anymore.
- **Founder alerts:** hot-lead call-request alerts are now EMAIL always (joshn.wms@gmail.com), plus an optional carrier email-to-SMS gateway via `FOUNDER_ALERT_SMS_EMAIL` (plain Resend email, no Twilio). `TWILIO_*` env vars are dead.
- The 2026-07-30 test-credentials saga and the earlier webhook-signature work are recorded in `CHANGELOG.md`; they describe what was true before the removal.

## Calendly — booking embed (orphaned)
- **Env:** `CALCOM_API_KEY` exists in `.env.local` but **no cal.com server integration found**. `react-calendly` is installed.
- **Files:** `src/components/booking/{CalendlyBooking,SessionManager,BookingSettings}.tsx` — **none imported anywhere in `src/`**. No `[slug]/book/` page renders them. The live booking flow is **booking tokens** (`/api/booking-tokens`, `BookingTokenButton`). Backend (`booking-checkout`, `booking_sessions`) still functions but has no reachable UI entry point. **Legacy/unused.**

## Not real integrations
- **`@google/genai`** — a `package.json` dep with **zero imports under `src/`**; only used by root `.mjs` content-generation scripts (marketing carousels/thumbnails). Not part of the deployed app.
- **DiceBear** — only in `supabase/seed-*.sql` demo avatar URLs; whitelisted in `next.config.ts` `images.remotePatterns` defensively. No app code calls it.
- **`BRAVE_API_KEY`, `GEMINI_API_KEY`** — present in `.env.local` but not referenced in `src/` (likely for the `.mjs` tooling / research scripts). `Unclear`.

## Vercel — hosting + cron
- 25 crons in `vercel.json`, all ≤ daily (Hobby-plan constraint). Each cron route checks `Authorization: Bearer ${CRON_SECRET}` (100% coverage). CLI is linked to project `crwn`.
- Crons with external deps: `sync-opportunities`→OpenAI; `ai-manager`, `admin/agent/briefing`→DeepSeek(+Resend); `recruiter-*`→Stripe (`weekly-payout` retired 2026-08-11: Stripe pays artists on its own automatic daily schedule and CRWN runs no artist-payout cron); `onboarding-health`/`rls-canary`→Supabase+Resend.

## Analytics / error monitoring — ABSENT
No Sentry, PostHog, Segment, Amplitude, Mixpanel, or GA anywhere in `src/`. CRWN relies entirely on first-party tables (`admin_metrics_cache`, funnel/visit tracking). Error handling is `console.log` + `try/catch` → 500. `Confirmed`.

---

*See also: [11-SECURITY-AND-PRIVACY.md](11-SECURITY-AND-PRIVACY.md) · [12-ENVIRONMENT-AND-SETUP.md](12-ENVIRONMENT-AND-SETUP.md) · [07-BUSINESS-RULES.md](07-BUSINESS-RULES.md)*
