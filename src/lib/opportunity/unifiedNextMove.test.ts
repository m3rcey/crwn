// The first move is worded for where the artist is starting from. Pinned after the Tier 1 ICP
// validation audit (2026-09-20), which passed the funnel (P0 0, P1 0) and left two P2s:
//
//  A. An operator with 1,200 paying supporters and $35,000 a month was told "Your membership
//     ladder: build this now" and "1. Launch the membership". The strategy (membership first) was
//     right. The framing read as though CRWN had not understood the business just described.
//  B. "Fans already paying you directly" could mean members, buyers ever, or buyers this month, so
//     a proven one-time seller left it blank.
//
// The personas below are the audit's. Every test that touches money asserts it did NOT move:
// this is a wording change, and the economics passed the audit as they are.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEAD_MAGNET_BY_SLUG } from '@/lib/leadMagnets/registry';
import { getDeliverableSpec } from '@/lib/opportunityDrafts/deliverableSpecs';
import { calculateScenarioBand, calculateUnifiedOpportunity, directStateFor } from './unifiedModel';
import { ESTIMATE_EYEBROW, buildUnifiedResult, toUnifiedInputs } from './unifiedAdapter';
import { recalcUnified } from './recalcUnified';

// Kairo: an existing recurring operator.
const KAIRO = { social_followers: 420_000, monthly_listeners: 180_000, owned_contacts: 12_500, current_supporters: 290, direct_fan_revenue_cents: 840_000, unreleased_count: 12 };
// Andre: the same, at arena scale.
const ANDRE = { social_followers: 1_250_000, monthly_listeners: 900_000, owned_contacts: 45_000, current_supporters: 1_200, direct_fan_revenue_cents: 3_500_000, unreleased_count: 12 };
// Maya: $22k a month from merch, VIP and downloads. Buyers, no recurring members. Left it blank.
const MAYA = { social_followers: 300_000, owned_contacts: 20_000, direct_fan_revenue_cents: 2_200_000, unreleased_count: 12 };
// No direct operation yet.
const NEW_ARTIST = { social_followers: 60_000, unreleased_count: 12 };

const text = (answers: Record<string, unknown>) => {
  const r = buildUnifiedResult(answers);
  const pick = (key: string) => (r.sections.find((s) => s.key === key)?.items ?? []).join(' ');
  return { system: pick('system'), sequence: pick('sequence'), all: JSON.stringify(r), result: r };
};
const model = (answers: Record<string, unknown>) => calculateUnifiedOpportunity(toUnifiedInputs(answers));

describe('where the artist is starting from, from two answers already asked', () => {
  it('reads recurring supporters first, then direct revenue, then neither', () => {
    expect(directStateFor(toUnifiedInputs(KAIRO) as never)).toBe('recurring_operator');
    expect(directStateFor(toUnifiedInputs(ANDRE) as never)).toBe('recurring_operator');
    expect(directStateFor(toUnifiedInputs(MAYA) as never)).toBe('direct_seller');
    expect(directStateFor(toUnifiedInputs(NEW_ARTIST) as never)).toBe('new');
  });

  it('treats a blank answer and a real zero the same way, as the adapter always has', () => {
    expect(directStateFor(toUnifiedInputs({ ...MAYA, current_supporters: 0 }) as never)).toBe('direct_seller');
    expect(directStateFor(toUnifiedInputs({ ...MAYA, current_supporters: '' }) as never)).toBe('direct_seller');
    expect(directStateFor(toUnifiedInputs({ ...NEW_ARTIST, current_supporters: 0, direct_fan_revenue_cents: 0 }) as never)).toBe('new');
  });
});

