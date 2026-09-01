# 30. The CRWN email system, end to end

> Written 2026-08-15 from a full scan of the repository and live queries against production, not
> from memory. `Confirmed` where a live probe backed it, `code-verified` where only the source did.
> Everything a person receives from CRWN is in here: 38 files, 58 send sites, 5 systems, 4 audiences.

## The one distinction everything hangs on

**TRANSACTIONAL** email answers something the recipient did: a receipt, a payout, a support reply, a
result they asked for. It sends regardless of marketing consent, carries no unsubscribe, and must
not be suppressed by a marketing opt-out. Refusing to send a receipt because someone left a mailing
list is a bug, not compliance.

**MARKETING** email is anything unsolicited and recurring: nurture, onboarding nudges, upgrade
prompts, win-backs, digests, campaigns. It requires explicit consent or an existing relationship, it
carries an unsubscribe, and it must check global suppression before every send.

A sender that guesses wrong in either direction is a defect. Most of the "no unsubscribe" rows in
the inventory below are correct, because they are transactional. The exceptions are listed under
Known gaps and are real.

---

## The four audiences

| Audience | Who | Systems that reach them |
|---|---|---|
| **Prospect** | Ran a calculator, gave an email, has NO account | Prospect nurture, day-0 result email |
| **Artist** | Has a CRWN account | Platform sequences, transactional, founder-triggered |
| **Fan** | Subscribes to or buys from an artist | Artist campaigns, artist sequences, fan digest, transactional |
| **Internal** | Josh, admins, recruiters, partners | Alerts, canaries, briefings, applications |

The prospect and artist boundaries never overlap: `prospect_nurture_enrollments` is keyed on an
email with no account, `platform_sequence_enrollments` on `artist_user_id NOT NULL`. Signing up
exits the first and starts the second, by design.

---

## The five systems

### 1. Prospect nurture: pre-signup, consent-gated, image-led

Full spec: [`docs/PROSPECT_NURTURE.md`](../PROSPECT_NURTURE.md). Sequence **v3**, 15 emails over 365
days plus the day-0 transactional result email. Content is code
(`src/lib/prospectNurture/sequence.ts`), versioned in git.

- **Trigger:** the optional capture card on a calculator result, with an explicit unchecked consent
  box. No consent, no enrollment; the result email sends either way.
- **Cadence:** front-loaded. 9 of 15 land inside 18 days (1, 2, 4, 6, 8, 11, 14, 18, 24, 32, 45, 60,
  120, 210, 365).
- **Personalization:** per-calculator modules inject the quick win and use case; a sub-avatar
  overrides the calculator when one resolves. Money values come from the stored result, never
  recomputed.
- **CTA:** `signup` / `result` / `auto`. `auto` resolves server-side through `decideCallRequest` and
  points a qualified opportunity-calculator lead at the existing launch-call hand-raiser. Destination
  and label only, never body copy, never who qualifies.
- **Creative:** 12 flat-vector concepts across 16 touches, banner above the copy.
- **Runner:** `/api/cron/prospect-nurture`, daily 10:30 UTC.
- **`Confirmed` 2026-08-15: it has never sent a single email.** 0 leads, 0 enrollments, 0 sends. The
  constraint was capture, not copy.

### 2. Platform sequences: post-signup lifecycle and activation

**10 sequences, 27 steps, all active, 20 real enrollments** spanning 2026-04-01 to 2026-08-13.
Unlike prospect nurture, this system has actually sent to real artists. Copy lives in the DATABASE
(`platform_sequences` / `platform_sequence_steps`), not the repo, which is why nothing in `npm test`
could see it and why it drifted badly (see History).

Four activation nudges form a strict prerequisite chain, evaluated daily by
`/api/cron/activation-nudges` (02:00 UTC). Reaching a milestone cancels its nudge.

| Trigger | Has | Missing | Stalls after |
|---|---|---|---|
| `activation_no_track` | onboarding completed | first track | 3 days |
| `activation_no_tiers` | first track | tiers created | 2 days |
| `activation_no_stripe` | tiers created | Stripe connected | 1 day |
| `activation_no_subscribers` | Stripe connected | first subscriber | 7 days |

Plus six lifecycle sequences: `new_signup`, `onboarding_incomplete`, `starter_upgrade_nudge`,
`upgrade_abandoned`, `paid_at_risk`, `paid_churned`.

