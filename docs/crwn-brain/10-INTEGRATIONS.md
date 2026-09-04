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
| DeepSeek (via `openai` SDK) | AI Manager + admin agent + /support chat (2026-07-31) | Complete | n/a |
| Anthropic (`@anthropic-ai/sdk`) | Acquisition lead decision on the ManyChat inbound path | Complete (narrow) | n/a |
| Twilio (raw REST) | SMS/MMS **marketing**: REMOVED 2026-07-31. Inbound keyword reply (`/api/sms/inbound`, dark) since 2026-08-21. Internal speed-to-lead alert AUTHORIZED 2026-08-24, not yet built | Marketing removed; narrow non-marketing use only | n/a (webhook signature-verified) |
| Apify (raw REST) | Artist Distribution Finder (admin-only): public Instagram discovery, profile enrichment, and Big Page Index post refresh via `apify/instagram-hashtag-scraper`, `apify/instagram-profile-scraper`, `apify/instagram-post-scraper` | LIVE (token set + first search ran 2026-08-24) | n/a (no webhook; the admin UI polls run status) |
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

### Stripe financial lifecycle testing — the sandbox harness (2026-09-04)

Some money questions cannot be answered by unit tests, because the answer belongs to Stripe and
not to CRWN. "Does a 100% discounted subscription really need no card", "does appending a phase
to a paying fan's schedule really leave their paid period intact", "is 12 monthly periods really
12 invoices" are all facts about Stripe's object model. `scripts/verify-prize-lifecycle.mjs`
runs them against real Stripe TEST objects and reads the results back rather than inspecting the
parameters it just sent.

- **Env: `STRIPE_TEST_SECRET_KEY`, local tooling only.** Never set it in Vercel; nothing in
  `src/` reads it. It is a NEW convention because the repo had none: prior to this the only
  Stripe secret was the live key.
- **`scripts/lib/stripeSandbox.mjs` is the one safety primitive**, deliberately generic so
  future financial-rail validation (Team Splits funding) reuses the guard without inheriting
  anything prize-shaped. It reads `STRIPE_TEST_SECRET_KEY` and only that name; it refuses
  `sk_live_`/`rk_live_` by prefix before any network call; it refuses anything it cannot
  positively identify as test mode; and it then requires **Stripe itself** to answer
  `livemode: false`, because a prefix is a string a typo can produce. **There is no fallback to
  `STRIPE_SECRET_KEY`,** which is the whole point: the app's `src/lib/stripe/client.ts` binds
  the live key at module load, so a harness importing it would be live by construction.
- **The refusal is frozen by `src/lib/stripe/sandboxKey.test.ts`** (mutation-tested 2026-09-04:
  adding a `|| process.env.STRIPE_SECRET_KEY` fallback and separately disabling the live-prefix
  branch each failed the suite; both reverted, clean pass). It asserts the live refusal, the
  missing-key refusal, the refuse-by-default for unknown shapes, and that the guard's only
  environment read is the test variable.
- **No secret is ever printed, returned, logged or committed.** Only the mode and the Stripe
  account id are printed. `.env*` is gitignored.
- **Every object the harness creates is labelled** `crwn_sandbox_run=<run>` and deleted at the
  end; `--keep` leaves them for dashboard inspection.
- **It touches no database.** Stripe primitives need none, and keeping the DB out is what makes
  the harness safe to run from a machine pointed at production Supabase.