describe('an existing recurring operator is consolidating, not launching from zero', () => {
  for (const [name, persona, supporters] of [['Kairo', KAIRO, '290'], ['Andre', ANDRE, '1,200']] as const) {
    it(`${name}: no "launch the membership", no "build this now"`, () => {
      const t = text(persona);
      expect(t.sequence).not.toMatch(/Launch the membership/);
      expect(t.system).not.toMatch(/Your membership ladder: build this now/);
      expect(t.all).not.toMatch(/Nothing else works until fans have somewhere to pay/);
    });

    it(`${name}: their ${supporters} paying supporters are acknowledged, and move first`, () => {
      const m = model(persona);
      const first = m.launchSequence[0];
      expect(first.title).toBe('Bring your existing membership into CRWN');
      expect(first.detail).toContain(`${supporters} paying supporters first`);
      expect(first.detail).toMatch(/keep what already works/);
      const rec = m.recommendations.find((r) => r.key === 'membership_ladder')!;
      expect(rec.reason).toContain(`${supporters} fans paying you`);
      expect(rec.reason).toMatch(/not a launch from zero/);
      expect(rec.placementText).toMatch(/consolidate/);
    });

    it(`${name}: consolidation comes first and expansion follows it`, () => {
      const detail = model(persona).launchSequence[0].detail;
      expect(detail.indexOf('Map your current tiers')).toBeLessThan(detail.indexOf('invite'));
      expect(detail.indexOf('invite')).toBeLessThan(detail.indexOf('Expand the ladder'));
    });

    it(`${name}: promises no migration CRWN does not perform`, () => {
      const t = text(persona);
      // Fans are invited and choose. Nothing is moved, imported or transferred for them.
      expect(model(persona).launchSequence[0].detail).toMatch(/Nothing moves on its own: you invite them and they choose to join/);
      expect(t.all).not.toMatch(/automatic(ally)?|we (will )?(migrate|move|import|transfer)|already (imported|moved|migrated)|one[- ]click/i);
    });

    it(`${name}: the ladder itself is still the recommendation, first, with all its rungs`, () => {
      const m = model(persona);
      expect(m.launchSequence[0].keys).toContain('membership_ladder');
      expect(m.launchSequence[0].phase).toBe(1);
      const rec = m.recommendations.find((r) => r.key === 'membership_ladder')!;
      expect(rec.placement).toBe('build_now');
      expect(rec.label).toBe('Your membership ladder');
      expect(m.core.tiers.map((x) => x.name)).toEqual(['Silver', 'Gold', 'Platinum']);
    });
  }
});

describe('a proven seller with no recurring membership has buyers, not members', () => {
  it('is never told they already run a membership', () => {
    const t = text(MAYA);
    expect(t.all).not.toMatch(/existing membership|your current tiers|paying supporters first|consolidate what you already run/i);
    expect(t.sequence).not.toMatch(/Bring your existing membership/);
  });

  it('is not talked to as a beginner either', () => {
    const t = text(MAYA);
    expect(t.sequence).not.toMatch(/Launch the membership/);
    expect(t.system).not.toMatch(/Your membership ladder: build this now/);
  });

  it('starts from the buyers already paying her, before the wider audience', () => {
    const m = model(MAYA);
    expect(m.launchSequence[0].title).toBe('Turn the buyers you already have into members');
    expect(m.launchSequence[0].detail).toMatch(/Import the buyers you already have/);
    expect(m.launchSequence[0].detail).toMatch(/before your wider audience/);
    const rec = m.recommendations.find((r) => r.key === 'membership_ladder')!;
    expect(rec.reason).toContain('$22,000 a month');
    expect(rec.reason).toMatch(/one purchase at a time/);
    expect(rec.placementText).toMatch(/buyers you already have/);
  });

  it('still gets the recurring ladder as the recommendation', () => {
    const m = model(MAYA);
    expect(m.launchSequence[0].keys).toContain('membership_ladder');
    expect(m.recommendations.find((r) => r.key === 'membership_ladder')!.placement).toBe('build_now');
  });
});

