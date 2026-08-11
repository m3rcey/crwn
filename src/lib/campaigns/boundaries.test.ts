import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// Z11: the Virality Engine's boundaries, asserted against the SOURCE so a future change has to
// argue with a test rather than quietly reintroduce a second source of truth.
//
// The falsifiable rule from the canonical architecture: if a campaign row and the canonical rail
// can ever disagree about who earned what, the boundary is wrong and one of the two is paying real
// money. Everything below is that rule, made mechanical.

// Comments are stripped before every assertion below. These files explain at length WHY they do
// not touch the money rails, and a test that grepped the prose would fail on the explanation while
// passing on the violation. Every assertion here is about CODE.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Line comments, but not the `//` inside a URL literal.
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const read = (p: string) => stripComments(readFileSync(p, 'utf8'));
const readRaw = (p: string) => readFileSync(p, 'utf8');

const STORE = read('src/lib/campaigns/store.ts');
const RESULTS = read('src/lib/campaigns/results.ts');
const ELIGIBILITY = read('src/lib/campaigns/eligibility.ts');
const ARCHETYPES = read('src/lib/campaigns/archetypes.ts');
const LIFECYCLE = read('src/lib/campaigns/lifecycle.ts');
const ROUTE_LIST = read('src/app/api/fan-campaigns/route.ts');
const ROUTE_ONE = read('src/app/api/fan-campaigns/[id]/route.ts');
const ROUTE_ACTIVE = read('src/app/api/fan-campaigns/active/route.ts');
const ROUTE_JOIN = read('src/app/api/fan-campaigns/join/route.ts');
// SQL keeps its comments: `--` is not stripped, and the migration's assertions are what is checked.
const MIGRATION = readRaw('supabase/schema-phase3-fan-campaigns.sql');
const REFERRALS = read('src/lib/referrals.ts');
const ATTRIBUTION = read('src/lib/attribution.ts');

const CAMPAIGN_SOURCES = [
  ['store', STORE],
  ['results', RESULTS],
  ['eligibility', ELIGIBILITY],
  ['archetypes', ARCHETYPES],
  ['lifecycle', LIFECYCLE],
  ['route: list/create', ROUTE_LIST],
  ['route: mutate', ROUTE_ONE],
  ['route: public', ROUTE_ACTIVE],
  ['route: join', ROUTE_JOIN],
] as const;

// ---------------------------------------------------------------------------
// The campaign never becomes a second source of truth
// ---------------------------------------------------------------------------

describe('the campaign spine writes to no canonical rail', () => {
  const CANONICAL_TABLES = [
    'referrals',
    'referral_earnings',
    'earnings',
    'subscriptions',
    'fan_payouts',
    'referral_clicks',
  ];

  it.each(CAMPAIGN_SOURCES)('%s never inserts, updates or upserts anything', (_label, src) => {
    // Every write in the campaign layer targets fan_campaigns or fan_campaign_participants. This
    // asserts it by checking that no canonical table name appears next to a write verb.
    for (const table of CANONICAL_TABLES) {
      for (const verb of ['insert', 'update', 'upsert', 'delete']) {
        const pattern = new RegExp(`from\\(['"]${table}['"]\\)[^;]{0,200}\\.${verb}\\(`, 's');
        expect(pattern.test(src), `${_label} must not ${verb} ${table}`).toBe(false);
      }
    }
  });

  it('reads the referral rail and never recomputes a commission from a rate', () => {
    expect(STORE).toContain("from('referrals')");
    expect(STORE).toContain("from('referral_earnings')");
    // A rate multiplied here and a rate stored there are two numbers that eventually disagree.
    for (const src of [STORE, RESULTS]) {
      expect(src).not.toContain('commission_rate');
      expect(src).not.toContain('referral_commission_rate');
      expect(src).not.toContain('clipper_commission_rate');
    }
  });

  it('never touches the payout rail', () => {
    for (const [label, src] of CAMPAIGN_SOURCES) {
      expect(src, `${label} must not touch payouts`).not.toContain('insertHeldReferralEarning');
      expect(src, `${label} must not touch payouts`).not.toContain('atomic_fan_cashout');
      expect(src, `${label} must not touch payouts`).not.toContain('PAYOUT_HOLD_DAYS');
    }
  });

  it('leaves the existing referral money rails untouched by Z11', () => {
    // processReferral still decides attribution and commission at the Stripe webhook, and it knows
    // nothing about campaigns. If a campaign id ever appears in here, the boundary has moved.
    expect(REFERRALS).not.toMatch(/campaign/i);
    expect(ATTRIBUTION).not.toMatch(/campaign/i);
  });
});

