import { describe, it, expect } from 'vitest';
import { assignVariant, evenAllocation, hashString } from './assignment';
import {
  EXPERIMENT_CONFIGS,
  getExperimentConfig,
  isKnownExperience,
  isKnownVariant,
  toPublicExperiment,
} from './registry';
import { TAXONOMY, getTaxonomyEvent, isActualBasis, TAXONOMY_VERSION } from './taxonomy';
import { METRIC_DEFINITIONS, metricIsAvailable } from './metrics';
import { buildInsights, compareRate, dedupeBy, MIN_SAMPLE, type ExperienceStats } from './insights';

describe('deterministic assignment', () => {
  const alloc = [
    { variantKey: 'a', pct: 50 },
    { variantKey: 'b', pct: 50 },
  ];

  it('is stable for the same inputs (no mid-journey switching)', () => {
    const first = assignVariant('aid-123', 'exp', '1', alloc);
    for (let i = 0; i < 100; i++) expect(assignVariant('aid-123', 'exp', '1', alloc)).toBe(first);
  });

  it('respects allocation boundaries (~50/50 across many ids)', () => {
    let a = 0;
    let b = 0;
    for (let i = 0; i < 4000; i++) {
      const v = assignVariant(`id-${i}`, 'exp', '1', alloc);
      if (v === 'a') a++;
      else if (v === 'b') b++;
    }
    expect(a + b).toBe(4000); // full allocation, no holdout
    expect(a).toBeGreaterThan(1600);
    expect(b).toBeGreaterThan(1600);
  });

  it('returns holdout (null) for the unallocated remainder', () => {
    const held = [{ variantKey: 'only', pct: 20 }];
    let nulls = 0;
    for (let i = 0; i < 2000; i++) if (assignVariant(`h-${i}`, 'exp', '1', held) === null) nulls++;
    expect(nulls).toBeGreaterThan(1400); // ~80% holdout
  });

  it('changes assignment when the config version changes', () => {
    // Not guaranteed per-id, but the distribution must differ; check at least one id flips.
    let flipped = false;
    for (let i = 0; i < 200 && !flipped; i++) {
      const id = `v-${i}`;
      if (assignVariant(id, 'exp', '1', alloc) !== assignVariant(id, 'exp', '2', alloc)) flipped = true;
    }
    expect(flipped).toBe(true);
  });

  it('returns null for empty inputs', () => {
    expect(assignVariant('', 'exp', '1', alloc)).toBeNull();
    expect(assignVariant('aid', 'exp', '1', [])).toBeNull();
  });

  it('hashString is deterministic', () => {
    expect(hashString('x')).toBe(hashString('x'));
    expect(hashString('x')).not.toBe(hashString('y'));
  });

  it('evenAllocation splits across keys', () => {
    expect(evenAllocation(['a', 'b'])).toEqual([
      { variantKey: 'a', pct: 50 },
      { variantKey: 'b', pct: 50 },
    ]);
  });
});

describe('registry + config validation', () => {
  it('exposes the two approved experiences and prebuilt configs', () => {
    expect(isKnownExperience('own-your-fans')).toBe(true);
    expect(isKnownExperience('streaming-loss')).toBe(true);
    expect(isKnownExperience('made-up')).toBe(false);
    expect(EXPERIMENT_CONFIGS.length).toBeGreaterThanOrEqual(2);
  });

  it('validates variant membership', () => {
    expect(isKnownVariant('oyf-signup-timing-v1', 'save')).toBe(true);
    expect(isKnownVariant('oyf-signup-timing-v1', 'nope')).toBe(false);
    expect(isKnownVariant('missing', 'save')).toBe(false);
  });

  it('public projection hides private config (hypothesis/metrics/notes)', () => {
    const cfg = getExperimentConfig('oyf-signup-timing-v1')!;
    const pub = toPublicExperiment(cfg) as Record<string, unknown>;
    expect(pub.hypothesis).toBeUndefined();
    expect(pub.primaryMetric).toBeUndefined();
    expect(pub.secondaryMetrics).toBeUndefined();
    expect(pub.variants).toHaveLength(cfg.variants.length);
    expect((pub.variants as { key: string }[])[0].key).toBeDefined();
    // No variant-level `config` behavior leaks either.
    expect((pub.variants as Record<string, unknown>[])[0].config).toBeUndefined();
  });
});

