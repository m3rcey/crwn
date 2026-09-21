// PUBLIC CALCULATOR COST BASIS (founder decision, 2026-09-20).
//
// "When a CRWN calculator models platform costs, it uses the canonical revenue-based plan
// recommendation for the modeled gross GMV rather than assuming a fixed plan."
//
// The calculators used to pin Pro. That was a convention inherited from `/worth`, written when Pro
// was $9.99 and was the plan the paid ladder required; both reasons went in the 2026-07-31 reprice,
// and every audited ICP artist was being priced $1,400 to $4,600 a month above the plan CRWN would
// itself recommend them. `/worth` also named Pro, took Pro's 8%, called the result net, and left
// Pro's $49 out.
//
// Every expectation below is derived from the canonical constants and helpers, never from a number
// typed into this file, so a repricing moves the expectations with it instead of failing them.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIER_LIMITS, TIER_PRICING } from './platformTier';
import {
  describePlanBasis,
  modeledPlanCost,
  monthlyPlanCostCents,
  proBreakEvenGmvCents,
  recommendPlan,
  scaleBreakEvenGmvCents,
  type PlatformPlan,
} from './planRecommendation';
import { calculate, getAssumptions } from './leadCalculator';
import { calculateScenarioBand, calculateUnifiedOpportunity } from './opportunity/unifiedModel';
import { buildUnifiedResult, toUnifiedInputs } from './opportunity/unifiedAdapter';
import { getTool } from './acquisition/toolAdapters';

const PLANS: PlatformPlan[] = ['starter', 'pro', 'scale'];
const subscription = (p: PlatformPlan): number => (p === 'starter' ? 0 : TIER_PRICING[p].monthly);
const usd = (cents: number): string => '$' + Math.round(cents / 100).toLocaleString('en-US');
/** Source with comments removed, so a comment that NAMES the recommender is not read as a use of it. */
const codeOnly = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// The requested regression points, in dollars, plus the three audited ICP gross values.
const GMV_DOLLARS = [500, 1_000, 1_225, 2_500, 5_000, 10_000, 25_000, 50_000, 51_906, 99_264, 159_154];

