import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { activeObservedRates, observedRates, rateOrModel } from './artistObserved';
import { observedRatesBrief } from './readership';
import { CONSTRAINT_THRESHOLDS as T } from './thresholds';
import type { ConstraintEvidence } from './types';

const RAW = readFileSync('src/lib/constraint/artistObserved.ts', 'utf8');
/** CODE only. A comment explaining that a thing is forbidden is not that thing. */
const SRC = RAW.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const GENERATE = readFileSync('src/app/api/ai-manager/generate/route.ts', 'utf8');
const BRIEF = readFileSync('src/lib/ai/coachingBrief.ts', 'utf8');

const base = (over: Partial<ConstraintEvidence> = {}): ConstraintEvidence => ({
  now: '2026-08-11T00:00:00.000Z',
  launch: { pageLive: true, stripeConnected: true, tierPurchasable: true, hasTrack: true, daysLive: 200 },
  reach: { uniqueVisits: null, lookbackDays: 30 },
  membership: { freeMembers: null, paidMembers: null, freeJoinsInWindow: null, daysSinceFirstFreeMember: null, hasFirstPaidConversion: null, mrrCents: null, premiumMrrShare: null },
  tiers: { interactionDataAvailable: false, paidRungs: [], lookbackDays: 30 },
  promises: { resolved: null, completed: null, missed: null, completionRate: null, overdueNow: null, oldestOverdue: null, lookbackDays: 90 },
  retention: { churnRatePct: null, platformChurnRatePct: null, cancelReasonResponses: null },
  slug: 'x',
  ...over,
});
const get = (e: ConstraintEvidence, k: string) => observedRates(e).find((r) => r.metric === k)!;

describe('missing evidence never becomes zero', () => {
  it('returns no_evidence rather than a 0% rate when traffic cannot be seen', () => {
    const r = get(base(), 'free_capture_rate');
    expect(r.status).toBe('no_evidence');
    expect(r.value).toBeNull();
    expect(r.value).not.toBe(0);
    expect(r.active).toBe(false);
  });

  it('does not invent a checkout rate when tier data cannot be read', () => {
    const r = get(base(), 'checkout_completion_rate');
    expect(r.status).toBe('no_evidence');
    expect(r.value).toBeNull();
  });

  it('treats zero checkout starts as nothing to measure, not as 0% completion', () => {
    const e = base({ tiers: { interactionDataAvailable: true, paidRungs: [], lookbackDays: 30 } });
    expect(get(e, 'checkout_completion_rate').status).toBe('no_evidence');
  });
});

describe('sample sufficiency uses the canonical floor, and is never invented here', () => {
  it('keeps the model below the floor even though the data exists', () => {
    const below = T.freeCapture.minimumVisits - 1;
    const e = base({
      reach: { uniqueVisits: below, lookbackDays: 30 },
      membership: { ...base().membership, freeJoinsInWindow: 10 },
    });
    const r = get(e, 'free_capture_rate');
    expect(r.status).toBe('insufficient_sample');
    expect(r.active).toBe(false);
    expect(r.value).toBeCloseTo(10 / below); // computed, but deliberately not trusted
  });

  it('activates at the floor', () => {
    const at = T.freeCapture.minimumVisits;
    const e = base({
      reach: { uniqueVisits: at, lookbackDays: 30 },
      membership: { ...base().membership, freeJoinsInWindow: 8 },
    });
    const r = get(e, 'free_capture_rate');
    expect(r.status).toBe('artist_observed');
    expect(r.active).toBe(true);
    expect(r.minimumSample).toBe(T.freeCapture.minimumVisits);
    expect(r.windowDays).toBe(T.freeCapture.lookbackDays);
  });

  it('reads the floors from policy instead of hardcoding them', () => {
    expect(SRC).toContain('t.freeCapture.minimumVisits');
    expect(SRC).toContain('t.checkoutCompletion.minimumCheckoutStarts');
  });

  it('never writes a threshold: policy is read-only here', () => {
    expect(SRC).not.toMatch(/CONSTRAINT_THRESHOLDS\.\w+\s*=/);
    expect(SRC).not.toMatch(/minimum\w*\s*=\s*\d/);
  });
});

describe('numerator, denominator and sample are exposed, not just a number', () => {
  it('sums checkout starts across rungs rather than averaging per-rung rates', () => {
    const e = base({
      tiers: {
        interactionDataAvailable: true,
        lookbackDays: 30,
        paidRungs: [
          { tierId: 'a', tierName: 'Silver', priceCents: 1000, views: 100, checkoutStarts: 30, joins: 3 },
          { tierId: 'b', tierName: 'Gold', priceCents: 2500, views: 50, checkoutStarts: 10, joins: 7 },
        ],
      },
    });
    const r = get(e, 'checkout_completion_rate');
    expect(r.numerator).toBe(10);
    expect(r.denominator).toBe(40);
    expect(r.sample).toBe(40);
    expect(r.value).toBeCloseTo(0.25); // not (0.1 + 0.7)/2
    expect(r.explanation).toContain('10 of 40');
  });
});

