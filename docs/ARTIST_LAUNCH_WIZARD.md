# The Artist Launch Wizard — staged build plan

Spec from Josh, 2026-07-30. The setup wizard stops being "photo → tier → track → product →
share" and becomes: **restore the business they designed → make it operational → show the
workload → prepare the audience → launch it.**

Condensed target order:
verify account → restore plan → identity → confirm recommended offers → generate roadmap →
connect Stripe → add minimum content → generate and review Promise Calendar → import fans →
prepare launch campaign → preview complete system → publish → invite first fans.

## Design rules (from the spec, binding)

- Never re-ask what a calculator captured (audience size, listeners, revenue history, catalog).
- The artist must instantly recognize the restored plan as the one they built pre-signup.
- Stripe is NOT required before seeing the recommendation; it IS required before publishing paid offers.
- Bulk catalog upload is prominent (ICP has 40-300 songs) but optional; no onboarding-only media system.
- Promise Calendar obligations come from CONFIRMED benefits, not templates. Offer-level obligations
  at publish; purchase-level obligations only on purchase (no fake workload).
- Shared benefits across tiers = ONE obligation with multi-tier access, not duplicates.
- Show estimated recurring workload before publish; the artist can adjust dates/frequencies.
- Import never auto-sends anything; review before invites. Nothing sends without final review.
- Keep server-side completion (`/api/artist/complete-setup`) and server-side role promotion.
- After publish: the launch command screen (next move, progress, upcoming promises, roadmap stage,
  performance), never a generic dashboard.

## What already exists (reuse, never rebuild)

| Spec need | Existing system |
|---|---|
| Restore plan after signup | `lead_magnet_results` claim + `autoClaimForUser` + `getLeadMagnetSeed` (`handoffSeed.ts`) |
| Recommended offer | `buildStarterOffer` (derived on read, deterministic) |
| Recommended ladder + prices + benefits | `RECOMMENDED_LADDER` in `tierTemplate.ts`; Rise Level 3 apply seeds the Promise Calendar |
| Promise Calendar | `fulfillment_obligations` + Promise Calendar UI (`/studio/promise`) |
| Revenue goal → dated plan | `seedRevenueRamp` (runs in complete-setup) |
| Stripe connect + return + price backfill | `/api/stripe/connect/status` + `backfillTierPrices()` |
| Content systems | tracks/albums/playlists, gating, uploads, scheduled releases |
| Post-setup builder restore | `/api/lead-results/post-setup-destination` + `resolveJourneyDestination` |
| Identity + publish | wizard identity screens + `/api/onboarding/identity` (2026-07-30) |
| Contact invites | contact-invite path (live); CSV import = Patreon on-ramp option (b), already chosen NEXT UP |
| Share-to-Earn / campaigns | existing campaign + share-to-earn systems |

Genuinely new: the personalized artist roadmap object (NOT `14-ROADMAP-INFERRED.md`, which is an
internal product doc), the benefit→obligation generator with dedup/inheritance rules, the fan
import hub (multi-source), the launch campaign composer, the four-preview review screen, and the
launch command screen.

## Build stages (each ships whole and leaves the wizard working)

1. **Restore the plan** — SHIPPED 2026-07-30. `/api/lead-results/auto-claim` now returns the
   claimed seed summary; the wizard opens with a "Your CRWN plan is saved" intro (headline, the
   number they calculated, source tool) for brand-new signups with a claimed result. Spec Phase 1.
2. **Confirm the recommended model** — SHIPPED 2026-07-30. The wizard's three free-tier screens
   became ONE `ladder` confirm screen: Bronze free (always applied) + Silver/Gold/Platinum with
   inline price edit and per-rung "Drop this tier", benefits expandable, fulfillment notes shown.
   Applying uses the extracted shared path `src/lib/applyTierTemplate.ts` (same as Rise Level 3):
   Stripe prices on connect via backfill, `/api/tier-benefits` seeds the Promise Calendar
   obligations. Retry-safe via name/alias dedupe; a dropped rung stays available in Rise Level 3.
   The Phase 3 leftovers (estimated buyers per tier, calculator-answer attribution) landed
   with Stage 3.
