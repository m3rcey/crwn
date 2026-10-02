import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { classifyNotification, isGovernable } from './comms/taxonomy';
import { ACTIVATION_GAPS, decideLifecycleSend } from './lifecycle/artistEmailGate';

// PROMISE CALENDAR + LIFECYCLE EMAIL BOUNDARY.
//
// Two systems were emailing about the SAME fan promise. `promiseReminders` (06:00, via the
// scheduled-releases cron) and `calendarReminders` (09:00, via the sequences cron) both read
// `fulfillment_events`, and they dedupe against ledgers that cannot see each other:
// `metadata.reminded_offsets` on one side, the `calendar_reminders` claim table on the other. So a
// single obligation produced two emails three hours apart plus an in-app notification.
//
// The earlier fix corrected only ELIGIBILITY (both stopped treating Revenue Ramp steps as fan
// promises). What remained doubled up was therefore the REAL obligations. Production had already
// claimed 16 `fulfillment_event` reminders across both channels.
//
// Resolution: one owner per subject type. `promiseReminders` owns fan promises, because it honours
// each obligation's configurable `reminder_offsets`; `calendarReminders` owns everything else and
// is now fan-only.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'));

const PROMISE = read('src/lib/promiseReminders.ts');
const CALENDAR = read('src/lib/calendarReminders.ts');
const NUDGES = read('src/app/api/cron/activation-nudges/route.ts');
const ONBOARD = read('src/app/api/cron/onboarding-reminder/route.ts');

describe('exactly one sender owns fan promises', () => {
  it('promiseReminders reads fulfillment_events', () => {
    expect(PROMISE).toContain("from('fulfillment_events')");
  });

  it('calendarReminders no longer reads them at all', () => {
    expect(CALENDAR).not.toContain("from('fulfillment_events')");
    expect(CALENDAR).not.toContain("subjectType: 'fulfillment_event'");
  });

  it('so one obligation can no longer produce two emails', () => {
    const readers = [
      ['promiseReminders', PROMISE],
      ['calendarReminders', CALENDAR],
    ].filter(([, src]) => (src as string).includes("from('fulfillment_events')"));
    expect(readers.map(([n]) => n)).toEqual(['promiseReminders']);
  });

  it('promiseReminders keeps the configurable lead times that justified it winning', () => {
    expect(PROMISE).toContain('reminder_offsets');
    expect(PROMISE).toMatch(/\[7, 3, 1\]/);
  });

  it('calendarReminders keeps its own distinct jobs', () => {
    for (const t of ['live_sessions', 'road_campaigns', 'missions', 'clip_bounties', 'proof_of_demand']) {
      expect(CALENDAR, `calendarReminders must still cover ${t}`).toContain(t);
    }
  });
});

describe('promise reminder emails start at the first PAYING member (2026-10-02)', () => {
  // August 2026: artists with zero members were emailed "Monthly Vault unlock" and "Private group
  // listening event". Before a paying member exists the artist's constraint is getting paid, not
  // fulfilling, so this channel waits. The rule is the shared one, never a re-expression.
  it('uses the one paying rule, countsAsPaying', () => {
    expect(PROMISE).toContain('countsAsPaying(');
    expect(PROMISE).not.toMatch(/price\s*>\s*0/);
  });
  it('skips an artist with no paying member before any offset is considered', () => {
    const gate = PROMISE.indexOf('payingArtists.has(');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(PROMISE.indexOf('remindedOffsetsOf(e.metadata)'));
  });
});

describe('fan-obligation language stays on real obligations', () => {
  it('promiseReminders still filters to fan promises and still says "Promise due"', () => {
    expect(PROMISE).toContain('onlyFanPromises');
    expect(PROMISE).toMatch(/Promise due in/);
  });

  it('calendarReminders no longer calls anything a promise', () => {
    // It cannot see fan promises any more, so promise language would be false by construction.
    expect(CALENDAR).not.toMatch(/Promise coming up|promises coming up/);
  });

  it('neither re-expresses the fan-promise rule with its own literal', () => {
    expect(PROMISE).not.toMatch(/ramp_step_key/);
    expect(CALENDAR).not.toMatch(/ramp_step_key/);
  });
});

describe('the notification chokepoint is no longer bypassed here', () => {
  it('calendarReminders routes through createNotification', () => {
    expect(CALENDAR).toContain('createNotification');
    expect(CALENDAR).not.toMatch(/from\('notifications'\)[\s\S]{0,40}\.insert/);
  });

  it('its type is classified, so the governor recognises it', () => {
    const c = classifyNotification('calendar_reminder');
    expect(c).toBeTruthy();
    // Fan-facing, therefore not subject to artist attention governance.
    expect(isGovernable(c!)).toBe(false);
  });
});

describe('lifecycle email is state-aware, not a blind drip', () => {
  // Since 2026-10-02 the chain lives in lifecycle/artistEmailGate.ts and is read by BOTH the
  // enrollment cron and the send cron, so these are asserted as behavior, not source shape.
  it('activation nudges enroll through the shared gate', () => {
    expect(NUDGES).toContain('shouldEnrollForGap');
  });

  it('each gap is the stall it names, in the wizard order', () => {
    expect(ACTIVATION_GAPS.map((g) => [g.gap, g.triggerType])).toEqual([
      ['music', 'activation_no_track'],
      ['paid_tier', 'activation_no_tiers'],
      ['stripe', 'activation_no_stripe'],
      ['first_paid', 'activation_no_subscribers'],
    ]);
  });

  it('a stripe-connected artist cannot receive the connect-Stripe nudge', () => {
    const connected = {
      milestones: { onboarding_completed: 'x', first_track_uploaded: 'x', stripe_connected: 'x' },
      hasPaidTier: true,
      platformTier: 'starter',
      gmv30dCents: 0,
    };
    expect(decideLifecycleSend('activation_no_stripe', connected, 1).action).toBe('complete');
  });

  it('onboarding reminders are send-once and only for unfinished onboarding', () => {
    expect(ONBOARD).toContain('onboarding_nudge_sent_at');
    expect(ONBOARD).toMatch(/onboarding_completed/);
  });
});

describe('email did not become a second priority engine', () => {
  it('no lifecycle sender diagnoses or ranks', () => {
    for (const [label, src] of [['promise', PROMISE], ['calendar', CALENDAR], ['nudges', NUDGES]] as const) {
      expect(src, `${label} must not diagnose`).not.toContain('readConstraint');
      expect(src, `${label} must not assemble evidence`).not.toContain('assembleConstraintEvidence');
      expect(src, `${label} must not issue`).not.toContain('recordIssuedRecommendation');
      expect(src, `${label} must not call a model`).not.toContain('deepseek');
    }
  });

  it('no email-specific completion state replaces canonical fulfillment', () => {
    expect(PROMISE).not.toMatch(/email_completed|reminder_completed/);
  });

  it('adds no global email ledger', () => {
    for (const src of [PROMISE, CALENDAR]) {
      expect(src).not.toMatch(/email_log|email_sends|communication_log|CREATE TABLE/);
    }
  });
});

describe('consent and suppression survive', () => {
  it('calendarReminders still honours the suppression list', () => {
    expect(CALENDAR).toContain('suppressedEmails');
    expect(CALENDAR).toContain('email_suppressions');
  });

  it('suppression marks the row skipped rather than pretending it sent', () => {
    expect(CALENDAR).toMatch(/status: !email \|\| suppressed\.has\(email\) \? 'skipped' : 'sent'/);
  });
});
