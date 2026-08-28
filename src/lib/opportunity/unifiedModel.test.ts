// Double-counting invariants for the unified opportunity model.
//
// These are not "does the function run" tests. Each one fails if a specific double-count
// re-enters the model, which is the only thing that makes the combined total defensible. The
// claim "this total is overlap-safe" is only true while this file is green.

import { describe, it, expect } from 'vitest';
import {
  calculateUnifiedOpportunity,
  calculateScenarioBand,
  getUnifiedAssumptions,
  normalizeAudience,
  evaluateEligibility,
  seatPriceForAudience,
  DEFAULT_INPUTS,
  type UnifiedInputs,
  type Scenario,
} from './unifiedModel';

// A fully-loaded artist: every opportunity eligible, so every overlap is live at once. If the
// model double-counts anywhere, it double-counts here.
const FULL: Partial<UnifiedInputs> = {
  socialFollowers: 500_000,
  monthlyListeners: 300_000,
  ownedContacts: 20_000,
  currentPayingSupporters: 0,
  currentDirectRevenueCents: 0,
  unreleasedCount: 40,
  fansPromote: 'would',
  videoOutput: 'lots',
  promoterOverlap: 'some_overlap',
  liveWilling: 'yes',
  sessionStructure: 'hybrid',
  vaultPlacement: 'tier',
  timeCapacity: 'medium',
};

const SCENARIOS: Scenario[] = ['conservative', 'expected', 'high'];
const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;

describe('layer 1: one normalized audience', () => {
  it('never sums followers and listeners into an audience the artist does not have', () => {
    const r = calculateUnifiedOpportunity(FULL);
    expect(r.audience.primaryReach).toBe(500_000);
    expect(r.audience.primaryReach).toBeLessThan(500_000 + 300_000);
    expect(r.audience.crossPlatformOverlapUnknown).toBe(true);
  });

  it('treats owned contacts as a subset, so addressable can never exceed the audience', () => {
    const a = getUnifiedAssumptions('high');
    const audience = normalizeAudience(
      { ...DEFAULT_INPUTS, socialFollowers: 10_000, ownedContacts: 9_000 },
      a,
    );
    expect(audience.ownedContacts).toBe(9_000);
    expect(audience.addressable).toBeLessThanOrEqual(audience.primaryReach);
    // Inclusion-exclusion, not a sum: owned + reachRate on the remainder.
    expect(near(audience.addressable, 9_000 + 1_000 * a.reachRate)).toBe(true);
  });

  it('clamps an over-reported owned list rather than inventing audience', () => {
    const a = getUnifiedAssumptions('expected');
    const audience = normalizeAudience({ ...DEFAULT_INPUTS, socialFollowers: 1_000, ownedContacts: 50_000 }, a);
    expect(audience.ownedContacts).toBeLessThanOrEqual(audience.primaryReach);
    expect(audience.addressable).toBeLessThanOrEqual(audience.primaryReach);
  });
});