describe('the plan follows the recommender at every modeled gross', () => {
  it.each(GMV_DOLLARS)('$%d a month: the recommender\'s plan, priced in full', (dollars) => {
    const gross = dollars * 100;
    const cost = modeledPlanCost(gross);
    const plan = recommendPlan({ projectedMonthlyGmvCents: gross }).plan;
    expect(cost.plan).toBe(plan);
    expect(cost.feePercent).toBe(TIER_LIMITS[plan].platformFeePercent);
    expect(cost.subscriptionCents).toBe(subscription(plan));
    expect(cost.feeCents).toBe(Math.round(gross * (TIER_LIMITS[plan].platformFeePercent / 100)));
    expect(cost.totalCents).toBe(cost.feeCents + cost.subscriptionCents);
    expect(cost.totalCents).toBe(monthlyPlanCostCents(plan, gross));
  });

  it.each(GMV_DOLLARS)('$%d a month: no other plan would cost less', (dollars) => {
    // The recommender is a break-even rule, so its pick is the cheapest plan (ties aside). This is
    // what makes the estimate one a rational artist would actually get.
    const gross = dollars * 100;
    const picked = modeledPlanCost(gross).totalCents;
    for (const p of PLANS) expect(picked).toBeLessThanOrEqual(monthlyPlanCostCents(p, gross));
  });

  it('models Launch below the Pro break-even, Pro between the break-evens, Scale above', () => {
    const pro = proBreakEvenGmvCents();
    const scale = scaleBreakEvenGmvCents();
    expect(modeledPlanCost(pro - 100).plan).toBe('starter');
    expect(modeledPlanCost(pro + 100).plan).toBe('pro');
    expect(modeledPlanCost(scale - 100).plan).toBe('pro');
    expect(modeledPlanCost(scale + 100).plan).toBe('scale');
  });

  it('preserves the recommender\'s own tie behavior at both break-evens, where the costs are equal', () => {
    for (const [breakEven, lower, upper] of [
      [proBreakEvenGmvCents(), 'starter', 'pro'],
      [scaleBreakEvenGmvCents(), 'pro', 'scale'],
    ] as const) {
      // A true tie: both plans cost the same at the break-even...
      expect(monthlyPlanCostCents(lower, breakEven)).toBe(monthlyPlanCostCents(upper, breakEven));
      // ...and the calculator takes whichever side the recommender takes. It does not decide.
      expect(modeledPlanCost(breakEven).plan).toBe(recommendPlan({ projectedMonthlyGmvCents: breakEven }).plan);
      expect(modeledPlanCost(breakEven).totalCents).toBe(monthlyPlanCostCents(lower, breakEven));
    }
  });

  it('puts every audited ICP gross on Scale, and shows what the old fixed-Pro basis overcharged', () => {
    for (const dollars of [51_906, 99_264, 159_154]) {
      const gross = dollars * 100;
      expect(modeledPlanCost(gross).plan).toBe('scale');
      expect(monthlyPlanCostCents('pro', gross) - modeledPlanCost(gross).totalCents).toBeGreaterThan(100_000);
    }
  });

  it('charges nothing on no gross, and tolerates junk', () => {
    for (const g of [0, -5, NaN, Infinity]) {
      const c = modeledPlanCost(g as number);
      expect(c.plan).toBe('starter');
      expect(c.totalCents).toBe(0);
    }
  });

  it('describes a plan only from the canonical constants', () => {
    for (const p of PLANS) {
      const words = describePlanBasis(p);
      expect(words.costLine).toContain(`${TIER_LIMITS[p].platformFeePercent}% fee`);
      expect(words.shortCost).toContain(`${TIER_LIMITS[p].platformFeePercent}%`);
      if (p === 'starter') {
        expect(words.costLine).toMatch(/no monthly plan cost/);
      } else {
        expect(words.costLine).toContain(`${usd(TIER_PRICING[p].monthly)}/mo`);
        expect(words.shortCost).toContain(`${usd(TIER_PRICING[p].monthly)}/mo`);
      }
      expect(`${words.name} ${words.costLine} ${words.shortCost}`).not.toMatch(/[—–]/);
    }
    expect(describePlanBasis('starter').name).toBe('Launch');
  });
});

