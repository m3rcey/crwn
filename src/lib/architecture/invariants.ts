// ============================================================================
// CRWN ARCHITECTURE INVARIANT REGISTRY
// ============================================================================
// The ONE developer-facing inventory of CRWN's ratified product-architecture
// contracts. Every entry is a rule the product has DECIDED, not a convention:
// violating one silently is drift; changing one deliberately follows the
// rule-change workflow in docs/crwn-brain/26-PRODUCT-DRIFT-PREVENTION.md
// (Brain rule first, then implementation, then this registry, then the test).
//
// This is DATA consumed by tests (src/lib/architecture/*.test.ts and the
// existing boundary suites it references). It is not a runtime system: nothing
// in src/app or src/components may import this module (architecture.test.ts
// enforces that). Do not make it dynamic, admin-editable, or database-backed.
//
// severity:
//   P0 = money, security, or data ownership. Wrong = real dollars or real access.
//   P1 = priority / source-of-truth / product ownership. Wrong = two systems
//        claim the same fact and the founder steers by a lie.
//   P2 = navigation / communication / admin truth. Wrong = users or the founder
//        cannot find or trust a surface.
//   P3 = terminology / docs / education. Wrong = the product teaches its own
//        retired ideas.
//
// enforcement:
//   'test'    = deterministic vitest assertion (runs in npm run verify:architecture)
//   'probe'   = live production check (npm run verify:migrations / verify:stripe)
//   'runtime' = enforced by the code path itself (e.g. checkout price verification)
//   'doc'     = documented contract with no automated check yet (the gap is stated)
// ============================================================================

export type InvariantSeverity = 'P0' | 'P1' | 'P2' | 'P3';

export type InvariantCategory =
  | 'money'
  | 'ownership'
  | 'measurement'
  | 'communications'
  | 'attribution'
  | 'navigation'
  | 'terminology'
  | 'identifiers'
  | 'reachability'
  | 'authorization'
  | 'docs';

export interface Invariant {
  id: string;
  severity: InvariantSeverity;
  category: InvariantCategory;
  /** The rule, stated so a violation is falsifiable. */
  rule: string;
  /** The canonical owner (module, route, or external system). */
  owner: string;
  /** Where the truth lives (file, table, or system). */
  sourceOfTruth: string;
  /** How the rule is enforced. */
  enforcement: 'test' | 'probe' | 'runtime' | 'doc';
  /** Test files (repo-relative) or scripts that fail when the rule breaks. */
  enforcedBy: string[];
  /** Brain docs to review when this rule is touched. */
  docs: string[];
  notes?: string;
}

