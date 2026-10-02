import { describe, it, expect } from 'vitest';
import { sequenceStillApplies } from './stillApplies';

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
