# Prospect Nurture (email-only calculator leads)

Long-term email nurture for artists who complete a CRWN calculator, ask for the result by email, but
do **not** create an account. It turns a one-shot result email into a versioned, calculator-aware,
consent-gated sequence that persuades the lead to make a free account and start the specific action
their calculator recommended, then exits them the instant they sign up.

This is **additive**, not a parallel system. It reuses the existing Resend sender, the global
`email_suppressions` gate, the daily Vercel cron scheduler, the `lead_magnet_leads` /
`lead_magnet_results` tables, the signup token handoff, and the `lead_magnet_events` analytics sink.
It is separate from the **platform sequences** (`platform_sequence_*`), which nurture account holders.

## Funnel

1. Lead runs a calculator on a public tool page.
2. On the result page they enter an email and check the consent box to get the result. This posts to
   `POST /api/lead-magnets/capture`.
3. The capture route stores the lead + result, sends the **transactional** result email immediately,
   and (with consent) calls `enrollProspect(...)`.
4. The daily cron `GET /api/cron/prospect-nurture` sends the next due email to each active enrollment.
5. When the lead signs up, `autoClaimForUser` runs `exitProspectNurtureForUser(...)` and the sequence
   stops. The user moves into the existing signup/onboarding/activation flows.

## Who it targets (docs/ICP.md)

Sequence **v2** is written for the CRWN ICP: a proven direct-to-fan seller whose monetization stack
is **fragmented** (Patreon, Shopify, Discord, Linktree, Gumroad, Eventbrite, email/SMS tools, YouTube
Memberships). The pitch is **consolidation**, not "streaming pays pennies" (they already know that).
The loss framing is fragmentation: stacked fees, fan lists that never talk, and offers that cannot
compound because every piece lives in a different tool. It never tells the artist their audience is
too small, that fans might not pay, or that they need a catalog/label/budget.

## Sequence lifecycle + cadence (v2)

Content lives in code (`src/lib/prospectNurture/sequence.ts`), versioned in git like the quest
catalog. `current_step` is an index into the array, so the first 11 ids/order/dayOffsets are kept
stable across the v1->v2 retune (only the copy changed); later phases are appended. Day 0 is the
transactional result email (sent by the capture route, not counted here).

| Phase | Days | Emails |
|-------|------|--------|
| P1 delivery + momentum | 1, 3 | `core.p1.recap`, `core.p1.action` |
| P2 belief building | 5, 8, 11, 14 | `core.p2.why`, `core.p2.small-or-large`, `core.p2.recalc`, `core.p2.misconception` |
| P3 practical education | 18, 24, 30, 36, 42 | `core.p3.first-step`, `core.p3.template`, `core.p3.rise`, `core.p3.proof-vs-guess`, `core.p3.recap-invite` |
| P4 objections (fragmented-stack) | 56, 63, 70, 77, 84 | `already-use-tools`, `switching-cost`, `no-time`, `stack-works`, `another-tool` |
| P5 mechanism | 100, 120 | `one-place`, `compounding` |
| P6 proof + identity | 150, 180 | `walkthrough` (labeled hypothetical), `identity` |
| P7 re-engagement | 220, 260 | `reintro` (re-run numbers), `blocker` (one-reply ask) |
| P8 authority + conversion | 300, 340, 365 | `year-contrast`, `cost-of-delay`, `final-invite` (offers "reply less" + unsubscribe) |

25 nurture emails + the day-0 transactional = 26 touches across ~12 months, cadence slowing as the
lead cools. **P9 evergreen** (a monthly post-365 track, or a behavior-triggered branch) is a
deliberate follow-up; it appends to the same array with no schema or runner change.

## Calculator-to-module mapping

One universal core serves every calculator. The `moduleQuickWin` / `moduleUseCase` blocks and the
`{{feature_name}}` / `{{hero_value}}` tokens inject calculator-specific content at render time.
`src/lib/prospectNurture/calculatorModules.ts` has an explicit module per registry slug (plus the
external `worth` tool). Any slug without one derives a module from the registry
(`featureName` + `conversionTarget.route`), so a newly added calculator is nurtured automatically.

Each module supplies: `featureName`, `quickWin` (a low-effort action this week), `firstBuild` (the
smallest first build), `useCase` (opportunity → offer), `destinationRoute` (recommended first action).

## Personalization token dictionary

Built by `buildNurtureTokens(...)` (pure, in `tokens.ts`). Every token is a string; a missing value
renders as an empty string, never `undefined` or a literal `{{token}}`.

| Token | Source | Fallback |
|-------|--------|----------|
| `first_name` | `lead_magnet_leads.artist_name` first word | `there` |
| `artist_name` | `lead_magnet_leads.artist_name` | `""` |
| `tool_name` | registry `name` | tool slug config |
| `feature_name` | registry `featureName` | derived |
| `hero_value` | `result_data.heroValue` or `estimatedMonthlyCents` | `""` |
| `monthly_value` | `hero_value` + " a month" | `""` |
| `annual_value` | `result_data.estimatedAnnualCents` | `""` |
| `result_url` | public route + `?result=<public_token>` | route without token |
| `signup_url` | `/signup?tool=<slug>&result=<token>&ref=nurture` | without token |
| `cta_label` | `continueCtaFor(slug)` | "Build This In CRWN" |
| `unsubscribe_url` | `/api/prospect-nurture/unsubscribe/<unsub_token>` | always present |

