// `projected_monthly_gmv` and the plan recommendation are sized by modeled GROSS GMV.
//
// The defect (fixed 2026-09-20, founder decision): auto-claim and the launch-review panel fed
// `recommendPlan()` the seed's `estimatedMonthlyCents`. For the Opportunity Calculator that is
// NET-NEW revenue, what is left after CRWN's costs AND after subtracting what the artist already
// earns. So the more an artist already earned, the smaller CRWN sized them, and an established
// seller whose estimate added nothing new was sized at zero and got no recommendation at all.
//
// These run the real adapter and the real recommender over the audit's personas, so the fixture
// IS the failure, not a paraphrase of it.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { recommendPlan, scaleBreakEvenGmvCents } from '@/lib/planRecommendation';
import { buildUnifiedResult, toUnifiedInputs } from '@/lib/opportunity/unifiedAdapter';
import { calculateScenarioBand, calculateUnifiedOpportunity } from '@/lib/opportunity/unifiedModel';
import { getTool } from '@/lib/acquisition/toolAdapters';
import { rowToSeed } from './handoffSeed';
import { projectedGmvCents, projectedGmvCentsFromSeed } from './projectedGmv';

/** A claimed Opportunity result row, exactly as the capture route stores one. */
const opportunityRow = (answers: Record<string, unknown>, id = 'r1') =>
  rowToSeed({
    id,
    tool_slug: 'opportunity-calculator',
    result_data: buildUnifiedResult(answers) as unknown as Record<string, unknown>,
    input_data: answers,
    created_at: '2026-09-20T00:00:00.000Z',
  });

/** A builder draft row: no numbers on it at all (`result_data` is empty). */
const draftRow = (slug = 'opportunity-calculator') =>
  rowToSeed({
    id: 'draft',
    tool_slug: slug,
    result_data: {},
    input_data: { deliverableValues: { t1Name: 'Silver' }, opportunitySummary: '$14,576 to $93,165/mo' },
    created_at: '2026-09-21T00:00:00.000Z',
  });

const KAIRO = { social_followers: 420_000, monthly_listeners: 180_000, owned_contacts: 12_500, current_supporters: 290, direct_fan_revenue_cents: 840_000, unreleased_count: 12 };
// The investigation's Maya: $22k a month direct, and a CONSERVATIVE case that adds nothing new.
const MAYA = { social_followers: 300_000, owned_contacts: 20_000, direct_fan_revenue_cents: 2_200_000, unreleased_count: 12 };

describe('the stored GMV is modeled gross', () => {
  it('reads the gross the model computed, not the net-new estimate beside it', () => {
    const seed = opportunityRow(KAIRO);
    const model = calculateUnifiedOpportunity(toUnifiedInputs(KAIRO));
    expect(projectedGmvCentsFromSeed(seed)).toBe(model.totalGrossCents);
    // The figure that USED to be stored: smaller by CRWN's costs and by everything already earned.
    expect(seed.estimatedMonthlyCents).toBe(model.netNewMonthlyCents);
    expect(projectedGmvCentsFromSeed(seed)!).toBeGreaterThan(seed.estimatedMonthlyCents!);
    expect(projectedGmvCentsFromSeed(seed)! - seed.estimatedMonthlyCents!).toBe(
      model.crwnCostCents + model.contributorCommissionCents + KAIRO.direct_fan_revenue_cents,
    );
  });

  it('is not lowered by current direct revenue', () => {
    const none = projectedGmvCentsFromSeed(opportunityRow({ ...KAIRO, direct_fan_revenue_cents: 0 }));
    const lots = projectedGmvCentsFromSeed(opportunityRow({ ...KAIRO, direct_fan_revenue_cents: 9_000_000 }));
    expect(lots).toBe(none);
  });

  it('is not lowered by CRWN\'s costs', () => {
    const model = calculateUnifiedOpportunity(toUnifiedInputs(KAIRO));
    expect(model.crwnCostCents).toBeGreaterThan(0);
    expect(projectedGmvCentsFromSeed(opportunityRow(KAIRO))).toBe(model.netMonthlyCents + model.crwnCostCents + model.contributorCommissionCents);
  });

  it('stays in cents: a $51,906 gross is 5,190,600, never 51,906 and never 519,060,000', () => {
    const gmv = projectedGmvCentsFromSeed(opportunityRow(KAIRO))!;
    const dollars = Math.round(gmv / 100);
    expect(Number.isInteger(gmv)).toBe(true);
    expect(dollars).toBeGreaterThan(40_000);
    expect(dollars).toBeLessThan(70_000);
    // Read as dollars by mistake it would be a $5M artist; read as cents-of-dollars, a $519 one.
    expect(recommendPlan({ projectedMonthlyGmvCents: gmv }).plan).toBe('scale');
    expect(recommendPlan({ projectedMonthlyGmvCents: dollars }).plan).toBe('starter');
  });
});