3. **Benefit→obligation generator + calendar review screen** — one module that translates
   confirmed benefits into `fulfillment_obligations` — SHIPPED 2026-07-30.
   `src/lib/promisePlan.ts` is the pure generator brain shared by the wizard AND the server
   sync (`tierObligations.ts` consumes it, so what the artist reviews is exactly what gets
   created): promise detection, cadence/title/first-due from benefit config, DEDUP (the same
   promise on several tiers is ONE obligation, `metadata.merged_tier_ids`, re-anchored if the
   anchor tier drops it) and INHERITANCE (`serves_higher_tiers` on Gold's vault unlock serves
   every higher tier via `metadata.serves_tier_ids`, refreshed on every sync so wizard
   creation order converges), plus the recurring-workload model. Fan eligibility
   (`calendarProjection.fanEligibleForObligation`) and fulfillment notifications honor the
   serve lists, so multi-tier access is real, not cosmetic. The wizard gained a `promises`
   review screen (monetize group; the tier create moved onto it): cadence dropdown +
   first-due date per promise ride into the apply path as `benefitConfigOverrides`, with an
   honest "estimated workload" line. The ladder screen now shows estimated buyers per rung
   from the artist's own calculator (`tierProjections` on auto-claim, matched by
   current/legacy tier name) with loss-framed attribution. Pure logic under test in
   `promisePlan.test.ts`. No migration: serve lists ride the existing `metadata` jsonb.
   Spec Phase 4 rules + Phase 6a.
4. **Stripe step in-wizard** — SHIPPED 2026-07-30. A `stripe` screen follows the promise
   review (monetize group): "Connect Stripe so fans can purchase your offers and you can
   receive payouts." Connect goes through `/api/stripe/connect`, which now honors a validated
   same-site `?returnTo=` for its refresh/return URLs; the wizard passes `/setup`, and the
   resume effect restores the EXACT `stripe` screen on `?stripe=success|refresh` instead of
   the first-incomplete scan. Verification stays server-side: the screen just re-hits
   `/api/stripe/connect/status` (which does the live `accounts.retrieve` and the tier-price
   backfill, and now also returns `payoutsEnabled`) and renders connected / under-review
   ("Check again") / not-connected states. The screen NEVER blocks Continue: Stripe is
   required to take money, not to finish setup, exactly per the design rule. Spec Phase 5.
5. **Minimum viable content step** — SHIPPED 2026-07-30. A `content-plan` screen opens the
   music group with ONE decision: one featured track (fastest, starts free), the full catalog,
   or an explicit "I'll add music later" escape (jumps the group, loss-framed). The catalog
   path mounts the EXISTING dashboard `BulkUploadForm` inside the wizard (multi-file queue,
   per-track tier access + one-time prices, artwork, progress, Artist Agreement consent), so
   tier-access assignment reuses the real gating system and no onboarding-only media system
   exists. The single-track path is unchanged. The track-title screen is skipped on the bulk
   path (titles come from file names in the form); Continue unlocks from the DB the moment
   tracks exist, and the bulk completion fires the `first_track_uploaded` milestone the
   single path already fired. Spec Phase 6.
