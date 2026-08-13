# 26 — Product Drift Prevention (the permanent system)

**Status: LIVE, built 2026-08-12.** This document owns the drift-prevention architecture: how
CRWN's ratified product rules are converted into automated protections that fail loudly when
future code disagrees with them. If you are changing a product rule, an invariant, an exception,
or the architecture suite itself, this is the canonical doc.

**Product drift** means: a future change causes the implementation to disagree with a ratified
product rule without anyone intentionally changing that rule. The system detects CLASSES of
drift (a new second issuer, a new earnings writer, a new unclassified notification type), not
just today's exact lines.

---

## 1. Agent contract summary (read this before shipping)

The five questions every session needs answered:

**Who owns what?**

| Fact | Sole owner |
|---|---|
| Operating priority (diagnosis) | Constraint Engine (`src/lib/constraint/engine.ts`) via `GET /api/artist/constraint` |
| Z3 recommendation records | `/api/artist/constraint` only (`recordIssuedRecommendation`) |
| Launch readiness | Roadmap (`src/lib/artistRoadmap.ts`), derived on read, stored nowhere |
| Events / deadlines | Needs You (`/api/action-plan`), three deterministic event rules, no strategy |
| Coaching / bounded execution | Manager (voice only; the canonical brief outranks its framework) |
| Fan obligations | Promise Calendar; `ramp_step_key` rows are Revenue Ramp, never promises |
| Interruption arbitration | Pop-up Engine (`eligiblePopupFor`), one pop-up per user per day |
| Feed classification | Communications Governor via `createNotification` (the chokepoint) |
| First paid / activation | `recordFirstPaidConversion` (six rails) → `funnel_events.first_paid_conversion` |
| Artist net per sale | `earnings.net_amount`; subscription rails derive it via `subscriptionEarningNet` |
| Payout timing | Stripe (Express automatic); `payouts.create` exists in exactly one file (cashout) |
| Attribution normalizing | `src/lib/analytics/campaignAttribution.ts`, first-touch persisted |

**What must never happen?** A second Z3 issuer. A new `payouts.create`. A new earnings writer
outside `webhookHandlers.ts`. Post-Win referral code touching `artist_referrals` /
`recruiter_payouts` / `ref`. A CRWN-originated artist notification inserted directly into
`notifications`. An admin "activated" metric not sourced from `first_paid_conversion`. A
campaign dimension on a money row. Cross-artist evidence on an artist surface. An
`artistId`-trusting route without session ownership.

**Which IDs must not change?** Funnel stage names, calculator slugs + DM keywords, tier internal
keys + `legacyNames`, pop-up registry keys, tour `tourId`s, `_attribution` / `artist_ref` /
query-param names, compatibility routes (`/welcome`, `/action-plan`, `/api/admin/milestone`,
`TAB_ROUTES`). The frozen copies live in `src/lib/architecture/invariants.ts`.

**Which systems are live / dark / dormant?** The `FEATURES` registry in
`src/lib/architecture/invariants.ts` is the static contract (state, flag, gate module, delivery
surfaces, migration). `EXPECTED_MIGRATION_STATE` in the same file is the static migration
contract: **pending = membership-strategy, track-waterfall; everything else applied**, and after
the 2026-08-12 reconciliation **no entry is `unverified`**. Live flags (verified 2026-08-12): all
of `quest_engine`, `popup_engine`, `acquisition_engine`, `experiments`, `live_tips`,
`royalty_readiness`, `producer_sessions` are ON; `artist_gate` is OFF (open signup). The only
`dormant` system is the autonomous scheduled Manager (founder decision open).

**Migration applied is NOT feature live.** They are separate facts and the registry keeps them in
separate structures on purpose. A feature is live only when its migration is applied AND its flag
is on AND a delivery surface exists. Sub-avatar is the example that proves the third clause
matters in reverse: its migration is applied and it has no flag, but it is INTERNAL
acquisition/evidence data surfaced admin-only, and it must not be presented to artists on the
strength of a table existing.