- **It does NOT branch on signup origin.** A cold signup and a lead-magnet signup receive identical
  emails; no post-signup cron reads any lead-magnet or attribution signal. Verified by scan.
- **It branches on PROGRESS, not on what was built.** `tiers_created` is a boolean; nothing reads
  the ladder, the prices or the rungs.
- **Renderer:** `src/lib/emails/platformSequenceEmail.ts`, one pure module shared by the cron and
  the preview so they cannot diverge.
- **Creative:** 6 concepts bound by `trigger_type` (`platformSequenceArt.ts`), not per step, because
  a sequence is one argument escalating across its steps.
- **Runner:** `/api/cron/platform-sequences`, daily 10:00 UTC.

### 3. Fan-facing, artist-owned

Artists email their own fans. CRWN is the sender of record, so suppression and unsubscribe are
CRWN's responsibility even though the artist writes the words.

- **Campaigns** (`lib/campaignSender.ts`, `/api/campaigns/[id]/send`) are artist-composed blasts.
  Suppression and unsubscribe present.
- **Artist sequences** (`/api/cron/sequences`, 09:00 UTC) runs artist-configured fan sequences. Keyed
  on `enrollment.id`, distinct from platform sequences. Since Build 1 of the fan sales engine
  (2026-09-01), a sequence may carry a CONVERSION GOAL (`sequences.goal_tier_id`, migration
  pending): a fan holding an active subscription at or above that tier by price rank exits as
  'completed' the moment the Stripe webhook lands their purchase, the cron self-heals missed
  exits before every send, and enrollment refuses fans already past the goal. Selling Gold to
  someone who owns Gold no longer happens. Goal-less sequences are unchanged.
- **Scheduled campaigns** (`/api/cron/scheduled-campaigns`, 08:00 UTC) sends what an artist queued.
- **Fan digest** (`/api/cron/fan-digest`) is a roundup whose code is complete and **whose schedule is
  disabled**. It cannot send today. See "What actually fires".
- **New post notification** (`/api/emails/artist-new-post`), called from the app, not a cron.

### 4. Transactional

Receipts, subscription events, purchases, payouts, cashouts, referral earnings, team-split
notifications, booking tokens, release credits, support replies. Fourteen of the 58 send sites live
in `lib/webhookHandlers.ts` alone. These carry no unsubscribe **on purpose**.

### 5. Internal and founder

Daily admin briefing, the onboarding canary, the RLS canary, new-artist alerts, partner
applications, recruiter qualification, low-score survey alerts. Addressed to CRWN, not customers.

---

## What actually fires

**A route existing is not a route sending.** `vercel.json` schedules **13 crons**, and the pre-PMF
surface reduction (doc 13) deliberately left several email routes in the repo with **no schedule at
all**. Their code is complete, their tests pass, and they have never run since. Re-enable triggers
live in `UNSCHEDULED_CRON_EXCEPTIONS` (`src/lib/architecture/exceptions.ts`), which is also what
stops the architecture suite flagging them as dead.

The complete set of scheduled crons that send email, `code-verified` against `vercel.json`
2026-08-15:

| Cron | UTC | Class | Sends to |
|---|---|---|---|
| `outcome-measure` | 01:00 | (no email) | |
| `activation-nudges` | 02:00 | (no email) | enrolls only; `platform-sequences` delivers |
| `platform-crm` | 05:00 | (no email) | |
| `scheduled-releases` | 06:00 | T | fans |
| `onboarding-health` | 07:00 | I | founder, only on failure |
| `scheduled-campaigns` | 08:00 | M | fans |
| `sequences` | 09:00 | M | fans |
| `platform-sequences` | 10:00 | M | artists |
| `prospect-nurture` | 10:30 | M | prospects |
| `testimonial-requests` | 11:00 | (no email) | |
| `onboarding-reminder` | 21:00 | M | artists |
| `rls-canary` | 22:00 | I | founder, only on failure |
| `constraint-outcomes` | 02:00 | (no email) | |

**Unscheduled, code kept, cannot send:** `fan-digest`, `clipper-rate-drops`, `recruiter-qualify`,
`recruiter-recurring`, the admin agent briefing, `inactive-subscribers`, `sequence-conversions`.

So the live recurring surface is narrow: **four marketing crons and one transactional one**, plus
two canaries that stay silent unless something breaks. Everything else in the inventory below is
event-driven (a webhook, a purchase, a support reply) or is not currently reachable.

Vercel Hobby allows **one run per day maximum** per cron. Never schedule an email cron more
frequently; anything sub-daily blocks every deployment.

