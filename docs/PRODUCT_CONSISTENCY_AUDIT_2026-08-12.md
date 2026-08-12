# Comprehensive CRWN Product Consistency Audit

**Date:** 2026-08-12
**Status:** REMEDIATED 2026-08-12 (same day). See the "Remediation status" section directly below.
The original findings are preserved unchanged beneath it as the audit record.

---

## Remediation status (2026-08-12)

Findings executed in dependency order under ratified founder decisions A-E. Original evidence
preserved below; this table is the outcome record.

| Finding | Status | Remediation evidence |
|---|---|---|
| F-01 initial-sub net basis | **FIXED** (prospective) | `src/lib/earningsNet.ts` (`subscriptionEarningNet`) shared by both webhook paths; checkout echoes `attributed_cut`; pinned by `earningsNet.test.ts` (16 tests). **Historical: zero affected rows** — production probe found 0 positive `referral_earnings` and 0 `team_split_earnings` rows ever, so per Decision B no backfill was needed and no collaborator money moved. |
| F-02 admin "activated" = 3-of-5 | **FIXED** | Route carries `setup_progress` (preserved 3-of-5) AND canonical `activated` from `funnel_events.first_paid_conversion`; both drawn as separate chart series. Pinned by `adminActivation.test.ts`. |
| F-03 first money = memberships only | **FIXED** | Admin conversion cards read canonical activation; `first_subscriber` relabelled "First Member (memberships)". Same test file. |
| F-04 client-asserted milestones | **FIXED** | `src/lib/milestoneReconcile.ts` derives truth from canonical rows with historical timestamps, runs in the nudge cron before rule evaluation, never derives `stripe_connected`, and `shouldEnrollForRule`'s 30-day freshness window enforces Decision D (no retroactive nudge storm). Milestone route logs failures instead of swallowing them. 23 tests. |
| F-05 Post-Win delivery dark | **DISPROVEN** (worst case) / CLOSED | Production probe: `popup_engine = {"enabled": true}`, 16 `popup_events` (announcements, surveys, milestone pop-ups all delivered). All 19 registry pop-ups audited: announce_* correctly self-limit via `announcedAt` + once; flag-gated ones stay dormant behind their flags; none stale or unsafe. Post-Win is reachable and correctly silent until `first_paid_conversion` exists (zero eligible wins is not failure). No production mutation was needed. |
| F-06 chokepoint bypasses | **FIXED** | 12 types classified in `NOTIFICATION_TAXONOMY` (artist money types critical/never-deferrable; fan truths passthrough); 15 artist-facing direct inserts routed through `createNotification`; buyer confirmation split to `live_ticket_confirmed` (one type, one classification). Source-walking allowlist test: `src/lib/comms/chokepoint.test.ts`. |
| F-07 two interruption owners | **FIXED** | `selectSingleInterruption` retired; ownership split documented in `governor.ts` (governor = feed classification, Pop-up Engine = interruption arbitration); precedence invariants ported to registry assertions in `governor.test.ts`. |
| F-08 "Earn" points at missions | **FIXED** (Decision E) | Fan nav slot = "Missions" (tourId `nav-earn` kept stable); `/earn` gets an "Earnings" entry in the fan hub; fan tour copy updated. Pages NOT merged. |
| F-09 notification ≠ ledger | **FIXED** | Renewal (and initial) earning notifications render the exact stored `net_amount` (`artistNet`). Pinned in `earningsNet.test.ts`. |
| F-10 Royalty Readiness missing from hub | **FIXED** | Added to the artist hub Grow group with `hub: true`; the page's wizard Exit/Done are hub-aware (`requestHubReopen`). |
| F-11 docs call live things dark | **FIXED** | CLAUDE.md + doc 22 corrected (fan-campaigns migration applied; quest/popup engines live). `CLAUDE.md` added to `brainContract.test.ts`'s canonical doc list — the gap this drift escaped through. |
| F-12 fan hub incomplete | **FIXED** | My calendar, Missions, Earnings, My missions, My squads, My bounties, My impact indexed in the fan hub, grouped, all verified live routes. |
| F-13 no tours on complex surfaces | **FIXED** | Tours shipped for Manager, Promise Calendar, Team Splits, Fan Drives only (per audit scope), via shared `HubPageTour` mounted inside the gated content; copy states each system's actual boundary (Manager doesn't own priority; Calendar = fan promises; Splits = allocation not a payout rail; Drives = non-cash, canonical-rail-derived). |
| F-14 "Action Plan" leak | **FIXED** | `/missions` label now "Needs You"; `ownership.test.ts` extended to walk ALL of src/app + src/components for the retired label. |
| F-15 four auth implementations | **FIXED** (scoped) | 11 admin routes consolidated onto `requireAdmin` (semantics identical: session + `profiles.role`). Deliberately NOT converted: cron-secret routes (`agent/autonomous`, `agent/briefing`), the public outreach tracking pixel/unsubscribe links, and `admin/track`'s internal-secret design — different semantics, correctly so. Inline `requireArtistOwner`-equivalent checks on artist routes were left: each verified correct, and per the task, specialized authorization is not replaced merely for grepability. |
| F-16 milestone route misfiled | **FIXED** | Canonical `/api/artist/milestone`; `/api/admin/milestone` is a documented compatibility wrapper (`export { POST }`); all 7 client call sites repointed. |
| F-17 em dash in artist copy | **FIXED** | LivestreamManager copy uses parentheses. Admin `'—'` empty-cell glyphs deliberately untouched. |
| F-18 dead Post-Win exports | **DISPROVEN** | `REFERRAL_DESTINATION` is consumed by `buildReferralLink` itself; `ARTIST_REF_PARAM` is a pinned boundary contract in `postWinReferral.test.ts` ("artist_ref, never ref"). Both KEPT; removing them would delete a drift assertion, not dead weight. |
| F-19 clawback scan O(refunds x deals) | **DEFERRED WITH REASON** | Production measured 2026-08-12: 0 refund earnings, 0 active deals, 0 accrual rows. Bounding now trades audited correctness for an unfelt win. Deferral + the correct future approach (watermark, not fixed window) documented in the cron itself. |

