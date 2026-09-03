import { describe, it, expect } from 'vitest';
import { RECOMMENDED_LADDER, TIER_TEMPLATE_MAP, type TierTemplateDef } from './tierTemplate';
import {
  planLadderPromises,
  estimateMonthlyWorkload,
  monthlyMinutes,
  workloadLabel,
  computeServesTierIds,
  servesTierIdsOf,
  mergedTierIdsOf,
  projectedBuyersFor,
  defaultFirstDue,
  firstDueFromConfig,
  recurrenceFromConfig,
} from './promisePlan';

const fullLadder = () => RECOMMENDED_LADDER.map((def) => ({ def, included: true }));

describe('planLadderPromises', () => {
  it('plans exactly the two scheduled promises of the full recommended ladder', () => {
    const plan = planLadderPromises(fullLadder());
    expect(plan.map((p) => p.benefitType).sort()).toEqual(['exclusive_posts', 'group_live_qa']);
    const vault = plan.find((p) => p.benefitType === 'exclusive_posts')!;
    expect(vault.title).toBe('Monthly Vault unlock');
    expect(vault.tierKey).toBe('vault');
    expect(vault.defaultRecurrence).toBe('monthly');
    const event = plan.find((p) => p.benefitType === 'group_live_qa')!;
    expect(event.title).toBe('Private group listening event');
    expect(event.defaultRecurrence).toBe('quarterly');
    expect(event.servesTierNames).toEqual(['Platinum']);
  });

  it('inherits upward: the Gold vault unlock serves Platinum members too', () => {
    const plan = planLadderPromises(fullLadder());
    const vault = plan.find((p) => p.benefitType === 'exclusive_posts')!;
    expect(vault.inheritsUp).toBe(true);
    expect(vault.servesTierNames).toEqual(['Gold', 'Platinum']);
  });

  it('drops inheritance targets that are not confirmed', () => {
    const rungs = RECOMMENDED_LADDER.map((def) => ({ def, included: def.key !== 'throne' }));
    const plan = planLadderPromises(rungs);
    const vault = plan.find((p) => p.benefitType === 'exclusive_posts')!;
    expect(vault.servesTierNames).toEqual(['Gold']);
    expect(plan.find((p) => p.benefitType === 'group_live_qa')).toBeUndefined();
  });

  it('plans nothing when only Bronze is confirmed', () => {
    const rungs = RECOMMENDED_LADDER.map((def) => ({ def, included: def.priceCents === 0 }));
    expect(planLadderPromises(rungs)).toEqual([]);
  });

  it('dedups the same promise appearing on two rungs into ONE serving both', () => {
    const silver = TIER_TEMPLATE_MAP.inner_circle;
    const withDuplicate: TierTemplateDef = {
      ...silver,
      benefits: [
        ...silver.benefits,
        {
          label: 'Monthly Vault unlock from your backlog',
          workload: 'moderate',
          structured: {
            benefit_type: 'exclusive_posts',
            config: { frequency: 'monthly', obligation_title: 'Monthly Vault unlock' },
          },
        },
      ],
    };
    const rungs = RECOMMENDED_LADDER.map((def) => ({
      def: def.key === 'inner_circle' ? withDuplicate : def,
      included: true,
    }));
    const plan = planLadderPromises(rungs);
    const vaults = plan.filter((p) => p.benefitType === 'exclusive_posts');
    expect(vaults).toHaveLength(1);
    // Anchored on the LOWEST rung carrying it, serving the higher one too.
    expect(vaults[0].tierKey).toBe('inner_circle');
    expect(vaults[0].servesTierNames).toContain('Gold');
  });
});

describe('workload model', () => {
  it('normalizes cadence into minutes per month', () => {
    expect(monthlyMinutes('content_drop', 'monthly')).toBe(30);
    expect(monthlyMinutes('livestream', 'quarterly')).toBe(30);
  });

  it('estimates the full ladder at about an hour a month', () => {
    const plan = planLadderPromises(fullLadder());
    const minutes = estimateMonthlyWorkload(
      plan.map((p) => ({ fulfillmentType: p.fulfillmentType, recurrence: p.defaultRecurrence })),
    );
    expect(minutes).toBe(60); // 30 (monthly unlock) + 30 (quarterly 90-min event)
    expect(workloadLabel(minutes)).toBe('about an hour a month');
  });

  it('labels edge cases sanely', () => {
    expect(workloadLabel(0)).toBe('no recurring workload');
    expect(workloadLabel(30)).toBe('about 30 minutes a month');
    expect(workloadLabel(150)).toBe('about 2.5 hours a month');
  });
});