describe('layer 2: a fan may hold many roles, a person is counted once', () => {
  it('does not add all sharers to all clippers', () => {
    const r = calculateUnifiedOpportunity(FULL);
    const { sharers, clippers, dualPromoters, uniquePromoters } = r.segments;
    expect(sharers).toBeGreaterThan(0);
    expect(clippers).toBeGreaterThan(0);
    expect(dualPromoters).toBeGreaterThan(0);
    expect(near(uniquePromoters, sharers + clippers - dualPromoters)).toBe(true);
    expect(uniquePromoters).toBeLessThan(sharers + clippers);
    expect(uniquePromoters).toBeGreaterThanOrEqual(Math.max(sharers, clippers));
  });

  it('honours the artist answer about how much their promoters overlap', () => {
    const same = calculateUnifiedOpportunity({ ...FULL, promoterOverlap: 'mostly_same' });
    const diff = calculateUnifiedOpportunity({ ...FULL, promoterOverlap: 'mostly_different' });
    expect(same.segments.uniquePromoters).toBeLessThan(diff.segments.uniquePromoters);
    // Both still respect the union bounds.
    for (const r of [same, diff]) {
      expect(r.segments.uniquePromoters).toBeLessThanOrEqual(r.segments.sharers + r.segments.clippers);
      expect(r.segments.uniquePromoters).toBeGreaterThanOrEqual(Math.max(r.segments.sharers, r.segments.clippers));
    }
  });

  it('gives a share-only artist no clippers, and a clip-only artist no sharers', () => {
    const shareOnly = calculateUnifiedOpportunity({ ...FULL, videoOutput: 'none' });
    expect(shareOnly.segments.clippers).toBe(0);
    expect(shareOnly.segments.dualPromoters).toBe(0);
    expect(near(shareOnly.segments.uniquePromoters, shareOnly.segments.sharers)).toBe(true);

    const clipOnly = calculateUnifiedOpportunity({ ...FULL, fansPromote: 'unlikely' });
    expect(clipOnly.segments.sharers).toBe(0);
    expect(near(clipOnly.segments.uniquePromoters, clipOnly.segments.clippers)).toBe(true);
  });

  it('keeps the paying population inside the conversion ceiling', () => {
    for (const scenario of SCENARIOS) {
      const r = calculateUnifiedOpportunity(FULL, scenario);
      const fromExisting = r.audience.addressable * r.assumptions.maxConversion;
      const fromReferral = r.segments.referredReach * r.assumptions.referredConversion;
      expect(r.segments.payingSupporters).toBeLessThanOrEqual(fromExisting + fromReferral + 1);
    }
  });
});

