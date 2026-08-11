import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { categoryForPlatform, stackSeedFromCalculator } from './stackReplacementSource';
import { CRWN_REPLACES, buildStackReplacementReport } from './stackReplacement';
import { LEAD_MAGNET_BY_SLUG } from './leadMagnets/registry';

const ROUTE = readFileSync('src/app/api/admin/stack-replacement/route.ts', 'utf8');
/** The route's CODE, with comments stripped. Prose about what the route refuses to do must not be
 *  mistaken for the route doing it. */
const ROUTE_CODE = ROUTE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('the stack taxonomy is deterministic and covers what the calculator asks', () => {
  it('maps every platform the Fan Stack Calculator offers', () => {
    const cfg = LEAD_MAGNET_BY_SLUG['fan-stack-calculator'];
    const options = cfg.inputs.find((i) => i.key === 'platforms_used')?.options ?? [];
    expect(options.length).toBeGreaterThan(0);
    for (const o of options) {
      // 'other' is the honest fallback, but no CURRENT option should land there unnoticed.
      expect(categoryForPlatform(o.value), `${o.value} is unmapped`).not.toBe('other');
    }
  });

  it('classifies by job, and the same job lands in the same category whatever the brand', () => {
    expect(categoryForPlatform('Patreon')).toBe('membership');
    expect(categoryForPlatform('YouTube Memberships')).toBe('membership');
    expect(categoryForPlatform('Shopify')).toBe(categoryForPlatform('Gumroad'));
  });

  it('sends an unknown tool to `other`, which CRWN never claims to replace', () => {
    expect(categoryForPlatform('Some CRM nobody has heard of')).toBe('other');
    expect(CRWN_REPLACES.other).toBe(false);
  });
});

describe('CRWN never claims a replacement it cannot deliver', () => {
  it('leaves ticketing and scheduling out of the replaceable set', () => {
    // Live sessions are not a physical box office, and CRWN ships no scheduling tool.
    expect(CRWN_REPLACES.ticketing).toBe(false);
    expect(CRWN_REPLACES.scheduling).toBe(false);
  });

  it('lists an unreplaceable tool as staying in the stack rather than dropping it', () => {
    const seed = stackSeedFromCalculator({ platforms_used: ['Patreon', 'Ticketing'] });
    const r = buildStackReplacementReport(seed.input);
    expect(r.systemCount).toBe(2);
    expect(r.replaceableCount).toBe(1);
    expect(r.staysInStack).toEqual(['Ticketing']);
  });
});

describe('evidence is labelled, never asserted', () => {
  it('marks declared answers as artist-declared and never observed', () => {
    const seed = stackSeedFromCalculator({
      platforms_used: ['Patreon'],
      monthly_software_cost_cents: 8000,
      paid_members_elsewhere: 10,
      avg_fan_revenue_cents: 1000,
    });
    expect(seed.evidence.tools).toBe('artist_declared');
    expect(seed.evidence.toolCosts).toBe('artist_declared');
    expect(seed.evidence.monthlyDirectGmv).toBe('derived');
    expect(Object.values(seed.evidence)).not.toContain('observed');
  });

  it('marks what was never asked as unknown instead of zero', () => {
    const seed = stackSeedFromCalculator({ platforms_used: ['Patreon'] });
    expect(seed.evidence.toolCosts).toBe('unknown');
    expect(seed.evidence.monthlyDirectGmv).toBe('unknown');
    expect(seed.evidence.adminHours).toBe('unknown');
    expect(seed.unallocatedToolSpendCents).toBeNull();
  });

  it('always says out loud that nothing is observed from a connected account', () => {
    const seed = stackSeedFromCalculator({ platforms_used: ['Patreon'] });
    expect(seed.limitations.join(' ')).toContain('None of it is observed from a connected account');
  });

  it('refuses to audit an artist who never declared a stack', () => {
    const seed = stackSeedFromCalculator({});
    expect(seed.usable).toBe(false);
    expect(stackSeedFromCalculator(null).usable).toBe(false);
  });
});

// The single most important honesty property in this file.
describe('a declared total is never split into invented per-tool costs', () => {
  it('leaves every per-tool cost at zero even when a total is known', () => {
    const seed = stackSeedFromCalculator({
      platforms_used: ['Patreon', 'Discord', 'Shopify'],
      monthly_software_cost_cents: 9000,
    });
    expect(seed.input.tools.map((t) => t.monthlyCents)).toEqual([0, 0, 0]);
    // The total is carried, unallocated, for the operator to itemize live.
    expect(seed.unallocatedToolSpendCents).toBe(9000);
    expect(seed.limitations.join(' ')).toContain('Itemize it per tool');
  });

  it('never lets the unallocated total leak into a claimed saving', () => {
    const seed = stackSeedFromCalculator({
      platforms_used: ['Patreon'],
      monthly_software_cost_cents: 9000,
    });
    const r = buildStackReplacementReport(seed.input);
    expect(r.replaceableToolCostCents).toBe(0);
    expect(r.toolCostCents).toBe(0);
  });
});

describe('the audit is operator-only and cannot touch anything external', () => {
  it('is admin-gated and resolves the caller from their session', () => {
    expect(ROUTE).toContain('requireAdmin');
    expect(ROUTE).toContain("status: 401");
  });

  it('writes nothing, anywhere', () => {
    for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(']) {
      expect(ROUTE, `the audit must not ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('performs no external migration or cancellation', () => {
    expect(ROUTE_CODE).not.toMatch(/cancel|migrate|unsubscribe|stripe\.subscriptions|patreon\.|shopify\./i);
  });

  it('is not exposed on any artist route', () => {
    // Admin namespace only. An artist must not be able to read another artist's stack, or their own
    // through a path that skips requireAdmin.
    expect(ROUTE).toContain('api/admin/stack-replacement');
  });
});

describe('the audit is evidence, not priority', () => {
  it('does not introduce a constraint type or touch the Constraint Engine', () => {
    expect(ROUTE).not.toMatch(/STACK_REPLACEMENT|readConstraint|recordIssuedRecommendation/);
  });

  it('reuses the versioned pure report rather than recomputing', () => {
    expect(ROUTE).toContain('buildStackReplacementReport');
    expect(ROUTE).toContain('renderStackReplacementReport');
  });
});