describe('the audited ICP results: only the CRWN cost, and what follows it, moved', () => {
  // The Tier 1 audit's personas. `direct_fan_revenue_cents` is cents at this layer.
  const PERSONAS = {
    Kairo: { social_followers: 420_000, monthly_listeners: 180_000, owned_contacts: 12_500, current_supporters: 290, direct_fan_revenue_cents: 840_000, unreleased_count: 12 },
    Maya: { social_followers: 300_000, owned_contacts: 20_000, direct_fan_revenue_cents: 2_200_000, unreleased_count: 12 },
    Andre: { social_followers: 1_250_000, monthly_listeners: 900_000, owned_contacts: 45_000, current_supporters: 1_200, direct_fan_revenue_cents: 3_500_000, unreleased_count: 12 },
  };

  for (const [name, answers] of Object.entries(PERSONAS)) {
    it(`${name}: Scale in the expected case, with the revenue side untouched by the plan`, () => {
      const r = calculateUnifiedOpportunity(toUnifiedInputs(answers));
      expect(r.assumptions.planKey).toBe(recommendPlan({ projectedMonthlyGmvCents: r.totalGrossCents }).plan);
      expect(r.assumptions.planKey).toBe('scale');

      // The revenue side reconciles exactly as it did: nothing about it reads a plan.
      expect(r.recurringGrossCents).toBe(r.core.tiers.reduce((s, t) => s + t.monthlyCents, 0));
      expect(r.oneTimeGrossCents).toBe(r.core.memberAlacarteGrossCents + r.incrementalGrossCents);
      expect(r.totalGrossCents).toBe(r.recurringGrossCents + r.oneTimeGrossCents);
      expect(r.inputs.currentDirectRevenueCents).toBe(answers.direct_fan_revenue_cents);

      // Only cost, after-cost and additional move, and each is the canonical arithmetic.
      expect(r.crwnCostCents).toBe(monthlyPlanCostCents('scale', r.totalGrossCents));
      expect(r.netMonthlyCents).toBe(r.totalGrossCents - r.crwnCostCents - r.contributorCommissionCents);
      expect(r.netNewMonthlyCents).toBe(Math.max(0, r.netMonthlyCents - answers.direct_fan_revenue_cents));
      // They keep MORE than the old fixed-Pro basis showed, by exactly the difference in plan cost.
      expect(r.netMonthlyCents - (r.totalGrossCents - monthlyPlanCostCents('pro', r.totalGrossCents))).toBe(
        monthlyPlanCostCents('pro', r.totalGrossCents) - monthlyPlanCostCents('scale', r.totalGrossCents),
      );
    });

    it(`${name}: the page names Scale, its rate and its price, and enrolls nobody`, () => {
      const result = buildUnifiedResult(answers);
      const tile = result.sections.find((s) => s.key === 'headline')!.metrics!.find((m) => /After CRWN/.test(m.label))!;
      expect(tile.label).toBe(`After CRWN Scale costs (${TIER_LIMITS.scale.platformFeePercent}% + ${usd(TIER_PRICING.scale.monthly)}/mo)`);
      const everything = JSON.stringify(result);
      expect(everything).not.toMatch(/you are on|your plan is|you have been|signed you up|upgraded you/i);
      expect(everything).toMatch(/Nothing here signs you up for one/);
    });
  }

  it('keeps the 2026-09-20 existing-operator wording and the paying-fan semantics intact', () => {
    const kairo = calculateUnifiedOpportunity(toUnifiedInputs(PERSONAS.Kairo));
    expect(kairo.launchSequence[0].title).toBe('Bring your existing membership into CRWN');
    expect(kairo.launchSequence[0].detail).toContain('290 paying supporters first');
    const maya = calculateUnifiedOpportunity(toUnifiedInputs(PERSONAS.Maya));
    expect(maya.launchSequence[0].title).toBe('Turn the buyers you already have into members');
    // The supporter answer still moves no money, under the new basis too.
    const a = calculateScenarioBand(toUnifiedInputs(PERSONAS.Kairo)).expected;
    const b = calculateScenarioBand(toUnifiedInputs({ ...PERSONAS.Kairo, current_supporters: 0 })).expected;
    expect(b.totalGrossCents).toBe(a.totalGrossCents);
    expect(b.crwnCostCents).toBe(a.crwnCostCents);
    expect(b.netNewMonthlyCents).toBe(a.netNewMonthlyCents);
  });
});