describe('fallback is mandatory', () => {
  const modelled = 0.02;

  it('keeps the model when there is no evidence', () => {
    const out = rateOrModel(get(base(), 'free_capture_rate'), modelled);
    expect(out.source).toBe('modelled');
    expect(out.value).toBe(modelled);
  });

  it('keeps the model when the sample is too thin', () => {
    const e = base({ reach: { uniqueVisits: 5, lookbackDays: 30 }, membership: { ...base().membership, freeJoinsInWindow: 5 } });
    const out = rateOrModel(get(e, 'free_capture_rate'), modelled);
    expect(out.source).toBe('modelled'); // a 100% rate on 5 visits must never win
    expect(out.value).toBe(modelled);
  });

  it('uses the artist own rate only once it is eligible, and says so', () => {
    const e = base({ reach: { uniqueVisits: 400, lookbackDays: 30 }, membership: { ...base().membership, freeJoinsInWindow: 20 } });
    const out = rateOrModel(get(e, 'free_capture_rate'), modelled);
    expect(out.source).toBe('artist_observed');
    expect(out.value).toBeCloseTo(0.05);
    expect(out.sample).toBe(400);
  });

  it('never leaves the caller unable to tell which was used', () => {
    for (const o of [rateOrModel(undefined, modelled), rateOrModel(get(base(), 'free_capture_rate'), modelled)]) {
      expect(['artist_observed', 'modelled']).toContain(o.source);
      expect(o.explanation.length).toBeGreaterThan(0);
    }
  });
});

describe('the manager may quote these rates and may not invent one', () => {
  it('says nothing at all when no rate is eligible', () => {
    expect(observedRatesBrief(activeObservedRates(base()))).toBeNull();
  });

  it('forbids computing, estimating and comparing to other artists', () => {
    const e = base({ reach: { uniqueVisits: 400, lookbackDays: 30 }, membership: { ...base().membership, freeJoinsInWindow: 20 } });
    const brief = observedRatesBrief(activeObservedRates(e))!;
    expect(brief).toContain('this artist own account only');
    expect(brief.toLowerCase()).toContain('do not calculate a rate yourself');
    expect(brief.toLowerCase()).toContain('do not compare this artist to');
  });

  it('only ever passes ELIGIBLE rates to the manager', () => {
    const thin = base({ reach: { uniqueVisits: 5, lookbackDays: 30 }, membership: { ...base().membership, freeJoinsInWindow: 5 } });
    expect(activeObservedRates(thin)).toEqual([]);
    expect(observedRatesBrief(activeObservedRates(thin))).toBeNull();
  });
});

describe('the cross-artist boundary', () => {
  it('takes one artist evidence object and nothing else', () => {
    // No client, no query, no artist list: the signature makes cross-artist input impossible.
    expect(SRC).not.toMatch(/SupabaseClient|from\(['"]/);
    expect(SRC).not.toMatch(/benchmark|cohort|averageAcross|allArtists|percentile/i);
  });

  it('is fed from the SAME single-artist evidence read the constraint engine uses', () => {
    // This assembly moved OUT of the cron and into `ai/coachingBrief.ts`, because the cron was
    // not the only Manager path that needed it: the artist's own Refresh button ran the insight
    // model with no canonical context at all. One builder now serves both, so the property this
    // test protects (Z9 rates come from the SAME single-artist evidence read, never a second
    // query and never a wider one) is asserted at that builder.
    expect(BRIEF).toContain('activeObservedRates(evidence)');
    expect(BRIEF).toContain('assembleConstraintEvidence(admin, { artistId, userId })');
    // ...and every Manager path must go through it rather than assembling its own.
    // CRON dropped: the autonomous Manager cron was deleted 2026-08-13.
    for (const src of [GENERATE]) {
      expect(src).toContain('buildCoachingBrief');
      expect(src).not.toContain('activeObservedRates');
    }
  });
});

describe('no score, no money, no policy change', () => {
  it('produces no combined index or confidence number', () => {
    expect(SRC).not.toMatch(/score|rating|confidence[A-Z]|index\b/i);
  });

  it('reads no financial value', () => {
    expect(SRC).not.toMatch(/mrr|earnings|revenue|gmv|cents/i);
  });

  it('adds no schema and no persistence', () => {
    expect(SRC).not.toMatch(/insert|update|upsert|\.from\(/);
  });
});
