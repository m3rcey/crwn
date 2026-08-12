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