describe('the same supporter is never counted twice across acquisition systems', () => {
  it('splits the one supporter pool into organic, clip and share with nothing left over', () => {
    for (const scenario of SCENARIOS) {
      const r = calculateUnifiedOpportunity(FULL, scenario);
      const { organicSupporters, clipAttributedSupporters, shareAttributedSupporters } = r.attribution;
      expect(near(organicSupporters + clipAttributedSupporters + shareAttributedSupporters, r.segments.payingSupporters)).toBe(true);
      expect(organicSupporters).toBeGreaterThanOrEqual(0);
      expect(clipAttributedSupporters).toBeGreaterThanOrEqual(0);
      expect(shareAttributedSupporters).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps attributed revenue INSIDE membership revenue rather than beside it', () => {
    const r = calculateUnifiedOpportunity(FULL);
    const attributedGross = r.attribution.clipAttributedGrossCents + r.attribution.shareAttributedGrossCents;
    expect(attributedGross).toBeGreaterThan(0);
    expect(attributedGross).toBeLessThanOrEqual(r.core.grossCents);
    // Turning the acquisition systems on must never introduce a revenue LINE of their own.
    expect(r.incremental.some((i) => i.key === 'share_to_earn' || i.key === 'clip_to_earn')).toBe(false);
  });

  it('does not let Clip-to-Earn invent subscribers outside the audience it converts', () => {
    const withClips = calculateUnifiedOpportunity(FULL);
    const withoutClips = calculateUnifiedOpportunity({ ...FULL, videoOutput: 'none' });
    const delta = withClips.segments.payingSupporters - withoutClips.segments.payingSupporters;
    expect(delta).toBeGreaterThan(0);
    // The lift is bounded by the conversion ceiling on the SAME addressable pool. It can never add
    // subscribers the way a separate revenue stream would.
    expect(withClips.segments.payingSupporters).toBeLessThanOrEqual(
      withClips.audience.addressable * withClips.assumptions.maxConversion +
        withClips.segments.referredReach * withClips.assumptions.referredConversion +
        1,
    );
  });

  it('only lets Share-to-Earn add heads because its reach is from OUTSIDE the audience', () => {
    const r = calculateUnifiedOpportunity(FULL);
    expect(r.segments.referredReach).toBeGreaterThan(0);
    expect(near(r.attribution.shareAttributedSupporters, r.segments.referredReach * r.assumptions.referredConversion)).toBe(true);
  });

  it('charges contributor commission only on the attributed slice, never on all revenue', () => {
    const r = calculateUnifiedOpportunity(FULL);
    const attributedGross = r.attribution.clipAttributedGrossCents + r.attribution.shareAttributedGrossCents;
    expect(r.contributorCommissionCents).toBeLessThanOrEqual(attributedGross);
    expect(r.contributorCommissionCents).toBeLessThan(r.totalGrossCents);
  });
});

describe('the Vault is a tier, not a second membership', () => {
  it('never emits Vault revenue on top of membership revenue', () => {
    const r = calculateUnifiedOpportunity(FULL);
    expect(r.incremental.some((i) => i.key === 'vault')).toBe(false);
    const vaultRec = r.recommendations.find((x) => x.key === 'vault');
    expect(vaultRec?.placement).toBe('inside_membership');
    expect(vaultRec?.monthlyGrossCents).toBe(0);
    // The Vault tier's supporters are part of the one pool, not extra people.
    const ladderSupporters = r.core.tiers.reduce((s, t) => s + t.supporters, 0);
    expect(near(ladderSupporters, r.segments.payingSupporters)).toBe(true);
    expect(r.core.tiers.some((t) => t.key === 'vault')).toBe(true);
  });

  it('may be sold separately only when explicitly configured, and still off ONE population', () => {
    const standalone = calculateUnifiedOpportunity({ ...FULL, vaultPlacement: 'standalone' });
    const ladderSupporters = standalone.core.tiers.reduce((s, t) => s + t.supporters, 0);
    expect(near(ladderSupporters, standalone.segments.payingSupporters)).toBe(true);
    expect(standalone.recommendations.find((x) => x.key === 'vault')?.placement).toBe('sell_separately');
  });

  it('is not recommended at all when there is nothing to put in it', () => {
    const empty = calculateUnifiedOpportunity({ ...FULL, unreleasedCount: 1 });
    expect(empty.recommendations.find((x) => x.key === 'vault')?.placement).toBe('not_yet');
    expect(empty.core.tiers.some((t) => t.key === 'vault')).toBe(false);
    const ladderSupporters = empty.core.tiers.reduce((s, t) => s + t.supporters, 0);
    expect(near(ladderSupporters, empty.segments.payingSupporters)).toBe(true);
  });
});

describe('a member is never also counted as a ticket or seat buyer', () => {
  it('sells every incremental item out of the non-member pool only', () => {
    const r = calculateUnifiedOpportunity(FULL);
    const seatOrTicketBuyers = r.incremental
      .filter((i) => i.key === 'live_tickets' || i.key === 'producer_sessions')
      .reduce((s, i) => s + i.buyers, 0);
    expect(seatOrTicketBuyers).toBeGreaterThan(0);
    expect(seatOrTicketBuyers).toBeLessThanOrEqual(r.segments.nonMemberAddressable);
  });

  it('earns nothing from a session that is included in the membership', () => {
    const included = calculateUnifiedOpportunity({ ...FULL, sessionStructure: 'included' });
    const sessions = included.incremental.find((i) => i.key === 'producer_sessions');
    expect(sessions?.buyers).toBe(0);
    expect(sessions?.grossCents).toBe(0);
    expect(included.recommendations.find((x) => x.key === 'producer_sessions')?.placement).toBe('inside_membership');
  });

  it('counts only the EXTRA seats when a session is hybrid', () => {
    const hybrid = calculateUnifiedOpportunity({ ...FULL, sessionStructure: 'hybrid' });
    const ticketed = calculateUnifiedOpportunity({ ...FULL, sessionStructure: 'ticketed' });
    const h = hybrid.incremental.find((i) => i.key === 'producer_sessions')!;
    const t = ticketed.incremental.find((i) => i.key === 'producer_sessions')!;
    expect(h.grossCents).toBeGreaterThan(0);
    expect(h.grossCents).toBeLessThan(t.grossCents);
  });

  it('does not count live attendees again under every category', () => {
    const r = calculateUnifiedOpportunity(FULL);
    const tickets = r.incremental.find((i) => i.key === 'live_tickets')!;
    const tips = r.incremental.find((i) => i.key === 'live_tips')!;
    // Tippers are a SUBSET of the ticket buyers, not a new group of people.
    expect(tips.buyers).toBeLessThan(tickets.buyers);
    // And there is no separate replay or sponsorship line, because neither exists in CRWN.
    expect(r.incremental.some((i) => /replay|sponsor/i.test(i.key))).toBe(false);
  });
});

describe('financial normalization', () => {
  it('keeps recurring and one-time revenue separate and reconciled', () => {
    const r = calculateUnifiedOpportunity(FULL);
    expect(r.recurringGrossCents).toBe(r.core.grossCents);
    expect(r.oneTimeGrossCents).toBe(r.incremental.reduce((s, i) => s + i.grossCents, 0));
    expect(r.totalGrossCents).toBe(r.recurringGrossCents + r.oneTimeGrossCents);
    expect(r.recurringGrossCents).toBeGreaterThan(0);
  });

  it('never mixes a gross figure with a net one', () => {
    const r = calculateUnifiedOpportunity(FULL);
    expect(r.netMonthlyCents).toBe(r.totalGrossCents - r.platformFeeCents - r.contributorCommissionCents);
    expect(r.netMonthlyCents).toBeLessThan(r.totalGrossCents);
    expect(r.platformFeeCents).toBe(Math.round(r.totalGrossCents * (r.assumptions.platformFeePercent / 100)));
  });

  it('subtracts what the artist already earns instead of adding it', () => {
    const already = 200_000; // $2,000/mo direct today
    const withCurrent = calculateUnifiedOpportunity({ ...FULL, currentDirectRevenueCents: already });
    const without = calculateUnifiedOpportunity(FULL);
    expect(withCurrent.netMonthlyCents).toBe(without.netMonthlyCents);
    expect(withCurrent.netNewMonthlyCents).toBe(Math.max(0, without.netMonthlyCents - already));
    expect(withCurrent.netNewMonthlyCents).toBeLessThan(without.netNewMonthlyCents);
  });

  it('never reports a negative opportunity', () => {
    const r = calculateUnifiedOpportunity({ ...FULL, currentDirectRevenueCents: 999_999_999 });
    expect(r.netNewMonthlyCents).toBe(0);
    expect(r.netNewAnnualCents).toBe(0);
  });

  it('annualizes only by twelve, never by anything longer', () => {
    const r = calculateUnifiedOpportunity(FULL);
    expect(r.netNewAnnualCents).toBe(r.netNewMonthlyCents * 12);
  });
});

describe('the combined total is materially below a naive sum of the tools', () => {
  it('does not reproduce the additive fantasy', () => {
    const r = calculateUnifiedOpportunity(FULL);
    const audience = 500_000;
    // Each individual tool's own published formula, at this audience.
    const naive =
      Math.round(audience * 0.015) * 1000 + // vault
      Math.round(Math.round(audience * 0.03) * 20 * 0.02) * 1000 + // share-to-earn
      Math.round(audience * 0.005) * 1000 + // clip-to-earn
      Math.round(audience * 0.003) * seatPriceForAudience(audience) + // exec producer
      Math.round(audience * 0.2 * 0.03) * 1000; // own your fans
    expect(r.totalGrossCents).toBeLessThan(naive / 2);
  });

  it('claims far fewer paying people than the tools would claim between them', () => {
    const r = calculateUnifiedOpportunity(FULL);
    const audience = 500_000;
    const naivePayers =
      Math.round(audience * 0.015) + Math.round(audience * 0.005) + Math.round(audience * 0.2 * 0.03);
    expect(r.segments.payingSupporters).toBeLessThan(naivePayers);
  });
});

describe('optional opportunities do not appear for ineligible artists', () => {
  it('gives a no-live artist no ticket, tip or seat revenue', () => {
    const r = calculateUnifiedOpportunity({ ...FULL, liveWilling: 'no', sessionStructure: 'ticketed' });
    expect(r.incremental).toHaveLength(0);
    expect(r.oneTimeGrossCents).toBe(0);
    expect(r.recommendations.find((x) => x.key === 'live')?.placement).toBe('not_yet');
    // No "you said live is not for you" line: the unified calculator no longer asks, so the model
    // may not quote an answer the artist never gave (2026-08-28).
    expect(r.notInTheTotal.some((x) => x.key === 'live')).toBe(false);
  });

  it('gives an artist with no video no clip lift', () => {
    const r = calculateUnifiedOpportunity({ ...FULL, videoOutput: 'none' });
    expect(r.attribution.clipAttributedSupporters).toBe(0);
    expect(r.attribution.clipCommissionCents).toBe(0);
    expect(r.recommendations.find((x) => x.key === 'clip_to_earn')?.placement).toBe('not_yet');
  });

  it('models nothing at all for an artist with no audience', () => {
    const r = calculateUnifiedOpportunity({});
    expect(r.audience.primaryReach).toBe(0);
    expect(r.segments.payingSupporters).toBe(0);
    expect(r.totalGrossCents).toBe(0);
    expect(r.netNewMonthlyCents).toBe(0);
  });

  it('never recommends a session for an artist who will not host one', () => {
    const e = evaluateEligibility({ ...DEFAULT_INPUTS, liveWilling: 'no', sessionStructure: 'ticketed' });
    expect(e.producerSessions).toBe(false);
    expect(e.live).toBe(false);
  });
});

describe('edited plan choices recalculate correctly', () => {
  it('drops the total when the artist turns an opportunity off', () => {
    const base = calculateUnifiedOpportunity(FULL);
    const noClips = calculateUnifiedOpportunity({ ...FULL, videoOutput: 'none' });
    const noShares = calculateUnifiedOpportunity({ ...FULL, fansPromote: 'unlikely' });
    const noLive = calculateUnifiedOpportunity({ ...FULL, liveWilling: 'no' });
    expect(noClips.totalGrossCents).toBeLessThan(base.totalGrossCents);
    expect(noShares.totalGrossCents).toBeLessThan(base.totalGrossCents);
    expect(noLive.totalGrossCents).toBeLessThan(base.totalGrossCents);
  });

  it('moves money out of the total when a session becomes a membership benefit', () => {
    const ticketed = calculateUnifiedOpportunity({ ...FULL, sessionStructure: 'ticketed' });
    const included = calculateUnifiedOpportunity({ ...FULL, sessionStructure: 'included' });
    expect(included.totalGrossCents).toBeLessThan(ticketed.totalGrossCents);
    // And the recurring side is untouched, because the tier price did not change.
    expect(included.recurringGrossCents).toBe(ticketed.recurringGrossCents);
  });

  it('is deterministic for the same inputs', () => {
    expect(calculateUnifiedOpportunity(FULL)).toEqual(calculateUnifiedOpportunity(FULL));
  });
});

describe('scenarios stay internally consistent', () => {
  it('orders conservative below expected below high on every headline figure', () => {
    const band = calculateScenarioBand(FULL);
    expect(band.conservative.netNewMonthlyCents).toBeLessThan(band.expected.netNewMonthlyCents);
    expect(band.expected.netNewMonthlyCents).toBeLessThan(band.high.netNewMonthlyCents);
    expect(band.conservative.segments.payingSupporters).toBeLessThan(band.expected.segments.payingSupporters);
    expect(band.expected.segments.payingSupporters).toBeLessThan(band.high.segments.payingSupporters);
  });

  it('holds every invariant in every scenario, not just the default one', () => {
    const band = calculateScenarioBand(FULL);
    for (const r of Object.values(band)) {
      const { organicSupporters, clipAttributedSupporters, shareAttributedSupporters } = r.attribution;
      expect(near(organicSupporters + clipAttributedSupporters + shareAttributedSupporters, r.segments.payingSupporters)).toBe(true);
      expect(near(r.core.tiers.reduce((s, t) => s + t.supporters, 0), r.segments.payingSupporters)).toBe(true);
      expect(r.totalGrossCents).toBe(r.recurringGrossCents + r.oneTimeGrossCents);
      expect(r.netMonthlyCents).toBeLessThanOrEqual(r.totalGrossCents);
      const buyers = r.incremental
        .filter((i) => i.key === 'live_tickets' || i.key === 'producer_sessions')
        .reduce((s, i) => s + i.buyers, 0);
      expect(buyers).toBeLessThanOrEqual(r.segments.nonMemberAddressable);
    }
  });
});

describe('what is deliberately left out of the dollar total', () => {
  it('names the non-additive opportunities instead of forcing them into the headline', () => {
    const r = calculateUnifiedOpportunity(FULL);
    const keys = r.notInTheTotal.map((x) => x.key);
    expect(keys).toContain('proof_of_demand');
    expect(keys).toContain('retention');
    expect(keys).toContain('royalties');
    expect(keys).toContain('sponsorship');
    // And none of them contributes a cent.
    for (const k of keys) {
      expect(r.incremental.some((i) => i.key === k)).toBe(false);
    }
  });

  it('explains the overlap in plain language', () => {
    const r = calculateUnifiedOpportunity(FULL);
    expect(r.overlapNotes.length).toBeGreaterThanOrEqual(4);
    expect(r.overlapNotes.some((s) => /count(ed)? once/i.test(s))).toBe(true);
    // Copy rule: no em dashes anywhere in generated copy.
    const allCopy = [
      ...r.overlapNotes,
      ...r.notInTheTotal.flatMap((x) => [x.label, x.why]),
      ...r.recommendations.flatMap((x) => [x.label, x.reason]),
      ...r.launchSequence.flatMap((x) => [x.title, x.detail]),
      ...r.incremental.flatMap((x) => [x.label, x.basis]),
    ].join(' ');
    expect(allCopy).not.toMatch(/[—–]/);
  });
});

describe('the launch sequence is personalized, not a fixed list', () => {
  it('always starts with the membership and ends with validation', () => {
    const r = calculateUnifiedOpportunity(FULL);
    expect(r.launchSequence[0].keys).toContain('membership_ladder');
    expect(r.launchSequence[r.launchSequence.length - 1].keys).toContain('proof_of_demand');
  });

  it('skips the phases the artist is not eligible for', () => {
    const minimal = calculateUnifiedOpportunity({
      socialFollowers: 20_000,
      fansPromote: 'unlikely',
      videoOutput: 'none',
      liveWilling: 'no',
      sessionStructure: 'none',
      unreleasedCount: 0,
    });
    const titles = minimal.launchSequence.map((p) => p.title).join(' ');
    expect(titles).not.toMatch(/promoters/i);
    expect(titles).not.toMatch(/content to work/i);
    expect(titles).not.toMatch(/premium experience/i);
    expect(minimal.launchSequence.map((p) => p.phase)).toEqual([1, 2]);
  });
});

describe('seat pricing bands match the Executive Producer Session tool', () => {
  it('bands by audience exactly as the standalone tool does', () => {
    expect(seatPriceForAudience(1_500_000)).toBe(30000);
    expect(seatPriceForAudience(300_000)).toBe(20000);
    expect(seatPriceForAudience(60_000)).toBe(10000);
    expect(seatPriceForAudience(10_000)).toBe(5000);
    expect(seatPriceForAudience(500)).toBe(2500);
  });
});