---

## Complete sender inventory

`suppr` = checks `isEmailSuppressed` before sending. `unsub` = emits an unsubscribe link.
`class` = T transactional, M marketing, I internal. `†` = route exists but is **not scheduled**, so
it cannot currently send.

| Sender | Sends | Class | suppr | unsub |
|---|---:|---|---|---|
| `cron/prospect-nurture` | 1 | M | yes | yes |
| `cron/platform-sequences` | 1 | M | yes | yes |
| `cron/sequences` (artist to fan) | 1 | M | yes | yes |
| `cron/fan-digest` † | 1 | M | yes | yes |
| `cron/onboarding-reminder` | 1 | **M** | **NO** | **NO** |
| `cron/scheduled-releases` | 1 | T | NO | NO |
| `cron/clipper-rate-drops` † | 1 | T | NO | NO |
| `cron/recruiter-qualify` † | 1 | I | NO | NO |
| `cron/recruiter-recurring` † | 1 | I | NO | NO |
| `cron/onboarding-health` | 1 | I | NO | NO |
| `cron/rls-canary` | 1 | I | NO | NO |
| `campaigns/[id]/send` | 2 | M | yes | yes |
| `lib/campaignSender` | 1 | M | yes | yes |
| `admin/crm/outreach` | 1 | M | yes | yes |
| `acquisition/channels` | 1 | M | yes | yes |
| `lead-magnets/capture` (day 0) | 1 | T | yes | NO |
| `lead-magnets/email` | 1 | T | yes | yes |
| `leads/calculator` (`/worth`) | 1 | T | NO | NO |
| `lead-magnets/call-request` | 2 | I | NO | NO |
| `lib/calendarReminders` | 1 | T | yes | NO |
| `lib/promiseReminders` | 1 | T | NO | NO |
| `lib/referrals` | 1 | T | NO | NO |
| `lib/teamSplits/notify` | 3 | T | NO | NO |
| `lib/webhookHandlers` | 14 | T | NO | NO |
| `emails/artist-new-post` | 1 | M | NO | NO |
| `emails/route` | 1 | T | NO | NO |
| `stripe/cashout` | 1 | T | NO | NO |
| `release-credits` | 1 | T | NO | NO |
| `bounties/[id]/submissions` | 1 | T | NO | NO |
| `support`, `support/chat`, `admin/support-chat` | 4 | T | NO | NO |
| `partner/apply` | 2 | I | NO | NO |
| `recruit/signup` | 1 | I | NO | NO |
| `notifications/new-artist-hook` | 2 | I | NO | NO |
| `popups` | 1 | I | NO | NO |
| `admin/agent/briefing` † | 1 | I | NO | NO |
| `acquisition/automationDispatcher` | 1 | M | NO | NO |
| **38 files** | **58** | | **11 yes** | **9 yes** |

---

## Consent, suppression, unsubscribe

- **`email_suppressions` is the ONE global stop.** A hard bounce, a spam complaint or any
  unsubscribe writes a row keyed on email, and every marketing sender must check it. It is global on
  purpose: unsubscribing from one CRWN email stops them all.
- **Bounces and complaints** arrive at the signed Resend webhook (`/api/webhooks/resend`,
  `verifySvixSignature`, fails closed) and suppress automatically.
- **Explicit consent** is required for prospect nurture only, because that is the one audience with
  no prior relationship. `emailConsent === true`, never pre-checked, never inferred from typing an
  email address. Artists and fans have an existing relationship, so their marketing runs on an
  unsubscribe model rather than an opt-in one.
- **Signed unsubscribe links.** `src/lib/emails/unsubscribeToken.ts` HMACs a scope
  (kind + id + artist + recipient), so a token for one person cannot unsubscribe another.
  `ALLOW_UNSIGNED_LEGACY_LINKS` is still `true` because already-sent emails carry unsigned links;
  stranding a real unsubscribe is worse than the narrow risk. Three senders still emit unsigned
  links (see TODO.md).
- **RFC 8058 one-click** (`List-Unsubscribe` + `List-Unsubscribe-Post`) on prospect nurture,
  platform sequences, campaigns and fan digest.

---

## Rendering and creative

Both nurture systems are **image-led**: a flat-vector banner above the copy, per
`CLAUDE.md` → Brand Imagery. Assets are hosted, never inlined, because a base64 payload pushes the
message past Gmail's clipping threshold and a clipped message hides the unsubscribe link.