- **Validation status: PROVEN IN STRIPE TEST MODE 2026-09-04. 38 checks, 0 failures, 0
  unproven** (35 on the first proof; 3 more once every leg carried the production routing,
  `default_settings.transfer_data` + `application_fee_percent`, and the Connect leg measured the
  transfer DELTA rather than the account total, because the paid legs correctly produce real
  transfers and the prize produces none). All three winner states, plus Connect. The production
  construction lives in `src/lib/campaigns/prizeStripe.ts`, and `prizeStripe.test.ts` scans the
  harness for the same literals so proof and production cannot drift. What the run actually
  established, most of which contradicted the design it was built to confirm:

  | Assumption | What Stripe said |
  |---|---|
  | phase `coupon: <id>` | **REJECTED.** Under `billing_mode.type=flexible` (this API version) a phase takes `discounts: [{ coupon }]`. |
  | phase `iterations: 12` | **REJECTED**, unknown parameter. Use `duration: { interval: 'month', interval_count: 12 }`. |
  | `start_date` slightly in the future | **Leaves the schedule `not_started` and `schedule.subscription` null.** For an immediate prize it must be `'now'`. |
  | a $0 subscription needs no card | **TRUE.** Customer with no payment method, subscription `active`, first invoice FINALISED (not draft) at `status=paid`, $0 due / $0 paid / $0 remaining, zero charges. |
  | `from_subscription` preserves the paid period | **TRUE.** Phase 0's `end_date` came back identical to the pre-existing `current_period_end`; no refund, no duplicate subscription, prize phase starts exactly at that boundary. |
  | `transfer_data` + `application_fee_percent` on a $0 invoice | **Safe.** Zero charges, zero transfers to the destination, no application fee. |

  The 100%-off coupon is `percent_off: 100, duration: 'repeating', duration_in_months: 12`, and
  the hard stop is `end_behavior: 'cancel'` with the prize as the final phase. A `forever`
  coupon would outlive the prize; a `once` coupon would leave months 2 to 12 payable.

  **A draft invoice is not evidence.** The first pass asserted $0 on a `status=draft` invoice,
  whose amounts are not final. The harness now finalises it and re-reads, because the question
  is what the fan is actually billed.

  **A test Connect account needs to be `custom` with Stripe's documented test fixtures**
  (`external_account: 'btok_us_verified'`, `address.line1: 'address_full_match'`) to come back
  `transfers: active`. A fresh Express account is not enabled and makes the Connect leg
  unanswerable rather than passing.
- **This does NOT satisfy the Team Splits canary**, which additionally needs a non-production
  Supabase project and a webhook secret (see `28-TEAM-SPLIT-FUNDING-ARCHITECTURE.md` §27.3).
  Same blocker, larger environment. Team Split funding remains disabled.

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

## AI — TWO providers (scan-verified 2026-08-25)

The count has moved twice, each time verified by a repository-wide scan for provider clients and
completion call sites, never by trusting the previous doc. It said "two providers" while the
Anthropic acquisition surface was live and undocumented (fixed 2026-08-12 as "three"); then the
OpenAI synthetic sync-listings generator was deleted (its route no longer exists, and
`agentSecurityBoundaries.test.ts` asserts no sync_opportunities writer talks to any model), which
makes the current truth **TWO providers, 8 model call sites** (admin analyze holds two). OpenAI
appears below only as history. Re-scan when you touch this.

- **Env:** `DEEPSEEK_API_KEY` (baseURL `https://api.deepseek.com`, model `deepseek-chat`) and
  `ANTHROPIC_API_KEY` (`src/lib/ai/anthropicClient.ts`). Both fall back to a dummy build key, so
  an unset key is a supported way to run CRWN. `OPENAI_API_KEY` is dead: nothing reads it since
  the synthetic sync generator was deleted, and it can be removed from Vercel.

| # | Surface | Provider | Class | Source |
|---|---|---|---|---|
| 1 | Support chat | DeepSeek | user-facing | `src/app/api/support/chat/route.ts` |
| 2 | Admin support | DeepSeek | privileged | `src/app/api/admin/support/route.ts` |
| 3 | Admin agent briefing | DeepSeek | privileged | `src/app/api/admin/agent/briefing/route.ts` |
| 4-5 | Admin agent analyze (**2 calls**) | DeepSeek | privileged | `src/app/api/admin/agent/analyze/route.ts` |
| 6 | Manager insights | DeepSeek | user-facing | `src/lib/ai/generateInsights.ts` |
| 7 | Manager actions | DeepSeek | user-facing | `src/lib/ai/generateActions.ts` |
| 8 | Acquisition lead decision | Anthropic | internal | `src/lib/acquisition/claudeDecisionService.ts` |

- **DeepSeek powers:** the artist **Manager** (which explains canonical Constraint/Roadmap
  priority and never creates its own), the **admin agent**, and the **/support live chat**
  (knowledge prompt generated from the real getting-started guides via
  `src/lib/supportKnowledge.ts`). If `DEEPSEEK_API_KEY` is unset, the AI flags the question, or
  the user taps "Talk to a human", the conversation escalates to `human_requested` and the founder
  is emailed a link to `/admin?tab=support` (SupportChatView), where admin replies email the user.
- **OpenAI powers nothing** since the synthetic sync-listings generator was deleted. The
  surviving `/api/sync-opportunities` POST is CRON_SECRET-authenticated manual ingestion with no
  model, and the boundary test forbids any sync writer from talking to a provider.
