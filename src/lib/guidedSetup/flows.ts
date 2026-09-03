// guidedSetup/flows.ts: the registry of Rise Mode guided flows, and the ONE place their entry
// paths live.
//
// A Rise Mode quest never drops an artist into a blank generic screen. Each configuration-heavy
// quest opens a guided flow under /build/<flow> that already knows the artist, pre-fills every
// fact CRWN holds, asks only for the decisions CRWN cannot make, writes canonical rows, and
// returns to Rise Mode, where the quest completes from real state on the next read.
//
// PURE. The roadmap (src/lib/artistRoadmap.ts), the quest CTA map
// (src/components/quests/questRoutes.ts) and the funnel readiness report all point at flows
// through this table, so a flow's route changes in exactly one line. A flow whose builder has not
// shipped yet declares `legacyHref`: the /build shell forwards there, so no Rise Mode link ever
// 404s while the guided builders land phase by phase.

export type GuidedFlowKey = 'offer' | 'magnet' | 'experience' | 'followup' | 'stripe' | 'funnel' | 'test' | 'launch';

export type GuidanceType = 'direct' | 'prefill' | 'guided' | 'observed';

export interface GuidedFlowDef {
  key: GuidedFlowKey;
  /** The Rise Mode quest label. Outcomes, never internals. */
  title: string;
  guidance: GuidanceType;
  /** Where the flow lives once built. */
  href: string;
  /** Where the /build shell forwards until the builder ships. Null once it has. */
  legacyHref: string | null;
}

export const GUIDED_FLOWS: Record<GuidedFlowKey, GuidedFlowDef> = {
  offer: {
    key: 'offer',
    title: 'Build your offer',
    guidance: 'guided',
    href: '/build/offer',
    legacyHref: '/account/tiers',
  },
  magnet: {
    key: 'magnet',
    title: 'Give fans something worth joining for',
    guidance: 'guided',
    href: '/build/magnet',
    legacyHref: '/studio/automations',
  },
  experience: {
    key: 'experience',
    title: 'Show fans why the paid tier is worth it',
    guidance: 'guided',
    href: '/build/experience',
    legacyHref: '/account/tiers',
  },
  followup: {
    key: 'followup',
    title: 'Follow up with fans who do not buy yet',
    guidance: 'guided',
    href: '/build/followup',
    legacyHref: '/studio/fans?view=sequences',
  },
  stripe: {
    key: 'stripe',
    title: 'Get paid to your own account',
    guidance: 'direct',
    // The ONLY Connect Stripe control in the product lives in TierManager (with its Artist
    // Agreement gate); the payouts screen has no way to connect.
    href: '/account/tiers',
    legacyHref: null,
  },
  funnel: {
    key: 'funnel',
    title: 'Turn it on',
    guidance: 'prefill',
    href: '/build/funnel',
    legacyHref: '/studio/automations',
  },
  test: {
    key: 'test',
    title: 'Test it',
    guidance: 'guided',
    href: '/build/test',
    legacyHref: '/studio/automations',
  },
  launch: {
    key: 'launch',
    title: 'Launch it',
    guidance: 'guided',
    href: '/build/launch',
    legacyHref: '/studio/automations',
  },
};

export const GUIDED_FLOW_KEYS = Object.keys(GUIDED_FLOWS) as GuidedFlowKey[];

export function isGuidedFlowKey(v: unknown): v is GuidedFlowKey {
  return typeof v === 'string' && v in GUIDED_FLOWS;
}

/** The href Rise Mode and the quest board hand out for a flow. */
export function guidedFlowHref(key: GuidedFlowKey): string {
  return GUIDED_FLOWS[key].href;
}

/** Same-site paths only. An absolute or protocol-relative value is refused, never followed. */
export function safeSitePath(v: string | null | undefined, fallback: string): string {
  if (!v || !v.startsWith('/') || v.startsWith('//')) return fallback;
  return v;
}

/** Where Rise Mode expects the artist back. Every flow returns here unless told otherwise. */
export const RISE_MODE_PATH = '/profile/artist';