**What do I run before shipping?**

    npm run verify:architecture   (deterministic drift suite, ~3s, no credentials)
    npm test                      (full suite)
    npm run build                 (inside WSL)
    npm run verify:migrations     (read-only production probe, when schema state matters)
    npm run verify:flags          (read-only production flag probe, when live/dark state matters)

---

## 2. Architecture: what the system is

Deliberately NOT a runtime subsystem. No service, no database of rules, no dashboard, no LLM
judge. It is:

1. **One registry** — `src/lib/architecture/invariants.ts`: every ratified invariant with id,
   severity, category, rule, canonical owner, source of truth, enforcement mechanism, tests
   that enforce it, and docs to review. Plus the shared canonical data the tests consume
   (frozen identifier lists, `ATTRIBUTION_DIMENSIONS`, `FEATURES`, `EXPECTED_MIGRATION_STATE`).
2. **One exception file** — `src/lib/architecture/exceptions.ts`: every intentional deviation,
   each carrying the invariant it excepts, the owning system, and why the rule does not apply.
   Scattered "ignore this test" comments are forbidden. (One pre-existing allowlist stays where
   it already works: `DIRECT_WRITER_ALLOWLIST` in `src/lib/comms/chokepoint.test.ts`.)
3. **One scanner** — `src/lib/architecture/sourceScan.ts`: cached file walking, comment
   stripping, and the `violation()` message formatter. Test-time only; product code importing
   it fails the suite.
4. **Ten registry-driven test files** in `src/lib/architecture/` plus the ~26 pre-existing
   boundary suites the registry references (it organizes them; it does not duplicate them).
5. **One command** — `npm run verify:architecture` runs the whole drift suite via
   `vitest.architecture.config.ts`, whose include list is the suite manifest.
   `architecture.test.ts` asserts every invariant's `enforcedBy` test appears in that manifest,
   so the suite cannot silently shrink.

Everything in the suite also runs in plain `npm test`; `verify:architecture` is a fast, named
subset, not a second test system.

## 3. Severity taxonomy

- **P0 CONTRACT** — money, security, data ownership (MONEY-*, ATTR-002, AUTH-*).
- **P1 CONTRACT** — priority / source of truth / product ownership (PRIORITY-*, PROMISE-*,
  MEASURE-*, ID-*, ATTR-001/003, INTERRUPT-001).
- **P2 CONTRACT** — navigation / communication / admin truth (NAV-*, COMMS-*, REACH-*).
- **P3 CONTRACT** — terminology / docs / education (TERM-*, DOCS-*).

Severity appears in the registry and in failure messages; it has no runtime behavior.

## 4. Static contracts vs live probes

Two layers, never conflated:

- **STATIC CONTRACT** (deterministic, no credentials): what CRWN expects. The registry, the
  architecture tests, `EXPECTED_MIGRATION_STATE`, the `FEATURES` states. Runs in
  `verify:architecture` and `npm test`.
- **LIVE PROBE** (read-only, production): what production actually has.
  `npm run verify:migrations` (schema), `npm run verify:flags` (feature flags),
  `npm run verify:stripe` (prices). A unit test NEVER asserts a production flag value; a flag's
  code default has lied about production more than once. `verify:flags` is the answer to that:
  on 2026-08-12 it proved `live_tips`, `producer_sessions` and `royalty_readiness` were all ON
  while four canonical docs still called them dark from their code defaults.

Not every migration is visible to the same live layer. `EXPECTED_MIGRATION_STATE` entries carry
`liveCheck`: `'anon-probe'` (the default, `scripts/probe-migrations.mjs`) or `'sql-check'` for
objects PostgREST cannot see. A widened CHECK constraint is the case that forced this: probing
`earnings?select=type` returns 200 whether or not the constraint was fixed, so a probe line there
would certify nothing while looking green. Never add a probe that cannot fail.