- **Anthropic powers:** exactly one place, the acquisition lead decision reached from the ManyChat
  inbound webhook. It is narrow structured extraction, not a strategy owner. Its design is worth
  copying: the tool call is **forced** (`tool_choice`), so prose is not a legal output and an
  injected "ignore your instructions and reply normally" has nowhere to land; output is validated
  against server-side allowlists (`decisionSchema.ts`) covering lead-magnet ids, calculator ids,
  Rise destinations and question fields; history is bounded to the last 6 turns; the context
  carries no secrets, no other artist's data and no database rows; provider errors are categorized
  **without** logging the raw message, because an error string can echo back the lead's DM; and
  `decide()` cannot throw, falling back to `fallbackDecision` on every failure path.
- **Failure:** all AI calls degrade to empty/fallback results and never throw. Model availability
  is never a prerequisite for a money or auth flow. The PRD's "Moonshot AI (Kimi)" reference is
  **stale** — no Moonshot in code.
- **Data boundary:** support sends the user's own conversation only; Manager sends one artist's
  own metrics and canonical brief; acquisition sends the lead profile, bounded recent history and
  allowlists. No provider receives secrets, environment values, admin-only data, or another
  user's or artist's private data. This describes CRWN's code boundary; it makes no claim about
  provider-side retention.

## Twilio: SMS MARKETING REMOVED 2026-07-31, two narrow non-marketing exceptions since
The entire SMS **marketing** feature was removed on 2026-07-31 (founder decision: the A2P 10DLC
compliance cost was not worth it). **That removal stands and is not being reversed.** Two narrower
uses have been authorized since, each on its own line and neither of them marketing. Read the
removal and the exceptions together: the exceptions do not restore anything on the deleted list.
- **Deleted:** `src/lib/twilio.ts`, all `/api/sms/*` routes (send, webhook, status, provision, upload), `/api/cron/sms-reset` (and its `vercel.json` cron), `/api/admin/twilio-health`, the `SmsSetup` component, the SMS tab in the Fan CRM (AudienceTab), SMS limits in `platformTier.ts`, SMS mentions in tier upgrade emails / `PlatformTierModal` / `PlatformBilling` / the worth page, the SMS consent checkbox on lead capture, the fan SMS marketing toggle, and Terms §13 (SMS Messaging Program) plus the privacy policy's Twilio mention.
- **DB tables kept, dormant:** `artist_phone_numbers`, `sms_subscribers`, `sms_consent_log` were NOT dropped. They preserve historical consent records; nothing reads or writes them anymore.
- **Founder alerts:** hot-lead call-request alerts are now EMAIL always (joshn.wms@gmail.com), plus an optional carrier email-to-SMS gateway via `FOUNDER_ALERT_SMS_EMAIL` (plain Resend email, no Twilio).
- **Twilio (INBOUND ONLY, since 2026-08-21):** CRWN still sends no SMS. One route, `/api/sms/inbound`, answers a texted keyword with a link, via TwiML, so the reply leaves from whichever number received it. It runs on its OWN number, `TWILIO_JUBO_PHONE_NUMBER`, and ignores messages sent to any other number; `TWILIO_PHONE_NUMBER` is reserved for a different purpose and is test-pinned out of that route. Signature verification is HMAC-SHA1 in `src/lib/webhookSignatures.ts` (no SDK), pinned against Twilio's published vector. STOP/HELP belong to the carrier and Twilio Advanced Opt-Out; CRWN stays silent on them. Live traffic additionally requires A2P 10DLC registration.
- **Twilio (INTERNAL OUTBOUND, AUTHORIZED 2026-08-24, NOT YET BUILT):** the founder authorized ONE
  outbound A2P 10DLC campaign, registered to **JNW Creative Enterprises, Inc.** (Low Volume
  Standard), whose ONLY recipient is authorized internal company personnel. When a qualified
  artist submits the `CallRequestCard` hand-raiser, an operational alert naming the lead and their
  callback number goes to an authorized representative so they can return the call **by phone**.
  The artist is not a recipient of that campaign. **No sending code exists yet**: today
  `/api/lead-magnets/call-request` still alerts by Resend email plus the optional
  `FOUNDER_ALERT_SMS_EMAIL` carrier gateway, and that is what ships. What DID change on 2026-08-24
  is the public legal surface the campaign is vetted against: `/privacy` section 8 and `/terms`
  section 13. See `11-SECURITY-AND-PRIVACY.md`.
