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
2. **Confirm the recommended model** — replace the wizard's single free-tier screens with a
   confirm screen driven by `RECOMMENDED_LADDER` + `buildStarterOffer` + the seed's
   conversionPayload: accept / edit price / remove optional component. Applying uses the SAME
   code path as Rise Level 3 (tier create + calendar seed). Keep the free-Bronze-only path for
   artists with no claimed plan. Spec Phase 3.
3. **Benefit→obligation generator + calendar review screen** — one module that translates
   confirmed benefits into `fulfillment_obligations` (recurrence, first due date, tier links,
   dedup across tiers, inheritance), plus the pre-launch review screen with estimated recurring
   workload. Reused by the wizard AND by later tier edits. Spec Phase 4 rules + Phase 6a.
4. **Stripe step in-wizard** — surface connect at the right moment (after confirm, before
   publish-paid), restore to the exact step on return, verify server-side. Mostly wiring;
   `connect/status` already does the heavy parts. Spec Phase 5.
5. **Minimum viable content step** — choose the offer needing content → upload one track / small
   collection / bulk / later; assign tier access; reuse existing upload + gating. Bulk upload
   prominent for the ICP. Spec Phase 6.
6. **Personalized roadmap** — derive a 5-stage execution plan (Foundation → Private launch →
   Audience launch → Deliver and retain → Expand) from offer/audience/goal/availability; store
   per-artist; surface current stage + next milestone. Feed XP through the Quest Engine, not a
   parallel progression system. Spec Phase 4.
7. **Fan import hub** — CSV first (Patreon on-ramp option (b) is already the chosen wedge),
   then other sources; review before any invite; versioned permission attestation. Spec Phase 7.
8. **Launch campaign composer** — generate announcement/follow-up/social/DM copy + segment +
   date from the offer; artist picks test (10-25) / segment / all / manual; drafts only. Spec Phase 8.
9. **Preview + publish + launch command screen** — four previews (storefront, checkout,
   calendar, roadmap), completeness checklist, publish action bundling the existing server
   completion, and the post-launch command screen replacing the dashboard landing. Spec Phases 9-10.

Stages 2-3 are the heart (the plan becomes an operational business with visible workload) and
come next. Each stage updates this doc's SHIPPED markers.
