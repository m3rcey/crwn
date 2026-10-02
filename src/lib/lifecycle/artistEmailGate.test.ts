import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ACTIVATION_GAPS,
  currentActivationGap,
  decideLifecycleSend,
  lifecyclePriority,
  shouldEnrollForGap,
  upgradeNudgeEligible,
  type ArtistEmailFacts,
} from './artistEmailGate';
import { proBreakEvenGmvCents } from '@/lib/planRecommendation';

// The artist lifecycle email gate (2026-10-02). Production that week: "you are ready for Pro"
// went to ten artists with zero fans and zero revenue; the Stripe nudge kept sending after Stripe
// connected and claimed music that did not exist; several sequences ran against one artist at
// once. Every case below is one of those, stated as the rule that now prevents it.

const NOW = new Date('2026-10-02T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const BE = proBreakEvenGmvCents();

function facts(over: Partial<ArtistEmailFacts> & { m?: Record<string, string> } = {}): ArtistEmailFacts {
  const { m, ...rest } = over;
  return {
    milestones: { onboarding_completed: daysAgo(10), ...(m ?? {}) },
    hasPaidTier: false,
    platformTier: 'starter',
    gmv30dCents: 0,
    ...rest,
  };
}

const gap = (g: string) => ACTIVATION_GAPS.find((d) => d.gap === g)!;

describe('one current gap, in the order the wizard builds the business', () => {
  it('no music is the gap before anything else', () => {
    expect(currentActivationGap(facts())).toBe('music');
  });
  it('music but only the free Bronze rung: the paid tier is the gap', () => {
    expect(currentActivationGap(facts({ m: { first_track_uploaded: daysAgo(5), tiers_created: daysAgo(9) } }))).toBe('paid_tier');
  });
  it('music and a paid tier: payouts are the gap', () => {
    expect(currentActivationGap(facts({ hasPaidTier: true, m: { first_track_uploaded: daysAgo(5) } }))).toBe('stripe');
  });
  it('everything set up: the first paid fan is the gap', () => {
    expect(
      currentActivationGap(facts({ hasPaidTier: true, m: { first_track_uploaded: daysAgo(5), stripe_connected: daysAgo(3) } })),
    ).toBe('first_paid');
  });
  it('a paid fan exists: no activation gap is left', () => {
    expect(
      currentActivationGap(
        facts({ hasPaidTier: true, m: { first_track_uploaded: daysAgo(5), stripe_connected: daysAgo(3), first_subscriber: daysAgo(1) } }),
      ),
    ).toBeNull();
  });
  it('before the wizard is finished, none of these emails apply', () => {
    expect(currentActivationGap({ ...facts(), milestones: {} })).toBeNull();
  });
});

describe('enrollment: only the current gap, after its stall, inside the freshness window', () => {
  it('REGRESSION: a Stripe nudge never enrolls an artist with no music, even with tiers', () => {
    const f = facts({ hasPaidTier: true, m: { tiers_created: daysAgo(5) } });
    expect(shouldEnrollForGap(gap('stripe'), f, NOW)).toBe(false);
    expect(shouldEnrollForGap(gap('music'), f, NOW)).toBe(true);
  });
  it('the stall is measured from when the gap BECAME current, not from signup', () => {
    // Tiers were made weeks ago, music landed yesterday: the Stripe gap has been current one day.
    const f = facts({ hasPaidTier: true, m: { tiers_created: daysAgo(40), first_track_uploaded: daysAgo(0.5) } });
    expect(shouldEnrollForGap(gap('stripe'), f, NOW)).toBe(false);
    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    expect(shouldEnrollForGap(gap('stripe'), f, later)).toBe(true);
  });
  it('a stall older than the freshness window is history, not news', () => {
    const f = facts({ m: { onboarding_completed: daysAgo(60) } });
    expect(shouldEnrollForGap(gap('music'), f, NOW)).toBe(false);
  });
});

describe('send time: every step is re-decided against current facts', () => {
  it('REGRESSION: the Stripe nudge completes the moment Stripe is connected', () => {
    const f = facts({ hasPaidTier: true, m: { first_track_uploaded: daysAgo(5), stripe_connected: daysAgo(1) } });
    expect(decideLifecycleSend('activation_no_stripe', f, BE)).toEqual({ action: 'complete', reason: 'gap_closed' });
  });
  it('REGRESSION: a queued Stripe email for an artist with no music is cancelled, not sent', () => {
    const f = facts({ hasPaidTier: true });
    expect(decideLifecycleSend('activation_no_stripe', f, BE).action).toBe('cancel');
  });
  it('the current gap sends', () => {
    expect(decideLifecycleSend('activation_no_track', facts(), BE)).toEqual({ action: 'send' });
  });
  it('the old "connect Stripe" onboarding sequence follows the same Stripe rule', () => {
    expect(decideLifecycleSend('onboarding_incomplete', facts(), BE).action).toBe('cancel');
  });
  it('triggers the gate does not know about are never silenced by it', () => {
    expect(decideLifecycleSend('paid_churned', facts(), BE)).toEqual({ action: 'send' });
  });
});

describe('the Pro upsell is sold on real revenue, never on a Connect id', () => {
  it('REGRESSION: zero revenue never gets "you are ready for Pro"', () => {
    const f = facts({ gmv30dCents: 0 });
    expect(upgradeNudgeEligible(f, BE)).toBe(false);
    expect(decideLifecycleSend('starter_upgrade_nudge', f, BE).action).toBe('cancel');
  });
  it('unknown revenue never sells a plan', () => {
    expect(upgradeNudgeEligible(facts({ gmv30dCents: null }), BE)).toBe(false);
  });
  it('at the break-even on Launch, it sends', () => {
    const f = facts({ gmv30dCents: BE });
    expect(upgradeNudgeEligible(f, BE)).toBe(true);
    expect(decideLifecycleSend('starter_upgrade_nudge', f, BE)).toEqual({ action: 'send' });
  });
  it('already on Pro: the upsell is done, never re-sold', () => {
    expect(decideLifecycleSend('starter_upgrade_nudge', facts({ platformTier: 'pro', gmv30dCents: BE * 3 }), BE).action).toBe('complete');
  });
});

describe('one email per artist per run, activation first', () => {
  it('activation gaps outrank everything else in a run', () => {
    expect(lifecyclePriority('activation_no_track')).toBeLessThan(lifecyclePriority('starter_upgrade_nudge'));
    expect(lifecyclePriority('activation_no_subscribers')).toBeLessThan(lifecyclePriority('paid_at_risk'));
  });
});

// ── Source wiring: enrollment and sending read the SAME rule ────────────────────────────────
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const NUDGES = strip(readFileSync('src/app/api/cron/activation-nudges/route.ts', 'utf8'));
const SENDER = strip(readFileSync('src/app/api/cron/platform-sequences/route.ts', 'utf8'));
const CRM = strip(readFileSync('src/app/api/cron/platform-crm/route.ts', 'utf8'));

describe('wiring', () => {
  it('the nudge cron enrolls through shouldEnrollForGap, with no private rule list', () => {
    expect(NUDGES).toContain('shouldEnrollForGap');
    expect(NUDGES).not.toMatch(/NUDGE_RULES\s*[:=]/);
  });
  it('the send cron re-decides every step and caps one email per artist per run', () => {
    expect(SENDER).toContain('decideLifecycleSend(');
    expect(SENDER).toContain('emailedThisRun');
    // The gate must run BEFORE the ledger insert and the send.
    expect(SENDER.indexOf('decideLifecycleSend(')).toBeLessThan(SENDER.indexOf("from('platform_sequence_sends')"));
  });
  it('REGRESSION: the CRM never maps a pipeline stage to the Pro upsell', () => {
    const map = CRM.slice(CRM.indexOf('STAGE_TRIGGERS'), CRM.indexOf('};', CRM.indexOf('STAGE_TRIGGERS')));
    expect(map).not.toContain('starter_upgrade_nudge');
    expect(CRM).toContain('upgradeNudgeEligible(');
  });
});
