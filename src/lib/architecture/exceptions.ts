// ============================================================================
// CRWN ARCHITECTURE EXCEPTIONS — the ONE place intentional deviations live.
// ============================================================================
// Every entry names the invariant it excepts, the owning system, and WHY the
// canonical rule does not apply. Tests consume these lists; scattered
// "// ignore drift test" comments are forbidden. An exception with no reason
// is a bug; registry.test.ts asserts every entry references a real invariant.
//
// The chokepoint allowlist (COMMS-001) deliberately stays where it already
// lives — DIRECT_WRITER_ALLOWLIST in src/lib/comms/chokepoint.test.ts — because
// it is bidirectionally enforced there and moving a working allowlist is churn.
// ============================================================================

export interface ArchException {
  /** Invariant this excepts (must exist in INVARIANTS). */
  invariant: string;
  /** The excepted file, value, or identifier. */
  subject: string;
  /** The system that owns the exception. */
  owner: string;
  /** Why the canonical rule does not apply here. */
  reason: string;
}

/**
 * MONEY-004: files (besides src/lib/webhookHandlers.ts) allowed to insert rows
 * carrying net_amount.
 */
export const EARNINGS_WRITER_EXCEPTIONS: readonly ArchException[] = [
  {
    invariant: 'MONEY-004',
    subject: 'src/app/api/cron/team-split-selfcheck/route.ts',
    owner: 'Team Splits self-check',
    reason:
      'Manual-trigger verification canary: writes one fake earning row (description ts-canary) to prove the accrual pipeline end-to-end, then cleans up. Not a revenue rail.',
  },
];

/**
 * AUTH-001: routes under src/app/api/admin/ that intentionally do not call
 * requireAdmin. Each carries a DIFFERENT authority, verified in the F-15
 * remediation. Removing an entry means converting the route to requireAdmin.
 */
export const ADMIN_ROUTE_EXCEPTIONS: readonly ArchException[] = [
  {
    invariant: 'AUTH-001',
    subject: 'src/app/api/admin/agent/autonomous/route.ts',
    owner: 'CRWN business agent (cron)',
    reason: 'CRON_SECRET bearer auth: invoked by scheduler, not by an admin session.',
  },
  {
    invariant: 'AUTH-001',
    subject: 'src/app/api/admin/agent/briefing/route.ts',
    owner: 'CRWN business agent (cron)',
    reason: 'CRON_SECRET bearer auth: scheduled in vercel.json, no session exists.',
  },
  {
    invariant: 'AUTH-001',
    subject: 'src/app/api/admin/track/route.ts',
    owner: 'internal funnel tracking',
    reason:
      'INTERNAL_TRACK_SECRET header from middleware; fails open until the secret is configured so tracking never silently dies on deploy. Not an admin session surface.',
  },
  {
    invariant: 'AUTH-001',
    subject: 'src/app/api/admin/milestone/route.ts',
    owner: 'onboarding compatibility',
    reason:
      'F-16 compatibility wrapper re-exporting /api/artist/milestone (artist SELF-SERVICE). Admin-gating it would break deployed clients and cached PWA bundles still POSTing the old path.',
  },
  {
    invariant: 'AUTH-001',
    subject: 'src/app/api/admin/crm/outreach/track/[sendId]/route.ts',
    owner: 'CRM outreach tracking',
    reason:
      'Intentionally PUBLIC read-only endpoint: the 1x1 open-tracking pixel and click redirect embedded in outreach emails. Keyed on the unguessable sendId; an admin gate would break tracking for every recipient. Verified deliberate in F-15.',
  },
  {
    invariant: 'AUTH-001',
    subject: 'src/app/api/admin/crm/outreach/unsubscribe/[sendId]/route.ts',
    owner: 'CRM outreach compliance',
    reason:
      'Intentionally PUBLIC endpoint: the unsubscribe link in outreach emails. Gating unsubscribe behind an admin session would be a compliance failure, not a fix. Verified deliberate in F-15.',
  },
];

/**
 * MEASURE-002: admin files allowed to define an `activated` value that does not
 * source funnel_events first_paid_conversion, because their "activated" is a
 * DIFFERENT canonical concept, honestly named in its own domain.
 */
export const ADMIN_ACTIVATED_EXCEPTIONS: readonly ArchException[] = [
  {
    invariant: 'MEASURE-002',
    subject: 'src/app/api/admin/experiment-analytics/route.ts',
    owner: 'Opportunity Ledger (Money Model measurement)',
    reason:
      'Reads opportunity_ledger.activated, the per-feature adoption column (revealed/activated/captured semantics from doc 21). It is feature activation, not artist activation, and is never presented as the activation funnel.',
  },
  {
    invariant: 'MEASURE-002',
    subject: 'src/app/api/admin/opportunity/route.ts',
    owner: 'Opportunity Ledger (Money Model measurement)',
    reason:
      'Same opportunity_ledger.activated column as above: the admin rollup of revealed/activated/captured money per feature. Feature adoption, not artist activation.',
  },
];

/**
 * NAV-001: Studio destinations allowed to be absent from the artist AccountHub.
 * Currently empty on purpose — the documented rule is full parity. Add an entry
 * only with a founder-visible reason.
 */
export const STUDIO_HUB_PARITY_EXCEPTIONS: readonly ArchException[] = [];

/**
 * ATTR-001: attribution dimensions a specific key map may legitimately omit.
 * Encoded as `${mapName}:${field}`.
 */
export const ATTRIBUTION_COVERAGE_EXCEPTIONS: readonly ArchException[] = [
  {
    invariant: 'ATTR-001',
    subject: 'dims:entry',
    owner: 'sub-avatar entry tracking',
    reason:
      'attributionToFunnelDims deliberately drops entry (?from=): the entry avatar rides its own snapshot (ENTRY_AVATAR_KEY in leadMagnets/analytics.ts) and stamping it as a funnel dim would double-count the dimension.',
  },
];

