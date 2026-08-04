import { describe, it, expect } from 'vitest';
import {
  assignSubAvatar,
  deriveAcquisitionAvatar,
  evidenceFromInputs,
  mergeEvidence,
  resolveGenreFamily,
  scoreEvidence,
} from './assignment';
import { ENTRY_CONTEXT_INPUT_KEY } from './taxonomy';

describe('deriveAcquisitionAvatar', () => {
  it('is the OLDEST avatar entry context and ignores tool contexts', () => {
    expect(deriveAcquisitionAvatar(['vault-revenue-planner', 'rnb_empire_builder', 'brand_led_hip_hop_artist'])).toBe(
      'rnb_empire_builder',
    );
  });

  it('is null when no avatar link was ever clicked', () => {
    expect(deriveAcquisitionAvatar(['worth', 'vault-revenue-planner'])).toBeNull();
    expect(deriveAcquisitionAvatar([])).toBeNull();
    expect(deriveAcquisitionAvatar(null)).toBeNull();
  });

  it('is NOT overwritten by later behavior', () => {
    const contexts = ['established_independent_operator'];
    expect(deriveAcquisitionAvatar(contexts)).toBe('established_independent_operator');
    // A pile of contradicting evidence moves the OBSERVED avatar, never the acquisition one.
    const observed = assignSubAvatar({
      entryContexts: contexts,
      genreFamily: 'hiphop',
      videoOutput: 'lots',
      fansPromote: 'already',
      liveSessionsHosted: 5,
    });
    expect(observed?.primarySubAvatar).toBe('brand_led_hip_hop_artist');
    expect(deriveAcquisitionAvatar(contexts)).toBe('established_independent_operator');
  });
});

describe('assignSubAvatar', () => {
  it('returns null on no evidence: unassigned is honest, never guessed', () => {
    expect(assignSubAvatar({})).toBeNull();
    expect(assignSubAvatar({ audience: 500 })).toBeNull();
  });

  it('one weak signal is not an assignment', () => {
    expect(assignSubAvatar({ videoOutput: 'some' })).toBeNull();
    expect(assignSubAvatar({ liveWilling: 'yes' })).toBeNull();
  });

  it('the ICP Tier 1 bar (audience AND proven sales) assigns the highest-priority avatar', () => {
    // 3 (bar) + 2 (sales are a real income stream) = 5, which is medium: a big audience saying
    // they sell is a claim, not a measured one, so the band stays honest until a number backs it.
    const claimed = assignSubAvatar({ audience: 400_000, monetizationStatus: 'direct_established' });
    expect(claimed?.primarySubAvatar).toBe('highest_priority_empire_builder');
    expect(claimed?.confidence).toBe('medium');

    // Add the number (real supporters or real monthly revenue) and it reaches high.
    const evidenced = assignSubAvatar({
      audience: 400_000,
      monetizationStatus: 'direct_established',
      currentSupporters: 120,
    });
    expect(evidenced?.confidence).toBe('high');
  });

  it('confidence bands on sample strength, not on certainty of identity', () => {
    const thin = assignSubAvatar({ genreFamily: 'rnb', unreleasedCount: 12 }); // 2 + 2 = 4
    expect(thin?.confidence).toBe('medium');
    const thick = assignSubAvatar({
      genreFamily: 'rnb',
      unreleasedCount: 12,
      currentSupporters: 5,
      liveWilling: 'yes',
    }); // 2 + 2 + 1 + 1 = 6
    expect(thick?.confidence).toBe('high');
  });

  it('genre alone is a weak claim: brand-led needs the content engine too', () => {
    const genreOnly = assignSubAvatar({ genreFamily: 'hiphop' });
    expect(genreOnly?.primarySubAvatar).toBe('brand_led_hip_hop_artist');
    expect(genreOnly?.confidence).toBe('low');
    // Genre + a real content engine + fans who promote = 5, medium. The engine is what makes the
    // claim assignable at all; "high" is reserved for evidence stacked past that.
    const withEngine = assignSubAvatar({ genreFamily: 'hiphop', videoOutput: 'lots', fansPromote: 'already' });
    expect(withEngine?.confidence).toBe('medium');
    const withEngineAndFunnel = assignSubAvatar({
      entryContexts: ['brand_led_hip_hop_artist'],
      genreFamily: 'hiphop',
      videoOutput: 'lots',
      fansPromote: 'already',
    });
    expect(withEngineAndFunnel?.confidence).toBe('high');
  });

  it('an entry context is a strong declared signal that answers can still outvote', () => {
    const justTheLink = assignSubAvatar({ entryContexts: ['brand_led_hip_hop_artist'] });
    expect(justTheLink?.primarySubAvatar).toBe('brand_led_hip_hop_artist');
    expect(justTheLink?.source).toBe('acquisition_path');

    // They clicked the brand-led link but answered like a proven, large-audience seller.
    const answersDisagree = assignSubAvatar({
      entryContexts: ['brand_led_hip_hop_artist'],
      audience: 600_000,
      monetizationStatus: 'direct_established',
      currentSupporters: 200,
    });
    expect(answersDisagree?.primarySubAvatar).toBe('highest_priority_empire_builder');
  });

  it('ties break by the declared precedence order, so cohorts stay disjoint', () => {
    // hip-hop (2) + video lots (2) = 4 for brand-led; R&B cannot also be true, so construct a
    // genuine tie between the operator (2 + 2) and brand-led (2 + 2).
    const a = assignSubAvatar({
      monetizationStatus: 'direct_some',
      platformsUsed: ['Patreon', 'Discord'],
      genreFamily: 'hiphop',
      videoOutput: 'lots',
    });
    expect(a?.primarySubAvatar).toBe('established_independent_operator');
    expect(a?.secondarySubAvatar).toBe('brand_led_hip_hop_artist');
  });

  it('a valid manual override wins outright, an invalid one is ignored', () => {
    expect(
      assignSubAvatar({ genreFamily: 'hiphop', videoOutput: 'lots', manualOverride: 'rnb_empire_builder' })
        ?.primarySubAvatar,
    ).toBe('rnb_empire_builder');
    expect(
      assignSubAvatar({ genreFamily: 'hiphop', videoOutput: 'lots', manualOverride: 'hacker_value' })
        ?.primarySubAvatar,
    ).toBe('brand_led_hip_hop_artist');
    // A retired v1 id must not be honored either.
    expect(
      assignSubAvatar({ genreFamily: 'hiphop', videoOutput: 'lots', manualOverride: 'catalog_vault_seller' })
        ?.primarySubAvatar,
    ).toBe('brand_led_hip_hop_artist');
  });

  it('is deterministic: same evidence, same assignment', () => {
    const e = { entryContexts: ['rnb_empire_builder'], genreFamily: 'rnb' as const, unreleasedCount: 20 };
    expect(assignSubAvatar(e)).toEqual(assignSubAvatar(e));
  });

  it('every scored point carries a human-readable evidence line', () => {
    const lines = scoreEvidence({
      entryContexts: ['highest_priority_empire_builder'],
      audience: 500_000,
      monetizationStatus: 'direct_established',
      currentSupporters: 80,
      platformsUsed: ['Patreon', 'Shopify'],
      yearsReleasing: 6,
      genreFamily: 'rnb',
      unreleasedCount: 30,
      videoOutput: 'lots',
      fansPromote: 'already',
      liveWilling: 'yes',
      patreonImported: true,
      liveSessionsHosted: 4,
      gatedTracks: 9,
    });
    expect(lines.length).toBeGreaterThan(8);
    for (const l of lines) {
      expect(l.line.length).toBeGreaterThan(5);
      expect(l.points).toBeGreaterThan(0);
    }
  });
});

