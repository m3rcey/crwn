import { describe, it, expect } from 'vitest';
import {
  ARCHETYPE_KEYS,
  CAMPAIGN_ARCHETYPES,
  archetypeFor,
  capabilitiesSupported,
  requiredSlots,
} from './archetypes';
import {
  MAX_WINDOW_DAYS,
  canJoin,
  checkLaunchReady,
  isPubliclyVisible,
  nextStatus,
  windowClosed,
  type CampaignDraft,
} from './lifecycle';
import { campaignOfferFor, campaignShapedConstraints } from './eligibility';
import { badgeEarners, buildCampaignResults } from './results';
import { CONSTRAINT_TYPES, type ConstraintResult, type DiagnosedConstraint } from '@/lib/constraint/types';
import { GLOBAL_FAN_BADGES } from '@/lib/fanBadges';

const NOW = '2026-08-11T00:00:00.000Z';
const ARTIST_USER = 'artist-user-1';
const IN_TEN_DAYS = '2026-08-21T00:00:00.000Z';

function draft(over: Partial<CampaignDraft> = {}): CampaignDraft {
  const a = CAMPAIGN_ARCHETYPES.fan_recruitment;
  return {
    archetype: 'fan_recruitment',
    title: 'Bring three people',
    endsAt: IN_TEN_DAYS,
    toolkit: { ...a.defaultToolkit },
    ...over,
  };
}

