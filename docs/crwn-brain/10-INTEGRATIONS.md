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
| DeepSeek (via `openai` SDK) | AI Manager + admin autonomous agent | Complete | n/a |
| OpenAI (`gpt-4o-mini`) | `sync-opportunities` cron only | Complete (narrow) | n/a |
| Twilio (raw REST) | SMS/MMS marketing | Complete (Pro+, dev-stubbed) | status ✅ / inbound ❌ **(High)** |
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
- **Env:** `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, plus six `STRIPE_CRWN_*_PRICE_ID` (pro/label/empire × monthly/annual).
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
- **⚠️ HIGH security gap:** `/api/webhooks/resend` and `/api/outreach/webhook` (and `/api/outreach/inbound`) do **NOT verify the Svix signature** — anyone can POST a forged `email.complained` to mass-suppress arbitrary addresses. See `11-SECURITY-AND-PRIVACY.md`.

## DeepSeek + OpenAI — AI (two providers, both via the `openai` npm SDK)
- **Env:** `DEEPSEEK_API_KEY` (baseURL `https://api.deepseek.com`, model `deepseek-chat`), `OPENAI_API_KEY` (`gpt-4o-mini`).
- **DeepSeek powers:** artist **AI Manager** (`src/lib/ai/generateInsights.ts`, `generateActions.ts`) and the **admin autonomous agent** (`src/app/api/admin/agent/{analyze,briefing}/route.ts`, `admin/support`). Actions execute via `src/app/api/admin/agent/execute/route.ts` behind a coordination lock (`src/lib/ai/coordinationLock.ts`) + `requireAdmin()`.
- **OpenAI powers:** exactly one place — `src/app/api/cron/sync-opportunities/route.ts` (generates synthetic sync-licensing "opportunity" listings, Mon/Thu).
- **Failure:** all AI calls are try/caught and degrade to empty/fallback results, never throw. The PRD's "Moonshot AI (Kimi)" reference is **stale** — no Moonshot in code.

## Twilio — SMS/MMS
- **Env:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, plus `FOUNDER_ALERT_PHONE` (server-only, the hot-lead alert recipient; email fallback to the founder when unset). **No `twilio` npm package** — raw `fetch` Basic-auth to the REST API (`src/lib/twilio.ts`).
- **Internal operational alerts (2026-07-30):** the qualified call-request route (`/api/lead-magnets/call-request`) sends ONE founder SMS per qualified request via `sendSms`, entirely separate from artist→fan SMS marketing (no `sms_subscribers`, no per-fan caps, no quiet-hour logic — it is an internal pager, not a campaign).
- **Files:** `src/lib/twilio.ts` (send + quiet-hours + area-code→timezone), `src/app/api/sms/{send,status,provision,upload,webhook}`. Reset cron `/api/cron/sms-reset` (monthly).
- **Gating:** Pro+ only (`getSmsLimit(tier)===0` blocks Free). Quiet hours 9pm–9am fan-local; max 1 SMS/mo/fan/artist.
- **Dev:** stubs to `console.log('[SMS Stub]')` and returns fake success when unconfigured.
- **Webhooks:** `/api/sms/status` (delivery) **verifies** Twilio HMAC-SHA1 signature. `/api/sms/webhook` (inbound STOP/YES keywords) does **NOT** verify — **High** gap. `sms/send` has a TODO: quiet-hour sends are silently dropped (counted, never queued) — partial feature.

## Calendly — booking embed (orphaned)
- **Env:** `CALCOM_API_KEY` exists in `.env.local` but **no cal.com server integration found**. `react-calendly` is installed.
- **Files:** `src/components/booking/{CalendlyBooking,SessionManager,BookingSettings}.tsx` — **none imported anywhere in `src/`**. No `[slug]/book/` page renders them. The live booking flow is **booking tokens** (`/api/booking-tokens`, `BookingTokenButton`). Backend (`booking-checkout`, `booking_sessions`) still functions but has no reachable UI entry point. **Legacy/unused.**

## Not real integrations
- **`@google/genai`** — a `package.json` dep with **zero imports under `src/`**; only used by root `.mjs` content-generation scripts (marketing carousels/thumbnails). Not part of the deployed app.
- **DiceBear** — only in `supabase/seed-*.sql` demo avatar URLs; whitelisted in `next.config.ts` `images.remotePatterns` defensively. No app code calls it.
- **`BRAVE_API_KEY`, `GEMINI_API_KEY`** — present in `.env.local` but not referenced in `src/` (likely for the `.mjs` tooling / research scripts). `Unclear`.

## Vercel — hosting + cron
- 25 crons in `vercel.json`, all ≤ daily (Hobby-plan constraint). Each cron route checks `Authorization: Bearer ${CRON_SECRET}` (100% coverage). CLI is linked to project `crwn`.
- Crons with external deps: `sync-opportunities`→OpenAI; `ai-manager`, `admin/agent/briefing`→DeepSeek(+Resend); `weekly-payout`/`recruiter-*`→Stripe; `onboarding-health`/`rls-canary`→Supabase+Resend.

## Analytics / error monitoring — ABSENT
No Sentry, PostHog, Segment, Amplitude, Mixpanel, or GA anywhere in `src/`. CRWN relies entirely on first-party tables (`admin_metrics_cache`, funnel/visit tracking). Error handling is `console.log` + `try/catch` → 500. `Confirmed`.

---

*See also: [11-SECURITY-AND-PRIVACY.md](11-SECURITY-AND-PRIVACY.md) · [12-ENVIRONMENT-AND-SETUP.md](12-ENVIRONMENT-AND-SETUP.md) · [07-BUSINESS-RULES.md](07-BUSINESS-RULES.md)*