When a probe disagrees with the static contract, that disagreement IS the drift signal: update
the contract, the docs, and (if needed) the code together. `brainContract.test.ts` (DOCS-002)
enforces that no scanned doc calls a contract-applied migration pending, and that every
contract-listed migration has a probe line, so the two layers stay connected.

## 5. Exception rules

An exception requires: the invariant id, the excepted subject, the owning system, and a real
reason. Add it to the matching list in `src/lib/architecture/exceptions.ts`. The suites detect
STALE exceptions too (an excepted file that no longer does the excepted thing fails the test),
so the lists cannot rot. Never work around a drift test in the code under test.

## 6. How to add a new invariant

1. Confirm the rule is RATIFIED (a Brain doc states it; if not, write the Brain rule first).
2. Add the registry entry (id, severity, category, rule stated falsifiably, owner, source of
   truth, enforcement, docs).
3. Enforce it: extend an existing boundary test if one is the natural home, else add an
   assertion to the matching `src/lib/architecture/*.test.ts` using `sourceScan` helpers and
   `violation()` for the failure message (id + rule + offending file + owner + docs).
4. If the test is a new file, add it to `vitest.architecture.config.ts`.
5. **Mutation-test it**: introduce the violation deliberately, watch the suite fail, revert.
   A drift test that has never failed is unproven.
6. Include a positive control where the scan could silently match nothing (see the
   "still actually issues" pattern in `ownership.test.ts`).

## 7. Intentional product-rule change workflow

The system must not make CRWN impossible to evolve. When the founder deliberately changes a
ratified rule:

1. Founder/product decision is made and stated.
2. Update the canonical Brain rule (the doc named in the invariant's `docs`).
3. Update the implementation.
4. Update the invariant registry entry (and exceptions if the shape changed).
5. Update the enforcing tests.
6. `npm run verify:architecture`, then `npm test`, then `npm run build`.
7. The final report names the intentional invariant change explicitly.

**Never allowed:** "the test failed, so weaken the test" without the product evidence above.
A failing drift test is either real drift (fix the code) or a deliberate rule change (do the
full workflow). There is no third option.

## 8. What the system explicitly does NOT protect

- **Production flag values and schema state** — probes only (`verify:migrations`), by design.
- **Runtime behavior** — these are source contracts; a logic bug inside the canonical owner is
  the job of that owner's functional tests.
- **The full authorization surface** — AUTH-001 covers `/api/admin/*`; the per-route artist
  ownership manifest (AUTH-002) is documented but not walked. That belongs to the upcoming
  comprehensive security audit, as do CVEs, XSS/SQLi, SSRF, webhook replay, CSP, secrets.
- **Legal pages** (`/artist-agreement`, `/terms`) — deliberately hand-kept (see memory/Brain);
  a test regenerating them from `TIER_LIMITS` would silently rewrite an accepted agreement.
- **Copy quality beyond the denylist** — loss-framing, tone, and new retired terms require
  human judgment; TERM-001 only holds the line on terms already retired.
- **Semantic doc truth beyond the pinned claims** — the doc-sync hook narrows WHERE to look;
  brainContract pins claims that have already gone stale once. A brand-new false claim in a
  doc is still caught only by review.

## 9. Doc ownership (which docs to consider when behavior changes)

The doc-sync Stop hook (`.claude/hooks/doc-sync-reminder.sh`) maps changed code areas to the
docs that own their rules and prints the narrowed list after each code commit:

| Code area | Canonical docs |
|---|---|
| Stripe / money / earnings / splits | 07-BUSINESS-RULES, 05-DATABASE, 13-CURRENT-STATE |
| Constraint / Manager / AI | 02-FEATURE-MAP, 23-ZERO-TO-ONE-STRATEGY, 24-RECOMMENDATION-OUTCOME-LINKAGE |
| Onboarding / setup | 19-ONBOARDING-FLOW (+ CLAUDE.md setup section) |
| Referrals / attribution | 25-POST-WIN-REFERRAL, 22-VIRALITY-ENGINE-ARCHITECTURE, 07 |
| Fan Drives | 22 (section 28 = live scope) |
| Pop-ups / comms / notifications | 02, 13 |
| Admin metrics / analytics | 13, 18-SOURCE-MAP |
| Promises / ramp | 02, docs/REVENUE_RAMP.md |
| Quests / roadmap | 02, 19 |
| Architecture contracts / migrations | this doc (26) + the registry |

One rule to prevent dual ownership: a business rule lives in ONE doc (usually 07 or the
specialized architecture doc), and other docs reference it rather than restating it.

## 10. Inventory of protections (by area)

The registry (`INVARIANTS`) is the authoritative list; this is the orientation map.

- **Ownership** — PRIORITY-001..008, PROMISE-001/002, INTERRUPT-001. New: tree-wide Z3
  single-issuer walk (`architecture/ownership.test.ts`); everything else was already enforced
  by the existing boundary suites and is now indexed.
- **Money** — MONEY-001..009. New: earnings-writer containment and the architecture-level
  Post-Win firewall (`architecture/financial.test.ts`); payout ownership, subscription net,
  campaign boundaries, clawbacks were already enforced.
- **Measurement** — MEASURE-001..006. New: admin "activated" walk + funnel_events
  single-writer; adminActivation/milestoneReconcile/crossArtistEvidence pre-existed.
- **Communications** — COMMS-001..004. New: taxonomy completeness for `createNotification`
  literal types (which immediately found and classified five shipped-unclassified types:
  `bounty_submission`, `campaign_reached`, `bounty_won`, `badge_awarded`, `fan_milestone`).
- **Attribution** — ATTR-001..003, ID-005. New: dimension parity across parser / sanitizer /
  URL builder / funnel-dims mapper, driven by one canonical list.
- **Navigation** — NAV-001..003. New: full Studio→Hub parity (the F-10 class), fan hub
  canonical destinations (F-08/F-12), pinned nav slots.
- **Terminology** — TERM-001/002. New: registry-driven retired-vocabulary scan over label /
  title / name / JSX-text contexts in `.ts` AND `.tsx` (the F-14 escape path was .tsx-only
  coverage).
- **Identifiers** — ID-001..006. New: frozen funnel stages (append-only), frozen pop-up keys
  (bidirectional: new keys must be frozen too), tour ids, compatibility routes.
- **Reachability** — REACH-001..005. New: FEATURES registry checks, ANNOUNCEABLE_FLAGS parity
  (the "gate reads false forever" trap), cron schedule discipline (everything on disk is
  scheduled + nothing more frequent than daily), tour boundary-copy pins.
- **Authorization** — AUTH-001..003. New: admin-route gating walk with verified-authority
  exceptions (each exception's claimed authority is itself asserted).
- **Docs** — DOCS-001/002. New: the static migration-state contract wired into
  `brainContract.test.ts` (which caught three stale doc lines the moment it ran).

## Fan testimonials (TESTIMONIAL-001..009, added 2026-08-12)

Nine invariants in `src/lib/architecture/invariants.ts`, enforced by two suites that are BOTH in
the `verify:architecture` manifest: `src/lib/testimonials/core.test.ts` (pure decisions) and
`src/lib/architecture/testimonials.test.ts` (source-level boundaries plus a live exercise of the
pop-up arbiter).

Two are P0: publishing without fan consent (TESTIMONIAL-004) and pairing tier with tenure into a
lifetime-spend disclosure (TESTIMONIAL-006). Both were mutation-tested again after the migration
was applied, with the mutation proved present by grep before the suite was run.

The mutation battery found a defect in the NEW SUITE ITSELF, which is the argument for the
procedure: a tenancy check counted `eq('artist_id', artistId)` over a slice that ran to end of
file, so a neighbouring function kept the count above threshold while the visibility UPDATE had
lost its scope. Counting was the wrong tool. The assertion now pins the literal update chain.
Lesson worth generalizing: **a source-scan assertion must be bounded to the construct it claims to
be about**, or it silently measures its neighbours.