function diagnosed(over: Partial<DiagnosedConstraint> = {}): DiagnosedConstraint {
  return {
    status: 'diagnosed',
    constraint: 'REACH',
    confidence: 'high',
    title: 'Almost nobody is seeing your page',
    explanation: 'x',
    evidence: [{ label: '4 visitors.', metric: 'unique_visits', value: 4, unit: 'count' }],
    action: { label: 'Import your fan contacts', why: 'y', href: '/studio/fans', verifiedBy: 'artist_has_fan_contacts' },
    evaluatedAt: NOW,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// Archetype registry
// ---------------------------------------------------------------------------

describe('archetypes are data, and only shippable ones exist', () => {
  it('ships exactly one archetype in V1', () => {
    expect(ARCHETYPE_KEYS).toEqual(['fan_recruitment']);
  });

  it('every shipped archetype only declares capabilities the spine implements', () => {
    for (const a of Object.values(CAMPAIGN_ARCHETYPES)) {
      expect(capabilitiesSupported(a)).toBe(true);
    }
  });

  it('never declares a UGC capability, which is blocked on licensing and moderation', () => {
    for (const a of Object.values(CAMPAIGN_ARCHETYPES)) {
      expect(a.capabilities).not.toContain('submission');
      expect(a.capabilities).not.toContain('assets');
      expect(a.capabilities).not.toContain('judged');
    }
  });

  it('never declares ranking, because no privacy-safe public ranking ships in V1', () => {
    for (const a of Object.values(CAMPAIGN_ARCHETYPES)) {
      expect(a.capabilities).not.toContain('ranked');
    }
  });

  it('rejects an unknown archetype', () => {
    expect(archetypeFor('dance_challenge')).toBeNull();
    expect(archetypeFor(null)).toBeNull();
    expect(requiredSlots('dance_challenge')).toEqual([]);
  });

  it('only uses non-cash incentives, resolving to an EXISTING badge key', () => {
    for (const a of Object.values(CAMPAIGN_ARCHETYPES)) {
      expect(a.incentive.kind).toBe('non_cash');
      expect(GLOBAL_FAN_BADGES[a.incentive.badgeKey]).toBeTruthy();
    }
  });

  it('states what it cannot measure, so a report cannot be read as more than it is', () => {
    const a = CAMPAIGN_ARCHETYPES.fan_recruitment;
    expect(a.unmeasuredOutcomes.join(' ')).toMatch(/free/i);
    expect(a.unmeasuredOutcomes.join(' ')).toMatch(/social/i);
  });

  it('carries no em dash in any artist or fan facing string', () => {
    const strings = JSON.stringify(CAMPAIGN_ARCHETYPES);
    expect(strings).not.toContain('—');
    expect(strings).not.toContain('–');
  });
});

// ---------------------------------------------------------------------------
// Lifecycle: launch gate
// ---------------------------------------------------------------------------

describe('a campaign cannot launch incomplete', () => {
  it('launches when every required slot is filled and the window is sane', () => {
    expect(checkLaunchReady(draft(), { now: NOW, artistSlug: 'm3rcey' }).ok).toBe(true);
  });

  it('refuses launch with a required toolkit slot empty, and names the slot', () => {
    const r = checkLaunchReady(draft({ toolkit: { ...CAMPAIGN_ARCHETYPES.fan_recruitment.defaultToolkit, share_message: '   ' } }), {
      now: NOW,
      artistSlug: 'm3rcey',
    });
    expect(r.ok).toBe(false);
    expect(r.emptyRequiredSlots).toContain('share_message');
  });

  it('refuses launch when the toolkit is entirely empty', () => {
    const r = checkLaunchReady(draft({ toolkit: {} }), { now: NOW, artistSlug: 'm3rcey' });
    expect(r.ok).toBe(false);
    expect(r.emptyRequiredSlots).toHaveLength(requiredSlots('fan_recruitment').length);
  });

  it('refuses an invalid archetype outright', () => {
    const r = checkLaunchReady(draft({ archetype: 'remix_challenge' }), { now: NOW, artistSlug: 'm3rcey' });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/does not exist/);
  });

  it('refuses when the artist has no public page, because there is no link to share', () => {
    const r = checkLaunchReady(draft(), { now: NOW, artistSlug: null });
    expect(r.ok).toBe(false);
    expect(r.problems.join(' ')).toMatch(/public page/);
  });

  it('refuses a window in the past or beyond the product bound', () => {
    expect(checkLaunchReady(draft({ endsAt: '2026-08-10T00:00:00.000Z' }), { now: NOW, artistSlug: 's' }).ok).toBe(false);
    const tooLong = new Date(new Date(NOW).getTime() + (MAX_WINDOW_DAYS + 5) * 86_400_000).toISOString();
    expect(checkLaunchReady(draft({ endsAt: tooLong }), { now: NOW, artistSlug: 's' }).ok).toBe(false);
  });

  it('refuses copy longer than the slot allows', () => {
    const r = checkLaunchReady(
      draft({ toolkit: { ...CAMPAIGN_ARCHETYPES.fan_recruitment.defaultToolkit, what_to_do: 'x'.repeat(300) } }),
      { now: NOW, artistSlug: 's' },
    );
    expect(r.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle: transitions and visibility
// ---------------------------------------------------------------------------

describe('lifecycle transitions', () => {
  it('only launches from draft', () => {
    expect(nextStatus('draft', 'launch')).toBe('active');
    expect(nextStatus('active', 'launch')).toBeNull();
    expect(nextStatus('ended', 'launch')).toBeNull();
    expect(nextStatus('archived', 'launch')).toBeNull();
  });

  it('only ends from active, and only archives from ended', () => {
    expect(nextStatus('active', 'end')).toBe('ended');
    expect(nextStatus('draft', 'end')).toBeNull();
    expect(nextStatus('ended', 'archive')).toBe('archived');
    expect(nextStatus('active', 'archive')).toBeNull();
  });

  it('never makes a draft publicly visible', () => {
    expect(isPubliclyVisible({ status: 'draft' })).toBe(false);
    expect(isPubliclyVisible({ status: 'active' })).toBe(true);
    expect(isPubliclyVisible({ status: 'ended' })).toBe(true);
    expect(isPubliclyVisible({ status: 'archived' })).toBe(false);
  });

  it('knows when the window has passed', () => {
    expect(windowClosed({ endsAt: IN_TEN_DAYS }, NOW)).toBe(false);
    expect(windowClosed({ endsAt: NOW }, IN_TEN_DAYS)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Participation
// ---------------------------------------------------------------------------

describe('participation gate', () => {
  const active = { status: 'active' as const, endsAt: IN_TEN_DAYS, artistUserId: ARTIST_USER };

  it('lets an ordinary fan join a running drive', () => {
    expect(canJoin(active, 'fan-1', NOW).ok).toBe(true);
  });

  it('refuses a draft and an ended campaign', () => {
    expect(canJoin({ ...active, status: 'draft' }, 'fan-1', NOW).ok).toBe(false);
    expect(canJoin({ ...active, status: 'ended' }, 'fan-1', NOW).ok).toBe(false);
    expect(canJoin({ ...active, status: 'archived' }, 'fan-1', NOW).ok).toBe(false);
  });

  it('refuses a join after the window closes even while the row still says active', () => {
    expect(canJoin(active, 'fan-1', '2026-09-01T00:00:00.000Z').ok).toBe(false);
  });

  it('refuses the artist joining their own drive', () => {
    const v = canJoin(active, ARTIST_USER, NOW);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/your own/i);
  });
});

// ---------------------------------------------------------------------------
// Constraint eligibility
// ---------------------------------------------------------------------------

describe('only approved campaign-shaped constraints route to a drive', () => {
  it('exposes exactly REACH and FIRST_PAID in V1', () => {
    expect([...campaignShapedConstraints()].sort()).toEqual(['FIRST_PAID', 'REACH']);
  });

  it('never offers a drive for FULFILLMENT', () => {
    const o = campaignOfferFor(diagnosed({ constraint: 'FULFILLMENT' }));
    expect(o.eligible).toBe(false);
    expect(o.archetype).toBeNull();
    expect(o.canonicalAction).not.toBeNull();
  });

  it('never offers a drive for RETENTION', () => {
    const o = campaignOfferFor(diagnosed({ constraint: 'RETENTION' }));
    expect(o.eligible).toBe(false);
    expect(o.archetype).toBeNull();
  });

  it('never offers a drive for the offer, friction, capture or depth problems', () => {
    for (const c of ['FREE_CAPTURE', 'PAID_TIER_INTEREST', 'CHECKOUT_COMPLETION', 'DEPTH'] as const) {
      expect(campaignOfferFor(diagnosed({ constraint: c })).eligible).toBe(false);
    }
  });

  it('offers Fan Recruitment for REACH and for FIRST_PAID', () => {
    for (const c of ['REACH', 'FIRST_PAID'] as const) {
      const o = campaignOfferFor(diagnosed({ constraint: c }));
      expect(o.eligible).toBe(true);
      expect(o.archetype?.key).toBe('fan_recruitment');
    }
  });

  it('never offers a drive on insufficient evidence', () => {
    const insufficient: ConstraintResult = {
      status: 'insufficient_evidence',
      reason: 'too early',
      missingEvidence: ['unique page visits'],
      evaluatedAt: NOW,
    };
    const o = campaignOfferFor(insufficient);
    expect(o.eligible).toBe(false);
    expect(o.constraint).toBeNull();
  });

  it('fails closed when the constraint read failed entirely', () => {
    expect(campaignOfferFor(null).eligible).toBe(false);
    expect(campaignOfferFor(undefined).eligible).toBe(false);
  });

  it('covers every constraint type with an explicit verdict', () => {
    for (const c of CONSTRAINT_TYPES) {
      const o = campaignOfferFor(diagnosed({ constraint: c }));
      expect(typeof o.eligible).toBe('boolean');
      expect(o.reason.length).toBeGreaterThan(0);
    }
  });

  it('does not add VIRALITY as a constraint type', () => {
    expect(CONSTRAINT_TYPES).not.toContain('VIRALITY' as never);
  });
});

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

describe('campaign results derive from canonical rails', () => {
  const window = { startsAt: NOW, endsAt: IN_TEN_DAYS };
  const participants = [
    { fanId: 'fan-a', displayName: 'A', joinedAt: NOW },
    { fanId: 'fan-b', displayName: 'B', joinedAt: NOW },
  ];

  it('counts only referrals from participants inside the window', () => {
    const r = buildCampaignResults({
      window,
      participants,
      referrals: [
        { id: 'r1', referrerFanId: 'fan-a', createdAt: '2026-08-12T00:00:00.000Z', status: 'active' },
        { id: 'r2', referrerFanId: 'fan-c', createdAt: '2026-08-12T00:00:00.000Z', status: 'active' }, // not a participant
        { id: 'r3', referrerFanId: 'fan-b', createdAt: '2026-07-01T00:00:00.000Z', status: 'active' }, // before window
        { id: 'r4', referrerFanId: 'fan-b', createdAt: '2026-09-01T00:00:00.000Z', status: 'active' }, // after window
      ],
      commissions: [{ referralId: 'r1', commissionAmountCents: 100 }],
    });
    expect(r.verifiedPaidConversions.value).toBe(1);
    expect(r.participantsWithVerifiedConversion).toBe(1);
    expect(r.perParticipant[0].fanId).toBe('fan-a');
  });

  it('does not double count a repeated referral row', () => {
    const r = buildCampaignResults({
      window,
      participants,
      referrals: [
        { id: 'r1', referrerFanId: 'fan-a', createdAt: '2026-08-12T00:00:00.000Z', status: 'active' },
        { id: 'r1', referrerFanId: 'fan-a', createdAt: '2026-08-12T00:00:00.000Z', status: 'active' },
      ],
      commissions: [{ referralId: 'r1', commissionAmountCents: 100 }],
    });
    expect(r.verifiedPaidConversions.value).toBe(1);
  });

  it('reports free joins as MISSING, never zero', () => {
    const r = buildCampaignResults({ window, participants, referrals: [], commissions: [] });
    expect(r.freeJoinsAttributed.value).toBeNull();
    expect(r.freeJoinsAttributed.state).toBe('missing');
  });

  it('reports external reach as MISSING, never zero', () => {
    const r = buildCampaignResults({ window, participants, referrals: [], commissions: [] });
    expect(r.externalReach.value).toBeNull();
    expect(r.externalReach.state).toBe('missing');
  });

  it('cannot measure anything before the drive launches', () => {
    const r = buildCampaignResults({
      window: { startsAt: null, endsAt: IN_TEN_DAYS },
      participants,
      referrals: [{ id: 'r1', referrerFanId: 'fan-a', createdAt: NOW, status: 'active' }],
      commissions: [],
    });
    expect(r.verifiedPaidConversions.value).toBeNull();
    expect(r.verifiedPaidConversions.state).toBe('missing');
  });

  it('reads commission off the earnings rail and never recomputes it from a rate', () => {
    const r = buildCampaignResults({
      window,
      participants,
      referrals: [
        { id: 'r1', referrerFanId: 'fan-a', createdAt: '2026-08-12T00:00:00.000Z', status: 'active' },
        { id: 'r2', referrerFanId: 'fan-b', createdAt: '2026-08-12T00:00:00.000Z', status: 'active' },
      ],
      commissions: [
        { referralId: 'r1', commissionAmountCents: 250 },
        { referralId: 'r2', commissionAmountCents: 150 },
      ],
    });
    expect(r.commissionsOnThoseConversions.cents).toBe(400);
    expect(r.commissionsOnThoseConversions.state).toBe('complete');
  });

  it('calls commission UNKNOWN when an earnings row is absent, rather than zero', () => {
    const r = buildCampaignResults({
      window,
      participants,
      referrals: [
        { id: 'r1', referrerFanId: 'fan-a', createdAt: '2026-08-12T00:00:00.000Z', status: 'active' },
        { id: 'r2', referrerFanId: 'fan-b', createdAt: '2026-08-12T00:00:00.000Z', status: 'active' },
      ],
      commissions: [{ referralId: 'r1', commissionAmountCents: 250 }],
    });
    expect(r.commissionsOnThoseConversions.cents).toBeNull();
    expect(r.commissionsOnThoseConversions.state).toBe('missing');
  });

  it('awards the non-cash badge only to participants the rail already verified', () => {
    const r = buildCampaignResults({
      window,
      participants,
      referrals: [{ id: 'r1', referrerFanId: 'fan-a', createdAt: '2026-08-12T00:00:00.000Z', status: 'active' }],
      commissions: [{ referralId: 'r1', commissionAmountCents: 100 }],
    });
    expect(badgeEarners(r)).toEqual(['fan-a']);
  });

  it('produces no campaign payout, balance or per-participant money figure', () => {
    const r = buildCampaignResults({
      window,
      participants,
      referrals: [{ id: 'r1', referrerFanId: 'fan-a', createdAt: '2026-08-12T00:00:00.000Z', status: 'active' }],
      commissions: [{ referralId: 'r1', commissionAmountCents: 100 }],
    });
    for (const p of r.perParticipant) {
      expect(Object.keys(p)).toEqual(['fanId', 'displayName', 'joinedAt', 'verifiedPaidConversions']);
    }
    // The only money figure in the whole report is the commission the EXISTING referral programme
    // already owes, read off `referral_earnings`. No campaign payout, prize or balance may appear.
    const moneyKeys = Object.keys(r).filter((k) => /cost|payout|prize|balance|owed|commission/i.test(k));
    expect(moneyKeys).toEqual(['commissionsOnThoseConversions']);
  });
});