describe('the recommendation is based on gross: the Maya failure mode', () => {
  it('recommends Scale to a high-gross seller whose net-new revenue is near zero', () => {
    // Make the point as sharply as the data allows: she already earns about what the model says
    // she could gross, so almost nothing is NEW. Her business is large all the same.
    const model = calculateUnifiedOpportunity(toUnifiedInputs(MAYA));
    const alreadyThere = { ...MAYA, direct_fan_revenue_cents: model.netMonthlyCents - 5_000 };
    const seed = opportunityRow(alreadyThere);

    expect(seed.estimatedMonthlyCents).toBe(5_000); // $50 of net-new revenue...
    expect(recommendPlan({ projectedMonthlyGmvCents: seed.estimatedMonthlyCents! }).plan).toBe('starter'); // ...which the old code sized her by
    const gmv = projectedGmvCentsFromSeed(seed)!;
    expect(gmv).toBeGreaterThan(scaleBreakEvenGmvCents());
    expect(recommendPlan({ projectedMonthlyGmvCents: gmv }).plan).toBe('scale');
  });

  it('still recommends when the estimate adds NOTHING new, where the old code stored no recommendation at all', () => {
    const model = calculateUnifiedOpportunity(toUnifiedInputs(MAYA));
    const saturated = opportunityRow({ ...MAYA, direct_fan_revenue_cents: model.netMonthlyCents + 1_000_000 });
    expect(saturated.estimatedMonthlyCents).toBeNull(); // the old gate: `if (seed?.estimatedMonthlyCents)`
    expect(projectedGmvCentsFromSeed(saturated)).toBe(model.totalGrossCents);
    expect(recommendPlan({ projectedMonthlyGmvCents: projectedGmvCentsFromSeed(saturated)! }).plan).toBe('scale');
  });

  it('names the same plan the calculator showed her', () => {
    for (const persona of [KAIRO, MAYA]) {
      const shown = calculateScenarioBand(toUnifiedInputs(persona)).expected.assumptions.planKey;
      const stored = recommendPlan({ projectedMonthlyGmvCents: projectedGmvCentsFromSeed(opportunityRow(persona))! }).plan;
      expect(stored).toBe(shown);
    }
  });
});

describe('which row, and which figure, may stand for GMV', () => {
  it('looks past a newer builder draft, which carries no numbers, to the result that has a gross', () => {
    const real = opportunityRow(KAIRO);
    expect(projectedGmvCentsFromSeed(draftRow())).toBeNull();
    expect(projectedGmvCents([draftRow(), real])).toBe(projectedGmvCentsFromSeed(real));
    expect(projectedGmvCents([draftRow()])).toBeNull();
    expect(projectedGmvCents([])).toBeNull();
  });

  it('reads an Opportunity result saved before gross was carried from its two stored gross halves', () => {
    const legacy = opportunityRow(KAIRO);
    const model = calculateUnifiedOpportunity(toUnifiedInputs(KAIRO));
    delete (legacy.conversionPayload as Record<string, unknown>).totalGrossCents;
    expect(projectedGmvCentsFromSeed(legacy)).toBe(model.recurringGrossCents + model.oneTimeGrossCents);
    expect(projectedGmvCentsFromSeed(legacy)).toBe(model.totalGrossCents);
  });

  it('never uses a net figure as GMV: a /worth or Opportunity row with no gross contributes nothing', () => {
    for (const toolSlug of ['worth', 'opportunity-calculator']) {
      expect(projectedGmvCentsFromSeed({ toolSlug, estimatedMonthlyCents: 3_900_000, conversionPayload: { netMrrCents: 3_900_000, netNewMonthlyCents: 3_900_000 } })).toBeNull();
    }
  });

  it('reads the WORTH DM result\'s gross, which is larger than the net it leads with', () => {
    const dm = getTool('worth')!.execute({ monthly_listeners: 250_000, monetization_status: 'none' } as never);
    const seed = rowToSeed({ id: 'w', tool_slug: 'worth', result_data: dm as unknown as Record<string, unknown>, input_data: {}, created_at: '2026-09-20T00:00:00.000Z' });
    const cp = dm.conversionPayload as Record<string, number>;
    expect(projectedGmvCentsFromSeed(seed)).toBe(cp.totalGrossCents);
    expect(cp.totalGrossCents).toBeGreaterThan(cp.netMrrCents);
  });

  it('accepts a loss tool\'s estimate, which is a gross opportunity figure with nothing subtracted', () => {
    expect(projectedGmvCentsFromSeed({ toolSlug: 'vault-revenue-planner', estimatedMonthlyCents: 250_000, conversionPayload: {} })).toBe(250_000);
  });

  it('ignores junk', () => {
    for (const v of [0, -1, NaN, Infinity, '5190600', null, undefined]) {
      expect(projectedGmvCentsFromSeed({ toolSlug: 'opportunity-calculator', estimatedMonthlyCents: null, conversionPayload: { totalGrossCents: v } })).toBeNull();
    }
    expect(projectedGmvCentsFromSeed(null)).toBeNull();
  });
});

describe('the three places that size a plan all use this one definition', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

  it('auto-claim feeds the recommender, and stores, the projected gross', () => {
    const route = read('app/api/lead-results/auto-claim/route.ts');
    expect(route).toContain('const projectedGmv = projectedGmvCents(await getClaimedResults(');
    expect(route).toContain('recommendPlan({ projectedMonthlyGmvCents: projectedGmv })');
    expect(route).toContain('projected_monthly_gmv: projectedGmv');
    // The defect, by name: the net-new estimate may never reach the recommender or the column.
    expect(route).not.toMatch(/projectedMonthlyGmvCents:\s*seed\.estimatedMonthlyCents/);
    expect(route).not.toMatch(/projected_monthly_gmv:\s*seed\.estimatedMonthlyCents/);
    // Advisory only: the route never writes the artist's actual plan.
    expect(route).not.toMatch(/platform_tier\s*:/);
  });

  it('the launch-review panel prices plans on the projected gross, not on the goal', () => {
    const roadmap = read('app/api/artist/roadmap/route.ts');
    expect(roadmap).toContain('projectedGmvCents: projectedGmv');
    const setup = read('app/setup/page.tsx');
    expect(setup).toContain('setGoalCents(j.stats.projectedGmvCents)');
    expect(setup).not.toContain('setGoalCents(j.stats.goalMonthlyCents)');
  });
});