6. **Personalized roadmap** — SHIPPED 2026-07-30. `src/lib/artistRoadmap.ts` is the pure
   5-stage plan (Foundation → Private launch → Audience launch → Deliver and retain → Expand),
   ~21 steps, each keyed to an EXISTING Quest Engine DomainCheck by exact name (plus three
   Promise Calendar facts the evaluator lacks: scheduled / first-completed / nothing-overdue).
   `/api/artist/roadmap` derives it on read (nothing stored, deliberately deviating from the
   spec's "store per-artist": derive-from-live-data is the house pattern and cannot go stale):
   'check' steps run through the quest evaluator's own `evaluateCondition` via a minimal
   synthetic instance, so the roadmap can NEVER disagree with the quests, and XP keeps flowing
   through the Quest Engine when the underlying action completes, exactly per the design rule.
   Personalization: share steps deep-link to the artist's public page; the Expand MRR milestone
   is the monthly goal from their own claimed calculator (default $500). Weekly availability /
   platforms are NOT used because CRWN does not collect them; no step pretends. Surfaced as
   `RoadmapCard` at the top of Rise Mode (`/profile/artist`): current stage, one next
   milestone with a prefetched deep link, overall progress, full five stages on expand. Pure
   logic tested in `artistRoadmap.test.ts`. Spec Phase 4.
7. **Fan import hub** — SHIPPED 2026-07-30. `FanImportModal` (Fan CRM, `/studio/fans`) is the
   hub: the first screen asks "where are your fans right now?" (Patreon card with the exact
   export path, plus an any-CSV card for Mailchimp/Shopify/Gumroad/spreadsheets). A Patreon
   Relationship Manager export is auto-recognized (`src/lib/patreonImport.ts`, pure + tested):
   the review step shows active vs former patrons (active-only by default, former importable
   tagged `patreon-inactive` for win-back), each Patreon tier with its member count and the
   CLOSEST CRWN tier suggestion (free pledges → the free front door; ties break cheaper), and
   members import with `patreon` / `patreon-tier:<name>` tags for per-group targeting. The
   versioned permission attestation gates the import exactly as before, and the done screen
   hands off to Campaign Hub ("create the invite"), where the contacts audience already sends
   ONLY to attested, still-subscribed contacts with suppression + unsubscribe. Import never
   messages anyone by itself. Spec Phase 7; the TODO's Patreon on-ramp option (b) is done.
8. **Launch campaign composer** — SHIPPED 2026-07-30. `src/lib/launchCampaign.ts` (pure +
   tested) generates the launch kit from what the artist ACTUALLY built (page link, free front
   door, entry paid tier, imported audience): announcement + follow-up emails, social caption,
   story copy, DM copy, share link, a segment suggestion (Patreon members first when they
   exist), a suggested test size (20), and a suggested send date (coming Friday, two days of
   review runway). Surfaced as the `LaunchKit` panel atop the Campaigns view in the Fan CRM
   (`/studio/fans?view=campaigns`): one click creates BOTH emails as `campaigns` DRAFTS via the
   existing /api/campaigns (announcement preset to the contacts audience with a 20-contact test
   group; follow-up to all eligible), which the artist opens, reviews, and sends through the
   existing compliant contacts sender. The copy-paste assets cover the manual launch path.
   Nothing sends without review, by construction. Also fixed: the Stage 7 invite CTA and the
   roadmap's announce step pointed at /campaign-hub (Road-To campaigns); email campaigns live
   at /studio/fans, and both links now go there. Spec Phase 8.
9. **Preview + publish + launch command screen** — SHIPPED 2026-07-30. The wizard's end screen
   is now the `LaunchReview` ("Your CRWN launch system"): the six-item completeness checklist
   (offers / Stripe / content / promises / audience / campaign; open REQUIRED items carry a
   "Fix it" that jumps back to the exact wizard screen, the after-launch items say honestly
   where they happen), the previews (the PUBLIC PAGE is the storefront + checkout preview,
   opened as a fan; the Promise Calendar's next events and the roadmap's first milestone render
   INLINE because /studio/promise and /profile/artist sit behind the setup gate until launch),
   the share block, and ONE publish action, "Launch my CRWN", which is still exactly the
   existing server-side completion (`/api/artist/complete-setup` via markComplete + the journey
   resolver; role promotion stays the server trigger). The post-launch command screen is Rise
   Mode's top: `RoadmapCard` now also renders the real numbers (members / paying / MRR against
   the calculator goal, from /api/artist/roadmap's new `stats`) and the next three upcoming
   promises (`upcomingPromises`), above the current stage + next milestone it already carried.
   Real counts only, never projections dressed as results. Spec Phases 9-10.

ALL NINE STAGES ARE SHIPPED (2026-07-30). The wizard now runs the full journey the spec asked
for: restore the business they designed → make it operational → show the workload → prepare the
audience → launch it. What intentionally remains beyond the staged plan: deeper per-source
import integrations (OAuth instead of CSV), richer performance metrics on the command screen
(page visits, checkout starts), and folding the import/campaign steps into the wizard itself
rather than the post-launch surfaces they live on now.
