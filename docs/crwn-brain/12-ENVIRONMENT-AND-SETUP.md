# 12 — Environment & Setup

> Grounded in `package.json`, `next.config.ts`, `vercel.json`, `.env.local` (names only), `CLAUDE.md`. **No secret values here.**

## 1. Prerequisites
- Node 20+ (`@types/node: ^20`), npm. Next.js 16 + Turbopack.
- Accounts/services: Supabase project (`ecpqtuidtsncjfwtkvwc`, US East), Stripe (platform + Connect), Cloudflare R2, LiveKit, Resend, DeepSeek + OpenAI, Vercel. (Twilio is no longer needed: SMS was removed 2026-07-31.)
- **This repo lives in WSL** (`\\wsl.localhost\Ubuntu\home\merce\workspace-crwn`). Per project memory, **run `npm run build` and `git` inside WSL** — the Windows-side Bash tool build can fake-pass, and Windows git fabricates deletions from colon-named sidecar files. `Confirmed` (user memory).

## 2. Install & run
```bash
npm install          # add any missing package before importing it
npm run dev          # dev server, port 3000
npm run build        # production build — MUST pass before pushing
npm run lint         # eslint
npm test             # vitest, 820 tests across 50 files (a moving figure: run it) (pure business logic only)
```

## 3. Database setup / migrations
- Schema is in `supabase/*.sql`. **Applied manually** in the Supabase SQL Editor — never auto-run and no migration runner. Apply `schema.sql` first, then `schema-ticket*`, then `schema-phase2-*`/`schema-phase3-*` roughly in dependency order. `Confirmed`.
- **⚠️ Some core money tables (`earnings`, `referrals`, `referral_earnings`, `fan_payouts`, `processed_webhook_events`, `recruiters`) have no CREATE TABLE migration** — a fresh DB cannot be fully built from this repo. Obtain a production schema dump. `Needs founder confirmation`.
- Every migration ends with a `DO $$ … RAISE EXCEPTION …$$` self-verify block; if it errors in the SQL editor, the migration half-applied — do not ignore.
- Seeds: `seed-demo-data.sql` (test artist `m3rcey`), `seed-demo-admin.sql`, `seed-platform-sequences.sql`, `seed-autonomous-history.sql`. Cleanup: `cleanup-test-onboarding-accounts.sql`.

## 4. Build / deploy
- Deployed on **Vercel** (project `crwn`; relink with `npx vercel link --project crwn --yes` if `.vercel` is removed). Auto-deploy from `master`.
- `npm run build` must pass clean. `NEXT_PUBLIC_*` changes require a **full redeploy** (no cache) to take effect.
- After frontend changes, **bump `CACHE_NAME` in `public/sw.js`** (iOS Safari caches aggressively).
- Cron ≤ once/day (Hobby plan); anything more frequent blocks all deploys.
- Post-deploy checklist: `POST_DEPLOY_CHECKLIST.md`; verify with the `kai` agent / production smoke.

## 5. Environment variables

**Client-exposed (`NEXT_PUBLIC_`, bundled into browser JS):**
| Name | Purpose | Referenced |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase endpoint | supabase clients, `next.config.ts` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key (safe, RLS-scoped) | supabase clients |
| `NEXT_PUBLIC_LIVEKIT_URL` | LiveKit ws URL | `livekit.ts`, live components |
| `NEXT_PUBLIC_R2_PUBLIC_URL` | R2 public base | `r2/client.ts` |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_BASE_URL` / `NEXT_PUBLIC_SITE_URL` | absolute link building | emails, links |
| ~~`NEXT_PUBLIC_CRON_SECRET`~~ | **RETIRED.** Was client-bundled and mirrored `CRON_SECRET`. Gone from `src/`; the Manager Refresh button now uses the session cookie | (none) |

**Server-only (never expose):**
| Name | Purpose |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | RLS-bypassing admin client (API routes only) |
| `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` | Stripe |
| `STRIPE_CRWN_{PRO,SCALE}_{,ANNUAL_}PRICE_ID` (4) | platform plan Stripe price ids (LABEL/EMPIRE vars removed 2026-07-31; checkout verifies the live price amount against `TIER_PRICING`) |
| `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Cloudflare R2 |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVE_PROVIDER` | LiveKit |
| `RESEND_API_KEY`, `FROM_EMAIL` | Resend email |
| ~~`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`~~ | DEAD since 2026-07-31 (SMS removed; nothing reads them) |
| `FOUNDER_ALERT_SMS_EMAIL` | optional carrier email-to-SMS gateway address for founder hot-lead alerts (plain Resend email, no Twilio) |
| `DEEPSEEK_API_KEY`, `OPENAI_API_KEY` | AI (DeepSeek also powers the /support chat; if unset, chat escalates to the founder) |
| `CRON_SECRET` | gates all cron routes (24 after `sms-reset` was deleted 2026-07-31) |
| `INTERNAL_TRACK_SECRET` | middleware → `/api/admin/track` |
| `NEW_ARTIST_WEBHOOK_SECRET` | new-artist hook |
| `SURVEY_TOKEN_SECRET` | signed loyalty-survey tokens |
| `VERCEL_URL` | deploy URL fallback |

**Present in `.env.local` but NOT referenced in `src/`** (likely for root `.mjs` tooling): `CALCOM_API_KEY`, `GEMINI_API_KEY`, `BRAVE_API_KEY`. `Unclear` — safe to treat as non-app.

**Safe example format** (no real values):
```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...            # server only
STRIPE_SECRET_KEY=sk_live_...               # server only
STRIPE_WEBHOOK_SECRET=whsec_...
R2_BUCKET_NAME=crwn-media
CRON_SECRET=<random-string>                 # do NOT mirror into NEXT_PUBLIC_*
```

## 6. Build-safety rules (Vercel Hobby)
- Always fallback, never `!`: `process.env.X || 'dummy-...-for-build'`. A `!` on an env var crashes the static build during page collection. `Confirmed`.
- `.env*` is gitignored — never commit real values.

## 7. Common failures & troubleshooting
| Symptom | Likely cause |
|---|---|
| All POST /api return 404 | middleware matcher not excluding `api/` |
| Build crashes on static collection | `!` non-null assertion on an env var |
| Deploy blocked | a cron more frequent than daily in `vercel.json` |
| Artist stuck as `fan` | someone added a client `profiles.update({role})` (RLS-rejected); role promotion is server-side only |
| Item silently invisible to its owner | soft-delete (`is_active=false`) hitting a SELECT policy without an owner override |
| iOS not seeing new frontend | `CACHE_NAME` in `sw.js` not bumped |
| Paid track audio 200 to curl | audio bucket public / DB storing a public locator (must be private + signed) |
| Local `npm run build` "passes" but prod breaks | build run via Windows Bash tool instead of WSL |

---

*See also: [10-INTEGRATIONS.md](10-INTEGRATIONS.md) · [09-CODING-CONVENTIONS.md](09-CODING-CONVENTIONS.md) · [11-SECURITY-AND-PRIVACY.md](11-SECURITY-AND-PRIVACY.md)*