**Verification:** suite 1604 → **1671 tests, all passing**; `npm run build` exit 0; no migrations;
no schema; **no production mutations** (Decision A's flag was already on; probes were read-only).

---

## ORIGINAL AUDIT RECORD (unchanged below)

**Original status line:** FINDINGS ONLY. **NOT SHIPPED.** No product code, schema, migration or behavior was changed by this audit.
**Branch at time of audit:** `claude/rise-mode-full-journey`
**Baseline:** `npx vitest run` 91 files / 1604 tests passing. `npm run build` exit 0.

This document is the input to the next task, "Execute the Comprehensive CRWN Product Consistency
Audit Findings." Every finding below cites the file and line evidence it was derived from. Where
evidence was unavailable, the finding is marked UNKNOWN rather than guessed.

`CLAUDE_PROMPT_FRAMEWORK.md` does not exist anywhere in the repository. Reported once, per the
operating manual, and the audit proceeded.

---

## 0. What this audit found in one paragraph

CRWN's recent architectural work is real and it holds. The Z3/Z4/Z5 ownership boundaries, the
Constraint Engine's single-issuer rule, the canonical first-paid recorder, the payout-ownership
lockdown and the Team Splits clawback path are not merely documented, they are asserted against
source by tests that fail when violated. That is a genuinely strong foundation and most of this
audit's checks came back clean. The weaknesses are not in the core; they are at three edges:
**one money-ledger asymmetry where two rails can be paid from the same dollar**, **a measurement
layer that reports activation using a definition the product abandoned**, and **several complete,
tested systems whose only delivery surface is switched off**. None of these is currently
destroying data or leaking money at scale, so there is no P0. Several are P1 because they make
CRWN's own dashboard lie to the founder about whether the business is working.

---

## 1. Current product inventory (established, not assumed)

Enumerated directly from the repository, not from documentation.

| Surface | Count | Notes |
|---|---|---|
| App pages (`page.tsx`) | 115 | includes 3 route groups plus `[slug]` public artist pages |
| API routes (`route.ts`) | 241 | |
| Cron routes on disk | 25 | |
| Crons scheduled in `vercel.json` | 25 entries, 24 distinct cron routes + `/api/admin/agent/briefing` | |
| Unscheduled cron route | 1 (`team-split-selfcheck`) | **Deliberate.** Documented in-file as manual-trigger only. Not a defect. |
| SQL files in `supabase/` | 161 | |
| Feature flags in `admin_settings` | 7 (`acquisition_engine`, `experiments`, `live_tips`, `popup_engine`, `producer_sessions`, `quest_engine`, `royalty_readiness`) plus `artist_gate`, `frl_cost_assumptions` | |
| Studio tiles | 16 | |
| AccountHub entries (artist) | 33 | |
| Tour step modules | 19 | |
| Pages mounting `usePageTour` | 14 | |

**Production migration probe** (read-only, anon key, via `npm run verify:migrations`):
20 of 22 probed migrations applied. **Two NOT applied:**
`schema-phase2-membership-strategy.sql` and `schema-phase2-track-waterfall.sql`.
Both are correctly listed in `TODO.md` (lines 138 and 178).

`schema-phase3-fan-campaigns.sql` **is applied**, so the Virality Engine is no longer dark at the
database. `docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md` and `CLAUDE.md` still describe it as
"dark until the migration runs." See F-11.

---

## 2. Findings

Severity definitions used, and deliberately not inflated:
**P0** money moving wrongly right now, data loss, or a live security hole.
**P1** contradictory product behavior, duplicate financial authority, or a measurement CRWN steers by that is wrong.
**P2** meaningful inconsistency, confusing UX, stale system.
**P3** cleanup, terminology, maintainability.

**P0 count: 0. P1 count: 5. P2 count: 8. P3 count: 6.**

---

### P1

#### F-01 — Two rails can be paid from the same dollar on a referred first subscription

**Finding.** On the INITIAL subscription checkout, `earnings.net_amount` is written as
`gross - platformFee` using only the BASE platform fee. It does not subtract the referral or
clipper commission, even though Stripe charged the artist `platformFee + attributedCut`. The
RENEWAL path does subtract it. Team Splits then accrue a collaborator's share from that inflated
`net_amount`.

**Evidence.**
- `src/lib/webhookHandlers.ts:137` initial sub writes `net_amount: netAmount` where
  `netAmount = grossAmount - platformFee` (line 136).
- `src/lib/webhookHandlers.ts:499` renewal writes `net_amount: netAmount - referralCommission`.
- `src/app/api/stripe/checkout/route.ts:193` `const effectiveFeePercent = platformFeePercent + attributedCut;`
  and line 256 passes it as `application_fee_percent`. Stripe therefore takes base + cut from the artist.
- `src/lib/referrals.ts:96` computes and pays `commissionAmount` from that same initial earning
  (`processReferral` is called at `webhookHandlers.ts:293` with `earningId`).
- `src/lib/teamSplits/allocation.ts:31` `const basis = deal.payout_basis === 'gross_revenue' ? earning.gross_amount : earning.net_amount;`
- `src/lib/teamSplits/allocation.ts:9-11` header comment states the basis is "already net of platform
  fee and, **on renewals**, fan/clipper commission." The qualifier is an admission that the initial
  payment is not.

**Current behavior.** For a referred first subscription with an active tier Team Split deal, the
referrer is paid their commission AND the collaborator's percentage is computed on a basis that
still contains that commission. The artist's own ledger row also overstates their real take by the
commission amount.

**Why inconsistent.** `earnings.net_amount` is documented and consumed as the artist's true take
(`allocation.ts` header). On one of the six rails it is not.

**Impact.** Collaborator over-accrual on referred first payments. Artist-facing earnings
overstatement. Not a payout hole: `/api/stripe/balance` reads Stripe directly
(`src/app/api/stripe/balance/route.ts:29`), so no phantom money can be cashed out. Bounded to
artists who run a referral or clipper program AND have a Team Split deal.

**Disposition.** Make the initial path mirror the renewal path. Decide separately whether existing
`team_split_earnings` rows are corrected or left.

**Risk of changing it.** Medium. Touches the highest-traffic webhook handler. A wrong edit changes
what every artist is told they earned. Must not alter `platform_fee`, which is deliberately the
platform's base cut so admin revenue stays correct (`webhookHandlers.ts:456-459`).

**Founder clarification required:** YES. Backfill of already-accrued collaborator rows is a money
decision, not an engineering one.

**Dependencies.** None. Do this first.

---

#### F-02 — The admin dashboard defines "activated" as three of five setup milestones, not first paid

**Finding.** `/api/admin/funnel` computes weekly `activated` as "has at least 3 of 5 milestones"
drawn from `onboarding_completed`, `first_track_uploaded`, `tiers_created`, `stripe_connected`,
`first_subscriber`. CRWN's product definition of activation is the first paid member.

**Evidence.**
- `src/app/api/admin/funnel/route.ts:126-131`, comment `// "Activated" = has at least 3 of 5 milestones`.
- Canonical definition: `src/lib/analytics/paidConversion.ts:1` "the ONE definition of an artist's
  first paid fan conversion."
- `docs/crwn-brain/20-FIRST-REVENUE-LAUNCH-OFFER.md` and the FRL work treat first paid member as activation.

**Current behavior.** An artist who finished onboarding, uploaded a track and created tiers counts
as activated with zero fans and zero dollars.

**Impact.** The founder's primary activation chart can rise while no money moves. This is the
metric most likely to produce a wrong strategic decision.

**Disposition.** Rename the existing metric to what it measures (`setup_progress`) and add a
separate activation series sourced from `funnel_events` `first_paid_conversion`. Do not silently
redefine the existing series, or the historical trend becomes uninterpretable.

**Risk.** Low. Read-only analytics route.

**Founder clarification required:** YES, on whether the old series is kept alongside the new one.

**Dependencies.** Pairs with F-03. Same route, same fix window.

---

#### F-03 — Admin reports first money from one rail while the canonical recorder covers six

**Finding.** `funnel.first_subscriber` counts `activation_milestones.first_subscriber`, which is
written only from the subscription webhook. `recordFirstPaidConversion` covers six rails.

**Evidence.**
- `src/app/api/admin/funnel/route.ts:80`.
- `recordActivationMilestone(artist_id, 'first_subscriber')` appears exactly once in production
  code: `src/lib/webhookHandlers.ts:214` (subscription checkout only).
- `src/lib/analytics/paidConversion.ts:34-41` `PAID_CONVERSION_KINDS` = subscription, product,
  track, booking, live_ticket, live_tip. Six call sites in `webhookHandlers.ts` (lines 223, 934,
  1237, 1433, 1577, 1705).

**Current behavior.** An artist whose first dollar was a track sale, booking, live ticket or tip
shows as never having a first subscriber in admin, while `funnel_events` correctly records them as
converted. Two admin surfaces disagree about the same artist.

**Impact.** Under-reports monetized artists. Understates every rail that is not memberships,
exactly the rails CRWN recently invested in.

**Disposition.** Read first money from `funnel_events.first_paid_conversion` in admin. Keep
`first_subscriber` as a membership-specific sub-metric if it is still wanted.

**Risk.** Low.

**Dependencies.** Same batch as F-02.

---

#### F-04 — Activation milestones are client-asserted, unreconciled, and the nudge chain fails silently on a single lost write

**Finding.** Four of the six activation milestones are written by a fire-and-forget browser fetch
to a route that swallows every error. The activation nudge rules are chained on prerequisites, so
one lost write permanently silences every downstream lifecycle email for that artist. Only
`stripe_connected` has a reconciler.

**Evidence.**
- Client writers: `src/app/setup/page.tsx:489` (`onboarding_completed`), `:813`
  (`first_track_uploaded`), `src/components/artist/TrackUploadForm.tsx:576`,
  `src/components/artist/TierManager.tsx:321` (`tiers_created`),
  `src/components/onboarding/OnboardingProjectUpload.tsx:103` (`first_project_created`).
- `src/app/api/admin/milestone/route.ts:42` `catch { return NextResponse.json({ ok: true }); }`
  with the comment `// Silent fail — tracking should never break the app`.
- Server writers, only two: `src/lib/stripe/connectReconcile.ts:105` and `src/lib/webhookHandlers.ts:214`.
- Chained rules: `src/app/api/cron/activation-nudges/route.ts:19-43`. Each rule carries
  `requiresMilestone`, forming `onboarding_completed` to `first_track_uploaded` to `tiers_created`
  to `stripe_connected` to `first_subscriber`.
- `src/app/api/cron/activation-nudges/route.ts:110` `if (!prereqTimestamp) continue;`
- Reconciler precedent for one milestone only: `src/app/api/artist/roadmap/route.ts:125-145`.

**Current behavior.** Fails closed, which is the correct direction: a missing milestone produces
no nudge rather than a false one. But it means an artist who did the work and lost the write
receives none of the remaining activation sequence, forever, and the cron reports success.

**Impact.** Silent, unobservable loss of the onboarding lifecycle email product for an unknown
fraction of artists. Also degrades F-02 and F-03's inputs, and the admin agent's briefing, which
reads the same field (`src/app/api/admin/agent/scopes.ts:56`, `:261`).

**Why this matters more than it looks.** This is the same shape as the previously recorded
incident where a cron took its lock, returned 200 and did nothing. The failure is invisible by
construction.

**Disposition.** Derive these milestones server-side from the data that already proves them (a
`tracks` row exists, a `subscription_tiers` row exists) rather than trusting a browser, exactly as
the Quest Engine's `DomainCheck` evaluator already does. Do not add a second parallel evaluator;
reuse `src/lib/quests/evaluator.ts` facts.

**Risk.** Low to medium. Backfilling milestones will retroactively enroll artists in nudge
sequences unless the backfill also stamps them as already past.

**Founder clarification required:** YES. Backfilling could email artists who onboarded months ago.

**Dependencies.** Do before F-02/F-03 land, or the corrected dashboards will be fed the same
degraded input.

---

#### F-05 — Post-Win Referral's only delivery surface is the dark-launched Pop-up Engine

**Finding.** `src/lib/postWinReferral.ts` is complete, pure, tested (284-line test file) and
documented (`docs/crwn-brain/25-POST-WIN-REFERRAL.md`). Its link reaches an artist through exactly
one surface: the `artist_post_win_referral` pop-up. `/api/popups` returns
`{ enabled: false, popup: null }` unless `admin_settings.popup_engine` is on, which `CLAUDE.md`
documents as off by default.

**Evidence.**
- Only consumer of `buildReferralLink`: `src/app/api/popups/route.ts:65`.
- Hard gate: `src/app/api/popups/route.ts:38-40`.
- `ARTIST_REF_PARAM` and `REFERRAL_DESTINATION` are exported and have zero consumers anywhere.
- Attribution side is wired and correct: `src/lib/analytics/campaignAttribution.ts:236` reads
  `artist_ref`, deliberately never `ref` (line 235 comment).

**Current behavior.** UNKNOWN in production. I cannot read `admin_settings` (admin-gated, and this
audit is read-only). If the flag is off, no artist has ever been offered their referral link, the
`artistReferrer` attribution dimension will always be empty, and every feature announcement pop-up
CRWN has shipped under the "announce shipped features with a pop-up" standing rule has also never
been delivered.

**Impact.** Potentially an entire growth system, plus the entire announcement channel,
unreachable. High leverage for a one-row flag flip.

**Disposition.** Founder confirms the production value of `popup_engine`. If off, decide whether to
flip it or give Post-Win Referral a second, non-pop-up surface (Rise Mode after a proven win is the
natural home, and it is where the win is already known).

**Risk.** Low to flip. But flipping `popup_engine` activates every registered pop-up at once,
including announcements whose `announcedAt` logic then starts firing.

**Founder clarification required:** YES, and this is the single highest-value question in this document.

**Dependencies.** None.

---

### P2

#### F-06 — Nine files bypass the notification chokepoint; twelve notification types are invisible to the governor

**Finding.** `createNotification` is documented as "THE notification chokepoint" through which
"every CRWN notification is written." Nine other files insert into `notifications` directly, and
twelve of the types they write are absent from the governor's taxonomy.

**Evidence.**
- Chokepoint claim: `src/lib/notifications.ts:6-8`.
- Direct inserters: `src/lib/webhookHandlers.ts` (15 inserts), `src/lib/milestones.ts`,
  `src/lib/promiseTasks.ts`, `src/lib/referrals.ts`, `src/lib/bountyNotify.ts`,
  `src/app/api/city-unlocks/[id]/contribute/route.ts`, `src/app/api/cron/clipper-rate-drops/route.ts`,
  `src/app/api/promise-calendar/events/[id]/route.ts`, `src/app/api/release-credits/route.ts`.
  (`messages/broadcast` and `notifications/notify-subscribers` also insert directly but are
  artist-authored or fan-facing, which the taxonomy exempts by design. Not defects.)
- Unclassified types: `refund`, `dispute`, `live_ticket`, `live_tip`, `new_booking`, `milestone`,
  `referral_earning`, `city_unlocked`, `clipper_rate_change`, `promise_fulfilled`,
  `release_credit`, `bounty_available`. None appear in `NOTIFICATION_TAXONOMY`
  (`src/lib/comms/taxonomy.ts:117-165`).
- No test asserts the chokepoint. `src/lib/comms/governor.test.ts:263-271` only inspects
  `notifications.ts` itself.

**Current behavior.** Nothing is lost. Unknown types deliver by design
(`src/lib/comms/taxonomy.ts:96-98`), which is the correct failure direction. But the governor
cannot order or rank the money-critical types (`refund`, `dispute`) it most needs to rank, which is
the stated purpose of G2.

**Disposition.** Classify the twelve types. Route the artist-facing CRWN inserts through
`createNotification`. Leave the fan-facing and artist-authored ones alone. Add the regression test.

**Risk.** Low. Classification is additive; the governor cannot suppress anything in V1 except a
deferrable growth message under positive evidence.

---

#### F-07 — Two independent interruption governors, one of them unwired

**Finding.** `selectSingleInterruption` in `src/lib/comms/governor.ts:136` has zero production
callers. The live interruption cap is a separate, unrelated implementation inside the Pop-up
Engine.

**Evidence.** Grep for `selectSingleInterruption` returns only `governor.ts` and its own test.
Live cap: `src/lib/popups/index.ts:83` and `:117` ("Global governor: at most one shown pop-up per
calendar day").

**Impact.** The comms taxonomy's class precedence never applies to interruptions, so a celebration
pop-up and a fan-obligation pop-up are ordered by pop-up registry rules, not by `CLASS_ORDER`. Two
systems own "which interruption wins."

**Disposition.** Either wire the Pop-up Engine's selection through `selectSingleInterruption`, or
delete it and record that the Pop-up Engine owns interruption arbitration. Do not leave both.

**Risk.** Low.

---

#### F-08 — "Earn" in navigation points at missions; the actual earnings page is elsewhere

**Finding.** The fan bottom-nav slot and the fan AccountHub entry are both labelled "Earn" and both
route to `/command`, the missions screen. The page that shows a fan's held, available and paid
balances is `/earn`.

**Evidence.**
- `src/components/layout/Navigation.tsx:33` `const fanSlot = { href: '/command', label: 'Earn', ... }`
- `src/components/layout/AccountHub.tsx:262` `{ label: 'Earn', href: '/command', icon: Coins }`
- `/earn` is only reachable from `SupporterMode.tsx:246`, `EarnWithArtist.tsx:216`,
  `questRoutes.ts:21` and `:87`, and a bounty notification link
  (`src/app/api/bounties/[id]/submissions/route.ts:122`).

**Impact.** A fan who is told they earned a commission and goes looking for "Earn" lands on
missions and cannot find their money. Directly harms the Share-to-Earn and Clip-to-Earn loops.

**Disposition.** Rename the nav slot to what it is (Missions or Command) and give `/earn` a real
entry point, or merge the two screens. `/earn` and `/command` are genuinely different jobs, so
merging is not obviously right.

**Risk.** Low, but the tour anchor `tourId: 'nav-earn'` and any tour copy referencing it must move
together.

---

#### F-09 — Renewal earning notification shows a different number than the ledger records

**Finding.** On renewal, the artist notification renders `netAmount`, computed before the referral
commission is subtracted. The `earnings` row stores `netAmount - referralCommission`.

**Evidence.** `src/lib/webhookHandlers.ts:499` (row) versus `:534` (notification title
`+$${(netAmount / 100).toFixed(2)}`).

**Impact.** The artist is told they earned more than their payouts screen will show. Small amounts,
but it is a money number that does not reconcile.

**Disposition.** Use the same value in both. Trivial once F-01 settles which value is canonical.

**Dependencies.** Do together with F-01.

---

#### F-10 — Royalty Readiness is in Studio but missing from AccountHub, violating the documented navigation rule

**Finding.** `CLAUDE.md` states AccountHub is the COMPLETE index and "if you add a destination to
Studio, add it here too." `/royalty-readiness` is a Studio tile and is absent from AccountHub.

**Evidence.** Studio tile: `src/app/(main)/studio/page.tsx` (`href: '/royalty-readiness'`,
`title: 'Royalty Readiness'`). No matching entry in `src/components/layout/AccountHub.tsx`.

**Impact.** Small, but the rule exists precisely so there is no wrong place to look.

**Disposition.** Add it. Also add the regression test that pins Studio-to-Hub parity, which is what
would have caught this.

---

#### F-11 — Documentation calls the Virality Engine dark; production has the migration applied

**Finding.** `CLAUDE.md` and `docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md` describe Fan
Drives as "dark until `supabase/schema-phase3-fan-campaigns.sql` runs." The production probe
reports `fan campaigns` and `fan campaign participants` as applied and readable.

**Evidence.** `npm run verify:migrations` output, 2026-08-12.

**Impact.** Documentation drift of the exact class the `brainContract.test.ts` pattern exists to
catch. A future agent will defer work believing the feature is dark.

**Disposition.** Update the docs and add the fact to `src/lib/brainContract.test.ts`.

**Note.** Two migrations genuinely ARE unapplied (`membership-strategy`, `track-waterfall`), and
both fail soft correctly. The waterfall pass in
`src/app/api/cron/scheduled-releases/route.ts:30-56` is fenced in its own try/catch and checks
`wfErr`, so the rest of the release cron is unaffected. That is good engineering and should be the
template.

---

#### F-12 — Fan management surfaces are absent from the fan hamburger

**Finding.** The fan AccountHub lists only Explore, Library, Earn, Your info, Notification
preferences, Help Center, Getting started and Replay tour. `/impact`, `/my-calendar`,
`/my-missions`, `/my-squads`, `/my-bounties` have no hamburger entry.

**Evidence.** `src/components/layout/AccountHub.tsx`, fan group.

**Impact.** Fans cannot navigate to their own commitments. The artist side got the complete-index
treatment; the fan side did not.

**Disposition.** Apply the same rule to the fan hub.

---

#### F-13 — The newest and most complex surfaces have no page tour

**Finding.** 19 tour modules exist and 14 pages mount `usePageTour`. The surfaces with tours are
mostly the older campaign and mission screens. The systems introduced by the recent architecture
work have none.

**Evidence.** Pages with `usePageTour`: command, profile/artist, action-plan, bounties,
campaign-hub, campaigns, city-unlocks, clip-controls, missions, missions/suggestions, offers,
playbooks, proof-of-demand, squads. **Without:** `/studio/manager`, `/studio/promise`,
`/studio/team`, `/studio/sync`, `/studio/analytics`, `/studio/live`, `/fan-campaigns`,
`/royalty-readiness`.

**Impact.** Manager, Promise Calendar and Team Splits are the three surfaces where a wrong mental
model has financial consequences, and they are the three with no guidance.

**Disposition.** Add tours to Manager, Promise Calendar, Team Splits and Fan Drives only. Per the
prompt's instruction, do NOT add tours everywhere by default; the other four are legible enough.

---

### P3

#### F-14 — Retired vocabulary "Action Plan" still rendered in user-facing UI

`src/app/missions/page.tsx:173` renders a button labelled "Action Plan" pointing at
`/action-plan`. The surface was renamed to "Needs You" and `src/lib/constraint/ownership.test.ts:65-72`
pins the new name, but only for `studio/page.tsx` and `AccountHub.tsx`, so this leaked. Fix the
label, extend the test's file list.

#### F-15 — Four implementations of the admin gate, four of the artist-ownership gate

17 admin routes do not use `src/lib/auth/requireAdmin.ts`. **None of them is unguarded**: they use
an inline `profiles.role !== 'admin'` check, a local `verifyAdmin()` helper, or `CRON_SECRET`.
Likewise ~22 routes take a caller-supplied `artistId` without `requireArtistOwner`, and every one
spot-checked (`fan-contacts`, `audience`, `campaigns`, `smart-links`, `discount-codes`,
`marketing-costs`) enforces ownership inline via `.eq('id', artistId).eq('user_id', user.id)`.
**This is a consistency and maintainability finding, not a security hole.** Consolidating onto the
two shared helpers is what makes future coverage auditable by grep.

#### F-16 — `/api/admin/milestone` is a self-service artist route filed under `/api/admin/`

`src/app/api/admin/milestone/route.ts` authenticates the user session and writes only that user's
own artist row. It is correctly authorized but wrongly located. Any future "lock down everything
under /api/admin" sweep silently breaks onboarding tracking.

#### F-17 — One em dash in artist-facing copy

`src/components/artist/LivestreamManager.tsx:713` `'Seat price — suggested for your level'`.
Six further instances in `src/components/admin/*` are placeholder glyphs for empty table cells
(`'—'`), which is a different thing; treat separately. All other em dashes found in `src/` are in
code comments and are out of scope for the copy rule.

#### F-18 — Dead exports in Post-Win Referral

`ARTIST_REF_PARAM` and `REFERRAL_DESTINATION` (`src/lib/postWinReferral.ts`) have no consumers.
Keep if F-05 resolves toward a second surface; otherwise they are the only unused surface area in
that module.

#### F-19 — Team Split clawback scan is O(refunds x deals) daily

`applyClawbacks` (`src/app/api/cron/team-split-accruals/route.ts:135-190`) re-reads every refund
row for the artist on every deal every day, then issues a per-refund query. Correct today, will not
stay cheap. Bound it by refund `created_at` once volume justifies it, not before.

---

## 3. Product ownership matrix

| Responsibility | Canonical owner | Secondary consumers | Conflicting owners | Source of truth | Status | Recommended change |
|---|---|---|---|---|---|---|
| What matters now (diagnosis) | Constraint Engine (`src/lib/constraint/engine.ts`) | Manager (voice), Rise Mode, `resolveOperatingFlow` | None found | `readConstraint` evidence | **Sound.** Pinned by `constraint/ownership.test.ts` | None |
| Issuing a recommendation (Z3) | `/api/artist/constraint` only | Campaigns store Z3's `actionKey` | None found | `recordIssuedRecommendation` | **Sound.** Single writer asserted by test | None |
| Launch readiness | Roadmap (`src/lib/artistRoadmap.ts`) | LaunchReview, Rise Mode | None; Action Plan's re-derivation was removed and is test-pinned | Derived on read, stored nowhere | **Sound** | None |
| Execution and progress | Rise Mode / Quest Engine | Roadmap card | None | `quest_instances` + DomainChecks | **Live** (flag verified on 2026-08-11) | None |
| Real events and deadlines | Needs You (`/api/action-plan`) | Studio, AccountHub | None; strategy rules removed | Advisory, writes nothing | **Sound** | Fix stale label (F-14) |
| Fan obligations | Promise Calendar | Manager, comms taxonomy, fan eligibility | None found; `fanPromiseBoundary.test.ts` guards it | `promise_calendar_*` | **Sound** | None |
| Artist attention (feed) | Communications Governor via `createNotification` | 12 producers | **9 files bypass it** | `notifications` | **Partial** | F-06 |
| Artist attention (interruption) | Pop-up Engine | none | **`selectSingleInterruption` is a second, unwired owner** | `popup_events` | **Conflict** | F-07 |
| First paid conversion | `recordFirstPaidConversion` | funnel analytics | **Admin funnel uses `first_subscriber`** | `funnel_events` dedupe on artist | **Conflict** | F-03 |
| Activation | First paid member (product) | FRL, Money Model | **Admin funnel uses 3-of-5 milestones** | disputed | **Conflict** | F-02 |
| Setup milestones | `recordActivationMilestone` | admin funnel, nudges, agent, roadmap, quests | Client-asserted, unreconciled | `artist_profiles.activation_milestones` | **Fragile** | F-04 |
| Artist take per sale | `earnings.net_amount` | Team Splits, payouts UI, admin | **Initial-sub path disagrees with renewal path** | `earnings` | **Conflict** | F-01 |
| Artist payout timing | **Stripe** (Express, automatic daily) | none | None; pinned by `payoutOwnership.test.ts` | Stripe | **Sound and well defended** | None |
| Artist cashout | `/api/stripe/cashout` only | none | None; test asserts it is the only `payouts.create` | Stripe balance | **Sound** | None |
| Platform plan truth | Stripe, reconciled by `platformPlanReconcile.ts` | billing screen | `artist_profiles.platform_tier` is a claim | Stripe | **Sound, documented** | None |
| Referral ownership | `referrals` row, original referrer locked | checkout fee, webhook payout | None | `referrals` | **Sound** | None |
| Artist-to-artist advocacy | Post-Win Referral | attribution parser | None | `artist_ref` dimension | **Built, delivery dark** | F-05 |
| Campaign outcomes | Derived from canonical rails | admin | None; `campaigns/boundaries.test.ts` guards | referrals + participants + window | **Sound** | None |
| Fan entitlement | Server-side gate + `useSubscription` | 13 gated consumers, preview lens | None | `allowed_tier_ids` / `is_free` | **Sound** | None |

---

## 4. Feature disposition map

| System | Disposition | Reasoning |
|---|---|---|
| Constraint Engine | **KEEP** | Single diagnosis owner, test-defended. The spine of the operating flow. |
| Roadmap / launch gating | **KEEP** | Derived on read, stores nothing, no competing owner. |
| Rise Mode / Quest Engine | **KEEP** | Live, verified against production. Catalog rewrite remains outstanding, separately. |
| Needs You | **KEEP + BOUND** | Correctly stripped of strategy. Only the stale `/missions` label remains. |
| Manager | **KEEP + BOUND** | Subordinate to Constraint by prompt contract, asserted by test. Needs a tour (F-13). |
| Promise Calendar | **KEEP** | Clean boundary, well tested. Needs a tour. |
| Communications Governor | **KEEP + BOUND** | Feed channel is real. Interruption channel is unwired and must be resolved either way (F-07). |
| Pop-up Engine | **INVESTIGATE FURTHER** | Production flag state unknown. It gates Post-Win Referral and every announcement. |
| Post-Win Referral | **INVESTIGATE FURTHER** | Correct and complete. Reachability unknown (F-05). |
| Virality Engine / Fan Drives | **KEEP** | Boundaries genuinely enforced. Docs say dark, production says applied (F-11). |
| Team Splits | **KEEP + BOUND** | Allocation, capping and clawback are careful and correct. Basis input needs F-01. |
| Membership Strategy | **DARK-LAUNCH (unchanged)** | Migration unapplied, fails soft, in TODO. Correct state. |
| Release waterfall | **DARK-LAUNCH (unchanged)** | Same. The fail-soft fencing is the template for others. |
| `/earn` vs `/command` | **RENAME** | Two real jobs, one shared label (F-08). |
| Royalty Readiness | **RELOCATE (add to Hub)** | Violates the documented navigation rule (F-10). |
| `/api/admin/milestone` | **RELOCATE** | Self-service route misfiled under admin (F-16). |
| `selectSingleInterruption` | **MERGE or RETIRE** | Must not remain a second dormant owner. |
| `team-split-selfcheck` cron | **KEEP** | Deliberately unscheduled, documented, manual-trigger verification. Not dead code. |
| `artist/[slug]` route | **KEEP** | A 10-line redirect to `/[slug]`. Not a legacy bypass; checked. |
| SMS residue (`sms_subscribers`, cost model) | **KEEP for now** | Unsubscribe path still clears legacy rows, which is correct. Cost model references in admin are stale but harmless. |

---

## 5. Journey contradictions, ranked by likelihood of confusing or harming an artist or fan

1. **Operating, admin-facing.** The founder sees activation climbing while no artist has taken a dollar (F-02). Most likely to cause a wrong company decision.
2. **Onboarding to lifecycle.** An artist does the work, a browser write is lost, and CRWN stops nudging them entirely and never notices (F-04).
3. **Collaboration and money.** A referred first subscription pays the referrer and then pays a collaborator a share of the same money (F-01).
4. **Growth.** An artist proves a win and is never offered the referral link because its only surface is switched off (F-05).
5. **Fan money.** A fan earns a commission, taps "Earn," and lands on missions (F-08).
6. **First paid.** An artist's first dollar arrives via a track sale and admin reports them as never converted (F-03).
7. **Operating.** The artist is told "+$5.00" and the payouts screen shows less (F-09).
8. **Navigation.** An artist looks for Royalty Readiness in the complete index and it is not there (F-10).
9. **Fan navigation.** A fan has no route to their own calendar, missions, squads or bounties (F-12).
10. **Terminology.** "Action Plan" appears on `/missions` after the product renamed it to Needs You (F-14).
11. **Education.** Manager, Promise Calendar and Team Splits offer no guidance on first use (F-13).

---

## 6. Verdicts

**Financial consistency.** One real defect (F-01), bounded, with a decision required on remediating
existing rows. Everything else traced clean: payout ownership is Stripe's and is defended by a test
that walks every cron; cashout is the single CRWN-initiated payout; refunds claw back both referral
and Team Split commissions; the platform-plan double-subscribe guards are intact; `platform_fee`
is deliberately preserved as the platform's base cut so admin revenue is not polluted by
pass-through commission. This is a well-built money layer with one asymmetry.

**Security and permissions.** No holes found. Every admin route is authorized; every spot-checked
artist route enforces ownership. The revoked-column discipline holds. The finding here is
consistency of implementation (F-15), not exposure. I did not find an IDOR, a caller-trusted
artist id, or a missing admin gate.

**Admin truthfulness.** The weakest area. Two headline metrics measure something other than what
they are named (F-02, F-03) and both are fed by a fragile client-asserted field (F-04). The newer
measurement systems (funnel events, opportunity ledger, paid conversion, campaign attribution) are
markedly more rigorous than the older `activation_milestones` funnel they sit beside.

**Support and education.** Support chat, escalation, bug capture and the knowledge base are live
and coherent. The gap is tours on the newest complex surfaces (F-13). No tour copy was found
advertising retired behavior.

**Dead, dark and legacy.** Cleaner than expected. No dead code carries a cron schedule. The one
unscheduled cron is deliberately so and documented. `artist/[slug]` is a redirect, not a bypass.
The genuine issues are the reverse: two systems that are *more* dark than the docs claim (F-05,
and the pop-up channel generally) and one that is *less* dark (F-11).

---

## 7. Recommended implementation sequence

Ordered by dependency, not by severity alone.

**PHASE 0 — emergency.** None. There is no P0.

**PHASE 1 — source of truth.**
1a. F-05 founder decision on `popup_engine` (one question, blocks nothing else, highest leverage).
1b. F-01 initial-subscription net basis. Ship the handler fix; hold the backfill decision separately.
1c. F-04 derive activation milestones server-side from existing DomainCheck facts.

**PHASE 2 — broken handoffs and contradictions.**
2a. F-02 and F-03 together, one batch, one route. Depends on 1c for clean input.
2b. F-09 with F-01, same file, same window.
2c. F-06 classify the twelve types and route artist-facing CRWN inserts through the chokepoint.
2d. F-07 resolve interruption ownership one way or the other.

**PHASE 3 — UX, terminology, navigation.**
3a. F-08 nav label and `/earn` entry point.
3b. F-10 and F-12 hub parity, artist and fan.
3c. F-14 stale label, F-17 em dash.
3d. F-13 tours for Manager, Promise Calendar, Team Splits, Fan Drives only.

**PHASE 4 — legacy and cleanup.**
4a. F-15 consolidate onto `requireAdmin` and `requireArtistOwner`.
4b. F-16 relocate the milestone route.
4c. F-18 dead exports, F-19 clawback scan bound.
4d. F-11 doc corrections.

**PHASE 5 — observability and regression prevention.** Section 8.

Smallest safe batches: every phase-2 and phase-3 item is a single file or a single route and can
ship independently. Phase 1 items must not be batched together; each changes a source of truth and
needs its own evidence pass.

---

## 8. Permanent drift-prevention specification (specified, NOT built)

CRWN already has the right pattern: pure modules plus tests that read the source and assert
boundaries (`constraint/ownership.test.ts`, `campaigns/boundaries.test.ts`,
`stripe/payoutOwnership.test.ts`, `needsYouBoundary.test.ts`, `brainContract.test.ts`). The drift
system should extend that pattern, not invent a new mechanism.

Invariant classes this audit proves are needed:

1. **One canonical owner for priority.** Already covered. Extend the pinned file list beyond Studio and AccountHub (F-14 escaped through that gap).
2. **The notification chokepoint is the only writer.** Walk `src/` and assert no file other than `notifications.ts` contains `from('notifications').insert`, with an explicit allowlist for the fan-facing and artist-authored senders. Would have caught F-06.
3. **Every notification type is classified.** Extract every `type:` literal written to `notifications` and assert it exists in `NOTIFICATION_TAXONOMY`. Would have caught F-06.
4. **One first-paid definition.** Assert no admin route derives "converted" or "activated" from anything but `funnel_events` `first_paid_conversion`. Would have caught F-02 and F-03.
5. **Every earning row's net is commission-adjusted.** Assert every `from('earnings').insert` whose type is a positive rail passes a single shared `netForEarning()` helper. Would have caught F-01, and is the only structural defense against it recurring.
6. **Payout ownership.** Already covered and exemplary. Leave as is.
7. **Referral rails cannot cross economic boundaries.** Assert `postWinReferral.ts` never writes `artist_referrals` or `recruiter_payouts` and never uses `ref`. Partly covered by the module's own tests; promote to a source-walking assertion.
8. **No unauthorized Manager autonomy and no stale Manager actions.** Already covered by `managerBoundaries.test.ts` and `actionValidity.test.ts`. Leave as is.
9. **Studio-to-Hub parity.** Assert every `href` in the Studio grid appears in AccountHub. Would have caught F-10.
10. **No retired vocabulary in user-facing copy.** A denylist (`Action Plan`, `The Wave`, `Inner Circle` outside `legacyNames`, `empire`, SMS send language) asserted across `src/app` and `src/components` JSX text and string literals, excluding comments and compatibility identifiers. Would have caught F-14.
11. **Compatibility identifiers stay stable.** Assert `wave|inner_circle|vault|throne`, every `legacyNames` entry, every calculator slug and every funnel stage name is unchanged. Protects against a cleanup that looks harmless.
12. **Feature reachability.** For each dark-launched system, assert it has at least one delivery surface, and record which flag gates it. Would have surfaced F-05 as a question rather than a discovery.
13. **Docs match code.** Extend `brainContract.test.ts` with the applied or unapplied state of each migration referenced as "dark" in the brain. Would have caught F-11.

Deliberately NOT specified: a global cross-channel message cap (the governor's own header explains
why CRWN lacks the evidence for one), and any test that asserts production flag values, which no
test can read.

---

## 9. Founder decisions genuinely required

1. **Is `admin_settings.popup_engine` on in production?** If off, Post-Win Referral and every feature announcement have never been delivered. Highest leverage question in this document.
2. **F-01 remediation.** Correct the handler only, or also adjust already-accrued `team_split_earnings` rows? Real money, real collaborators.
3. **F-02.** Keep the old 3-of-5 series alongside a true activation series, or replace it and accept a discontinuity in the historical trend?
4. **F-04 backfill.** Backfilling milestones may retroactively enroll long-dormant artists in nudge sequences. Backfill with suppression, or leave history alone?
5. **F-08.** Rename the nav slot, or merge `/earn` into `/command`?

---

## 10. Investigated and intentionally NOT changed

Everything. No product code, schema, migration, test or behavior was modified. Specifically
examined and deliberately left alone: the `webhookHandlers.ts` money paths, all Team Splits
allocation and clawback logic, every Stripe route, all RLS and column-privilege boundaries, the
`notifications` producers, the Pop-up Engine flag, both unapplied migrations, the Constraint and
Manager prompt contracts, and all 91 existing test files.

---

## 11. Test and build status

- `npx vitest run`: **91 files, 1604 tests, all passing.** No baseline failures.
- `npm run build`: **exit 0**, compiled successfully.
- `npm run verify:migrations`: 20 applied, 2 not applied (both expected and in `TODO.md`).
- No test was altered to make this audit pass.