- **The A2P opt-in is a PUBLIC PAGE, because Twilio refused the paper form (2026-08-25).** The
  campaign was rejected when the opt-in was described as a signed internal record Twilio could not
  inspect; its documented evidence standard is "a live, publicly-accessible website with opt-in
  functionality". `/sms-alert-consent` is that page: brand identified, an UNCHECKED checkbox
  carrying the full disclosure (frequency, message and data rates, STOP, HELP, consent not a
  condition of purchase), links to `/privacy` and `/terms`, and a mobile number field. It records
  consent and **sends nothing**: the route holds no Twilio client and no credentials, and a test
  asserts that on comment-stripped source. Consent evidence goes to `internal_sms_alert_consents`
  (phone, server-owned disclosure text + version, source, timestamp, IP, user agent) and a copy is
  emailed to the internal recipient, so a consent is never lost while the migration is pending.
- **What is still forbidden.** Fan or artist SMS marketing, an SMS tab in the Fan CRM, an SMS
  campaign channel, SMS plan limits, fan SMS preferences, mass texting, and any artist-facing tool
  for texting fans. The deleted list above is the definition, and
  `src/lib/legal/legalPages.test.ts` (LEGAL-SMS-004) asserts neither the legal copy nor
  `campaignSender.ts` / `AudienceTab.tsx` has grown one back.
- The 2026-07-30 test-credentials saga and the earlier webhook-signature work are recorded in `CHANGELOG.md`; they describe what was true before the removal.

## Apify — Artist Distribution Finder (admin-only; hybrid Big Page Index since 2026-08-24)
- **Env:** `APIFY_API_TOKEN` (server-side only; never `NEXT_PUBLIC_`). Set in Vercel and LIVE since 2026-08-24. When absent the finder renders a "Provider not configured" state and serves stored observations only: `isApifyConfigured()` refuses dummy build fallbacks, so no provider request can ever carry one.
- **Files:** `src/lib/distribution/apifyProvider.ts` is the ONLY Apify code (raw `fetch` against `api.apify.com/v2`, Bearer auth so the token never sits in a URL; no SDK dependency). Everything else in `src/lib/distribution/` operates on normalized internal types. Routes: `src/app/api/admin/distribution/{search,poll,index,index/jobs}` (all `requireAdmin()`); UI: `src/components/admin/DistributionFinder.tsx` (the Distribution tab on `/admin`).
- **Actors, all contract-verified against the live Apify store 2026-08-24:** `apify/instagram-hashtag-scraper` (global discovery; `keywordSearch: true` toggles free-text mode, `-1` likes = hidden and is normalized to NULL), `apify/instagram-profile-scraper` (enrichment by `usernames[]`; its `relatedProfiles` output powers depth-1 expansion and carries NO follower counts, so expansion candidates take one enrichment hop), `apify/instagram-post-scraper` (Big Page Index refresh: `username` array in one run, `resultsLimit` PER PROFILE, `onlyPostsNewerThan` date floor), `apify/instagram-search-scraper` (direct big-page discovery: `searchType: 'user'`, `searchLimit` per term; user results carry followersCount/verified/private/category/bio DIRECTLY, so topic candidates filter without enrichment). Runs are started async and POLLED because an actor run takes minutes, past any Vercel function budget.
- **Hybrid architecture:** the WHY is that global keyword/hashtag discovery structurally surfaces superfan accounts (big media pages post artists without tagging them), proven twice: Ryan Leslie (largest hit ~14K) and Brent Faiyaz (overwhelmingly sub-1K accounts, while the 2-page index correctly surfaced @purestrap at 1.2M). The ratified finding: **artist keyword/hashtag discovery is a supplemental source, never the way to construct the large-page universe.** So searches merge TWO sources: the local `distribution_page_posts` corpus (recent posts of known significant pages, matched deterministically, an artist search never scrapes the index) and live global discovery, whose qualifying finds auto-join the index. The universe itself is built by **Discover Big Pages** (topic profile search via the search scraper, plus depth-1 related-profile expansion from indexed seeds), which returns a REVIEW table of candidates ranked by a deterministic Seed Value (audience 50 / corroboration 25 / relevance 15 / verification 10, in `src/lib/distribution/discovery.ts`); relevance boosts and never rejects. Founder maintenance is button-driven, never a cron: Discover, Add Pages (handles), Bootstrap From Artists (supplemental), Refresh Index (stale pages in batches of 25). "Add Selected" reuses the manual-add flow, so the index keeps ONE write path.
- **Scope:** PUBLIC Instagram data only, research/discovery only. No outreach automation, no private data, no login automation, no follower-list scraping. Coverage is best-effort public matches, **not** an exhaustive index of Instagram.
- **Cost controls:** bounded query set (max 4 keyword + 4 hashtag terms, 40 results each), max 30 profile enrichments per search, 24h observation cache, 7-day recent-post freshness with max 24 posts per page per refresh and a 90-day date floor. Full-refresh ceilings at pay-per-result pricing: 100 pages ≈ $6, 500 ≈ $28-32, 1,000 ≈ $55-65; only STALE pages are touched, so routine refreshes cost less.
- This is a data provider, not an AI model provider: the provider count in the AI section is unchanged, and no LLM is involved anywhere in the finder (queries, matching and ranking are all deterministic; the two-score model is Affinity + Distribution Value + a geometric Priority, weights in `src/lib/distribution/score.ts`).