| Set | Assets | Bound by | Registry |
|---|---:|---|---|
| Prospect nurture | 12 | per email (`NurtureEmail.art`, required field) | `prospectNurture/art.ts` |
| Platform sequences | 6 + 1 shared | per `trigger_type` | `emails/platformSequenceArt.ts` |

Manifest and prompts: [`docs/acquisition/nurture-creative-manifest.md`](../acquisition/nurture-creative-manifest.md),
`generate-nurture-art.mjs`, `generate-platform-art.mjs`.

Every email must still work with images blocked: alt text carries the concept, the argument lives in
HTML text, and both systems send a plain-text part.

---

## How to look at any of it

Email copy is the easiest thing in the codebase to ship wrong, because most of it is invisible until
someone receives it. Three tools exist so it does not have to be:

    npm run preview:emails            # 16 prospect-nurture touches, from code
    npm run preview:platform-emails   # 27 platform steps, from the LIVE database
    node scripts/verify-platform-sequence-copy.mjs   # live copy claims, exit 1 on a problem

Each preview renders through the SAME renderer that sends, so a preview cannot show something
different from what arrives. Both write a browsable HTML file with the rendered email and its
plain-text part side by side.

**Rendering finds things reading cannot.** Extracting the platform renderer immediately surfaced an
HTML injection through the artist's own display name, bullets rendering as spaced paragraphs, and
HTML-only sends. None were visible in the stored text.

---

## History worth not repeating

- **Prospect nurture shipped and never sent.** A 25-email sequence sat behind a capture card
  positioned after the builder, whose save button navigates to signup. The card was not below the
  fold, it was behind an exit. Zero leads in four months.
- **`capture_viewed` meant "mounted", not "seen".** The first instrumentation fired from a mount
  effect, counting a card three screens below the fold as an exposure. Measured on a 375x667 phone:
  mounted at y=588 with the fold at 667.
- **`sequence_version` was decorative.** It was stored and never read; the runner always indexed the
  live array, so any reorder would have jumped in-flight leads to unrelated emails.
- **The platform copy drifted for months with nothing watching.** 22 problems across 7 classes:
  invented statistics ("4x more likely", "2x more subscribers"), the wrong tier ladder (Basic
  $10 / Middle $50 / Premium $200 instead of Bronze free / Silver / Gold / Platinum), implied peer
  proof from a product with no paying artists, SMS promised after SMS was removed, Pro quoted at
  $9.99 against a real $49, legacy `?tab=` links, and em dashes in 25 of 27 steps.
- **A "fix" migration was itself stale.** `schema-phase2-fix-platform-sequence-copy.sql` asserts
  "the real Pro price is $9.99/mo", which stopped being true on 2026-07-31. Superseded by
  `schema-phase2-platform-sequence-copy-truth.sql`. Do not run the old one.
- **The platform crons ignored suppression entirely.** An artist who unsubscribed anywhere else, or
  who hard-bounced, kept receiving onboarding and upgrade emails.

The pattern in all six: the copy or the behaviour lived somewhere the test suite could not see, and
querying a table told us what we already suspected while reading or rendering told us what was
actually there.

---

## The feedback loop

Audited 2026-08-16 against production. **A send with no ledger row is a send nobody can ever ask a
question about**, and that was the state of the only system with real volume.

Four loops. Which are closed, and what closes them:

| Loop | Question it answers | State |
|---|---|---|
| **Protection** | should we stop mailing this address | **closed** |
| **Delivery** | did it arrive, was it opened, was it clicked | **closed for both ledgers** |
| **Outcome** | did the email change what the artist did | **open** |
| **Correctness** | does the copy still tell the truth | **manual** |

**Protection closes globally and always has.** A hard bounce or spam complaint at the signed Resend
webhook writes `email_suppressions`, and every marketing sender checks it. That write is
deliberately **not** gated on a send id, so it protects senders the webhook cannot otherwise see.

**Delivery now closes for both nurture ledgers.** The pattern is one shape used twice: INSERT a send
row before sending, ride the row id out as an `X-...-Send-Id` header, let the webhook write
`delivered` / `opened` / `clicked` / `bounced` back to it. `prospect_nurture_sends` has done this
since it shipped. `platform_sequence_sends` was added 2026-08-16 (migration
[`supabase/schema-phase2-platform-sequence-sends.sql`](../../supabase/schema-phase2-platform-sequence-sends.sql)).
Before it, the post-signup sequences sent **45 emails to real artists between 2026-04-01 and
2026-08-13 with no record of any of them**: the only trace was `current_step` on the enrollment.

