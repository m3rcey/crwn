// The economic contract of the Opportunity Calculator, pinned after the 2026-09-19 audit.
//
// What the audit saw: a $550 gross shown beside "Your net $506" (550 x 92%), on a page whose own
// pricing said Pro is $49 a month PLUS 8%. The net used Pro's rate and forgot Pro's price. The same
// page said "Recurring, every month" over a figure that contained one-off member extras, and an
// "Expected" column smaller than the net with nothing saying it had subtracted current revenue.
//
// Every assertion here is one of those three failures stated as a property, so a regression in
// any of them fails `npm test` instead of reaching an artist.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TIER_LIMITS, TIER_PRICING, formatTierName } from '@/lib/platformTier';
import { monthlyPlanCostCents, proBreakEvenGmvCents, recommendPlan, scaleBreakEvenGmvCents } from '@/lib/planRecommendation';
import { calculateScenarioBand, calculateUnifiedOpportunity } from './unifiedModel';
import { RANGE_COST_PHRASE, buildUnifiedResult, planBasisFor } from './unifiedAdapter';
import { recalcUnified } from './recalcUnified';

const usd = (cents: number): string => '$' + Math.round(cents / 100).toLocaleString('en-US');
/** Source with comments removed: the comments explain the wording and constants that were removed. */
const codeOnly = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// A small artist (the audit's Jaylen shape) and a proven seller with real direct income today.
const SMALL = { socialFollowers: 5_000 };
const SELLER = { socialFollowers: 60_000, ownedContacts: 2_500, unreleasedCount: 12, currentDirectRevenueCents: 40_000 };
const SELLER_ANSWERS = {
  social_followers: 60_000,
  owned_contacts: 2_500,
  unreleased_count: 12,
  direct_fan_revenue_cents: 40_000,
};

const planSubscription = (plan: 'starter' | 'pro' | 'scale'): number =>
  plan === 'starter' ? 0 : TIER_PRICING[plan].monthly;