describe('the campaign carries no money and no new cash rule', () => {
  it('has no money column in the schema, and the migration asserts it', () => {
    expect(MIGRATION).toContain('campaign spine must carry no money column');
    expect(MIGRATION).toContain("CHECK (incentive_kind = 'non_cash')");
  });

  it('only ever grants an EXISTING non-cash badge', () => {
    expect(STORE).toContain('awardFanBadge');
    expect(ARCHETYPES).toContain("kind: 'non_cash'");
    // No prize, no pool, no payout amount anywhere in the layer.
    for (const [label, src] of CAMPAIGN_SOURCES) {
      expect(src, `${label} must invent no prize`).not.toMatch(/prizeAmount|prizePool|payoutAmount|bountyAmount/);
    }
  });
});

// ---------------------------------------------------------------------------
// Z3: one logical recommendation
// ---------------------------------------------------------------------------

describe('Z3 recommendation identity stays singular', () => {
  it('no campaign surface issues a recommendation record', () => {
    for (const [label, src] of CAMPAIGN_SOURCES) {
      expect(src, `${label} must not issue a Z3 record`).not.toContain('recordIssuedRecommendation');
      expect(src, `${label} must not write the Z3 table`).not.toContain('constraint_recommendations');
    }
  });

  it('references the EXISTING durable action identity rather than minting one', () => {
    expect(ROUTE_LIST).toContain('actionKeyFor');
    expect(MIGRATION).toContain('recommendation_action_key');
  });

  it('reads the canonical engine rather than diagnosing anything itself', () => {
    expect(ROUTE_LIST).toContain('readConstraint');
    expect(ELIGIBILITY).not.toContain('readConstraint');
    // Eligibility takes an already-produced result; it has no evidence assembler and no thresholds.
    expect(ELIGIBILITY).not.toContain('assembleConstraintEvidence');
    expect(ELIGIBILITY).not.toContain('CONSTRAINT_THRESHOLDS');
  });
});

// ---------------------------------------------------------------------------
// Z9 / Z10: no adaptive selection
// ---------------------------------------------------------------------------

