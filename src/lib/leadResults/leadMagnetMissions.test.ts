// Tests for lead-magnet -> Rise Mode missions.
//
// The mission a calculator becomes is the artist's first, personalized step, so a wrong title,
// a wrong dollar, or a mission for a calculator they never completed would all be silent product
// bugs. These lock: the five mission titles, the money source (worth uses netMrr, loss tools use
// estimatedMonthlyCents), one-mission-per-completed-calculator dedupe, and biggest-first ranking.

import { describe, expect, it } from 'vitest';

import { seedToMission, missionsFromSeeds, LEAD_MAGNET_MISSIONS } from './leadMagnetMissions';
import type { LeadMagnetSeed } from './handoffSeed';

function seed(overrides: Partial<LeadMagnetSeed>): LeadMagnetSeed {
  return {
    resultId: 'r',
    toolSlug: 'worth',
    toolName: 'Streaming Loss Calculator',
    headline: '',
    heroValue: null,
    heroSuffix: null,
    estimatedMonthlyCents: null,
    estimatedAnnualCents: null,
    conversionPayload: {},
    convertHref: '/studio',
    createdAt: '2026-07-25T00:00:00Z',
    ...overrides,
  };
}

describe('seedToMission maps each calculator to its mission', () => {
  it('Streaming Loss -> Build Membership, dollar from netMrr, CTA into /offers/new', () => {
    const m = seedToMission(
      seed({ toolSlug: 'worth', conversionPayload: { netMrrCents: 120_000, ladder: [] } }),
    );
    expect(m?.title).toBe('Build Membership');
    expect(m?.monthlyValue).toBe('$1,200/mo');
    expect(m?.monthlyCents).toBe(120_000);
    expect(m?.href.startsWith('/offers/new?')).toBe(true);
  });

  it('the four loss tools carry their exact mission titles and estimatedMonthlyCents', () => {
    const cases: Array<[string, string, string]> = [
      ['share-to-earn-planner', 'Turn On Share-to-Earn', '/offers/new'],
      ['executive-producer-session', 'Create Your First Executive Producer Session', '/studio/live'],
      ['live-experience-calculator', 'Schedule Your First Ticketed Live', '/studio/live'],
      ['vault-revenue-planner', 'Launch Your Vault', '/offers/new'],
    ];
    for (const [slug, title, path] of cases) {
      const m = seedToMission(seed({ toolSlug: slug, estimatedMonthlyCents: 500_000 }));
      expect(m?.title).toBe(title);
      expect(m?.monthlyValue).toBe('$5,000/mo');
      expect(m?.href.startsWith(path)).toBe(true);
    }
  });

  it('a calculator with no builder mission returns null (no mission is invented)', () => {
    expect(seedToMission(seed({ toolSlug: 'movement-page-blueprint' }))).toBeNull();
    expect(seedToMission(seed({ toolSlug: 'royalty-readiness-check' }))).toBeNull();
  });

  it('a mission with no dollar figure still exists, just without a value', () => {
    const m = seedToMission(seed({ toolSlug: 'vault-revenue-planner', estimatedMonthlyCents: null }));
    expect(m?.title).toBe('Launch Your Vault');
    expect(m?.monthlyValue).toBeNull();
    expect(m?.monthlyCents).toBeNull();
  });
});

describe('missionsFromSeeds: one per completed calculator, ranked', () => {
  it('only generates missions for completed, builder-mapped calculators', () => {
    const missions = missionsFromSeeds([
      seed({ toolSlug: 'worth', conversionPayload: { netMrrCents: 100_000 } }),
      seed({ toolSlug: 'movement-page-blueprint', estimatedMonthlyCents: 999_999 }), // not mapped -> ignored
    ]);
    expect(missions.map((m) => m.toolSlug)).toEqual(['worth']);
  });

  it('dedupes to one mission per tool, keeping the newest (seeds are newest-first)', () => {
    const missions = missionsFromSeeds([
      seed({ toolSlug: 'worth', resultId: 'new', conversionPayload: { netMrrCents: 300_000 } }),
      seed({ toolSlug: 'worth', resultId: 'old', conversionPayload: { netMrrCents: 100_000 } }),
    ]);
    expect(missions).toHaveLength(1);
    expect(missions[0].resultId).toBe('new');
    expect(missions[0].monthlyCents).toBe(300_000);
  });

  it('ranks the biggest opportunity first (the personalized FIRST mission)', () => {
    const missions = missionsFromSeeds([
      seed({ toolSlug: 'share-to-earn-planner', estimatedMonthlyCents: 200_000 }),
      seed({ toolSlug: 'executive-producer-session', estimatedMonthlyCents: 900_000 }),
      seed({ toolSlug: 'vault-revenue-planner', estimatedMonthlyCents: 500_000 }),
    ]);
    expect(missions.map((m) => m.toolSlug)).toEqual([
      'executive-producer-session',
      'vault-revenue-planner',
      'share-to-earn-planner',
    ]);
    expect(missions[0].title).toBe('Create Your First Executive Producer Session');
  });

  it('returns nothing when no calculator was completed', () => {
    expect(missionsFromSeeds([])).toEqual([]);
  });
});

describe('the mission catalog covers exactly the five builder-mapped calculators', () => {
  it('has the five expected slugs', () => {
    expect(Object.keys(LEAD_MAGNET_MISSIONS).sort()).toEqual(
      [
        'executive-producer-session',
        'live-experience-calculator',
        'share-to-earn-planner',
        'vault-revenue-planner',
        'worth',
      ].sort(),
    );
  });
});