describe('plan basis: the recommender picks the plan from the gross, and its whole cost is paid', () => {
  // FOUNDER DECISION, 2026-09-20. The calculators no longer assume Pro. Each scenario's own gross
  // goes to the canonical `recommendPlan`, and that plan is priced in full. The calculator follows
  // the recommender; the recommender never follows the calculator.
  it('prices every scenario on the plan recommendPlan returns for THAT scenario\'s gross', () => {
    for (const inputs of [SMALL, SELLER, { socialFollowers: 20_000 }, { socialFollowers: 1_250_000 }]) {
      for (const r of Object.values(calculateScenarioBand(inputs))) {
        const expected = recommendPlan({ projectedMonthlyGmvCents: r.totalGrossCents }).plan;
        expect(r.assumptions.planKey).toBe(expected);
        expect(r.assumptions.platformFeePercent).toBe(TIER_LIMITS[expected].platformFeePercent);
        expect(r.assumptions.planMonthlyCents).toBe(planSubscription(expected));
        expect(r.crwnCostCents).toBe(monthlyPlanCostCents(expected, r.totalGrossCents));
      }
    }
  });

  it('no longer assumes Pro: a small gross models Launch and a large one models Scale', () => {
    const small = calculateUnifiedOpportunity(SMALL);
    expect(small.totalGrossCents).toBeLessThan(proBreakEvenGmvCents());
    expect(small.assumptions.planKey).toBe('starter');
    expect(small.planSubscriptionCents).toBe(0);
    expect(small.platformFeeCents).toBe(Math.round(small.totalGrossCents * (TIER_LIMITS.starter.platformFeePercent / 100)));

    const big = calculateUnifiedOpportunity({ socialFollowers: 1_250_000 });
    expect(big.totalGrossCents).toBeGreaterThan(scaleBreakEvenGmvCents());
    expect(big.assumptions.planKey).toBe('scale');
    expect(big.planSubscriptionCents).toBe(TIER_PRICING.scale.monthly);
  });

  it('lets conservative, expected and high sit on different plans when the recommender says so', () => {
    // 20,000 followers spans a breakpoint: the conservative gross is below the Pro break-even and
    // the expected one is above it. Forcing one plan onto all three would misprice an end.
    const band = calculateScenarioBand({ socialFollowers: 20_000 });
    const plans = [band.conservative, band.expected, band.high].map((r) => r.assumptions.planKey);
    expect(new Set(plans).size).toBeGreaterThan(1);
    expect(plans[0]).toBe('starter');
  });

  it('never lets the plan touch the revenue side: gross is identical whatever plan results', () => {
    // No circularity. The revenue builders are typed on `UnifiedRates`, which has no plan fields,
    // so this is enforced by the compiler; this asserts the observable consequence.
    const src = readFileSync(join(__dirname, 'unifiedModel.ts'), 'utf8');
    const grossAt = src.indexOf('const totalGrossCents =');
    const planAt = src.indexOf('modeledPlanCost(totalGrossCents)');
    expect(grossAt).toBeGreaterThan(-1);
    expect(planAt).toBeGreaterThan(grossAt);
    // Every revenue builder takes the plan-free rates; the full assumptions are assembled ONCE,
    // after the gross, inside calculateUnifiedOpportunity.
    expect(src.match(/a: UnifiedRates/g)!.length).toBeGreaterThanOrEqual(5);
    expect(src.match(/a: UnifiedAssumptions/g)!.length).toBe(1);
    expect(src.indexOf('const a: UnifiedAssumptions')).toBeGreaterThan(planAt);
  });

  it('charges exactly what the plan recommender says that plan costs at this gross', () => {
    for (const inputs of [SMALL, SELLER]) {
      const r = calculateUnifiedOpportunity(inputs);
      expect(r.totalGrossCents).toBeGreaterThan(0);
      expect(r.crwnCostCents).toBe(monthlyPlanCostCents(r.assumptions.planKey, r.totalGrossCents));
      expect(r.crwnCostCents).toBe(r.platformFeeCents + r.planSubscriptionCents);
    }
  });

  it('includes the subscription in the after-costs figure: the audit failure, exactly', () => {
    const r = calculateUnifiedOpportunity(SELLER);
    const feeOnly = r.totalGrossCents - r.platformFeeCents - r.contributorCommissionCents;
    // A paid plan: the honest figure is strictly below the fee-only one, by the plan's price.
    expect(planSubscription(r.assumptions.planKey)).toBeGreaterThan(0);
    expect(r.netMonthlyCents).toBe(feeOnly - planSubscription(r.assumptions.planKey));
    expect(r.netMonthlyCents).not.toBe(feeOnly);
  });

  it('costs a Launch result no subscription and a Pro or Scale result its own', () => {
    // Whatever plan the recommender returns, its rate and its price come from the same plan.
    const gross = 550_00;
    expect(monthlyPlanCostCents('starter', gross)).toBe(Math.round(gross * (TIER_LIMITS.starter.platformFeePercent / 100)));
    expect(monthlyPlanCostCents('pro', gross)).toBe(
      TIER_PRICING.pro.monthly + Math.round(gross * (TIER_LIMITS.pro.platformFeePercent / 100)),
    );
    expect(monthlyPlanCostCents('scale', gross)).toBe(
      TIER_PRICING.scale.monthly + Math.round(gross * (TIER_LIMITS.scale.platformFeePercent / 100)),
    );
  });

  it('never goes negative when a fixed plan price meets a tiny gross, and charges nothing on no gross', () => {
    const tiny = calculateUnifiedOpportunity({ socialFollowers: 40 });
    expect(tiny.netMonthlyCents).toBeGreaterThanOrEqual(0);
    expect(tiny.netNewMonthlyCents).toBeGreaterThanOrEqual(0);
    const none = calculateUnifiedOpportunity({});
    expect(none.totalGrossCents).toBe(0);
    expect(none.planSubscriptionCents).toBe(0);
    expect(none.crwnCostCents).toBe(0);
  });

  it('retypes no plan price, rate or breakpoint in either calculator, and pins no plan', () => {
    const files = [
      join(__dirname, 'unifiedModel.ts'),
      join(__dirname, 'unifiedAdapter.ts'),
      join(__dirname, 'recalcUnified.ts'),
      join(__dirname, '..', 'leadCalculator.ts'),
    ];
    for (const file of files) {
      const src = codeOnly(readFileSync(file, 'utf8'));
      expect(src, file).not.toMatch(/\b4900\b|\b19900\b|\$49\b|\$199\b|\b122500\b|\b500000\b|\$1,225|\$5,000/);
      // No plan is named as a constant anywhere: not a key, not a TIER_LIMITS / TIER_PRICING read.
      expect(src, file).not.toMatch(/TIER_LIMITS|TIER_PRICING|MODELED_PLAN/);
    }
    // The two MODELS never name a plan at all. (The adapter names Launch once, in copy, as the
    // plan every account starts on. That is a fact about signup, not a cost basis.)
    for (const file of [files[0], files[3]]) {
      expect(codeOnly(readFileSync(file, 'utf8')), file).not.toMatch(/['"](starter|pro|scale)['"]/);
    }
    // Both calculators reach the plan through the ONE shared helper.
    expect(readFileSync(files[0], 'utf8')).toContain('modeledPlanCost(totalGrossCents)');
    expect(readFileSync(files[3], 'utf8')).toContain('modeledPlanCost(grossMrrCents)');
  });

  it('leaves no hardcoded Pro or 8% wording on a surface whose plan is now dynamic', () => {
    const surfaces = [
      join(__dirname, 'unifiedAdapter.ts'),
      join(__dirname, 'recalcUnified.ts'),
      join(__dirname, '..', 'acquisition', 'toolAdapters.ts'),
      join(__dirname, '..', '..', 'app', '(public)', 'worth', 'WorthExperience.tsx'),
    ];
    for (const file of surfaces) {
      const code = codeOnly(readFileSync(file, 'utf8'));
      expect(code, file).not.toMatch(/8% Pro|Pro fee|Pro plan fee|Fee 8%|After CRWN Pro|CRWN's Pro plan/);
    }
  });
});

describe('recurring is subscriptions, and one-off money is never inside it', () => {
  it('keeps member extras out of the recurring figure in every scenario', () => {
    for (const r of Object.values(calculateScenarioBand(SELLER))) {
      expect(r.core.memberAlacarteGrossCents).toBeGreaterThan(0);
      expect(r.recurringGrossCents).toBe(r.core.tiers.reduce((s, t) => s + t.monthlyCents, 0));
      expect(r.oneTimeGrossCents).toBeGreaterThanOrEqual(r.core.memberAlacarteGrossCents);
      expect(r.totalGrossCents).toBe(r.recurringGrossCents + r.oneTimeGrossCents);
    }
  });

  it('shows the membership tile as subscriptions only and the one-off tile beside it', () => {
    const r = calculateUnifiedOpportunity(SELLER);
    const tiles = buildUnifiedResult(SELLER_ANSWERS).sections.find((s) => s.key === 'headline')!.metrics!;
    const membership = tiles.find((m) => /Membership, every month/.test(m.label))!;
    const oneOff = tiles.find((m) => /One-off purchases/.test(m.label))!;
    expect(membership.value).toBe(usd(r.recurringGrossCents));
    expect(oneOff.value).toBe(usd(r.oneTimeGrossCents));
    expect(oneOff.note).toMatch(/Not recurring/);
    // The two differ, which is the whole point: the old tile showed their SUM as recurring.
    expect(membership.value).not.toBe(usd(r.core.grossCents));
  });

  it('puts no one-off line under any heading or label that says recurring', () => {
    const result = buildUnifiedResult(SELLER_ANSWERS);
    for (const s of result.sections) {
      for (const m of s.metrics ?? []) {
        const saysRecurring = /recurring/i.test(`${s.title} ${m.label}`) && !/not recurring/i.test(m.label);
        if (saysRecurring) {
          expect(`${m.label} ${m.note ?? ''}`, `${s.key}: ${m.label}`).not.toMatch(/extras|one-off/i);
        }
      }
    }
    expect(result.summary).not.toMatch(/All of it is recurring/);
  });

  it('does not lengthen the hero summary, which sits above the email ask on a phone', () => {
    // The sentence this replaced, at its longest. The summary renders in the hero ABOVE the
    // email button, and that button is measured against a 390px fold, so honesty here may not be
    // bought with an extra line.
    const replaced = 'All of it is recurring membership, so nothing in your total depends on a one-off event.';
    const sentence = buildUnifiedResult(SELLER_ANSWERS).summary.match(/About \d+% of the gross[^.]*\.[^.]*\./)![0];
    expect(sentence.length).toBeLessThanOrEqual(replaced.length);
  });

  it('only says "all recurring" when there is truly no one-off money', () => {
    // No supporters means no member extras and no gross: the sentence falls to the empty state.
    const empty = buildUnifiedResult({});
    expect(empty.summary).not.toMatch(/recurring/);
  });
});

describe('total, current and additional revenue are three named things', () => {
  it('shows what the artist already earns apart from what they would add', () => {
    const r = calculateUnifiedOpportunity(SELLER);
    const tiles = buildUnifiedResult(SELLER_ANSWERS).sections.find((s) => s.key === 'headline')!.metrics!;
    const afterCosts = tiles.find((m) => /After CRWN/.test(m.label))!;
    const current = tiles.find((m) => /already earn direct/.test(m.label))!;
    const added = tiles.find((m) => /What you would add/.test(m.label))!;
    expect(afterCosts.value).toBe(usd(r.netMonthlyCents));
    expect(current.value).toBe(usd(SELLER.currentDirectRevenueCents));
    expect(current.note).toMatch(/Not new money/);
    expect(added.value).toBe(usd(r.netNewMonthlyCents));
    expect(r.netNewMonthlyCents).toBe(r.netMonthlyCents - SELLER.currentDirectRevenueCents);
  });

  it('names the plan and its whole cost on the after-costs tile and in the derivation', () => {
    const r = calculateUnifiedOpportunity(SELLER);
    const plan = planBasisFor(r);
    // The EXPECTED scenario's recommended plan is the primary plan context on the page.
    expect(plan.name).toBe(formatTierName(recommendPlan({ projectedMonthlyGmvCents: r.totalGrossCents }).plan));
    expect(plan.costLine).toContain(`${r.assumptions.platformFeePercent}% fee`);
    expect(plan.costLine).toContain(usd(r.assumptions.planMonthlyCents));

    const result = buildUnifiedResult(SELLER_ANSWERS);
    const tile = result.sections.find((s) => s.key === 'headline')!.metrics!.find((m) => /After CRWN/.test(m.label))!;
    expect(tile.label).toContain(plan.name);
    // The hero grid renders a tile's value and LABEL and drops its note, so the plan's cost must
    // be in the label itself or the artist never sees which plan the figure is after.
    expect(tile.label).toContain(plan.shortCost);
    expect(plan.shortCost).toContain(usd(r.assumptions.planMonthlyCents));
    expect(tile.note).toContain(plan.costLine);
    // An estimate basis, never a plan they hold: "Modeled using", in the derivation and the assumptions.
    const costRow = result.sections.find((s) => s.key === 'derivation')!.metrics!.find((m) => /Minus CRWN/.test(m.label))!;
    expect(costRow.note).toContain('Modeled using CRWN ' + plan.name);
    const assumed = result.sections.find((s) => s.key === 'assumptions')!.items!.join(' ');
    expect(assumed).toContain('modeled using CRWN ' + plan.name);
    expect(assumed).toMatch(/Every account starts free on Launch/);
    expect(assumed).toMatch(/Nothing here signs you up for one/);

    const rows = result.sections.find((s) => s.key === 'derivation')!.metrics!;
    const labels = rows.map((m) => m.label);
    const at = (re: RegExp) => labels.findIndex((l) => re.test(l));
    // The money is walked in the order it is subtracted, ending on the headline's expected case.
    const order = [
      at(/Membership subscriptions/),
      at(/one-off purchases by members/),
      at(/Total modeled gross/),
      at(/Minus CRWN .* plan costs/),
      at(/Left after CRWN/),
      at(/Minus what you already earn direct/),
      at(/What you would add/),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(rows[at(/Minus CRWN .* plan costs/)].value).toBe(`${usd(r.crwnCostCents)}/mo`);
    expect(rows[at(/What you would add/)].value).toBe(`${usd(r.netNewMonthlyCents)}/mo`);
  });

  it('shows no "already earn" line to an artist who earns nothing direct yet', () => {
    const result = buildUnifiedResult({ social_followers: 60_000 });
    const all = result.sections.flatMap((s) => s.metrics ?? []).map((m) => m.label);
    expect(all.some((l) => /already earn direct/.test(l))).toBe(false);
  });

  it('titles the scenario columns as what would be ADDED, which is what they hold', () => {
    const band = calculateScenarioBand(SELLER);
    const scenarios = buildUnifiedResult(SELLER_ANSWERS).sections.find((s) => s.key === 'scenarios')!;
    expect(scenarios.title).toMatch(/would add/);
    expect(scenarios.metrics!.find((m) => m.label === 'Expected')!.value).toBe(`${usd(band.expected.netNewMonthlyCents)}/mo`);
  });

  it('names Launch, with no plan price, for an artist whose gross the recommender puts on Launch', () => {
    // This replaced a footnote admitting that the fixed Pro basis overcharged small artists. With
    // the recommender choosing, a small artist is simply modeled on Launch.
    const smallModel = calculateUnifiedOpportunity(SMALL);
    expect(smallModel.assumptions.planKey).toBe('starter');
    const small = buildUnifiedResult({ social_followers: 5_000 });
    const tile = small.sections.find((s) => s.key === 'headline')!.metrics!.find((m) => /After CRWN/.test(m.label))!;
    expect(tile.label).toBe('After CRWN Launch costs (' + TIER_LIMITS.starter.platformFeePercent + '%, $0/mo)');
    expect(tile.value).toBe(usd(smallModel.totalGrossCents - monthlyPlanCostCents('starter', smallModel.totalGrossCents)));
    const text = small.sections.find((s) => s.key === 'assumptions')!.items!.join(' ');
    expect(text).toContain(TIER_LIMITS.starter.platformFeePercent + '% fee, no monthly plan cost');
    expect(text).not.toMatch(/leans cautious|costs less than/);
  });

  it('says which plan each scenario is on only when they differ', () => {
    const mixed = buildUnifiedResult({ social_followers: 20_000 }).sections;
    const notes = mixed.find((s) => s.key === 'scenarios')!.metrics!.map((m) => m.note ?? '');
    expect(notes[0]).toMatch(/, on Launch$/);
    expect(notes.every((n) => /, on (Launch|Pro|Scale)$/.test(n))).toBe(true);
    expect(mixed.find((s) => s.key === 'assumptions')!.items!.join(' ')).toMatch(/each priced on the plan recommended at that size/);

    const uniform = buildUnifiedResult({ social_followers: 1_250_000 }).sections;
    expect(uniform.find((s) => s.key === 'scenarios')!.metrics!.every((m) => !/ on /.test(m.note ?? ''))).toBe(true);
    expect(uniform.find((s) => s.key === 'assumptions')!.items!.join(' ')).not.toMatch(/each priced on the plan/);
  });
});

describe('the same definitions survive a builder recalculation and the saved payload', () => {
  it('describes the recalculated number with the same plan and the same deductions', () => {
    const result = buildUnifiedResult(SELLER_ANSWERS);
    const cp = result.conversionPayload as Record<string, unknown>;
    const recalc = recalcUnified({ vaultPlacement: 'none' }, cp)!;
    // A RANGE can span plans, so its wording names no single plan, and the builder says exactly
    // what the result said.
    expect(recalc.label).toContain(RANGE_COST_PHRASE);
    expect(result.headline).toContain(RANGE_COST_PHRASE);
    expect(RANGE_COST_PHRASE).not.toMatch(/Launch|Pro|Scale/);
    const band = calculateScenarioBand({ ...(cp.modelInputs as object), vaultPlacement: 'none' });
    expect(recalc.value).toBe(`${usd(band.conservative.netNewMonthlyCents)} to ${usd(band.high.netNewMonthlyCents)}`);
  });

  it('carries the plan basis and the current-revenue answer on the payload the signup reads', () => {
    const r = calculateUnifiedOpportunity(SELLER);
    const cp = buildUnifiedResult(SELLER_ANSWERS).conversionPayload as Record<string, number | string>;
    expect(cp.planKey).toBe(r.assumptions.planKey);
    // Modeled GROSS travels on the payload: it is the only figure the recommender may be fed.
    expect(cp.totalGrossCents).toBe(r.totalGrossCents);
    expect(cp.totalGrossCents).toBeGreaterThan(cp.netNewMonthlyCents as number);
    expect(cp.assumptionsVersion).toBe('unifiedAssumptions@2');
    expect(cp.planSubscriptionCents).toBe(r.planSubscriptionCents);
    expect(cp.platformFeeCents).toBe(r.platformFeeCents);
    expect(cp.currentDirectRevenueCents).toBe(SELLER.currentDirectRevenueCents);
    expect(cp.recurringGrossCents).toBe(r.recurringGrossCents);
    expect(cp.netNewMonthlyCents).toBe(r.netNewMonthlyCents);
  });
});