describe('archetype selection is deterministic, never learned', () => {
  it('uses no artist-observed rates and no cross-artist evidence', () => {
    for (const [label, src] of CAMPAIGN_SOURCES) {
      expect(src, `${label} must not use Z9 learning`).not.toContain('artistObserved');
      expect(src, `${label} must not use Z10 cohorts`).not.toContain('crossArtistEvidence');
      expect(src, `${label} must not use cross-artist patterns`).not.toContain('crossArtistPatterns');
    }
  });

  it('involves no model at any point', () => {
    for (const [label, src] of CAMPAIGN_SOURCES) {
      expect(src, `${label} must not call a model`).not.toMatch(/deepseek|openai|generateActions/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Security
// ---------------------------------------------------------------------------

describe('every campaign route self-authenticates', () => {
  it('resolves the artist from the session, never from a client-supplied id', () => {
    for (const [label, src] of [
      ['list/create', ROUTE_LIST],
      ['mutate', ROUTE_ONE],
    ] as const) {
      expect(src, `${label} resolves from session`).toContain("eq('user_id', user.id)");
      expect(src, `${label} takes no artistId`).not.toMatch(/searchParams\.get\(['"]artistId['"]\)/);
    }
  });

  it('checks campaign ownership before mutating it', () => {
    expect(ROUTE_ONE).toContain('campaign.artist_id !== artist.id');
    // Not-found rather than forbidden: a 403 would confirm another artist's campaign exists.
    expect(ROUTE_ONE).toContain("{ error: 'Not found' }, { status: 404 }");
  });

  it('never lets a caller name the participant', () => {
    expect(ROUTE_JOIN).toContain('user.id');
    expect(ROUTE_JOIN).not.toMatch(/body\.fanId|params\.fanId/);
    // The role comes from the archetype, not the request body.
    expect(ROUTE_JOIN).toContain('archetype.acceptedRoles[0]');
    expect(ROUTE_JOIN).not.toMatch(/body\.role/);
  });

  it('never names a SELECT-revoked column from a session client', () => {
    for (const [label, src] of CAMPAIGN_SOURCES) {
      expect(src, `${label} must not read revoked columns`).not.toContain('stripe_connect_id');
      expect(src, `${label} must not read revoked columns`).not.toContain('platform_stripe');
      expect(src, `${label} must not select * from artist_profiles`).not.toMatch(
        /from\(['"]artist_profiles['"]\)[\s\S]{0,80}select\(['"]\*/,
      );
    }
  });
});

describe('the public payload publishes only what it means to', () => {
  it('never ships the artist private constraint or the Z3 identity', () => {
    // These appear only in comments explaining why they are excluded, never in the returned object.
    const returned = ROUTE_ACTIVE.slice(ROUTE_ACTIVE.indexOf('const publicCampaign'));
    expect(returned).not.toMatch(/source_constraint:/);
    expect(returned).not.toMatch(/recommendation_action_key:/);
  });

  it('publishes no ranking and no other participant', () => {
    expect(ROUTE_ACTIVE).not.toMatch(/leaderboard|ranking|topParticipants/i);
    // Only the caller's own conversions are counted, keyed on their own session id.
    expect(ROUTE_ACTIVE).toContain("eq('referrer_fan_id', user.id)");
  });

  it('the drive itself declares no ranked capability', () => {
    expect(ARCHETYPES).toContain("IMPLEMENTED_CAPABILITIES");
    expect(ARCHETYPES).not.toMatch(/capabilities: \[[^\]]*'ranked'/);
  });
});

describe('the migration is hardened the way Z3 and Z8 taught', () => {
  it('enables RLS, ships only SELECT policies and self-verifies', () => {
    expect(MIGRATION).toContain('ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION).toContain('RAISE EXCEPTION');
    expect(MIGRATION).toContain("NOTIFY pgrst, 'reload schema'");
    expect(MIGRATION).toContain('must have no client write policy');
  });

  it('keeps one active campaign per artist, which is what makes the window unambiguous', () => {
    expect(MIGRATION).toContain('idx_fan_campaigns_one_active');
    expect(MIGRATION).toContain("WHERE status = 'active'");
  });

  it('makes a repeat join impossible', () => {
    expect(MIGRATION).toContain('UNIQUE (campaign_id, fan_id)');
  });
});

// ---------------------------------------------------------------------------
// Measurement integrity
// ---------------------------------------------------------------------------

describe('measurement never overstates itself', () => {
  it('never accepts a self-reported metric', () => {
    for (const [label, src] of CAMPAIGN_SOURCES) {
      expect(src, `${label} must not take a claimed view count`).not.toMatch(
        /viewCount|views:|reportedViews|selfReported/,
      );
    }
  });

  it('keeps joining and acquiring apart, and names nothing causally', () => {
    // A join is a volunteer, not a fan acquired. They are separate fields, and no field in the
    // report may be named as though the campaign produced the outcome.
    expect(RESULTS).toContain('participants');
    expect(RESULTS).toContain('verifiedPaidConversions');
    expect(RESULTS).not.toMatch(/\b(caused|causedBy|impact|lift|drove|attributedRevenue)\b/);
  });

  it('carries no em dash in any user-facing string', () => {
    // Code comments follow the repo's existing house style; the rule is about copy an artist or fan
    // can read, so the comment-stripped source is what is checked.
    for (const [label, src] of CAMPAIGN_SOURCES) {
      expect(src, `${label} must not use an em dash`).not.toContain('—');
    }
    expect(read('src/components/campaigns/CampaignJoin.tsx')).not.toContain('—');
    expect(read('src/app/fan-campaigns/page.tsx')).not.toContain('—');
  });
});