describe('taxonomy: projection vs actual', () => {
  it('is versioned', () => {
    expect(TAXONOMY_VERSION).toBe('v1');
    expect(TAXONOMY.length).toBeGreaterThan(20);
  });
  it('marks opportunity_captured as ACTUAL and opportunity_revealed as PROJECTION', () => {
    expect(getTaxonomyEvent('opportunity_captured')!.financialBasis).toBe('actual');
    expect(getTaxonomyEvent('opportunity_revealed')!.financialBasis).toBe('projection');
    expect(isActualBasis('opportunity_captured')).toBe(true);
    expect(isActualBasis('opportunity_revealed')).toBe(false);
  });
  it('marks thirty_day_retention unavailable rather than inventing it', () => {
    expect(getTaxonomyEvent('thirty_day_retention')!.available).toBe(false);
  });
});

describe('metric definitions', () => {
  it('defines every required metric', () => {
    for (const key of [
      'eligible',
      'exposed',
      'tool_completion',
      'builder_start',
      'signup_completion',
      'activated_artist',
      'feature_published',
      'first_fan_action',
      'first_dollar',
      'time_to_first_dollar',
      'seven_day_activation',
      'thirty_day_retention',
      'opportunity_revealed',
      'opportunity_activated',
      'opportunity_captured',
    ]) {
      const def = METRIC_DEFINITIONS.find((m) => m.key === key);
      expect(def, `missing definition: ${key}`).toBeDefined();
      expect(def!.definition.length).toBeGreaterThan(10);
    }
  });
  it('marks retention unavailable and captured as actual', () => {
    expect(metricIsAvailable('thirty_day_retention')).toBe(false);
    expect(METRIC_DEFINITIONS.find((m) => m.key === 'opportunity_captured')!.basis).toBe('actual');
    expect(METRIC_DEFINITIONS.find((m) => m.key === 'opportunity_revealed')!.basis).toBe('projection');
  });
});

describe('insights (deterministic, honest)', () => {
  const big = (over: Partial<ExperienceStats>): ExperienceStats => ({
    key: 'x',
    title: 'X',
    eligible: 1000,
    exposed: 900,
    toolCompletions: 500,
    builderStarts: 200,
    signupCompletions: 100,
    featurePublications: 30,
    firstDollars: 10,
    ...over,
  });

  it('states direction with sample sizes when data is sufficient', () => {
    const a = big({ title: 'Own Your Fans', toolCompletions: 500, builderStarts: 300 });
    const b = big({ title: 'Streaming Loss', toolCompletions: 500, builderStarts: 150 });
    const cards = buildInsights(a, b, 'Jul 1-27');
    const builder = cards[0];
    expect(builder.sufficient).toBe(true);
    expect(builder.text).toContain('Own Your Fans produced a higher builder-start rate');
    expect(builder.text).toContain('Jul 1-27');
    expect(builder.text).toMatch(/\d+\/\d+/); // sample sizes present
  });

  it('refuses to declare a direction on insufficient data (no fake winner)', () => {
    const a = big({ title: 'A', toolCompletions: 5, builderStarts: 4 });
    const b = big({ title: 'B', toolCompletions: 5, builderStarts: 1 });
    const card = compareRate(
      { title: 'A', num: 4, den: 5 },
      { title: 'B', num: 1, den: 5 },
      'builder-start rate',
      'Jul',
    );
    expect(card.sufficient).toBe(false);
    expect(card.text).toContain('Not enough data');
    expect(card.text).toContain(String(MIN_SAMPLE));
  });

  it('never emits a confidence percentage or causal claim', () => {
    const a = big({ title: 'A' });
    const b = big({ title: 'B' });
    for (const c of buildInsights(a, b, 'Jul')) {
      expect(c.text.toLowerCase()).not.toContain('confidence');
      expect(c.text.toLowerCase()).not.toContain('because');
      expect(c.text.toLowerCase()).not.toContain('caused');
      expect(c.text).not.toMatch(/p\s*[=<]/i);
    }
  });

  it('dedupeBy removes duplicate exposures', () => {
    const rows = [{ aid: 'a' }, { aid: 'a' }, { aid: 'b' }];
    expect(dedupeBy(rows, (r) => r.aid)).toHaveLength(2);
  });
});