describe('/worth uses the same plan basis, and agrees with Opportunity to the cent on the same gross', () => {
  // Listeners only, with enough unreleased material for the Gold rung, is an input where the two
  // models produce the same gross. They are NOT required to agree where their inputs differ.
  const AUDIENCES = [4_000, 20_000, 60_000, 250_000, 1_000_000];

  it.each(AUDIENCES)('%d listeners: identical gross, plan, rate, subscription, cost and after-cost', (listeners) => {
    const worth = calculate({ monthlyListeners: listeners, engagedFollowers: 0, currentStreamingCents: 0 }, getAssumptions('conservative'));
    const opp = calculateUnifiedOpportunity(toUnifiedInputs({ monthly_listeners: listeners, unreleased_count: 12 }));
    expect(worth.grossMrrCents).toBe(opp.totalGrossCents);
    expect(worth.planKey).toBe(opp.assumptions.planKey);
    expect(worth.platformFeePercent).toBe(opp.assumptions.platformFeePercent);
    expect(worth.planSubscriptionCents).toBe(opp.planSubscriptionCents);
    expect(worth.feeCents).toBe(opp.platformFeeCents);
    expect(worth.crwnCostCents).toBe(opp.crwnCostCents);
    expect(worth.netMrrCents).toBe(opp.netMonthlyCents);
  });

  it('covers all three plans across those audiences, so the agreement is not a Scale-only accident', () => {
    const plans = new Set(
      AUDIENCES.map((l) => calculate({ monthlyListeners: l, engagedFollowers: 0, currentStreamingCents: 0 }, getAssumptions('conservative')).planKey),
    );
    expect([...plans].sort()).toEqual(['pro', 'scale', 'starter']);
  });

  it('includes the subscription: the inherited defect, exactly', () => {
    const w = calculate({ monthlyListeners: 20_000, engagedFollowers: 0, currentStreamingCents: 0 }, getAssumptions('conservative'));
    expect(w.planSubscriptionCents).toBeGreaterThan(0);
    expect(w.netMrrCents).toBe(w.grossMrrCents - w.feeCents - w.planSubscriptionCents);
    expect(w.netAnnualCents).toBe(w.netMrrCents * 12);
  });

  it('left the /worth GROSS model alone', () => {
    const a = getAssumptions('conservative');
    const w = calculate({ monthlyListeners: 100_000, engagedFollowers: 0, currentStreamingCents: 0 }, a);
    const payers = 100_000 * a.reachRate * a.superfanRate;
    expect(w.payers).toBeCloseTo(payers, 6);
    expect(w.grossMrrCents).toBe(w.subsMrrCents + w.alacarteMrrCents);
    expect(w.alacarteMrrCents).toBe(Math.round(payers * a.alacarteArpuCents));
  });

  it('gives the WORTH DM result the same number and the same plan words as /worth', () => {
    const listeners = 250_000;
    const w = calculate({ monthlyListeners: listeners, engagedFollowers: 0, currentStreamingCents: 0 }, getAssumptions('conservative'));
    const dm = getTool('worth')!.execute({ monthly_listeners: listeners, monetization_status: 'none' } as never);
    const tile = dm.sections.find((s) => s.key === 'headline')!.metrics![0];
    const words = describePlanBasis(w.planKey);
    expect(tile.value).toBe(usd(w.netMrrCents));
    expect(tile.label).toBe(`Monthly, after CRWN ${words.name} costs (${words.shortCost})`);
    expect(tile.note).toContain(`modeled using CRWN ${words.name}`);
    const cp = dm.conversionPayload as Record<string, unknown>;
    expect(cp.totalGrossCents).toBe(w.grossMrrCents);
    expect(cp.planKey).toBe(w.planKey);
    expect(cp.netMrrCents).toBe(w.netMrrCents);
    expect(JSON.stringify(dm)).toMatch(/nothing here signs you up for a plan/);
  });
});

describe('a calculator recommendation is never billing state', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
    });

  it('no checkout, webhook or fee lookup reads a recommendation or a modeled plan', () => {
    const billing = [
      ...walk(join(__dirname, '..', 'app', 'api', 'stripe')),
      join(__dirname, 'webhookHandlers.ts'),
      join(__dirname, 'platformTier.ts'),
    ];
    expect(billing.length).toBeGreaterThan(10);
    for (const file of billing) {
      const src = codeOnly(readFileSync(file, 'utf8'));
      expect(src, file).not.toMatch(/recommendPlan|modeledPlanCost|recommended_plan|projected_monthly_gmv|planRecommendation/);
    }
  });

  it('charges on the artist\'s ACTUAL plan, read from platform_tier', () => {
    const src = readFileSync(join(__dirname, 'platformTier.ts'), 'utf8');
    const body = src.slice(src.indexOf('export async function getArtistFeePercent'));
    expect(body).toContain(".select('platform_tier')");
    expect(body).toContain('getPlatformFeePercent(data.platform_tier)');
  });

  it('left every price, rate and break-even exactly where it was', () => {
    expect([TIER_LIMITS.starter.platformFeePercent, TIER_LIMITS.pro.platformFeePercent, TIER_LIMITS.scale.platformFeePercent]).toEqual([12, 8, 5]);
    expect([TIER_PRICING.pro.monthly, TIER_PRICING.scale.monthly]).toEqual([4900, 19900]);
    expect([proBreakEvenGmvCents(), scaleBreakEvenGmvCents()]).toEqual([122_500, 500_000]);
  });
});