Two properties of that ledger are load-bearing and must not be "simplified" away:

- **The UNIQUE (enrollment_id, step_number) key is the idempotency guard.** The cron INSERTs before
  it sends and reads a `23505` as "already sent". Only 23505. Every other error means the ledger is
  unavailable and the email must still go out, which is what let this ship before the founder ran
  the migration. A failed send DELETEs its row so a retry stays possible.
- **The enrollment advance happens OUTSIDE the send guard.** A row written by a run that then died
  would otherwise stall that enrollment on one step forever. The nurture cron has always done this;
  the platform one now matches.

Both halves are pinned by `src/lib/architecture/emailFeedback.test.ts`, inside
`verify:architecture`. It asserts each status against each table individually. It counted
references at first, and a mutation proved that worthless: deleting an entire `opened` branch left
enough references to keep it green.

**Outcome is the loop still open.** Nothing links a send to what the artist or fan did next. The
machinery exists for artist-to-fan sequences (`sequence_conversions` plus
`/api/cron/sequence-conversions`, which measures subscribed / purchased / upgraded / resubscribed)
and is deliberately **unscheduled**: its exception reads "Re-enable with the sequence builder", and
that builder is hidden by the pre-PMF reduction. Scheduling it would instrument a feature nobody can
reach. Leave it off until the builder returns.

**Nothing detects a silent failure.** No alert fires if an email cron errors or sends zero. There is
no CI (`.github/workflows` does not exist), so `verify:architecture` runs only when someone runs it.

Read the results at `/admin`: "Lifecycle Email Performance", broken out per `trigger_type`, because
which activation nudge actually moves an artist is the only question this ledger exists to answer.
Sequence names are editable; trigger types are the stable key.

---

## Known gaps

1. **`cron/onboarding-reminder` is marketing with no suppression check and no unsubscribe.** It
   nudges artists who have not finished onboarding, on a delay after signup. It is the one
   clearly-misclassified sender in the inventory. `code-verified`, not yet fixed.
2. **`emails/artist-new-post` and `acquisition/automationDispatcher`** are marketing-ish with
   neither gate. Lower volume, worth a decision.
3. **Three senders still emit unsigned unsubscribe links**, which is why
   `ALLOW_UNSIGNED_LEGACY_LINKS` cannot flip to false. Listed in TODO.md with the exact call sites.
4. **`/worth` capture does not write a funnel event**, so its email captures do not appear as
   `email_submitted` alongside the registry calculators.
5. **No first-paid-member attribution back to a nurture email.** It would need the enrollment id
   stamped on a funnel stage below signup.
6. **Platform sequence copy is unreachable by `npm test`**, because it lives in the database. The
   only guard is `verify-platform-sequence-copy.mjs`, which is a manual run.
7. **The outcome loop is open.** Delivery and engagement are recorded for both nurture systems, but
   nothing links a send to a signup, an activation step or a first paid member. See The feedback
   loop above.
8. **No failure detection and no CI.** Nothing alerts when an email cron errors or silently sends
   zero, and no workflow runs the gates automatically.

---

## Source map

**Prospect nurture** `src/lib/prospectNurture/` (sequence, calculatorModules, render, tokens, art,
ctaBranch, enroll, emailPreview) · `/api/cron/prospect-nurture` ·
`/api/prospect-nurture/unsubscribe/[token]` · `/api/lead-magnets/capture` · `/api/leads/calculator`

**Platform sequences** `src/lib/emails/platformSequenceEmail.ts` · `platformSequenceArt.ts` ·
`/api/cron/platform-sequences` · `/api/cron/activation-nudges` · `/api/cron/platform-crm` ·
`/api/platform-sequences/unsubscribe/[enrollmentId]` · `src/lib/activationMilestones.ts`

**Shared** `src/lib/resend.ts` · `src/lib/emails/*.ts` (37 modules: templates plus the shared renderers) ·
`src/lib/emails/unsubscribeToken.ts` · `/api/webhooks/resend` · `email_suppressions`

**Verification** `scripts/verify-platform-sequence-copy.mjs` ·
`src/lib/prospectNurture/{sequence,capture,emailPreview,calculatorModules}.test.ts` ·
`src/lib/emails/platformSequenceEmail.test.ts`