**Financial values are never recomputed in the email layer.** They come straight from the stored
result's `result_data` (the deterministic calculator output). The `numberOrFallback` block renders a
with-number line when a figure exists and a no-number line for score-only tools (Royalty, Quest Path).

## Consent, suppression, enrollment + exit rules

- **Consent:** nurture is marketing, so `enrollProspect` requires `emailConsent === true` (the capture
  form requires the consent box, whose copy covers "occasional CRWN tips"). The transactional result
  email is separate and always sent.
- **Suppression:** `isEmailSuppressed` is checked at enroll and before every send. A hard bounce,
  spam complaint, or unsubscribe is a global suppression that overrides every marketing send.
- **Dedup:** a partial unique index (`email` where `status='active'`) enforces at most one active
  nurture per email. A second calculator refreshes the active enrollment's personalization instead of
  opening an overlapping sequence.
- **Idempotency:** `prospect_nurture_sends` has `UNIQUE(enrollment_id, email_id)`, so a step can never
  be sent twice even if the cron double-runs.
- **Exit on signup:** `exitProspectNurtureForUser` cancels active enrollments (`exit_reason =
  account_created`) when the lead's email is verified into an account. The cron also double-checks
  `lead_magnet_leads.converted_user_id` before each send. An existing user is never asked to sign up.

## Behavioral attribution

Sends carry an `X-Prospect-Send-Id` header. The **signed** Resend webhook (`/api/webhooks/resend`,
`verifySvixSignature`, fails closed) updates `prospect_nurture_sends` on `delivered` / `opened` /
`clicked` / `bounced`. A hard bounce or complaint also adds the address to `email_suppressions`, which
stops the enrollment at its next cron pass.

## Admin controls

- **Inspect:** Admin → Sequences tab → "Prospect Nurture" panel (`/api/admin/prospect-nurture`,
  `requireAdmin`). Shows enrollments by status/calculator/phase, exit reasons, sends, opens, clicks,
  bounces, and conversions (enrollments that exited via `account_created`). Emails are masked.
- **Pause the whole sequence:** it is code, so there is no DB flag; to hard-stop, remove the
  `/api/cron/prospect-nurture` entry from `vercel.json` or return early in the route.
- **Pause / remove one lead:** set that enrollment's `status` to `paused` or `canceled` in Supabase.
- **Edit content safely:** edit `sequence.ts` / `calculatorModules.ts`. In-flight enrollments keep
  their `sequence_version`; historical `prospect_nurture_sends` rows are never rewritten. To force a
  clean cut, bump `PROSPECT_NURTURE_VERSION` (new enrollments pick it up).

## Resend + scheduled-job setup

- Sender: existing `FROM_EMAIL` (`CRWN <hello@thecrwn.app>`), `RESEND_API_KEY`.
- Webhook: existing signed endpoint; `RESEND_WEBHOOK_SECRET` must be set (already is). Enable the
  `email.opened` and `email.clicked` events in the Resend dashboard for open/click attribution.
- Cron: `/api/cron/prospect-nurture` daily at `30 10 * * *`, Bearer `CRON_SECRET` (already set).

## Analytics events (in `lead_magnet_events`)

`prospect_nurture_enrolled`, `prospect_nurture_refreshed`, `prospect_nurture_email_sent`
(`reason_code` = the email id), `prospect_nurture_exited` (`reason_code` = exit reason),
`prospect_nurture_unsubscribed`. Canonical funnel stages (`account_created`, etc.) continue to flow
through `funnel_events` from the existing capture + auto-claim routes; those were not changed.

## Database

Migration `supabase/schema-phase2-prospect-nurture.sql` (see it for the full self-verify block):

- `prospect_nurture_enrollments` — one row per active nurture. `lead_id`, `email`, `tool_slug`,
  `result_id`, `sequence_version`, `phase`, `current_step`, `status`, `next_send_at`, `last_sent_at`,
  `exit_reason`, `unsub_token`. Partial unique on `email` where `status='active'` (dedup).
- `prospect_nurture_sends` — send ledger. `UNIQUE(enrollment_id, email_id)` (idempotency),
  `resend_message_id`, `status`, `opened_at`, `clicked_at`.
- Additive: `email_suppressions.reason` CHECK now allows `unsubscribe`.
- RLS enabled; admin-only SELECT; the cron/admin use the service-role client.

## Testing

`npx vitest run src/lib/prospectNurture` covers deterministic number rendering, missing-field
fallback, HTML escaping, cadence/uniqueness, full calculator coverage, and the enroll/exit gates
(consent, suppression, dedup, exit-on-account).

## Manual migration + rollback

Apply in the Supabase SQL editor, any order (both are standalone):

1. `supabase/schema-phase2-prospect-nurture.sql`
2. `supabase/schema-phase2-fix-platform-sequence-copy.sql` (corrects live Pro upgrade copy)

Rollback: `DROP TABLE prospect_nurture_sends, prospect_nurture_enrollments;` (the suppression CHECK
change is additive and safe to leave). Remove the cron entry from `vercel.json` to stop sends.

## Known limitations / follow-ups

- v1 ships Phases 1-3 (weeks 0-6). Phases 4-9 are structured for but not yet written.
- The external `worth` (Streaming Loss) tool has its own capture path and is **not** yet wired to
  `enrollProspect`; only registry wizard tools enroll today. Wiring `/worth` is a follow-up.
- Instagram/DM-origin leads live in `lead_identities` and are nurtured by the existing acquisition
  follow-up system, not this one.