describe('computeServesTierIds', () => {
  const tiers = [
    { id: 'bronze', price: 0 },
    { id: 'silver', price: 1000 },
    { id: 'gold', price: 2500 },
    { id: 'platinum', price: 10000 },
  ];

  it('inheritance adds every higher-priced active tier', () => {
    expect(
      computeServesTierIds({
        anchorTierId: 'gold',
        anchorPriceCents: 2500,
        inheritsUp: true,
        mergedTierIds: [],
        activeTiers: tiers,
      }),
    ).toEqual(['platinum']);
  });

  it('no inheritance means only explicit merges, never the anchor itself', () => {
    expect(
      computeServesTierIds({
        anchorTierId: 'gold',
        anchorPriceCents: 2500,
        inheritsUp: false,
        mergedTierIds: ['silver', 'gold'],
        activeTiers: tiers,
      }),
    ).toEqual(['silver']);
  });

  it('merged and inherited tiers union without duplicates', () => {
    const out = computeServesTierIds({
      anchorTierId: 'silver',
      anchorPriceCents: 1000,
      inheritsUp: true,
      mergedTierIds: ['platinum'],
      activeTiers: tiers,
    });
    expect(out.sort()).toEqual(['gold', 'platinum']);
  });
});

describe('metadata readers', () => {
  it('read defensively', () => {
    expect(servesTierIdsOf(null)).toEqual([]);
    expect(servesTierIdsOf({ serves_tier_ids: ['a', 2, 'b'] })).toEqual(['a', 'b']);
    expect(mergedTierIdsOf({ merged_tier_ids: 'nope' })).toEqual([]);
  });
});

describe('projectedBuyersFor', () => {
  const gold = TIER_TEMPLATE_MAP.vault;

  it('matches by current name', () => {
    expect(projectedBuyersFor(gold, [{ name: 'Gold', projectedSubs: 90.7 }])).toBe(90);
  });

  it('matches by legacy name (pre-rename results)', () => {
    expect(projectedBuyersFor(gold, [{ name: 'The Vault', projectedSubs: 38 }])).toBe(38);
  });

  it('returns null when unmodeled or invalid', () => {
    expect(projectedBuyersFor(gold, [{ name: 'Silver', projectedSubs: 100 }])).toBeNull();
    expect(projectedBuyersFor(gold, [{ name: 'Gold', projectedSubs: NaN }])).toBeNull();
  });
});

describe('config readers', () => {
  it('firstDueFromConfig parses only valid dates', () => {
    expect(firstDueFromConfig({ first_due_at: '2026-08-15T12:00:00Z' })?.toISOString()).toBe(
      '2026-08-15T12:00:00.000Z',
    );
    expect(firstDueFromConfig({ first_due_at: 'garbage' })).toBeNull();
    expect(firstDueFromConfig({})).toBeNull();
  });

  it('defaultFirstDue gives a week of runway at noon', () => {
    const d = defaultFirstDue(new Date('2026-07-30T09:30:00'));
    expect(d.getDate()).toBe(6);
    expect(d.getHours()).toBe(12);
  });

  it('recurrenceFromConfig answers null for anything the artist did not explicitly choose', () => {
    expect(recurrenceFromConfig({ frequency: 'daily' })).toBeNull();
    expect(recurrenceFromConfig({ frequency: '' })).toBeNull();
    expect(recurrenceFromConfig({})).toBeNull();
    expect(recurrenceFromConfig(null)).toBeNull();
    expect(recurrenceFromConfig({ frequency: 'quarterly' })).toBe('quarterly');
  });
});

describe('no fixed schedule unless chosen (2026-09-03)', () => {
  // The bug this pins: PROMISE_BENEFITS used to carry a code default of monthly, so a rung
  // that merely OFFERED behind-the-scenes posts planned a monthly obligation nobody chose.
  it('a schedulable benefit with no frequency plans no promise', () => {
    const silver = TIER_TEMPLATE_MAP.inner_circle;
    const offered: TierTemplateDef = {
      ...silver,
      benefits: [
        ...silver.benefits,
        { label: 'Behind the scenes', workload: 'low', structured: { benefit_type: 'exclusive_posts' } },
        { label: 'Live sessions', workload: 'moderate', structured: { benefit_type: 'group_live_qa', config: {} } },
        { label: 'Votes', workload: 'low', structured: { benefit_type: 'creative_voting', config: { frequency: '' } } },
      ],
    };
    const rungs = RECOMMENDED_LADDER.map((def) => ({ def: def.key === 'inner_circle' ? offered : def, included: true }));
    const plan = planLadderPromises(rungs);
    expect(plan.filter((p) => p.tierKey === 'inner_circle')).toEqual([]);
    // The template's own explicit cadences are untouched.
    expect(plan.map((p) => p.benefitType).sort()).toEqual(['exclusive_posts', 'group_live_qa']);
  });

  it('the same benefit WITH an explicit cadence plans exactly one promise at that cadence', () => {
    const silver = TIER_TEMPLATE_MAP.inner_circle;
    const scheduled: TierTemplateDef = {
      ...silver,
      benefits: [
        ...silver.benefits,
        { label: 'Weekly BTS', workload: 'low', structured: { benefit_type: 'creative_voting', config: { frequency: 'weekly' } } },
      ],
    };
    const rungs = RECOMMENDED_LADDER.map((def) => ({ def: def.key === 'inner_circle' ? scheduled : def, included: true }));
    const votes = planLadderPromises(rungs).filter((p) => p.benefitType === 'creative_voting');
    expect(votes).toHaveLength(1);
    expect(votes[0].defaultRecurrence).toBe('weekly');
  });
});