describe('an artist with no direct operation keeps the launch framing', () => {
  it('reads exactly as it did before', () => {
    const m = model(NEW_ARTIST);
    expect(m.launchSequence[0].title).toBe('Launch the membership');
    expect(m.launchSequence[0].detail).toBe('Publish the ladder with your free front door and your paid tiers. Nothing else works until fans have somewhere to pay.');
    const rec = m.recommendations.find((r) => r.key === 'membership_ladder')!;
    expect(rec.placementText).toBeUndefined();
    expect(rec.reason).toBe('One coordinated ladder is the whole recurring business. Everything else hangs off it.');
    expect(text(NEW_ARTIST).system).toMatch(/Your membership ladder: build this now\./);
  });

  it('is shown no consolidation or existing-buyer copy', () => {
    expect(text(NEW_ARTIST).all).not.toMatch(/existing membership|buyers you already have|consolidate|not a launch from zero/i);
  });
});

describe('the framing reaches the builder and the email, from the one sequence', () => {
  it('opens the builder launch order on the same first move the result showed', () => {
    const spec = getDeliverableSpec('opportunity-calculator')!;
    for (const persona of [KAIRO, MAYA, NEW_ARTIST]) {
      const r = buildUnifiedResult(persona);
      const order = (spec.prefill(r.conversionPayload as Record<string, unknown>).launchOrder as string[]).map(String);
      expect(order[0]).toBe(`1. ${model(persona).launchSequence[0].title}`);
    }
  });

  it('tells the operator the same thing in the result email', () => {
    const first = buildUnifiedResult(KAIRO).emailInsights!.find((i) => /Do this first/.test(i.title))!;
    expect(first.body).toMatch(/^Bring your existing membership into CRWN\./);
  });
});

describe('it is a wording change: the audited economics did not move', () => {
  it('gives the same money whatever the supporter answer is', () => {
    const base = { ...KAIRO };
    const bands = [290, 0, 5_000].map((n) => calculateScenarioBand(toUnifiedInputs({ ...base, current_supporters: n })));
    for (const b of bands.slice(1)) {
      for (const s of ['conservative', 'expected', 'high'] as const) {
        expect(b[s].totalGrossCents).toBe(bands[0][s].totalGrossCents);
        expect(b[s].crwnCostCents).toBe(bands[0][s].crwnCostCents);
        expect(b[s].netMonthlyCents).toBe(bands[0][s].netMonthlyCents);
        expect(b[s].netNewMonthlyCents).toBe(bands[0][s].netNewMonthlyCents);
        expect(b[s].segments.payingSupporters).toBe(bands[0][s].segments.payingSupporters);
      }
    }
  });

  it('keeps the hero, the tiles and the headline identical across framings', () => {
    const a = buildUnifiedResult({ ...KAIRO });
    const b = buildUnifiedResult({ ...KAIRO, current_supporters: 0 });
    expect(b.heroValue).toBe(a.heroValue);
    expect(b.headline).toBe(a.headline);
    expect(b.summary).toBe(a.summary);
    expect(b.sections.find((s) => s.key === 'headline')).toEqual(a.sections.find((s) => s.key === 'headline'));
    expect(b.sections.find((s) => s.key === 'derivation')).toEqual(a.sections.find((s) => s.key === 'derivation'));
    expect(b.sections.find((s) => s.key === 'scenarios')).toEqual(a.sections.find((s) => s.key === 'scenarios'));
  });

  it('still subtracts what Kairo already earns, once', () => {
    const m = model(KAIRO);
    expect(m.netNewMonthlyCents).toBe(m.netMonthlyCents - 840_000);
  });
});