/**
 * REACH-003: cron routes that exist on disk but are deliberately NOT scheduled.
 */
export const UNSCHEDULED_CRON_EXCEPTIONS: readonly ArchException[] = [
  {
    invariant: 'REACH-003',
    subject: 'src/app/api/cron/team-split-selfcheck/route.ts',
    owner: 'Team Splits self-check',
    reason: 'Manual-trigger-only verification canary, documented in-file. Deliberately unscheduled.',
  },

  // ── 2026-08-13 pre-PMF surface reduction: DISABLED, code kept ─────────────────────────────
  // Founder decision. Each of these owns a feature that is hidden or has a zero-row population,
  // so a daily run does nothing but spend attention and a Hobby cron slot. The IMPLEMENTATION is
  // preserved so re-enabling is one vercel.json line; the `reason` names the re-enable trigger,
  // which is the condition to check before restoring the schedule.
  {
    invariant: 'REACH-003',
    subject: 'src/app/api/cron/fan-digest/route.ts',
    owner: 'Fan digest',
    reason: 'DISABLED 2026-08-13: a weekly email about a nearly-empty platform risks unsubscribes from the few real fans. Re-enable when artists post enough that a digest has content (roughly: posts per week per artist > 3).',
  },
  {
    invariant: 'REACH-003',
    subject: 'src/app/api/cron/inactive-subscribers/route.ts',
    owner: 'Inactive-subscriber re-engagement',
    reason: 'DISABLED 2026-08-13: 14-day-inactivity emails across ~11 active subscriptions is noise. Re-enable when active subscriptions exceed ~50.',
  },
  {
    invariant: 'REACH-003',
    subject: 'src/app/api/cron/sequence-conversions/route.ts',
    owner: 'Artist sequence conversion attribution',
    reason: 'DISABLED 2026-08-13: attributes conversions for the artist sequence builder, which is hidden. Re-enable with the sequence builder.',
  },
  {
    invariant: 'REACH-003',
    subject: 'src/app/api/cron/lead-scoring/route.ts',
    owner: 'Artist CRM fan engagement scoring',
    reason: 'DISABLED 2026-08-13: per-fan engagement scoring across a 69-account platform. NOT the acquisition lead scorer (that is decideCallRequest, request-time, unaffected). Re-enable when a pilot artist has a fan base large enough that the CRM needs ranking.',
  },
  {
    invariant: 'REACH-003',
    subject: 'src/app/api/cron/clipper-rate-drops/route.ts',
    owner: 'Clipper rate drops',
    reason: 'DISABLED 2026-08-13: warns clippers ahead of a rate cut; 0 bounties and 1 VOD marker exist. Re-enable with the clipper program.',
  },
  {
    invariant: 'REACH-003',
    subject: 'src/app/api/cron/team-split-accruals/route.ts',
    owner: 'Team Split accruals',
    reason: 'DISABLED 2026-08-13: writes held accrual rows for collaborator deals; 0 deals exist. RE-ENABLE WITH THE FIRST REAL TEAM SPLIT DEAL, before any earning that deal should share in.',
  },
  {
    invariant: 'REACH-003',
    subject: 'src/app/api/cron/agent-health/route.ts',
    owner: 'Agent swarm health check',
    reason: 'DISABLED 2026-08-13: monitored the autonomous Manager (cron deleted) and the admin agent briefing (schedule disabled), and once certified a dead cron as healthy. Re-enable only if scheduled agent execution returns.',
  },
  {
    invariant: 'REACH-003',
    subject: 'src/app/api/cron/recruiter-qualify/route.ts',
    owner: 'Recruiter qualification + flat-fee payout',
    reason: 'DISABLED 2026-08-13 on production evidence: 0 artist_referrals rows, 0 recruiter_payouts rows, 0 invite-code uses, 0 artists on a paid plan, so it cannot fire. Recruiter DATA and code are retained. RE-ENABLE ON THE FIRST REAL artist_referrals ROW (or at the affiliate phase), BEFORE the referred artist can qualify: it pays real money via Stripe transfers.',
  },
  {
    invariant: 'REACH-003',
    subject: 'src/app/api/cron/recruiter-recurring/route.ts',
    owner: 'Recruiter recurring revenue share',
    reason: 'DISABLED 2026-08-13, same evidence as recruiter-qualify: it pays only on status=qualified referrals, and qualification can only come from recruiter-qualify. Same re-enable trigger, same money warning.',
  },
];

/**
 * TERM-001: files exempt from the retired-vocabulary scan.
 */
export const TERMINOLOGY_EXCEPTIONS: readonly ArchException[] = [
  {
    invariant: 'TERM-001',
    subject: 'src/lib/dashboardRoutes.ts',
    owner: 'legacy ?tab= compatibility',
    reason: 'TAB_ROUTES maps historical tab names for links already sitting in emails; identifiers, not copy.',
  },
];

/** Every exception list, for registry integrity checks. */
export const ALL_EXCEPTIONS: readonly ArchException[] = [
  ...EARNINGS_WRITER_EXCEPTIONS,
  ...ADMIN_ROUTE_EXCEPTIONS,
  ...ADMIN_ACTIVATED_EXCEPTIONS,
  ...STUDIO_HUB_PARITY_EXCEPTIONS,
  ...ATTRIBUTION_COVERAGE_EXCEPTIONS,
  ...UNSCHEDULED_CRON_EXCEPTIONS,
  ...TERMINOLOGY_EXCEPTIONS,
];