describe('evidenceFromInputs', () => {
  it('reads the all-in-one calculator answers, tolerating junk', () => {
    const e = evidenceFromInputs({
      genre_family: 'rnb',
      social_followers: 120_000,
      monthly_listeners: 300_000,
      monetization_status: 'direct_some',
      current_supporters: 40,
      direct_fan_revenue_cents: 250_000,
      unreleased_count: 18,
      video_output: 'some',
      fans_promote: 'would',
      live_willing: 'yes',
      shows_per_year: 'lots', // wrong type on a key it does not read anyway
    });
    expect(e.genreFamily).toBe('rnb');
    // Audience is the LARGER platform figure, never a sum.
    expect(e.audience).toBe(300_000);
    expect(e.monetizationStatus).toBe('direct_some');
    expect(e.currentSupporters).toBe(40);
    expect(e.unreleasedCount).toBe(18);
  });

  it('lifts the stored entry context back out as provenance', () => {
    const e = evidenceFromInputs({ [ENTRY_CONTEXT_INPUT_KEY]: 'brand_led_hip_hop_artist' });
    expect(e.entryContexts).toEqual(['brand_led_hip_hop_artist']);
    // A junk or tool value is not provenance and is dropped.
    expect(evidenceFromInputs({ [ENTRY_CONTEXT_INPUT_KEY]: 'worth' }).entryContexts).toBeNull();
  });

  it('falls back to a typed genre when no family was picked', () => {
    expect(resolveGenreFamily(evidenceFromInputs({ genre: 'Trap' }))).toBe('hiphop');
    expect(resolveGenreFamily(evidenceFromInputs({ genre: 'Soul' }))).toBe('rnb');
  });

  it('returns nulls, never zeros, for absent facts', () => {
    const e = evidenceFromInputs(null);
    expect(e.audience).toBeNull();
    expect(e.unreleasedCount).toBeNull();
    expect(e.genreFamily).toBeNull();
  });
});

describe('mergeEvidence', () => {
  it('keeps the earliest non-null value per field', () => {
    const merged = mergeEvidence({ audience: 10 }, { audience: 99, unreleasedCount: 5 });
    expect(merged.audience).toBe(10);
    expect(merged.unreleasedCount).toBe(5);
  });
});
