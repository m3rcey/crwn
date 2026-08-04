import { describe, it, expect } from 'vitest';
import {
  assignSubAvatar,
  deriveAcquisitionAvatar,
  evidenceFromInputs,
  mergeEvidence,
  scoreEvidence,
} from './assignment';

describe('deriveAcquisitionAvatar', () => {
  it('is the OLDEST mapped calculator and ignores unmapped ones', () => {
    expect(deriveAcquisitionAvatar(['worth', 'vault-revenue-planner', 'between-tour-calculator'])).toBe(
      'catalog_vault_seller',
    );
  });
  it('is null when nothing mapped was run', () => {
    expect(deriveAcquisitionAvatar(['worth', 'opportunity-calculator'])).toBeNull();
    expect(deriveAcquisitionAvatar([])).toBeNull();
    expect(deriveAcquisitionAvatar(null)).toBeNull();
  });
  it('is NOT overwritten by later behavior: the same slugs always derive the same avatar', () => {
    const slugs = ['fan-stack-calculator', 'live-experience-calculator'];
    expect(deriveAcquisitionAvatar(slugs)).toBe('membership_stack_consolidator');
    // A pile of live behavior changes the OBSERVED avatar, never the acquisition one.
    const observed = assignSubAvatar({ claimedCalculatorSlugs: slugs, liveSessionsHosted: 10, videoOutput: 'lots', liveWilling: 'yes' });
    expect(deriveAcquisitionAvatar(slugs)).toBe('membership_stack_consolidator');
    expect(observed).not.toBeNull();
  });
});

describe('assignSubAvatar', () => {
  it('returns null on no evidence: unassigned is honest, never guessed', () => {
    expect(assignSubAvatar({})).toBeNull();
    expect(assignSubAvatar({ claimedCalculatorSlugs: ['worth'] })).toBeNull();
  });

  it('one weak signal (1 point) is not an assignment', () => {
    expect(assignSubAvatar({ liveWilling: 'yes' })).toBeNull();
  });

  it('a mapped calculator run is a medium-confidence acquisition-path assignment', () => {
    const a = assignSubAvatar({ claimedCalculatorSlugs: ['between-tour-calculator'] });
    expect(a?.primarySubAvatar).toBe('touring_access_seller');
    expect(a?.source).toBe('acquisition_path');
    expect(a?.confidence).toBe('medium');
    expect(a?.taxonomyVersion).toBe('subAvatar@1');
    expect(a?.evidence.length).toBeGreaterThan(0);
  });

  it('declared platform evidence alone assigns the consolidator at low confidence', () => {
    const a = assignSubAvatar({ platformsUsed: ['Patreon', 'Discord', 'Shopify'] });
    expect(a?.primarySubAvatar).toBe('membership_stack_consolidator');
    expect(a?.source).toBe('declared');
    expect(a?.confidence).toBe('low');
  });

  it('stacked evidence raises confidence to high and surfaces a secondary', () => {
    const a = assignSubAvatar({
      claimedCalculatorSlugs: ['fan-stack-calculator'],
      platformsUsed: ['Patreon', 'Discord'],
      paidMembersElsewhere: 40,
      unreleasedCount: 25,
    });
    expect(a?.primarySubAvatar).toBe('membership_stack_consolidator');
    expect(a?.confidence).toBe('high');
    expect(a?.secondarySubAvatar).toBe('catalog_vault_seller');
  });

  it('a valid manual override wins outright', () => {
    const a = assignSubAvatar({
      claimedCalculatorSlugs: ['vault-revenue-planner'],
      manualOverride: 'live_community_creator',
    });
    expect(a?.primarySubAvatar).toBe('live_community_creator');
    expect(a?.source).toBe('manual');
  });

  it('an invalid override is ignored, not honored', () => {
    const a = assignSubAvatar({ claimedCalculatorSlugs: ['vault-revenue-planner'], manualOverride: 'hacker_value' });
    expect(a?.primarySubAvatar).toBe('catalog_vault_seller');
    expect(a?.source).toBe('acquisition_path');
  });

  it('ties break toward the acquisition-path avatar', () => {
    // touring +3 (first mapped calculator) vs consolidator +2 (patreon) +1 (paid members) = 3:
    // a genuine tie, and the funnel the artist chose to enter wins it.
    const a = assignSubAvatar({
      claimedCalculatorSlugs: ['between-tour-calculator'],
      patreonImported: true,
      paidMembersElsewhere: 10,
    });
    expect(a?.primarySubAvatar).toBe('touring_access_seller');
  });

  it('is deterministic: same evidence, same assignment', () => {
    const e = { claimedCalculatorSlugs: ['live-experience-calculator'], videoOutput: 'lots', liveWilling: 'yes' };
    expect(assignSubAvatar(e)).toEqual(assignSubAvatar(e));
  });

  it('every scored point carries a human-readable evidence line', () => {
    const lines = scoreEvidence({
      claimedCalculatorSlugs: ['fan-stack-calculator', 'vault-revenue-planner'],
      platformsUsed: ['Patreon', 'Discord'],
      showsPerYear: 12,
      vipBuyersPerShow: 5,
      liveWilling: 'yes',
      videoOutput: 'lots',
      unreleasedCount: 30,
      patreonImported: true,
      liveSessionsHosted: 3,
      gatedTracks: 12,
    });
    for (const l of lines) {
      expect(l.line.length).toBeGreaterThan(5);
      expect(l.points).toBeGreaterThan(0);
    }
  });
});

describe('evidenceFromInputs / mergeEvidence', () => {
  it('reads declared fields tolerantly and ignores junk', () => {
    const e = evidenceFromInputs({
      platforms_used: ['Patreon', 'Discord'],
      shows_per_year: 20,
      vip_buyers_per_show: 'ten', // wrong type -> absent
      unreleased_count: 12,
      live_willing: 'yes',
    });
    expect(e.platformsUsed).toEqual(['Patreon', 'Discord']);
    expect(e.showsPerYear).toBe(20);
    expect(e.vipBuyersPerShow).toBeNull();
    expect(e.unreleasedCount).toBe(12);
    expect(e.liveWilling).toBe('yes');
    expect(evidenceFromInputs(null).platformsUsed).toBeNull();
  });

  it('legacy vault input key (unreleasedSongs) still reads', () => {
    expect(evidenceFromInputs({ unreleasedSongs: 7 }).unreleasedCount).toBe(7);
  });

  it('mergeEvidence keeps the earliest non-null value per field', () => {
    const merged = mergeEvidence({ showsPerYear: 10 }, { showsPerYear: 99, unreleasedCount: 5 });
    expect(merged.showsPerYear).toBe(10);
    expect(merged.unreleasedCount).toBe(5);
  });
});
