import { describe, it, expect } from 'vitest';
import { campaignPhase, campaignReadiness, presentCampaign, isRulesUrl, type CampaignRow } from './giveaway';

const NOW = new Date('2026-09-10T12:00:00Z');

const base = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  id: 'c1',
  artist_id: 'a1',
  archetype: 'founding_ar_week',
  title: 'Founding A&R Week',
  status: 'active',
  starts_at: '2026-09-08T00:00:00Z',
  ends_at: '2026-09-15T00:00:00Z',
  toolkit: { promise: 'Help shape what comes next.', what_to_do: 'Join free and vote this week.' },
  ...over,
});

const FULL_GIVEAWAY = {
  promise: 'Help shape what comes next.',
  what_to_do: 'Join free and vote this week.',
  prize: '1 year of Platinum',
  prize_value: '$600 value',
  official_rules_url: 'https://thecrwn.app/gb/rules',
  eligibility: '18+, US only.',
  free_entry: 'Join the free tier and vote. No purchase necessary.',
  prize_tier_id: '11111111-2222-4333-8444-555555555555',
};

describe('campaignPhase — server time decides, and boundaries are half-open', () => {
  it('active inside the window', () => {
    expect(campaignPhase(base(), NOW)).toBe('active');
  });
  it('upcoming before the start', () => {
    expect(campaignPhase(base(), new Date('2026-09-01T00:00:00Z'))).toBe('upcoming');
  });
  it('ended at and after the end instant', () => {
    expect(campaignPhase(base(), new Date('2026-09-15T00:00:00Z'))).toBe('ended');
    expect(campaignPhase(base(), new Date('2026-09-20T00:00:00Z'))).toBe('ended');
  });
  it('active AT the start instant', () => {
    expect(campaignPhase(base(), new Date('2026-09-08T00:00:00Z'))).toBe('active');
  });
  it('any status other than active is off, whatever the dates say', () => {
    for (const status of ['draft', 'ended', 'archived'] as const) {
      expect(campaignPhase(base({ status }), NOW)).toBe('off');
    }
  });
  it('an inverted or invalid window is off, never active', () => {
    expect(campaignPhase(base({ starts_at: '2026-09-20T00:00:00Z' }), NOW)).toBe('off');
    expect(campaignPhase(base({ ends_at: 'not-a-date' }), NOW)).toBe('off');
  });
});

describe('readiness — a giveaway needs every legal fact or it does not exist', () => {
  const ok = { prizeFulfillable: true };

  it('a non-giveaway campaign is ready on promise, action and dates alone', () => {
    const r = campaignReadiness(base(), ok);
    expect(r.ready).toBe(true);
    expect(r.isGiveaway).toBe(false);
  });

  it('a fully configured giveaway is ready', () => {
    expect(campaignReadiness(base({ toolkit: FULL_GIVEAWAY }), ok).ready).toBe(true);
  });

  it.each([
    ['official_rules_url', 'Official Rules'],
    ['eligibility', 'may enter'],
    ['free_entry', 'free way to enter'],
  ])('a giveaway missing %s is BLOCKED', (field, fragment) => {
    const toolkit = { ...FULL_GIVEAWAY, [field]: '' };
    const r = campaignReadiness(base({ toolkit }), ok);
    expect(r.ready).toBe(false);
    expect(r.blockers.join(' ')).toContain(fragment);
  });

  it('a rules link that is not a real URL is refused', () => {
    expect(isRulesUrl('/terms')).toBe(false);
    expect(isRulesUrl('javascript:alert(1)')).toBe(false);
    expect(isRulesUrl('https://thecrwn.app/gb/rules')).toBe(true);
  });

  it('a prize CRWN cannot deliver blocks the giveaway, however complete the copy is', () => {
    const r = campaignReadiness(base({ toolkit: FULL_GIVEAWAY }), { prizeFulfillable: false });
    expect(r.ready).toBe(false);
    expect(r.blockers.join(' ')).toContain('no way to deliver this prize');
  });

  it('a giveaway with no prize TIER configured is BLOCKED: there is nothing to deliver', () => {
    const { prize_tier_id: _omit, ...noTier } = FULL_GIVEAWAY;
    void _omit;
    const r = campaignReadiness(base({ toolkit: noTier }), ok);
    expect(r.ready).toBe(false);
    expect(r.blockers.join(' ')).toContain('prize tier is not configured');
    // A malformed pointer is the same as a missing one.
    const bad = campaignReadiness(base({ toolkit: { ...FULL_GIVEAWAY, prize_tier_id: 'platinum' } }), ok);
    expect(bad.ready).toBe(false);
  });

  it('a stated value with no described prize is refused', () => {
    const r = campaignReadiness(base({ toolkit: { ...FULL_GIVEAWAY, prize: '' } }), ok);
    expect(r.ready).toBe(false);
  });
});

describe('presentCampaign — fails CLOSED to the evergreen funnel', () => {
  const ok = { prizeFulfillable: true };

  it('renders when active and complete', () => {
    const p = presentCampaign(base({ toolkit: FULL_GIVEAWAY }), NOW, ok);
    expect(p).not.toBeNull();
    expect(p!.giveaway?.prize).toBe('1 year of Platinum');
  });

  it('returns null for draft, ended, upcoming and archived', () => {
    expect(presentCampaign(base({ status: 'draft' }), NOW, ok)).toBeNull();
    expect(presentCampaign(base({ status: 'archived' }), NOW, ok)).toBeNull();
    expect(presentCampaign(base(), new Date('2026-09-20T00:00:00Z'), ok)).toBeNull();
    expect(presentCampaign(base(), new Date('2026-09-01T00:00:00Z'), ok)).toBeNull();
  });

  it('an INCOMPLETE giveaway renders nothing at all, never a partial sweepstakes', () => {
    const half = { ...FULL_GIVEAWAY, official_rules_url: '' };
    expect(presentCampaign(base({ toolkit: half }), NOW, ok)).toBeNull();
  });

  it('an unfulfillable prize renders nothing, so a fan is never offered it', () => {
    expect(presentCampaign(base({ toolkit: FULL_GIVEAWAY }), NOW, { prizeFulfillable: false })).toBeNull();
  });

  it('a campaign with no prize renders WITHOUT a giveaway block', () => {
    const p = presentCampaign(base(), NOW, ok);
    expect(p).not.toBeNull();
    expect(p!.giveaway).toBeUndefined();
  });

  it('never leaks artist-facing blockers into the fan presentation', () => {
    const p = presentCampaign(base({ toolkit: FULL_GIVEAWAY }), NOW, ok);
    expect(JSON.stringify(p)).not.toContain('blocker');
  });
});

describe('no purchase necessary is structural, not copy', () => {
  it('the presentation has no FIELD through which a purchase could ever matter', () => {
    // The artist's own copy may of course say "free tier"; what matters is the SHAPE.
    // There is no tier id, price, subscription or checkout field anywhere in the
    // presentation, so making entry depend on paying would require adding one, which is
    // a visible change rather than a quiet condition.
    const p = presentCampaign(base({ toolkit: FULL_GIVEAWAY }), NOW, { prizeFulfillable: true })!;
    const fields = [...Object.keys(p), ...Object.keys(p.giveaway ?? {})];
    for (const f of fields) {
      expect(f).not.toMatch(/tier|price(?!Value)|subscription|stripe|checkout|paid/i);
    }
    expect(fields).toContain('freeEntry');
  });
});
