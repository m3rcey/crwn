import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sequenceStillApplies, stepGapDays, withoutBareNameLine } from './stillApplies';

describe('withoutBareNameLine', () => {
  const body = '{{first_name}}\n\nYou in now thats wassup';
  it('drops a greeting that is only the name, when the name is unknown', () => {
    expect(withoutBareNameLine(body, true)).toBe('You in now thats wassup');
    expect(withoutBareNameLine('{{first_name}},\n\nHi', true)).toBe('Hi');
  });
  it('keeps it when the name is known, and never touches "Hey {{first_name}},"', () => {
    expect(withoutBareNameLine(body, false)).toBe(body);
    expect(withoutBareNameLine('Hey {{first_name}},\n\nHi', true)).toBe('Hey {{first_name}},\n\nHi');
  });
  it('the cron uses it', () => {
    expect(readFileSync('src/app/api/cron/sequences/route.ts', 'utf8')).toContain("withoutBareNameLine(step.body, firstName === 'there')");
  });
});

describe('stepGapDays: delay_days is "day N", so the wait is the gap', () => {
  it('REGRESSION: a 0/2/5/9/14 nurture sends on days 0, 2, 5, 9 and 14, not 0, 2, 7, 16, 30', () => {
    const days = [0, 2, 5, 9, 14];
    let t = days[0];
    const sent = [t];
    for (let i = 1; i < days.length; i++) {
      t += stepGapDays(days[i - 1], days[i]);
      sent.push(t);
    }
    expect(sent).toEqual(days);
  });
  it('a non-increasing pair never sends two steps at once', () => {
    expect(stepGapDays(5, 5)).toBe(1);
    expect(stepGapDays(5, 3)).toBe(1);
  });
  it('the cron schedules with it', () => {
    expect(readFileSync('src/app/api/cron/sequences/route.ts', 'utf8')).toContain('stepGapDays(step.delay_days, nextStep.delay_days)');
  });
});

const left = { activeMember: false, paidMember: false };
const free = { activeMember: true, paidMember: false };
const paid = { activeMember: true, paidMember: true };

describe('sequenceStillApplies', () => {
  it('REGRESSION: a free member who left stops getting the free-member nurture', () => {
    expect(sequenceStillApplies('free_join', left)).toBe('cancel');
  });
  it('a free member who bought a paid rung has finished the free-member nurture', () => {
    expect(sequenceStillApplies('free_join', paid)).toBe('complete');
    expect(sequenceStillApplies('free_join', free)).toBe('send');
  });
  it('REGRESSION: a cart paid on another session stops "You left something behind"', () => {
    expect(sequenceStillApplies('abandoned_cart', paid)).toBe('complete');
    expect(sequenceStillApplies('abandoned_cart', left)).toBe('send');
  });
  it('a churned fan who came back stops getting the win-back', () => {
    expect(sequenceStillApplies('win_back', paid)).toBe('complete');
  });
  it('member sequences need a membership', () => {
    for (const t of ['new_subscription', 'tier_upgrade', 'inactive_subscriber', 'loyalty_survey']) {
      expect(sequenceStillApplies(t, left)).toBe('cancel');
      expect(sequenceStillApplies(t, paid)).toBe('send');
    }
  });
  it('purchase sequences and unknown triggers are not membership-dependent', () => {
    expect(sequenceStillApplies('new_purchase', left)).toBe('send');
    expect(sequenceStillApplies('something_new', left)).toBe('send');
    expect(sequenceStillApplies(null, left)).toBe('send');
  });
});
