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
import { monthlyPlanCostCents, proBreakEvenGmvCents } from '@/lib/planRecommendation';
import { MODELED_PLAN, calculateScenarioBand, calculateUnifiedOpportunity } from './unifiedModel';
import { buildUnifiedResult, planBasisFor } from './unifiedAdapter';
import { recalcUnified } from './recalcUnified';

const usd = (cents: number): string => '$' + Math.round(cents / 100).toLocaleString('en-US');

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

describe('plan basis: one plan, its whole cost, from the canonical source', () => {
  it('takes the rate AND the price from the same plan in platformTier', () => {
    const a = calculateUnifiedOpportunity(SELLER).assumptions;
    expect(a.planKey).toBe(MODELED_PLAN);
    expect(a.platformFeePercent).toBe(TIER_LIMITS[a.planKey].platformFeePercent);
    expect(a.planMonthlyCents).toBe(planSubscription(a.planKey));
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

  it('would cost a Launch-basis model no subscription and a Scale-basis model its own', () => {
    // The model has ONE basis, but the identity it uses must hold for every plan, so flipping
    // MODELED_PLAN can never produce a rate from one plan and a price from another.
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

  it('retypes no plan price or plan rate in the model, the adapter or the recalc', () => {
    for (const file of ['unifiedModel.ts', 'unifiedAdapter.ts', 'recalcUnified.ts']) {
      const src = readFileSync(join(__dirname, file), 'utf8');
      expect(src, file).not.toMatch(/\b4900\b|\b19900\b|\$49\b|\$199\b/);
      expect(src, file).not.toMatch(/TIER_LIMITS\.pro\b|TIER_PRICING\.pro\b/);
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
    expect(plan.name).toBe(formatTierName(MODELED_PLAN));
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

  it('tells a below-break-even artist that Launch is cheaper, from the recommender math, and nobody else', () => {
    const small = buildUnifiedResult({ social_followers: 5_000 });
    const smallModel = calculateUnifiedOpportunity(SMALL);
    expect(smallModel.totalGrossCents).toBeLessThan(proBreakEvenGmvCents());
    const smallText = small.sections.find((s) => s.key === 'assumptions')!.items!.join(' ');
    expect(smallText).toContain(`${TIER_LIMITS.starter.platformFeePercent}% fee, no monthly plan cost`);
    expect(smallText).toContain(usd(smallModel.crwnCostCents - monthlyPlanCostCents('starter', smallModel.totalGrossCents)));

    const bigModel = calculateUnifiedOpportunity({ socialFollowers: 500_000 });
    expect(bigModel.totalGrossCents).toBeGreaterThan(proBreakEvenGmvCents());
    const bigText = buildUnifiedResult({ social_followers: 500_000 }).sections.find((s) => s.key === 'assumptions')!.items!.join(' ');
    expect(bigText).not.toMatch(/Every account starts on/);
  });
});

describe('the same definitions survive a builder recalculation and the saved payload', () => {
  it('describes the recalculated number with the same plan and the same deductions', () => {
    const result = buildUnifiedResult(SELLER_ANSWERS);
    const cp = result.conversionPayload as Record<string, unknown>;
    const recalc = recalcUnified({ vaultPlacement: 'none' }, cp)!;
    expect(recalc.label).toContain(`CRWN's ${formatTierName(MODELED_PLAN)} plan costs`);
    expect(result.headline).toContain(`CRWN's ${formatTierName(MODELED_PLAN)} plan costs`);
    const band = calculateScenarioBand({ ...(cp.modelInputs as object), vaultPlacement: 'none' });
    expect(recalc.value).toBe(`${usd(band.conservative.netNewMonthlyCents)} to ${usd(band.high.netNewMonthlyCents)}`);
  });

  it('carries the plan basis and the current-revenue answer on the payload the signup reads', () => {
    const r = calculateUnifiedOpportunity(SELLER);
    const cp = buildUnifiedResult(SELLER_ANSWERS).conversionPayload as Record<string, number | string>;
    expect(cp.planKey).toBe(MODELED_PLAN);
    expect(cp.planSubscriptionCents).toBe(r.planSubscriptionCents);
    expect(cp.platformFeeCents).toBe(r.platformFeeCents);
    expect(cp.currentDirectRevenueCents).toBe(SELLER.currentDirectRevenueCents);
    expect(cp.recurringGrossCents).toBe(r.recurringGrossCents);
    expect(cp.netNewMonthlyCents).toBe(r.netNewMonthlyCents);
  });
});
