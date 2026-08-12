import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAID_CONVERSION_KINDS } from './paidConversion';

// F-02 / F-03 (product consistency audit, 2026-08-12), founder Decision C.
//
// The admin funnel defined "activated" as 3-of-5 SETUP milestones and read first money from
// the membership rail only, while the product defines activation as the first paid fan
// conversion across all six rails. These tests pin the corrected definitions so the admin
// dashboard cannot quietly drift back to measuring setup work as money.
//
// The recorder's own behavior (six rails, dedupe per artist, attribution) is pinned by
// paidConversion.test.ts — this suite only pins the admin route CONSUMING it.

const ROUTE = readFileSync('src/app/api/admin/funnel/route.ts', 'utf8');
const VIEW = readFileSync('src/components/admin/FunnelView.tsx', 'utf8');

describe('admin activation is the canonical first-paid definition (F-02)', () => {
  it('the route reads activation from the canonical funnel_events stage', () => {
    expect(ROUTE).toContain("eq('stage', 'first_paid_conversion')");
    expect(ROUTE).toContain('activatedArtistIds');
  });

  it('the canonical recorder still covers all six rails (superset of memberships)', () => {
    expect([...PAID_CONVERSION_KINDS]).toEqual([
      'subscription',
      'product',
      'track',
      'booking',
      'live_ticket',
      'live_tip',
    ]);
  });

  it('the funnel payload carries BOTH series: activated and the preserved 3-of-5', () => {
    expect(ROUTE).toContain('activated: filtered.filter(a => activatedArtistIds.has(a.id)).length');
    // The historical 3-of-5 computation is preserved, renamed to setup_progress.
    expect(ROUTE).toContain('count >= 3');
    expect(ROUTE).toContain('setup_progress: setupProgress');
  });

  it('the weekly trend no longer calls the 3-of-5 series "activated"', () => {
    // Old defect: `// "Activated" = has at least 3 of 5 milestones`.
    expect(ROUTE).not.toMatch(/"Activated"\s*=\s*has at least/);
  });
});

describe('admin first money is not membership-only (F-03)', () => {
  it('the UI labels first_subscriber as membership-specific, never as first money', () => {
    expect(VIEW).toContain("label: 'First Member (memberships)'");
    expect(VIEW).not.toContain("label: 'First Subscriber'");
  });

  it('the UI conversion cards use canonical activation, not the membership milestone', () => {
    expect(VIEW).toContain('conversionRate(funnel.signups, funnel.activated)');
    expect(VIEW).toContain('conversionRate(topOfFunnel, funnel.activated)');
    expect(VIEW).not.toContain('conversionRate(funnel.signups, funnel.first_subscriber)');
    expect(VIEW).not.toContain('conversionRate(topOfFunnel, funnel.first_subscriber)');
  });

  it('both weekly-trend charts draw setup progress and activation as separate honest series', () => {
    expect((VIEW.match(/dataKey="setup_progress"/g) || []).length).toBe(2);
    expect((VIEW.match(/name="Activated \(First Paid\)"/g) || []).length).toBe(2);
  });
});