describe('the paying-fan question has one meaning, and it is the one the logic already had', () => {
  const inputs = LEAD_MAGNET_BY_SLUG['opportunity-calculator'].inputs;
  const supporters = inputs.find((i) => i.key === 'current_supporters')!;
  const revenue = inputs.find((i) => i.key === 'direct_fan_revenue_cents')!;

  it('asks for recurring payers, today, and says one-time buyers do not count', () => {
    expect(supporters.label).toBe('Fans paying you every month right now');
    expect(supporters.help).toMatch(/^Recurring only/);
    expect(supporters.help).toMatch(/One-time buyers \(merch, tickets, VIP, downloads\) do not count here/);
    expect(supporters.help).toMatch(/their money goes in the next answer/);
    expect(supporters.help).toMatch(/Zero is a perfectly normal answer/);
    // The ambiguity itself: a one-time example sitting among the recurring ones.
    expect(supporters.help).not.toMatch(/a membership, VIP\b/);
  });

  it('stays optional, in the same step, under the same frozen key', () => {
    expect(supporters.required).toBeFalsy();
    expect(supporters.step).toBe('proof');
    expect(supporters.type).toBe('number');
    expect(revenue.required).toBeFalsy();
    expect(revenue.step).toBe('proof');
    expect(inputs.findIndex((i) => i.key === 'direct_fan_revenue_cents')).toBe(inputs.findIndex((i) => i.key === 'current_supporters') + 1);
  });

  it('makes the revenue question stand alone, as ALL direct revenue, which is what the model subtracts', () => {
    // "What that earns you a month" tied the money to the fans counted above. With that question
    // recurring-only, a one-time seller would have entered $0 and had real revenue counted as new.
    expect(revenue.label).toBe('What fans pay you directly in a typical month');
    expect(revenue.label).not.toMatch(/\bthat\b/i);
    expect(revenue.help).toMatch(/^All of it: memberships, merch, tickets, VIP, downloads/);
    expect(revenue.help).toMatch(/We subtract this/);
  });

  it('did not change how the answer is read', () => {
    expect(toUnifiedInputs({ current_supporters: 290 }).currentPayingSupporters).toBe(290);
    expect(toUnifiedInputs({ current_supporters: '1,200' }).currentPayingSupporters).toBe(1200);
    expect(toUnifiedInputs({}).currentPayingSupporters).toBe(0);
    expect(toUnifiedInputs({ current_supporters: 0 }).currentPayingSupporters).toBe(0);
    expect(toUnifiedInputs({ direct_fan_revenue_cents: 22_000 }).currentDirectRevenueCents).toBe(22_000);
  });
});

describe('estimate copy says estimate', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

  it('puts the same estimate-qualified words above the range on the result and in the builder', () => {
    const r = buildUnifiedResult(KAIRO);
    expect(r.heroEyebrow).toBe(ESTIMATE_EYEBROW);
    expect(ESTIMATE_EYEBROW).toMatch(/could build an estimated/);
    const cp = r.conversionPayload as Record<string, unknown>;
    expect(recalcUnified({}, cp)!.eyebrow).toBe(ESTIMATE_EYEBROW);
    expect(recalcUnified({ vaultPlacement: 'none' }, cp)!.eyebrow).toMatch(/^Your estimate, updated/);
  });

  it('never calls the number what the plan "is worth"', () => {
    for (const file of ['components/opportunity/DeliverableBuilder.tsx', 'lib/opportunity/recalcUnified.ts', 'lib/opportunity/unifiedAdapter.ts']) {
      // Code only: the comments explain the phrase that was removed.
      const code = src(file).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');
      expect(code, file).not.toMatch(/plan is worth|is worth \$/i);
    }
    expect(src('components/opportunity/DeliverableBuilder.tsx')).toContain('{recalc.eyebrow}');
  });

  it('labels the setup workload as an estimate for the recommended promises, and claims nothing about their content', () => {
    const setup = src('app/setup/page.tsx');
    expect(setup).toContain('Estimated workload:</span> {workload} for the recommended promises');
    expect(setup).not.toContain('Recurring workload:');
    const rendered = setup.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l) && !/added "from content/.test(l)).join('\n');
    expect(rendered).not.toMatch(/from content you already have/);
    // Still derived, never a typed-in figure.
    expect(setup).toMatch(/const workload = workloadLabel\(\s*estimateMonthlyWorkload\(/);
  });

  it('writes no em dash or en dash in any of the new copy', () => {
    for (const persona of [KAIRO, ANDRE, MAYA, NEW_ARTIST]) expect(text(persona).all).not.toMatch(/[—–]/);
    const inputs = LEAD_MAGNET_BY_SLUG['opportunity-calculator'].inputs;
    expect(JSON.stringify(inputs.filter((i) => /supporters|revenue/.test(i.key)))).not.toMatch(/[—–]/);
  });
});