export const INVARIANTS: Invariant[] = [
  // ------------------------------------------------------------------ MONEY
  {
    id: 'MONEY-001',
    severity: 'P0',
    category: 'money',
    rule: 'Stripe owns automatic artist payout timing. No CRWN cron creates payouts, updates payout settings, or sets a payout schedule.',
    owner: 'Stripe Express (delay_days: 2, automatic daily)',
    sourceOfTruth: 'Stripe',
    enforcement: 'test',
    enforcedBy: ['src/lib/stripe/payoutOwnership.test.ts'],
    docs: ['docs/crwn-brain/07-BUSINESS-RULES.md'],
    notes: 'weekly-payout cron retired 2026-08-11 and must not return.',
  },
  {
    id: 'MONEY-002',
    severity: 'P0',
    category: 'money',
    rule: 'stripe.payouts.create appears in exactly one file: the artist cashout route. Everything else moving money platform->connected uses transfers.create.',
    owner: 'src/app/api/stripe/cashout/route.ts',
    sourceOfTruth: 'Stripe balance',
    enforcement: 'test',
    enforcedBy: ['src/lib/stripe/payoutOwnership.test.ts'],
    docs: ['docs/crwn-brain/07-BUSINESS-RULES.md'],
  },
  {
    id: 'MONEY-003',
    severity: 'P0',
    category: 'money',
    rule: 'Both subscription earning paths (initial checkout and renewal) derive artist net through subscriptionEarningNet, so referral/clipper pass-through commission is removed from artist net wherever Stripe charged it. platform_fee stays the platform base cut.',
    owner: 'src/lib/earningsNet.ts',
    sourceOfTruth: 'earnings.net_amount',
    enforcement: 'test',
    enforcedBy: ['src/lib/earningsNet.test.ts'],
    docs: ['docs/crwn-brain/07-BUSINESS-RULES.md'],
    notes:
      'The five non-subscription rails (product, track, booking, live_ticket, live_tip) legitimately compute gross - platformFee: no commission is charged on them. Deliberately NOT routed through the helper; if a commission is ever attributed on one of those rails, extend earningsNet.ts first.',
  },
  {
    id: 'MONEY-004',
    severity: 'P0',
    category: 'money',
    rule: 'No new earnings writer: files inserting rows carrying net_amount are limited to the canonical webhook handler and the allowlisted self-check canary. A new rail must be added there or explicitly excepted.',
    owner: 'src/lib/webhookHandlers.ts',
    sourceOfTruth: 'earnings table',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/financial.test.ts'],
    docs: ['docs/crwn-brain/07-BUSINESS-RULES.md'],
  },
  {
    id: 'MONEY-005',
    severity: 'P0',
    category: 'money',
    rule: 'Post-Win artist referral is unpaid forever and additive-attribution only. Post-Win code paths never write artist_referrals, recruiter_payouts, or referral earnings, never use the recruiter ref param, and never create a Stripe transfer or payout.',
    owner: 'src/lib/postWinReferral.ts (pure) + founder policy in doc 25',
    sourceOfTruth: 'docs/crwn-brain/25-POST-WIN-REFERRAL.md (ratified founder policy)',
    enforcement: 'test',
    enforcedBy: ['src/lib/postWinReferral.test.ts', 'src/lib/architecture/financial.test.ts'],
    docs: ['docs/crwn-brain/25-POST-WIN-REFERRAL.md'],
  },
  {
    id: 'MONEY-006',
    severity: 'P0',
    category: 'money',
    rule: 'The Fan Drives campaign spine writes no money rows and adds no attribution dimension to referrals, cookies, or Stripe metadata. Campaign outcomes are DERIVED from canonical rails (referrals x participants x window).',
    owner: 'src/lib/campaigns/*',
    sourceOfTruth: 'referrals + referral_earnings (canonical rails)',
    enforcement: 'test',
    enforcedBy: ['src/lib/campaigns/boundaries.test.ts'],
    docs: ['docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md'],
  },
  {
    id: 'MONEY-007',
    severity: 'P0',
    category: 'money',
    rule: 'Team Splits allocate from the canonical earning basis (earnings.net_amount / gross_amount per deal) and never become a second ledger of CRWN revenue. Collaborator money moves by transfers.create through the team-split cashout only.',
    owner: 'src/lib/teamSplits/allocation.ts',
    sourceOfTruth: 'earnings table',
    enforcement: 'test',
    enforcedBy: ['src/lib/earningsNet.test.ts', 'src/lib/stripe/payoutOwnership.test.ts'],
    docs: ['docs/crwn-brain/07-BUSINESS-RULES.md'],
  },
  {
    id: 'MONEY-008',
    severity: 'P0',
    category: 'money',
    rule: 'Plan fees and prices come only from TIER_LIMITS / TIER_PRICING in src/lib/platformTier.ts. platform-checkout verifies the live Stripe amount against TIER_PRICING before selling.',
    owner: 'src/lib/platformTier.ts',
    sourceOfTruth: 'TIER_LIMITS / TIER_PRICING',
    enforcement: 'runtime',
    enforcedBy: ['scripts/probe-stripe-prices.mjs'],
    docs: ['docs/crwn-brain/07-BUSINESS-RULES.md'],
    notes: 'Runtime verification in platform-checkout plus the read-only npm run verify:stripe probe. No deterministic test freezes prices; the probe is the check.',
  },
  {
    id: 'MONEY-009',
    severity: 'P0',
    category: 'money',
    rule: 'Refunds claw back proportionally on the same rail they were earned: referral commission and team-split accruals both reverse against the original earning.',
    owner: 'src/lib/webhookHandlers.ts (refund path)',
    sourceOfTruth: 'earnings + referral_earnings + team_split_earnings',
    enforcement: 'test',
    enforcedBy: ['src/lib/earningsNet.test.ts'],
    docs: ['docs/crwn-brain/07-BUSINESS-RULES.md'],
  },

  // -------------------------------------------------------------- OWNERSHIP
  {
    id: 'PRIORITY-001',
    severity: 'P1',
    category: 'ownership',
    rule: 'The Constraint Engine is the sole owner of canonical operating priority when evidence supports diagnosis. No other surface ranks strategic priorities.',
    owner: 'src/lib/constraint/engine.ts (readConstraint) via GET /api/artist/constraint',
    sourceOfTruth: 'constraint evidence (assembler.ts), derived on read',
    enforcement: 'test',
    enforcedBy: [
      'src/lib/constraint/ownership.test.ts',
      'src/lib/constraint/readership.test.ts',
      'src/lib/operatingFlow.test.ts',
    ],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md', 'docs/crwn-brain/23-ZERO-TO-ONE-STRATEGY.md'],
  },
  {
    id: 'PRIORITY-002',
    severity: 'P1',
    category: 'ownership',
    rule: 'Only /api/artist/constraint issues canonical Z3 recommendation records. Everything else may read or reference recommendation identity, never create competing history.',
    owner: 'src/app/api/artist/constraint/route.ts',
    sourceOfTruth: 'recordIssuedRecommendation (src/lib/constraint/recommendationStore.ts)',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/ownership.test.ts'],
    docs: ['docs/crwn-brain/24-RECOMMENDATION-OUTCOME-LINKAGE.md'],
    notes: 'Eleven per-surface tests also assert the negative; the architecture test walks the whole tree so a NEW file cannot become a second issuer.',
  },
  {
    id: 'PRIORITY-003',
    severity: 'P1',
    category: 'ownership',
    rule: 'Roadmap owns launch readiness, derived on read through the quest evaluator, stored nowhere. No second completion oracle.',
    owner: 'src/lib/artistRoadmap.ts via /api/artist/roadmap',
    sourceOfTruth: 'evaluateCondition (src/lib/quests/evaluator.ts)',
    enforcement: 'test',
    enforcedBy: ['src/lib/operatingFlow.test.ts', 'src/lib/artistRoadmap.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'PRIORITY-004',
    severity: 'P1',
    category: 'ownership',
    rule: 'Needs You (/api/action-plan) owns event/deadline attention only: three deterministic event rules, no standing-gap strategy recommendations, no writes, no diagnosis. Urgency is not priority.',
    owner: 'src/app/api/action-plan/route.ts',
    sourceOfTruth: 'real events (clip windows, fan suggestions, proof-of-demand)',
    enforcement: 'test',
    enforcedBy: ['src/lib/needsYouBoundary.test.ts', 'src/lib/constraint/ownership.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'PRIORITY-005',
    severity: 'P1',
    category: 'ownership',
    rule: 'Manager explains canonical priority and executes bounded approved actions. The canonical brief outranks its own framework; it never re-ranks, never claims peer comparison or causality, and never issues a Z3 record.',
    owner: 'src/lib/ai/* (voice), subordinate to the Constraint Engine',
    sourceOfTruth: 'canonicalPriorityBrief (src/lib/constraint/readership.ts)',
    enforcement: 'test',
    enforcedBy: ['src/lib/ai/managerBoundaries.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md', 'docs/crwn-brain/24-RECOMMENDATION-OUTCOME-LINKAGE.md'],
  },
  {
    id: 'PRIORITY-006',
    severity: 'P1',
    category: 'ownership',
    rule: 'The autonomous (scheduled) Manager stays dormant until founder-approved gates. The dormancy markers in the ai-manager cron are deliberate and must not be "fixed".',
    owner: 'founder decision (open)',
    sourceOfTruth: 'src/app/api/cron/ai-manager/route.ts (is_active filter + starter-tier early return)',
    enforcement: 'test',
    enforcedBy: ['src/lib/ai/managerBoundaries.test.ts', 'src/lib/ai/actionValidity.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'PRIORITY-007',
    severity: 'P1',
    category: 'ownership',
    rule: 'A stale Manager action cannot execute: approval is not perpetual authorization. Validity is re-derived from current state at the moment of execution, before the lock and before any handler.',
    owner: 'src/lib/ai/actionValidity.ts',
    sourceOfTruth: 'artist_agent_actions.created_at + live target state',
    enforcement: 'test',
    enforcedBy: ['src/lib/ai/actionValidity.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'PRIORITY-008',
    severity: 'P1',
    category: 'ownership',
    rule: 'No cross-artist evidence reaches an artist-facing Manager surface. Cross-artist aggregation is admin-only, behind three privacy gates, median-of-artist-rates, no artist ids in output.',
    owner: 'src/lib/crossArtistEvidence.ts',
    sourceOfTruth: 'crossArtistEvidence@1',
    enforcement: 'test',
    enforcedBy: ['src/lib/crossArtistEvidence.test.ts', 'src/lib/ai/managerBoundaries.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'PROMISE-001',
    severity: 'P1',
    category: 'ownership',
    rule: 'A fan promise is something owed to a fan. A row carrying metadata.ramp_step_key is a Revenue Ramp step, never a fan promise. Decision readers of fulfillment_events go through onlyFanPromises / FAN_PROMISE_FILTER.',
    owner: 'src/lib/fulfillment.ts (isFanPromiseEvent / onlyFanPromises)',
    sourceOfTruth: 'fulfillment_events.metadata.ramp_step_key',
    enforcement: 'test',
    enforcedBy: ['src/lib/fanPromiseBoundary.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md', 'docs/REVENUE_RAMP.md'],
  },
  {
    id: 'PROMISE-002',
    severity: 'P1',
    category: 'ownership',
    rule: 'Communication readers honor the fan-promise boundary too: exactly one sender (promiseReminders) emails an artist about a fan promise; calendarReminders never reads fulfillment_events; neither re-expresses the ramp marker as its own literal.',
    owner: 'src/lib/promiseReminders.ts',
    sourceOfTruth: 'src/lib/fulfillment.ts',
    enforcement: 'test',
    enforcedBy: ['src/lib/promiseEmailBoundary.test.ts', 'src/lib/promiseReminderBoundary.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'INTERRUPT-001',
    severity: 'P1',
    category: 'ownership',
    rule: 'The Pop-up Engine is the sole owner of interruption arbitration (one pop-up per user per day, priority-sorted single winner). The Communications Governor owns feed classification only. selectSingleInterruption stays retired.',
    owner: 'src/lib/popups/index.ts (eligiblePopupFor)',
    sourceOfTruth: 'popup_events + POPUPS registry priorities',
    enforcement: 'test',
    enforcedBy: ['src/lib/comms/governor.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },

  // ------------------------------------------------------------ MEASUREMENT
  {
    id: 'MEASURE-001',
    severity: 'P1',
    category: 'measurement',
    rule: 'There is ONE first-paid definition: funnel_events stage first_paid_conversion, recorded by recordFirstPaidConversion across all six paid rails (subscription, product, track, booking, live_ticket, live_tip), deduped per artist.',
    owner: 'src/lib/analytics/paidConversion.ts',
    sourceOfTruth: 'funnel_events (stage = first_paid_conversion)',
    enforcement: 'test',
    enforcedBy: [
      'src/lib/analytics/paidConversion.test.ts',
      'src/lib/analytics/adminActivation.test.ts',
      'src/lib/architecture/financial.test.ts',
    ],
    docs: ['docs/crwn-brain/20-FIRST-REVENUE-LAUNCH-OFFER.md', 'docs/crwn-brain/13-CURRENT-STATE.md'],
    notes: 'Explicitly-narrower metrics (e.g. "First Member (memberships)") are allowed because they do not pretend to mean activation.',
  },
  {
    id: 'MEASURE-002',
    severity: 'P1',
    category: 'measurement',
    rule: 'Activation = first paid conversion. Setup Progress = 3-of-5 setup milestones. They are different concepts; an admin surface labeling setup progress "activated" is drift.',
    owner: 'src/app/api/admin/funnel/route.ts (both series, honestly named)',
    sourceOfTruth: 'funnel_events (activation) / activation_milestones (setup)',
    enforcement: 'test',
    enforcedBy: ['src/lib/analytics/adminActivation.test.ts', 'src/lib/architecture/financial.test.ts'],
    docs: ['docs/crwn-brain/13-CURRENT-STATE.md'],
  },
  {
    id: 'MEASURE-003',
    severity: 'P1',
    category: 'measurement',
    rule: 'Milestone truth is server-derived from canonical rows with historical timestamps. Browser writes are optimization signals only. Reconciliation never manufactures "just completed now" lifecycle events (30-day stall freshness window).',
    owner: 'src/lib/milestoneReconcile.ts',
    sourceOfTruth: 'tracks / subscription_tiers / funnel_events / earnings rows',
    enforcement: 'test',
    enforcedBy: ['src/lib/milestoneReconcile.test.ts'],
    docs: ['docs/crwn-brain/13-CURRENT-STATE.md'],
  },
  {
    id: 'MEASURE-004',
    severity: 'P1',
    category: 'measurement',
    rule: 'Attribution is a reporting dimension. It never reaches a calculator input, a price, a fee, the lead scorer, or an authorization decision.',
    owner: 'src/lib/analytics/campaignAttribution.ts',
    sourceOfTruth: 'lead_magnet_results.input_data._attribution',
    enforcement: 'test',
    enforcedBy: ['src/lib/postWinReferral.test.ts'],
    docs: ['docs/crwn-brain/25-POST-WIN-REFERRAL.md'],
    notes: 'Partially structural: the attribution lib holds no DB client and no money tokens (pinned). A full "no consumer uses attribution in pricing" walk is not written; the consumers are enumerated in the Brain instead.',
  },
  {
    id: 'MEASURE-005',
    severity: 'P1',
    category: 'measurement',
    rule: 'Cross-artist aggregation honors three separate privacy gates (8 distinct artists, 200 observations, max 50% single-artist share), reports unavailable states rather than numbers, and never appears artist-facing.',
    owner: 'src/lib/crossArtistEvidence.ts',
    sourceOfTruth: 'crossArtistEvidence@1',
    enforcement: 'test',
    enforcedBy: ['src/lib/crossArtistEvidence.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'MEASURE-006',
    severity: 'P1',
    category: 'measurement',
    rule: 'No public leaderboard publishes a score invertible back to a fan\'s lifetime spend.',
    owner: 'src/lib/leaderboardPrivacy.ts',
    sourceOfTruth: 'leaderboard public projection',
    enforcement: 'test',
    enforcedBy: ['src/lib/leaderboardPrivacy.test.ts'],
    docs: ['docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md'],
  },

  // ---------------------------------------------------------- COMMUNICATIONS
  {
    id: 'COMMS-001',
    severity: 'P2',
    category: 'communications',
    rule: 'CRWN-originated artist notifications go through createNotification (the chokepoint). Direct inserts into notifications are limited to the documented allowlist (artist-authored fan sends and fan-facing transactional truths), enforced in both directions.',
    owner: 'src/lib/notifications.ts (createNotification)',
    sourceOfTruth: 'DIRECT_WRITER_ALLOWLIST in src/lib/comms/chokepoint.test.ts',
    enforcement: 'test',
    enforcedBy: ['src/lib/comms/chokepoint.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'COMMS-002',
    severity: 'P2',
    category: 'communications',
    rule: 'Every source-defined CRWN notification type is classified in NOTIFICATION_TAXONOMY. Unknown runtime input still fails open (delivers ungoverned) by policy, but a type literal written in source must not ship unclassified.',
    owner: 'src/lib/comms/taxonomy.ts',
    sourceOfTruth: 'NOTIFICATION_TAXONOMY',
    enforcement: 'test',
    enforcedBy: ['src/lib/comms/chokepoint.test.ts', 'src/lib/architecture/communications.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'COMMS-003',
    severity: 'P2',
    category: 'communications',
    rule: 'The Communications Governor is pure (imports only its taxonomy), governs attention not diagnosis, emits no suppress in V1, and carries NO global cross-channel cap (a founder decision backed by absent evidence, not an omission).',
    owner: 'src/lib/comms/governor.ts',
    sourceOfTruth: 'CLASS_ORDER (founder-ratified precedence)',
    enforcement: 'test',
    enforcedBy: ['src/lib/comms/governor.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'COMMS-004',
    severity: 'P2',
    category: 'communications',
    rule: 'Artist-authored broadcast and fan-notification routes keep their hourly/daily rate caps. A muted fan is a lost fan, so the platform caps even a well-meaning artist.',
    owner: 'api/messages/broadcast + api/notifications/notify-subscribers',
    sourceOfTruth: 'route-level rate limits',
    enforcement: 'doc',
    enforcedBy: [],
    docs: ['docs/crwn-brain/07-BUSINESS-RULES.md'],
    notes: 'No test pins the caps today. Named gap; add if the caps regress.',
  },

  // ------------------------------------------------------------- ATTRIBUTION
  {
    id: 'ATTR-001',
    severity: 'P1',
    category: 'attribution',
    rule: 'campaignAttribution.ts is the ONE normalizer, and every dimension on CampaignAttribution is covered by the parser, the storage sanitizer, and the URL builder (or carries a registered exception). A new dimension silently dropped by one key map is the proven drift class.',
    owner: 'src/lib/analytics/campaignAttribution.ts',
    sourceOfTruth: 'EMPTY_ATTRIBUTION keys + ATTRIBUTION_DIMENSIONS in this registry',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/attribution.test.ts', 'src/lib/analytics/campaignAttribution.test.ts'],
    docs: ['docs/crwn-brain/25-POST-WIN-REFERRAL.md', 'docs/acquisition/campaign-tagging.md'],
  },
  {
    id: 'ATTR-002',
    severity: 'P0',
    category: 'attribution',
    rule: 'artist_ref (Post-Win, reporting only) and ref (recruiter/partner, a money rail) are separate rails. artist_ref has no alias, no cookie, and is never read into recruited_by / partner_code_used / artist_referrals paths.',
    owner: 'src/lib/analytics/campaignAttribution.ts (artistReferrer) vs src/components/shared/ReferralPersist.tsx (ref)',
    sourceOfTruth: 'docs/crwn-brain/25-POST-WIN-REFERRAL.md',
    enforcement: 'test',
    enforcedBy: ['src/lib/postWinReferral.test.ts', 'src/lib/architecture/attribution.test.ts'],
    docs: ['docs/crwn-brain/25-POST-WIN-REFERRAL.md'],
  },
  {
    id: 'ATTR-003',
    severity: 'P1',
    category: 'attribution',
    rule: 'Persisted attribution is FIRST touch (mergeAttribution never replaces a set field); the client beacon stays LAST touch. Two policies, on purpose.',
    owner: 'src/lib/analytics/campaignAttribution.ts (mergeAttribution)',
    sourceOfTruth: 'lead_magnet_results.input_data._attribution',
    enforcement: 'test',
    enforcedBy: ['src/lib/analytics/campaignAttribution.test.ts', 'src/lib/analytics/attributionLookup.test.ts'],
    docs: ['docs/acquisition/campaign-tagging.md'],
  },

  // -------------------------------------------------------------- NAVIGATION
  {
    id: 'NAV-001',
    severity: 'P2',
    category: 'navigation',
    rule: 'Every artist Studio destination also appears in the AccountHub hamburger (the COMPLETE index), unless a registered exception documents why.',
    owner: 'src/components/layout/AccountHub.tsx',
    sourceOfTruth: 'STUDIO_CARDS in src/app/(main)/studio/page.tsx',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/navigation.test.ts'],
    docs: ['CLAUDE.md'],
  },
  {
    id: 'NAV-002',
    severity: 'P2',
    category: 'navigation',
    rule: 'The fan AccountHub indexes the fan MONEY destination, so a fan who earned a commission can always navigate to it. Narrowed 2026-08-13 (pre-PMF surface reduction): the missions/squads/bounties/impact economy is hidden, so those entries went with it, but Share-to-Earn is actively marketed and its earnings + cashout surface (ReferralDashboard, on /library) must stay reachable. The PROPERTY is unchanged: a fan can always reach their own money.',
    owner: 'src/components/layout/AccountHub.tsx (fan sections)',
    sourceOfTruth: 'FAN_HUB_DESTINATIONS in this registry',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/navigation.test.ts'],
    docs: ['CLAUDE.md'],
  },
  {
    id: 'NAV-003',
    severity: 'P2',
    category: 'navigation',
    rule: 'Every bottom-nav slot is labeled for what it opens, and a surviving slot never changes its tourId (a persistence key: renaming one replays the tour for everyone who dismissed it). Rewritten 2026-08-13 (pre-PMF surface reduction): the fan slot is Library -> /library, which is where the fan money surface now lives; the Explore, Messages and Missions slots were removed and their anchors are simply no longer rendered, never reused.',
    owner: 'src/components/layout/Navigation.tsx',
    sourceOfTruth: 'buildNavItems',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/navigation.test.ts'],
    docs: ['CLAUDE.md'],
  },

  // ------------------------------------------------------------- TERMINOLOGY
  {
    id: 'TERM-001',
    severity: 'P3',
    category: 'terminology',
    rule: 'Retired user-facing vocabulary does not reappear in user-facing copy: "Action Plan" (now Needs You), "24/7 assistant" (retired Manager claim), "All-In-One Platform" (retired positioning). Compatibility identifiers, comments, and legacyNames are excluded.',
    owner: 'product vocabulary (Z5 renames + positioning)',
    sourceOfTruth: 'RETIRED_TERMS in this registry',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/terminology.test.ts', 'src/lib/constraint/ownership.test.ts'],
    docs: ['docs/POSITIONING.md', 'docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'TERM-002',
    severity: 'P3',
    category: 'terminology',
    rule: 'No em dash in user-facing copy. Enforced per-surface where copy is data (tier templates, calculators, campaign surfaces); everywhere else by review.',
    owner: 'copy rule (CLAUDE.md)',
    sourceOfTruth: 'CLAUDE.md Copy Rule',
    enforcement: 'test',
    enforcedBy: ['src/lib/tierTemplate.test.ts', 'src/lib/leadMagnets/conversionContract.test.ts', 'src/lib/campaigns/boundaries.test.ts'],
    docs: ['CLAUDE.md'],
  },

  // ------------------------------------------------------------- IDENTIFIERS
  {
    id: 'ID-001',
    severity: 'P1',
    category: 'identifiers',
    rule: 'FUNNEL_STAGES names are frozen: historical funnel_events rows and the funnel_events CHECK are keyed to them. Stages may be appended, never renamed or removed.',
    owner: 'src/lib/analytics/funnelEvents.ts',
    sourceOfTruth: 'FROZEN_FUNNEL_STAGES in this registry',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/identifiers.test.ts'],
    docs: ['docs/crwn-brain/13-CURRENT-STATE.md'],
  },
  {
    id: 'ID-002',
    severity: 'P1',
    category: 'identifiers',
    rule: 'Calculator slugs, analyticsMetadata.toolId values, and DM keywords are frozen: ManyChat triggers, campaign links, and historical funnel rows are keyed to them.',
    owner: 'src/lib/leadMagnets/registry.ts',
    sourceOfTruth: 'src/lib/leadMagnets/conversionContract.test.ts (frozen slug list)',
    enforcement: 'test',
    enforcedBy: ['src/lib/leadMagnets/conversionContract.test.ts'],
    docs: ['CLAUDE.md'],
  },
  {
    id: 'ID-003',
    severity: 'P1',
    category: 'identifiers',
    rule: 'Tier internal keys (wave | inner_circle | vault | throne) and every legacyNames entry are frozen: calculators, drafts, the offer builder, and duplicate-detection depend on them.',
    owner: 'src/lib/tierTemplate.ts',
    sourceOfTruth: 'RECOMMENDED_LADDER',
    enforcement: 'test',
    enforcedBy: ['src/lib/tierTemplate.test.ts'],
    docs: ['CLAUDE.md'],
  },
  {
    id: 'ID-004',
    severity: 'P1',
    category: 'identifiers',
    rule: 'Pop-up registry keys are frozen: popup_events history and frequency caps are keyed to them. A renamed key resets every user\'s frequency state for that pop-up.',
    owner: 'src/lib/popups/registry.ts',
    sourceOfTruth: 'FROZEN_POPUP_KEYS in this registry',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/identifiers.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'ID-005',
    severity: 'P1',
    category: 'identifiers',
    rule: 'Attribution storage and wire identifiers are frozen: ATTRIBUTION_INPUT_KEY (_attribution), the query-param names (utm_* aliases, artist_ref, from), and ARTIST_REF_PARAM. Stored rows and live campaign links depend on them.',
    owner: 'src/lib/analytics/campaignAttribution.ts',
    sourceOfTruth: 'ATTRIBUTION_DIMENSIONS in this registry',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/attribution.test.ts', 'src/lib/postWinReferral.test.ts'],
    docs: ['docs/crwn-brain/25-POST-WIN-REFERRAL.md'],
  },
  {
    id: 'ID-006',
    severity: 'P1',
    category: 'identifiers',
    rule: 'Tour persistence ids (tourId values) and compatibility routes (/action-plan, /welcome redirect, /api/admin/milestone wrapper, TAB_ROUTES) are stable. Renaming a tourId replays the tour for everyone who dismissed it; removing a compatibility route breaks deployed clients and sent emails.',
    owner: 'navigation + route history',
    sourceOfTruth: 'FROZEN_TOUR_IDS + COMPATIBILITY_ROUTES in this registry',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/identifiers.test.ts', 'src/lib/milestoneReconcile.test.ts'],
    docs: ['CLAUDE.md', 'docs/crwn-brain/02-FEATURE-MAP.md'],
  },

  // ------------------------------------------------------------ REACHABILITY
  {
    id: 'REACH-001',
    severity: 'P2',
    category: 'reachability',
    rule: 'Every feature in the FEATURES registry keeps its declared gate and at least one declared delivery surface in code. A feature declared live has a reachable surface; a dormant one has an explicit gate.',
    owner: 'FEATURES registry (this file)',
    sourceOfTruth: 'FEATURES in this registry',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/reachability.test.ts'],
    docs: ['docs/crwn-brain/13-CURRENT-STATE.md'],
    notes: 'Production flag VALUES are never asserted in unit tests; that is what verify:migrations-style probes are for.',
  },
  {
    id: 'REACH-002',
    severity: 'P2',
    category: 'reachability',
    rule: 'Every flag-gated announcement pop-up\'s flag is listed in ANNOUNCEABLE_FLAGS in the popups route, or its gate reads false forever and the announcement never fires.',
    owner: 'src/app/api/popups/route.ts',
    sourceOfTruth: 'POPUPS registry featureFlags vs ANNOUNCEABLE_FLAGS',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/reachability.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },
  {
    id: 'REACH-003',
    severity: 'P2',
    category: 'reachability',
    rule: 'Every route under src/app/api/cron/ is scheduled in vercel.json (except registered manual-trigger exceptions), and every schedule is at most daily. More-frequent-than-daily crons block ALL Vercel deployments on the Hobby plan.',
    owner: 'vercel.json',
    sourceOfTruth: 'vercel.json crons',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/reachability.test.ts'],
    docs: ['CLAUDE.md'],
  },
  {
    id: 'REACH-004',
    severity: 'P2',
    category: 'reachability',
    rule: 'A completion-only heartbeat is not evidence of meaningful work: dormant or conditional scheduled systems distinguish "ran" from "did work" (the ai-manager incident: a cron heartbeat certified a four-month outage as healthy).',
    owner: 'src/app/api/cron/agent-health/route.ts',
    sourceOfTruth: 'per-cron work counters',
    enforcement: 'test',
    enforcedBy: ['src/lib/ai/actionValidity.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
    notes: 'The dormancy markers themselves are pinned. A general work-vs-heartbeat framework is deliberately NOT built; this is a design rule for new crons.',
  },
  {
    id: 'REACH-005',
    severity: 'P2',
    category: 'reachability',
    rule: 'Tour copy on architecture-sensitive surfaces teaches the real boundary: Manager explains priority and does not own it; the Promise Calendar holds fan promises only; Team Splits allocate and are not a payout rail; Fan Drives are non-cash and canonical-rail-derived.',
    owner: 'src/lib/*TourSteps.ts',
    sourceOfTruth: 'the invariants those tours describe (PRIORITY-005, PROMISE-001, MONEY-007, MONEY-006)',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/reachability.test.ts'],
    docs: ['docs/crwn-brain/02-FEATURE-MAP.md'],
  },

  // ----------------------------------------------------------- AUTHORIZATION
  {
    id: 'AUTH-001',
    severity: 'P0',
    category: 'authorization',
    rule: 'Every route under src/app/api/admin/ is gated by requireAdmin, or is a registered exception with a documented different-authority reason (cron secret, internal secret, compatibility wrapper, inline role check).',
    owner: 'src/lib/auth/requireAdmin.ts',
    sourceOfTruth: 'ADMIN_ROUTE_EXCEPTIONS in src/lib/architecture/exceptions.ts',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/authorization.test.ts'],
    docs: ['docs/crwn-brain/11-SECURITY-AND-PRIVACY.md'],
  },
  {
    id: 'AUTH-002',
    severity: 'P0',
    category: 'authorization',
    rule: 'A route accepting an artistId from a client proves session ownership (requireArtistOwner or an inline user_id check) unless it is admin-authorized, secret-gated, or intentionally public read-only. Specialized inline checks are legitimate; unchecked client trust is not.',
    owner: 'src/lib/apiAuth.ts (requireArtistOwner) + verified inline checks',
    sourceOfTruth: 'route-level auth (middleware excludes /api/)',
    enforcement: 'doc',
    enforcedBy: ['src/lib/brainContract.test.ts'],
    docs: ['docs/crwn-brain/11-SECURITY-AND-PRIVACY.md'],
    notes: 'F-15 audited every inline check as correct and deliberately kept them. A full route-ownership manifest belongs to the upcoming security audit, not this registry.',
  },
  {
    id: 'AUTH-003',
    severity: 'P0',
    category: 'authorization',
    rule: 'Role promotion is server-side only (trg_promote_to_artist); no client path updates profiles.role. Revoked Stripe id columns are read only through the service-role helper.',
    owner: 'database triggers + src/lib/stripe/connectAccount.ts',
    sourceOfTruth: 'schema-phase2-rls-column-restrictions.sql / column privileges',
    enforcement: 'probe',
    enforcedBy: ['scripts/probe-migrations.mjs'],
    docs: ['docs/crwn-brain/11-SECURITY-AND-PRIVACY.md', 'CLAUDE.md'],
  },

  // ------------------------------------------------------------------- DOCS
  {
    id: 'DOCS-001',
    severity: 'P3',
    category: 'docs',
    rule: 'Canonical Brain docs (00, 01, 02, 13, 22, 23, 24 + CLAUDE.md) may not call a shipped system unbuilt, a live flag dark, or an applied migration pending.',
    owner: 'src/lib/brainContract.test.ts',
    sourceOfTruth: 'repository code + production probes',
    enforcement: 'test',
    enforcedBy: ['src/lib/brainContract.test.ts'],
    docs: ['docs/crwn-brain/00-START-HERE.md'],
  },
  {
    id: 'DOCS-002',
    severity: 'P3',
    category: 'docs',
    rule: 'EXPECTED_MIGRATION_STATE in this registry is the static contract for which migrations CRWN expects applied vs pending. Docs must agree with it; npm run verify:migrations is the live probe that validates the contract itself against production.',
    owner: 'this registry (static) + scripts/probe-migrations.mjs (live)',
    sourceOfTruth: 'EXPECTED_MIGRATION_STATE below',
    enforcement: 'test',
    enforcedBy: ['src/lib/brainContract.test.ts'],
    docs: ['docs/crwn-brain/13-CURRENT-STATE.md', 'TODO.md'],
  },

  // --------------------------------------------------- FAN TESTIMONIALS (V1)
  // The customer is the ARTIST; the author is the FAN. Everything below protects that split.
  {
    id: 'TESTIMONIAL-001',
    severity: 'P1',
    category: 'ownership',
    rule: 'The artist manages VISIBILITY, never AUTHORSHIP. No route, component or query writes fan_testimonials.body after insert; the DB freeze trigger reverts one that tries.',
    owner: 'src/app/api/artist/testimonials/route.ts + trg_freeze_testimonial_body',
    sourceOfTruth: 'src/lib/testimonials/server.ts (setTestimonialVisibility has no body parameter)',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/testimonials.test.ts'],
    docs: ['docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md'],
  },
  {
    id: 'TESTIMONIAL-002',
    severity: 'P1',
    category: 'authorization',
    rule: 'Artist testimonial management resolves the artist from the SESSION (artist_profiles.user_id = auth user), never from a caller-supplied artistId. Artist A can neither read nor feature Artist B testimonials.',
    owner: 'src/app/api/artist/testimonials/route.ts',
    sourceOfTruth: 'ownedArtistId() in that route',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/testimonials.test.ts'],
    docs: ['docs/crwn-brain/11-SECURITY-AND-PRIVACY.md', 'docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md'],
  },
  {
    id: 'TESTIMONIAL-003',
    severity: 'P1',
    category: 'authorization',
    rule: 'Submit and withdraw are authorized by the authenticated session only. No token payload, and no fanUserId-style parameter, may name the author. This is the defect POST /api/surveys carries and testimonials must not inherit.',
    owner: 'src/app/api/testimonials/route.ts',
    sourceOfTruth: 'session.user.id passed as fanId in that route',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/testimonials.test.ts'],
    docs: ['docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md'],
  },
  {
    id: 'TESTIMONIAL-004',
    severity: 'P0',
    category: 'ownership',
    rule: 'Public display requires EXPLICIT fan consent (consent_scope = crwn_only) as well as artist featuring. Automatic collection is never automatic publication.',
    owner: 'src/lib/testimonials/core.ts (isTestimonialPubliclyEligible) + the fan_testimonials_public view WHERE clause',
    sourceOfTruth: 'fan_testimonials.consent_scope',
    enforcement: 'test',
    enforcedBy: ['src/lib/testimonials/core.test.ts', 'src/lib/architecture/testimonials.test.ts'],
    docs: ['docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md'],
  },
  {
    id: 'TESTIMONIAL-005',
    severity: 'P1',
    category: 'measurement',
    rule: 'A verification badge derives from canonical relationship evidence at render. No stored label, no artist-set string, and no client-supplied verified flag decides it.',
    owner: 'src/lib/testimonials/core.ts (deriveVerification) + the view CASE expression',
    sourceOfTruth: 'subscriptions (status, is_founder, started_at) + subscription_tiers.price',
    enforcement: 'test',
    enforcedBy: ['src/lib/testimonials/core.test.ts', 'src/lib/architecture/testimonials.test.ts'],
    docs: ['docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md'],
  },
  {
    id: 'TESTIMONIAL-006',
    severity: 'P0',
    category: 'measurement',
    rule: 'The public testimonial payload carries no fan financial or PII field, and NEVER pairs a tier name with tenure. Tier and tenure are each safe alone and are a lifetime-spend disclosure together, which is the leaderboardPrivacy defect.',
    owner: 'src/lib/testimonials/core.ts (PublicTestimonial) + fan_testimonials_public',
    sourceOfTruth: 'src/lib/testimonials/core.ts',
    enforcement: 'test',
    enforcedBy: ['src/lib/testimonials/core.test.ts', 'src/lib/architecture/testimonials.test.ts'],
    docs: ['docs/crwn-brain/11-SECURITY-AND-PRIVACY.md', 'docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md'],
  },
  {
    id: 'TESTIMONIAL-007',
    severity: 'P2',
    category: 'communications',
    rule: 'A testimonial request is delivered ONLY through the Pop-up Engine and the fan hub card. It sends no email, writes no notification, and never outranks money, access or an obligation (lowest priority in the catalog).',
    owner: 'src/lib/popups/registry.ts (fan_share_experience) + src/components/fan/TestimonialRequestCard.tsx',
    sourceOfTruth: 'src/lib/popups/registry.ts',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/testimonials.test.ts'],
    docs: ['docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md'],
  },
  {
    id: 'TESTIMONIAL-008',
    severity: 'P1',
    category: 'ownership',
    rule: 'Private loyalty-survey research (survey_responses, survey_type = loyalty_fan) is never read as, promoted into, or migrated to a public testimonial. Answering a survey is not publication consent.',
    owner: 'src/lib/testimonials/*',
    sourceOfTruth: 'survey_responses vs fan_testimonials are separate domains',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/testimonials.test.ts'],
    docs: ['docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md'],
  },
  {
    id: 'TESTIMONIAL-009',
    severity: 'P2',
    category: 'measurement',
    rule: 'Trigger eligibility reads canonical tables (subscriptions, fulfillment_events) and never fan_events, whose money event types are declared but not written. Every fulfillment read passes isFanPromiseEvent.',
    owner: 'src/lib/testimonials/server.ts',
    sourceOfTruth: 'subscriptions + fulfillment_events',
    enforcement: 'test',
    enforcedBy: ['src/lib/architecture/testimonials.test.ts'],
    docs: ['docs/crwn-brain/27-AUTOMATED-FAN-TESTIMONIALS-ARCHITECTURE.md'],
  },
];

// ============================================================================
// SHARED CANONICAL DATA consumed by the architecture tests. One list each,
// referenced by id above, so no test hardcodes its own copy.
// ============================================================================

/**
 * ATTR-001 / ID-005. The canonical attribution dimensions: CampaignAttribution
 * field -> query-param name. Adding a dimension to the interface means adding
 * it here AND to every key map the test walks (parser, sanitizer, builder).
 * `coveredBy` marks which maps must carry it; 'dims' = attributionToFunnelDims.
 */
export const ATTRIBUTION_DIMENSIONS: ReadonlyArray<{
  field: string;
  param: string;
  /** maps that must cover this dimension */
  coveredBy: ReadonlyArray<'parser' | 'sanitizer' | 'builder' | 'dims'>;
}> = [
  { field: 'channel', param: 'utm_medium', coveredBy: ['parser', 'sanitizer', 'builder', 'dims'] },
  { field: 'platform', param: 'utm_source', coveredBy: ['parser', 'sanitizer', 'builder', 'dims'] },
  { field: 'campaign', param: 'utm_campaign', coveredBy: ['parser', 'sanitizer', 'builder', 'dims'] },
  { field: 'creative', param: 'utm_content', coveredBy: ['parser', 'sanitizer', 'builder', 'dims'] },
  { field: 'variant', param: 'variant', coveredBy: ['parser', 'sanitizer', 'builder', 'dims'] },
  { field: 'angle', param: 'angle', coveredBy: ['parser', 'sanitizer', 'builder', 'dims'] },
  { field: 'keyword', param: 'keyword', coveredBy: ['parser', 'sanitizer', 'builder', 'dims'] },
  { field: 'ref', param: 'ref', coveredBy: ['parser', 'sanitizer', 'builder', 'dims'] },
  { field: 'artistReferrer', param: 'artist_ref', coveredBy: ['parser', 'sanitizer', 'builder', 'dims'] },
  // 'entry' (?from=) is the sub-avatar entry context. It is persisted and merged
  // but DELIBERATELY not mapped onto funnel dims: the entry avatar rides its own
  // snapshot (ENTRY_AVATAR_KEY in leadMagnets/analytics.ts). See exceptions.ts.
  { field: 'entry', param: 'from', coveredBy: ['parser', 'sanitizer', 'builder'] },
];

/** ID-001. Frozen copy of FUNNEL_STAGES. Append-only; never rename or remove. */
export const FROZEN_FUNNEL_STAGES: readonly string[] = [
  'page_viewed',
  'calculator_started',
  'calculator_completed',
  'result_revealed',
  'assumptions_changed',
  'email_submitted',
  'signup_clicked',
  'account_created',
  'email_verified',
  'setup_started',
  'setup_completed',
  'builder_opened',
  'builder_published',
  'rise_mode_started',
  'mission_completed',
  'call_requested',
  'stripe_connected',
  'fans_imported',
  'fan_invited',
  'first_paid_conversion',
];

/** ID-004. Frozen pop-up keys: popup_events history + frequency caps key on these. Append-only. */
export const FROZEN_POPUP_KEYS: readonly string[] = [
  'artist_connect_stripe',
  'artist_resume_rise',
  'artist_post_win_referral',
  'artist_first_broadcast',
  'artist_upgrade_pro',
  'artist_pro_break_even',
  'artist_scale_break_even',
  'announce_launch_limits',
  'announce_fan_preview',
  'announce_membership_strategy',
  'announce_rise_one_move',
  'fan_first_support',
  'survey_artist_experience',
  'announce_live_tips',
  'announce_royalty_readiness',
  'announce_producer_sessions',
  'announce_hub_navigation',
  'announce_support_chat',
  'notice_terms_2026_07_24',
  'fan_share_experience',
  'notice_legal_2026_08_25',
];

/** ID-006. Tour anchors that are persistence keys (localStorage dismissal state). */
export const FROZEN_TOUR_IDS: readonly string[] = [
  'nav-home',
  'nav-studio',
  'nav-rise',
  'nav-library',
  'action-plan',
];

/**
 * ID-006. Anchors whose SURFACE was retired (2026-08-13 pre-PMF surface reduction removed the
 * Explore, Messages and fan Missions nav slots).
 *
 * The rule these came from is "never RENAME a tour id, because dismissal state persists under it
 * and renaming replays the tour for everyone". Removing the step entirely does not replay
 * anything: it just never fires. What WOULD hurt is reusing one of these ids for a different
 * destination later, which is why they are listed here and asserted absent rather than deleted
 * from the registry.
 */
export const RETIRED_TOUR_IDS: readonly string[] = ['nav-explore', 'nav-earn', 'nav-messages'];

/** ID-006. Routes kept alive purely for deployed clients, sent emails, and cached PWAs. */
export const COMPATIBILITY_ROUTES: ReadonlyArray<{ path: string; reason: string }> = [
  { path: 'src/app/(public)/welcome', reason: 'sent onboarding emails link to /welcome; it redirects to /setup' },
  { path: 'src/app/action-plan', reason: 'legacy path for the Needs You surface; tourId + analytics keyed to it' },
  { path: 'src/app/api/action-plan', reason: 'the Needs You API; wire field stays priority deliberately' },
  { path: 'src/app/api/admin/milestone', reason: 'compatibility wrapper for cached PWA clients still POSTing the old path (F-16)' },
  { path: 'src/lib/dashboardRoutes.ts', reason: 'TAB_ROUTES legacy ?tab= map; emails and notifications.link rows still use it' },
];

/** NAV-002. Fan destinations the fan AccountHub must index (F-08 / F-12). */
export const FAN_HUB_DESTINATIONS: readonly string[] = [
  // Narrowed by the 2026-08-13 pre-PMF surface reduction. /library is the fan's money surface:
  // it mounts ReferralDashboard (referral links, commissions, fan Stripe Connect, $25 cashout),
  // which is the complete Share-to-Earn loop and an actively promoted calculator's payoff.
  // /earn duplicated that dashboard and added clip earnings, so it was the copy that went.
  // The missions/squads/bounties/impact routes still exist and still work; they are simply not
  // indexed by default while zero fan referrals and near-zero mission rows exist.
  '/library',
];

/** TERM-001. Retired user-facing vocabulary. Matched only in label/title/JSX-text
 * contexts by terminology.test.ts, so identifiers, hrefs, and comments never trip it. */
export const RETIRED_TERMS: ReadonlyArray<{ term: string; replacement: string; reason: string }> = [
  {
    term: 'Action Plan',
    replacement: 'Needs You',
    reason: 'Z5 rename (2026-08-11). The /action-plan route and tourId are compatibility identifiers and stay.',
  },
  {
    term: '24/7 assistant',
    replacement: 'help working the canonical priority',
    reason: 'Retired Manager claim: Manager explains priority, it does not own it.',
  },
  {
    term: 'All-In-One Platform',
    replacement: 'Fan Economy Operating System',
    reason: 'Retired positioning (doc 23 ratified the category).',
  },
];

/**
 * REACH-001. Feature reachability registry: the static contract for every
 * meaningful gated/dark/dormant system. `expectedState` documents intent;
 * tests assert only CODE facts (gate exists, surface exists) — never
 * production flag values (probes own that).
 *
 * expectedState:
 *   live        = delivered to users today (flag on / no flag)
 *   dark        = built + gated off, awaiting a founder flip or migration
 *   dormant     = deliberately not running; founder decision open
 *   compat_only = kept solely for backward compatibility
 *   unverified  = docs disagree about production state; do not trust either claim
 */
export interface FeatureContract {
  key: string;
  title: string;
  expectedState: 'live' | 'dark' | 'dormant' | 'compat_only' | 'unverified';
  /** admin_settings flag key, or null when ungated. */
  flag: string | null;
  /** Module that reads the gate (must exist and mention the flag). */
  gateModule: string | null;
  /** Delivery surfaces: file must exist and contain the literal. */
  surfaces: ReadonlyArray<{ file: string; mustContain: string }>;
  /** Migration the feature depends on, if any (see EXPECTED_MIGRATION_STATE). */
  migration: string | null;
  notes?: string;
}

export const FEATURES: readonly FeatureContract[] = [
  {
    key: 'popup_engine',
    title: 'Pop-up Engine (interruption owner)',
    expectedState: 'live',
    flag: 'popup_engine',
    gateModule: 'src/lib/popups/index.ts',
    surfaces: [
      { file: 'src/app/api/popups/route.ts', mustContain: 'eligiblePopupFor' },
      // The (main) layout split on 2026-08-18: layout.tsx is now the server half
      // (it resolves the role so the tab bar and Home are correct in the first
      // HTML), and MainShell.tsx is the client half that mounts the delivery
      // surfaces. PopupHost moved with them; the surface is unchanged.
      { file: 'src/app/(main)/MainShell.tsx', mustContain: 'Popup' },
    ],
    migration: null,
    notes: 'Flag verified ON in production 2026-08-12 (16 popup_events).',
  },
  {
    key: 'quest_engine',
    title: 'Quest Engine / Rise Mode',
    expectedState: 'live',
    flag: 'quest_engine',
    gateModule: 'src/lib/quests/index.ts',
    surfaces: [
      // TWO surfaces since 2026-08-13, and the split is load-bearing. /quests renders the
      // BOARD. /profile/artist mounts the same component as `variant="driver"`, which renders
      // nothing and exists only to call /api/quests: that route ASSIGNS eligible quests and
      // auto-completes them server-side, so a Rise Mode that no longer showed the board but
      // also stopped calling it would have frozen every artist's quests and XP silently.
      { file: 'src/app/(main)/quests/page.tsx', mustContain: 'RiseMode' },
      { file: 'src/app/(main)/profile/artist/page.tsx', mustContain: "variant=\"driver\"" },
    ],
    migration: null,
    notes: 'Flag verified ON in production 2026-08-11 (326 quest_instances). Code default false. The board moved off the Rise Mode surface 2026-08-13 (one-next-move simplification); the engine still runs on every Rise Mode load.',
  },
  {
    key: 'fan_drives',
    title: 'Fan Drives / Virality Engine V1',
    expectedState: 'live',
    flag: null,
    gateModule: null,
    // Hidden from the Studio grid by the 2026-08-13 pre-PMF surface reduction (0 campaigns, 0
    // participants, and its only measurement source `referrals` is also 0). The delivery surface
    // is now the ROUTE, which is what "reachable" has to mean for a hidden feature.
    surfaces: [
      { file: 'src/app/fan-campaigns/page.tsx', mustContain: 'export' },
      { file: 'src/app/api/fan-campaigns/route.ts', mustContain: 'export' },
    ],
    migration: 'schema-phase3-fan-campaigns.sql',
    notes: 'Migration APPLIED (probe 2026-08-12). Docs calling it dark are drift (F-11).',
  },
  {
    key: 'membership_strategy',
    title: 'Membership strategy (Release Club / Vault)',
    expectedState: 'live',
    flag: null,
    gateModule: null,
    surfaces: [{ file: 'src/app/(main)/account/tiers/page.tsx', mustContain: 'StrategyCard' }],
    migration: 'schema-phase2-membership-strategy.sql',
    notes: 'Derived on read; the override save is live since the migration was applied and verified 2026-08-16 (it was fail-soft before that, and the fail-soft path stays as the guard it always was). Moved off Rise Mode to /account/tiers 2026-08-13: the strategy explains what each ladder rung is FOR, so it belongs where the ladder is edited, not on the screen that answers "what do I do next".',
  },
  {
    key: 'track_waterfall',
    title: 'Release waterfall (higher tiers first)',
    expectedState: 'live',
    flag: null,
    gateModule: null,
    surfaces: [{ file: 'src/app/api/cron/scheduled-releases/route.ts', mustContain: 'waterfall' }],
    migration: 'schema-phase2-track-waterfall.sql',
    notes: 'Migration PENDING; fails soft (fenced try/catch — the template for dark features).',
  },
  {
    key: 'royalty_readiness',
    title: 'Royalty Readiness Check',
    expectedState: 'live',
    flag: 'royalty_readiness',
    gateModule: 'src/lib/royalty/readiness.ts',
    // Hidden from Studio AND the hub by the 2026-08-13 pre-PMF surface reduction. The FLAG STAYS
    // ON and the feature is untouched: its delivery surface is now its own route plus the
    // royalty-readiness-check calculator's conversionTarget, which is the funnel path that
    // actually matters. A diagnostic does not need a default nav slot before anyone has data.
    surfaces: [
      { file: 'src/app/(main)/royalty-readiness/page.tsx', mustContain: 'export' },
      { file: 'src/lib/leadMagnets/registry.ts', mustContain: "route: '/royalty-readiness'" },
    ],
    migration: 'schema-phase2-royalty-readiness.sql',
    notes:
      'Reconciled 2026-08-12: flag ON (verify:flags) + migration applied. Diagnostic only, deliberately no dollar figure. The AccountHub entry is unconditional and that is CORRECT now the flag is on; the Studio tile and the Rise Mode card self-hide via the /api/royalty-readiness probe, so a future flag-off would still degrade cleanly everywhere except the hub link.',
  },
  {
    key: 'live_tips',
    title: 'Live tips + tip goals',
    expectedState: 'live',
    flag: 'live_tips',
    gateModule: 'src/lib/live/tips.ts',
    surfaces: [
      { file: 'src/app/api/stripe/live-tip-checkout/route.ts', mustContain: 'isLiveTipsEnabled' },
      { file: 'src/components/live/LiveWatchRoom.tsx', mustContain: 'LiveTipBar' },
    ],
    migration: 'schema-phase2-earnings-live-tip-type.sql',
    notes:
      'Reconciled 2026-08-12. FOUR SEPARATE FACTS, all now true: (1) schema accepts earnings.type=live_tip; (2) the money rail records it (webhook inserts the earning, recordFirstPaidConversion kind live_tip, live_tip classified in the notification taxonomy); (3) flag ON; (4) the fan-facing tip bar is mounted on the watch page and gated server-side through /api/live/tips. Before the CHECK migration, facts 1 and 2 could disagree: the funnel event fires OUTSIDE the earnings-insert guard, so a rejected insert recorded a conversion with no GMV.',
  },
  {
    key: 'producer_sessions',
    title: 'Executive Producer Sessions',
    expectedState: 'live',
    flag: 'producer_sessions',
    gateModule: 'src/lib/producer/access.ts',
    surfaces: [
      { file: 'src/app/api/producer/flag/route.ts', mustContain: 'isProducerSessionsEnabled' },
      { file: 'src/components/artist/LivestreamManager.tsx', mustContain: 'producerEnabled' },
      { file: 'src/components/live/LiveWatchRoom.tsx', mustContain: 'producerEnabled' },
    ],
    migration: 'schema-phase2-producer-sessions.sql',
    notes:
      'Reconciled 2026-08-12: flag ON + migration applied. Phase 1 only. There is NO dedicated page or Studio tile by design: every surface is grafted onto Live (artist submission controls + review queue in LivestreamManager, fan-side offer and polls in LiveWatchRoom). The fan submission agreement is FINAL (consent.ts stamps 2026-07-24.v1) and enforced at the submit route; the docs claim of a .draft1 attorney-review blocker was stale and never existed in code. Phase 2 (stage/mic, moderation, seat types) remains unbuilt.',
  },
  {
    key: 'sub_avatar',
    title: 'Sub-avatar classification (internal evidence)',
    expectedState: 'live',
    flag: null,
    gateModule: null,
    surfaces: [
      { file: 'src/app/api/admin/avatar-cohorts/route.ts', mustContain: 'export' },
      { file: 'src/components/admin/AvatarCohortsView.tsx', mustContain: 'export' },
    ],
    migration: 'schema-phase2-sub-avatar.sql',
    notes:
      'INTERNAL ACQUISITION/EVIDENCE DATA, surfaced ADMIN-ONLY. Not an artist-facing feature and must not become one casually: sub_avatar_audit is admin-read/service-write, sub_avatar_override carries no client grant, and the artist is never asked to self-select (pinned by onboardingBoundary.test.ts). The only artist-visible output is one derived sentence of setup copy that never names the avatar. /api/artist/avatar (the override writer) has no UI caller today; whether an artist-facing picker should exist is an open product question in docs/SUB_AVATARS.md, not an oversight.',
  },
  {
    key: 'acquisition_engine',
    title: 'Instagram/ManyChat acquisition engine',
    expectedState: 'live',
    flag: 'acquisition_engine',
    gateModule: 'src/lib/acquisition/db.ts',
    surfaces: [{ file: 'src/app/api/integrations/manychat/webhook/route.ts', mustContain: 'isAcquisitionEngineEnabled' }],
    migration: null,
  },
  {
    key: 'experiments',
    title: 'Experiments engine',
    expectedState: 'live',
    flag: 'experiments',
    gateModule: 'src/lib/experiments/server.ts',
    surfaces: [],
    migration: 'schema-phase2-experiments.sql',
  },
  {
    key: 'post_win_referral',
    title: 'Post-Win artist referral',
    expectedState: 'live',
    flag: null,
    gateModule: null,
    surfaces: [{ file: 'src/app/api/popups/route.ts', mustContain: 'buildReferralLink' }],
    migration: null,
    notes: 'Delivery rides the artist_post_win_referral pop-up; correctly silent until a first_paid_conversion exists.',
  },
  {
    key: 'autonomous_manager',
    title: 'Autonomous (scheduled) AI Manager — DELETED 2026-08-13',
    expectedState: 'compat_only',
    flag: null,
    gateModule: null,
    // The surviving surface is the artist-REQUESTED half: generate (insights on demand) and
    // execute (approval-gated actions, session-owned). The scheduled autonomous cron was deleted
    // because its dormancy rested on ONE accidental gate (an is_active filter on a nonexistent
    // column) and it would have re-armed auto-executing AI across every artist account the moment
    // that column appeared for any unrelated reason. Absence is pinned by managerBoundaries /
    // actionValidity / governor / postWinReferral / needsYouBoundary / managerOps tests.
    surfaces: [
      { file: 'src/app/api/ai-manager/generate/route.ts', mustContain: 'requireArtistOwner' },
      { file: 'src/app/api/ai-manager/execute/route.ts', mustContain: 'auth.getUser()' },
    ],
    migration: null,
    notes: 'Reactivating scheduled autonomy is a FOUNDER decision requiring new code, a new cron entry, and deliberate updates to the six test files that pin its absence. Historical artist_agent_runs rows retained, nothing writes them now.',
  },
  {
    key: 'support_chat',
    title: 'Support live chat',
    expectedState: 'live',
    flag: null,
    gateModule: null,
    surfaces: [{ file: 'src/app/(public)/support/page.tsx', mustContain: 'export' }],
    migration: 'schema-phase2-support-chat.sql',
  },
  {
    key: 'song_lab',
    title: 'Song Lab (per-artist fan voting: GB co-creation + Julius live shows)',
    // LIVE since 2026-08-20 (migration founder-applied and probe-verified). Every
    // surface reads the server-only artist_profiles.song_lab_enabled column through
    // src/lib/songLab/access.ts and fails soft/closed where it is false. The gate is
    // PER-ARTIST (launch_partner pattern), not an admin_settings flag. Enabled artists:
    // gb (co-creation, by the migration) and julius-williams (live-show fan capture,
    // data write 2026-08-20). A vote offer whose decision is open renders the ballot ON
    // the /join landing (live show mode) and the claim casts the carried vote after the
    // free join, through the same checkVote authority as /api/song-lab/vote.
    expectedState: 'live',
    flag: null,
    gateModule: 'src/lib/songLab/access.ts',
    surfaces: [
      { file: 'src/app/api/song-lab/vote/route.ts', mustContain: 'isSongLabEnabled' },
      { file: 'src/app/[slug]/lab/page.tsx', mustContain: 'songLabArtistBySlug' },
      { file: 'src/app/(main)/studio/lab/page.tsx', mustContain: 'SongLabManager' },
    ],
    migration: 'schema-phase2-song-lab.sql',
    notes: 'Artist-scoped by design; deliberately NO Studio tile and NO AccountHub entry (hidden route, opt-in artists only). Votes are advisory only, recognition is Special-Thanks-class only (RECOGNITION_DISCLAIMER in src/lib/songLab/core.ts). Remove by deleting src/lib/songLab, src/components/songlab, src/app/api/song-lab, the two [slug] pages and the studio page.',
  },
];

/**
 * DOCS-002. The STATIC migration-state contract. What CRWN expects; the live
 * probe (npm run verify:migrations) is what production actually has. When the
 * probe disagrees with this list, update THIS LIST and the docs together —
 * that disagreement is exactly the drift this contract exists to surface.
 * States: 'applied' (live-verified), 'pending' (known unapplied, fail-soft),
 * 'unverified' (docs disagree or no live check exists — trust neither claim).
 *
 * `liveCheck` names WHICH live layer verifies the entry, because not every
 * migration is visible to the same tool:
 *   'anon-probe' (default) — scripts/probe-migrations.mjs, run by verify:migrations.
 *   'sql-check'            — supabase/check-unverified-feature-state.sql, for objects
 *                            PostgREST cannot see. A widened CHECK constraint is the
 *                            case: `earnings?select=type` returns 200 whether or not
 *                            the constraint was fixed, so an anon probe there would
 *                            certify nothing while looking green.
 */
export const EXPECTED_MIGRATION_STATE: ReadonlyArray<{
  file: string;
  state: 'applied' | 'pending' | 'unverified';
  liveCheck?: 'anon-probe' | 'sql-check';
  note?: string;
}> = [
  // Cybersecurity audit 2026-08-12. These are RESTRICTIVE migrations, so their live
  // check runs the OPPOSITE contract to every other row here: a normal migration is
  // proved applied by data becoming READABLE, a security migration by access becoming
  // DENIED. probe-migrations.mjs has a dedicated section where 42501 is the PASS,
  // because an anon-executable volatile RPC answers 25006 over GET and the generic
  // loop would file that under "unclear" and stay green over an open hole.
  { file: 'schema-phase2-sec-002-rpc-execute-lockdown.sql', state: 'applied', note: 'SEC-002/011/V11; probe-verified 2026-08-12, anon EXECUTE 25006 -> 42501 on check_rate_limit, redeem_invite, user_passes_artist_gate; negative window rejected 22023' },
  // 'sql-check' and not an anon probe, on purpose: this finding is about what an
  // AUTHENTICATED user may WRITE, PostgREST cannot see a trigger, and the trigger
  // reverts silently rather than raising, so the write returns 204 whether or not the
  // migration ran. An anon probe here would certify nothing while looking green.
  { file: 'schema-phase2-sec-003-profiles-identity-freeze.sql', state: 'applied', liveCheck: 'sql-check', note: 'SEC-003; verified 2026-08-12 with a throwaway authenticated user: self-approve, email rewrite and role promotion each returned 204 and changed nothing, so the READ-BACK is the evidence, never the status code' },
  { file: 'schema-phase2-sec-004-007-rls-notifications-tier-benefits.sql', state: 'applied', note: 'SEC-004/007; probe-verified 2026-08-12, anon notifications INSERT 23503 -> 42501 and tier_benefits write 42501 while its public read still works for the storefront' },
  { file: 'schema-phase2-sec-012-money-table-rls-reproducibility.sql', state: 'applied', note: 'SEC-012; probe-verified 2026-08-12, all 15 service-role-only money/CRM tables answer 42501 to anon' },
  { file: 'schema-phase2-sec-earnings-recruiters-select-policies.sql', state: 'applied', note: 'SEC-012 remainder. earnings and recruiters were deliberately excluded from the migration above because a bare RLS enable with no policy would have broken an artist reading their OWN earnings. Run 2026-08-12: the transaction COMMITTED and the probe flipped 200 [] -> 42501 on both tables, which is why this is applied. The post-COMMIT self-verify still raised on assertion 5 (recruiters had a NON-permissive policy naming a Data API role, and the cleanup loop only dropped USING(true) ones, so the file asserted a property it never enforced). The loop now uses assertion 5\'s exact predicate; a re-run to a clean self-verify is open in TODO.md. Access state is closed either way: the REVOKEs committed, and Postgres checks table privileges before RLS, so the surviving policy was already unreachable.' },

  // Team Split funded reserve. D4 enforcement + D3 surplus + reserve traceability. PENDING: the
  // collaborator cashout rail stays 503 either way, and every reserve writer treats a missing
  // column/function as "no reserve", which accrues nothing. The live check is a sql-check because
  // the two functions are REVOKED from anon and authenticated by design, so an anon probe can only
  // ever say "denied", which is indistinguishable from "not created".
  {
    file: 'schema-phase2-team-split-funded-reserve.sql',
    state: 'applied',
    liveCheck: 'sql-check',
    note: 'founder-applied 2026-08-12, live-verified 2026-08-13 through the service role (the two functions are REVOKED from anon/authenticated, so an anon probe cannot distinguish denied from absent). Verified BEHAVIOUR, not existence: team_split_committed_percent returns 101 for 101% of net, 100 for 100%, and converts 89% of GROSS to 101.14% of net at the Launch fee while 88% lands exactly on 100; custom/unfenced sources return 0; anon execution of both functions is denied; accept_team_split_deal returns no row for an unknown deal. Columns funded_reserve_cents, payee_kind, artist_id, idempotency_key all present. Superseded note: authored 2026-08-12. Adds accept_team_split_deal (advisory-locked D4 enforcement), team_split_committed_percent, team_split_earnings.funded_reserve_cents, and the artist_surplus payout kind with a durable idempotency key. Until it runs, deal ACCEPTANCE returns 503 rather than binding an unenforceable commitment.',
  },

  // Team Split cap reservations. The last financial control: atomic, cross-rail cap grants plus
  // the provisional/funded distinction, D3 surplus linkage and the dispute freeze. PENDING: until
  // it runs, every grant returns ZERO, which funds no split and creates no liability, and the
  // collaborator cashout rail stays 503 regardless. liveCheck is 'sql-check' because all six
  // functions are REVOKED from anon and authenticated by design, so an anon probe can only ever
  // answer "denied", which is indistinguishable from "not created".
  {
    file: 'schema-phase2-team-split-cap-reservations.sql',
    state: 'applied',
    liveCheck: 'sql-check',
    note: 'founder-applied 2026-08-13, live-verified the same day against the INSTALLED primitive (28 checks, all pass, canary rows deleted, production back to 0 deals / 0 reservations / 0 accruals). Proven BEHAVIOURALLY, not by object existence: the 800+800 race against a 1000c cap clamps the second grant to 200 ACROSS RAILS (payment_intent + invoice); a re-grant on the same money identity returns the existing 800 and consumes no new headroom; a third rail gets 0 once exhausted; release returns headroom and a FUNDED reservation refuses release; surplus refuses provisional, refuses a second return on the same reservation, refuses more than reserved, and refuses frozen money; freeze/unfreeze are both idempotent; an uncapped deal grants in full. Security: anon cannot read, cannot forge a row, and cannot execute any of the six money functions (401 on all). Original note: authored 2026-08-13. Adds team_split_cap_reservations (closed to client roles) plus grant/fund/release/return/freeze/unfreeze functions, all service-role only. The grant locks the DEAL row and counts accruals AND live reservations, so two rails cannot reserve the same cap headroom. Its self-verify proves cap safety behaviourally (800 + 200 <= 1000 against a 1000c cap, with an idempotent re-grant) inside a rolled-back probe.',
  },

  // Fan Testimonials V1. Its live check INVERTS the usual contract on the base tables (42501 is
  // the PASS, because they are closed to every client role) and runs the normal way on the public
  // view (200 is the PASS, because the artist page must be able to read it). BOTH probe lines are
  // required: the view alone would prove the objects exist while saying nothing about closure, and
  // the tables alone cannot distinguish "closed" from "never created".
  {
    file: 'schema-phase2-fan-testimonials.sql',
    state: 'applied',
    note: 'founder-applied 2026-08-12; probe-verified the same day. fan_testimonials_public reads 200, both base tables answer anon 42501 on select(*) AND on every individual sensitive column. Properties verified beyond object existence: the public view emits exactly [id, artist_id, body, context_kind, submitted_at, display_name, verification_label, tenure_label] with no tier/price/fan_id; the authorship freeze reverts a service-role body rewrite (read-back is the evidence, not the status code); consent narrows but never re-widens; the (artist, fan, context) unique rejects a duplicate with 23505; artist_profiles.testimonial_requests_enabled exists and is true for all 9 artists. Generator ran live: 7 requests created, immediate re-run created 0.',
  },

  { file: 'schema-phase2-membership-strategy.sql', state: 'applied', note: 'Founder-applied 2026-08-16, live-verified the same day. All three columns readable; anon can read all three, which is the point (artist_profiles carries PER-COLUMN grants since the Stripe ids were revoked, and naming one ungranted column 42501s the entire statement, so a new column without a GRANT would break unrelated browser queries). Checked the other direction too: stripe_connect_id still answers 42501 to anon, so the grant was not widened. An invalid strategy value is refused 23514 by the CHECK. 9 artists, 0 overrides set, which is the expected NULL-means-derived state.' },

  // Early access becomes server-enforced. 'sql-check' because the change is a
  // FUNCTION BODY: PostgREST cannot see one, so an anon probe could only ever
  // certify that some track is readable, which proves nothing about the window.
  // Two live layers cover it instead: supabase/verify-early-access-window.sql
  // (transactional, creates each reader shape, asserts, ROLLBACKs) and the daily
  // rls-canary check `early_access_window_enforced`, which is vacuous until an
  // artist schedules a members-first release and asserts every day after that.
  //
  // Ordering matters and is not cosmetic: this must be applied BEFORE
  // track-waterfall below. The waterfall only ever schedules paid_first tracks,
  // which is precisely the state the oracle failed to gate, so applying the
  // waterfall first would make an unreachable hole reachable.
  {
    file: 'schema-phase2-early-access-window-enforcement.sql',
    state: 'applied',
    liveCheck: 'sql-check',
    note: 'Founder-applied 2026-08-13; sql-check returned applied=true, and the BEHAVIOUR was then proved live with the anon key against a throwaway canary track on the founder test artist (inserted, probed, deleted). In-window: can_play=false with audio_url_128 AND audio_url_320 both NULL. After the window: can_play=true and the locator returns. In-window with an EMPTY tier list: can_play=true, matching classifyTrack (a stray date must not lock out paying members). No regression: all 44 anon-visible free tracks still play and all 11 member-only tracks stay denied and redacted.',
  },
  { file: 'schema-phase2-track-waterfall.sql', state: 'applied', note: 'Founder-applied 2026-08-13, AFTER the early-access oracle as required (it schedules the very content class that oracle gates). Probe-verified: tracks.waterfall selectable and NULL on existing rows, so the daily cron\'s .not(waterfall,is,null) filter skips every current track and no in-flight release changed.' },
  // Drops the retired Manager outcome-scoring schema (view + three never-written columns).
  // 'sql-check' because a dropped column is invisible to an anon probe: the tables it lived on
  // are service-role-only, so 42501 reads the same before and after.
  { file: 'schema-phase2-drop-manager-outcome-schema.sql', state: 'pending', liveCheck: 'sql-check', note: 'Zero rows ever held outcome data (guarded in-file: it ABORTS if any row does). Dropping it closes K-11 from the surface-reduction audit.' },
  // The post-signup lifecycle send ledger. PENDING: until it runs, the cron's ledger INSERT errors
  // and the code treats anything that is not a 23505 as "no ledger available", so the emails send
  // exactly as they did before and are simply not recorded. Nothing breaks either way, which is
  // what makes it safe to ship ahead of the founder running it. Once applied, the next daily run
  // starts recording and the signed Resend webhook can attribute a delivery, bounce, open or click
  // to a platform sequence for the first time.
  { file: 'schema-phase2-platform-sequence-sends.sql', state: 'applied', note: 'Founder-applied 2026-08-16 and live-verified the same day, BEHAVIOUR not just existence: all 9 columns selectable, anon resolves the table and gets [] (admin-only SELECT policy holding), a bogus parent id is refused 23503, and a duplicate (enrollment_id, step_number) is refused 23505 through a canary pair that was then deleted, leaving the ledger empty. That 23505 is the exact code the cron reads as already-sent, so the idempotency guard the whole insert-before-send design rests on is proved rather than assumed. Before this, 45 emails reached real artists from 2026-04-01 leaving no record beyond an enrollment step counter. Mirrors prospect_nurture_sends deliberately, so the webhook and the admin reader share one shape.' },
  { file: 'schema-phase3-fan-campaigns.sql', state: 'applied', note: 'probe-verified 2026-08-12' },
  { file: 'schema-phase3-recommendation-outcomes.sql', state: 'applied', note: 'probe-verified 2026-08-11' },
  { file: 'schema-phase3-tier-transitions.sql', state: 'applied' },
  { file: 'schema-phase2-tier-events.sql', state: 'applied' },
  { file: 'schema-phase2-launch-partner.sql', state: 'applied' },
  { file: 'schema-phase2-frl-engagements.sql', state: 'applied' },
  { file: 'schema-phase2-experiments.sql', state: 'applied' },
  { file: 'schema-phase2-support-chat.sql', state: 'applied' },
  { file: 'schema-phase2-quest-engine.sql', state: 'applied' },
  // The four reconciled 2026-08-12: the founder ran check-unverified-feature-state.sql and all
  // four returned applied=true. Probe lines were added the same day, so these are now covered by
  // verify:migrations permanently and cannot drift back to "unverified" for lack of a check.
  { file: 'schema-phase2-royalty-readiness.sql', state: 'applied', note: 'founder SQL check 2026-08-12; probe line added same day' },
  { file: 'schema-phase2-producer-sessions.sql', state: 'applied', note: 'founder SQL check 2026-08-12; probe line added same day' },
  { file: 'schema-phase2-sub-avatar.sql', state: 'applied', note: 'founder SQL check 2026-08-12; the override column probes 42501 (no client grant), which is the applied signal' },
  {
    file: 'schema-phase2-earnings-live-tip-type.sql',
    state: 'applied',
    liveCheck: 'sql-check',
    note: 'founder SQL check 2026-08-12 (pg_constraint introspection). Widens earnings_type_check only; a CHECK constraint is invisible to PostgREST, so it is deliberately NOT in probe-migrations.mjs.',
  },
  // Song Lab (GB experiment). The probe expects song_lab_projects to resolve for anon
  // (public SELECT policy on non-archived rows) and the gate column to answer 42501
  // (no client grant), exactly like launch_partner.
  { file: 'schema-phase2-song-lab-public-votes.sql', state: 'pending', note: 'ONE narrow table, song_lab_public_votes, for a live-show vote whose email belongs to somebody else VERIFIED account. Unavoidable: song_lab_votes.fan_id is NOT NULL REFERENCES profiles(id) and profiles.id REFERENCES auth.users(id), so a counted vote needs an auth identity, one email can only have one auth user, and writing it against the real account would attribute an opinion to a person who never expressed it. Holds an HMAC participant_key (CHECK pins the digest shape so a raw email cannot be stored), never an email and never a user id; service-role writes only, artist-scoped SELECT policy, no anon grant. Until applied, that one branch answers needsSignIn instead of claiming a vote it did not store; every other path is unaffected.' },
  { file: 'schema-phase2-song-lab-live-shows.sql', state: 'pending', note: 'Two additive nullable columns for the live-show model: song_lab_projects.show_timezone (the event IANA zone, so a stored UTC close time can be re-displayed and re-edited as local wall time) and song_lab_offer_claims.source (qr | jubo | sms | link, a reporting dimension with a CHECK). NO new table: an event is a project and each show is a decision, which the schema already expressed. Every code path survives it being pending: projects are read with select(*), the claim insert retries without `source` on 42703, and the live-show creator drops show_timezone on PGRST204. Until it is applied the public "opens at" line falls back to America/New_York and QR-vs-JUBO is reported as not recorded, never as zero.' },
  { file: 'schema-phase3-distribution-finder.sql', state: 'applied', note: 'Founder-applied and probe-verified 2026-08-24: both admin-only tables (distribution_pages, distribution_mentions) answer the anon key 42501 (reads revoked, expected), and the first live Ryan Leslie search ran end to end the same day.' },
  { file: 'schema-phase3-distribution-page-index.sql', state: 'applied', note: 'Founder-applied and probe-verified 2026-08-24 (distribution_page_posts answers the anon key 42501, reads revoked as expected), and the live Brent Faiyaz search surfaced @purestrap (1.2M) from the indexed corpus the same day, proving the hybrid path end to end. The fail-soft fallbacks in store.ts stay as a guard.' },
  { file: 'schema-phase2-song-lab.sql', state: 'applied', note: 'Founder-applied 2026-08-20 and probe-verified the same day: anon reads song_lab_projects 200 [], the gate column answers 42501, song_lab_votes answers 42501, day_one_anr badge seeded, and the live /api/song-lab/public?artist=gb answers 200 with the real free tier id. The gate was gb-only at apply time; julius-williams was enabled later the same day by a service-role data write (probe: public?artist=julius-williams answers 200), so the file self-verify now asserts gb-is-enabled, not exactly-one.' },
];

/** Words that mean "this migration has not been applied" when they share a doc line with its filename. */
export const MIGRATION_PENDING_WORDS = /unapplied|not applied|unrun|not run|pending|waiting|dark until|until it runs|until the migration/i;