## Social publishing: founder content to six platforms (2026-08-26)

Founder-operated, not artist-facing. Publishes the generated Fan Economy content
(`videos/carousels/fan-economy/` plus its Dropbox render folders) on a schedule the founder sets.
Instagram is LIVE and proven (media 18415895044156240 on @thecrwnapp, published unattended by the
cron on 2026-08-26 after one env-var whitespace failure). The other five are built and gated.

- **Env (all server-only, all trimmed on read):** `IG_USER_ID`, `IG_ACCESS_TOKEN`, `GRAPH_HOST`
  (graph.instagram.com for IGAA tokens, graph.facebook.com for EAA tokens), `FB_PAGE_ID`,
  `FB_PAGE_ACCESS_TOKEN`, `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN`, `X_API_KEY`, `X_API_SECRET`,
  `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`, `X_USERNAME`, `TIKTOK_ACCESS_TOKEN`, `YOUTUBE_CLIENT_ID`,
  `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REFRESH_TOKEN`, and the two audit gates `TIKTOK_AUDIT_PASSED`
  / `YOUTUBE_AUDIT_PASSED` (exactly `true` opens them; anything else fails closed).
- **Files:** `src/lib/social/capabilities.ts` is the ONE table of what each platform accepts
  (kinds, image count, caption ceiling, video length, daily limit, audit requirement); every
  surface reads it and nothing may offer a platform something it will refuse.
  `src/lib/social/adapter.ts` is the contract; `src/lib/social/adapters/*.ts` one file per
  platform, `adapters/index.ts` the registry. `src/app/api/cron/publish-tick/route.ts` is the
  worker (54 once-daily cron entries in `vercel.json` give 20-minute slots 7am to 11pm Eastern on
  the Hobby plan, since the cap is per expression not per project). `scripts/queue-carousels.mjs`
  is the local ingest: it transforms slides, uploads to R2, and writes one `social_posts` row plus
  one `social_post_targets` row per platform.
- **Tables:** `social_posts` (the content: kind, ordered media keys, absolute UTC slot) and
  `social_post_targets` (one per post per platform, with its OWN caption and status). Both RLS on
  with ZERO policies and ALL revoked from anon/authenticated: only the service role reads them.
  No money column, no credential column, asserted by the migrations' self-verify blocks.
- **The three rules that keep it safe.** (1) Publishing twice is the failure that matters, so a
  conditional UPDATE claims each target, a target with `provider_post_id` is never eligible again,
  and a partial unique index refuses a second pending target per (post, platform). (2) TikTok and
  YouTube force an unaudited client's posts to PRIVATE while reporting success, so both are refused
  until their audit is recorded, in the matrix AND inside the adapter. (3) The cron is a dumb tick;
  the schedule is `scheduled_for`, converted ONCE at queue time from the founder's wall clock, so
  daylight saving cannot move a post. Facebook and YouTube publish on their own clock
  (`handed_off`) when the slot is still ahead.
- **Constraints worth knowing before promising anything:** Threads caps a post at 500 characters
  and X at 280, so an Instagram caption cannot be reposted unchanged (`caption.<platform>.md`
  beside `caption.md` is the override). X is pay-per-use (~$0.015 a post, $0.20 with a link).
  TikTok caps roughly 15 to 25 posts per account per day even audited. YouTube takes video only.
  **YouTube community posts cannot be published by any API** and are recorded as permanently
  unsupported in `capabilities.ts`.
- **Security note:** every adapter strips its credentials from error text before it can reach a
  log or `last_error`; a trailing space in a pasted env var produced a Meta `code 100/33` with an
  empty message that read exactly like a permissions failure, which is why every read is trimmed.

## Meta multi-tenant OAuth: artist Fan Automations (2026-08-29, BUILT AND DARK)

ARTIST-facing, and deliberately a different product with a different threat model from the
founder publishing stack above and the founder ManyChat engine below: artists connect THEIR OWN
Instagram professional accounts (Instagram API with Instagram Login, graph.instagram.com) and
Facebook Pages (Facebook Login, graph.facebook.com), and CRWN answers comments on their posts
with the one private reply Meta permits, carrying a link into their drop funnel. Canonical
architecture, rules, and the exact Meta constraints encoded: `31-FAN-AUTOMATIONS.md`.

- **Env (all server-only):** `IG_APP_ID`, `IG_APP_SECRET`, `FB_APP_ID`, `FB_APP_SECRET`,
  `META_WEBHOOK_VERIFY_TOKEN`, `SOCIAL_TOKEN_ENC_KEY` (32-byte base64, the AES-256-GCM root for
  tokens at rest). Everything fails closed while any of them is unset, which is the feature's
  dark gate: there is no admin_settings flag.
- **Tokens are per-artist rows, NOT env vars** (the one ratified exception to the env-only
  rule): AES-256-GCM ciphertext in `artist_social_connections.access_token_enc`, table closed
  to every client role, read only by `src/lib/fanAutomations/connections.ts`. IG tokens (60-day)
  refresh via the daily `/api/cron/social-token-refresh`; Page tokens carry no expiry.
- **Webhook:** `/api/webhooks/meta` (hub.challenge GET + `X-Hub-Signature-256` POST via
  `verifyMetaSignature` in `src/lib/webhookSignatures.ts`), deduped by
  `UNIQUE(provider, comment_id)`, which is also the one-private-reply-per-comment enforcement.
- **App Review:** Standard Access runs the founder's own app-role accounts dark; real artists
  need Advanced Access (App Review + Business Verification) on every scope. The founder
  checklist lives in TODO.md.

## Calendly — booking embed (orphaned)
- **Env:** `CALCOM_API_KEY` exists in `.env.local` but **no cal.com server integration found**. `react-calendly` is installed.
- **Files:** `src/components/booking/{CalendlyBooking,SessionManager,BookingSettings}.tsx` — **none imported anywhere in `src/`**. No `[slug]/book/` page renders them. The live booking flow is **booking tokens** (`/api/booking-tokens`, `BookingTokenButton`). Backend (`booking-checkout`, `booking_sessions`) still functions but has no reachable UI entry point. **Legacy/unused.**

## Not real integrations
- **`@google/genai`** — a `package.json` dep with **zero imports under `src/`**; only used by root `.mjs` content-generation scripts (marketing carousels/thumbnails). Not part of the deployed app.
- **DiceBear** — only in `supabase/seed-*.sql` demo avatar URLs; whitelisted in `next.config.ts` `images.remotePatterns` defensively. No app code calls it.
- **`BRAVE_API_KEY`, `GEMINI_API_KEY`** — present in `.env.local` but not referenced in `src/` (likely for the `.mjs` tooling / research scripts). `Unclear`.

## Vercel — hosting + cron
- 25 crons in `vercel.json`, all ≤ daily (Hobby-plan constraint). Each cron route checks `Authorization: Bearer ${CRON_SECRET}` (100% coverage). CLI is linked to project `crwn`.
- Crons with external deps: `ai-manager`, `admin/agent/briefing`→DeepSeek(+Resend); `recruiter-*`→Stripe (`weekly-payout` retired 2026-08-11: Stripe pays artists on its own automatic daily schedule and CRWN runs no artist-payout cron); `onboarding-health`/`rls-canary`→Supabase+Resend.

## Analytics / error monitoring — ABSENT
No Sentry, PostHog, Segment, Amplitude, Mixpanel, or GA anywhere in `src/`. CRWN relies entirely on first-party tables (`admin_metrics_cache`, funnel/visit tracking). Error handling is `console.log` + `try/catch` → 500. `Confirmed`.

---

*See also: [11-SECURITY-AND-PRIVACY.md](11-SECURITY-AND-PRIVACY.md) · [12-ENVIRONMENT-AND-SETUP.md](12-ENVIRONMENT-AND-SETUP.md) · [07-BUSINESS-RULES.md](07-BUSINESS-RULES.md)*
