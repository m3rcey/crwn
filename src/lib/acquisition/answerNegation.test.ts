import { describe, it, expect } from 'vitest';
import { normalizeDeterministic, splitAnswerClauses } from './fieldRegistry';

// NEGATION IS RESOLVED BEFORE POSITIVE INTENT MATCHING (docs/crwn-brain/34-FOUNDER-FOLLOW-UP.md,
// "Monetization answers"). Found 2026-09-29 on a real DM: "I have no paid program or
// subscriptions" matched the bare "i have" rule and was stored as direct_some ("Yes, a few
// times"), worth 30 of the 40 monetization points.

const m = (raw: string) => normalizeDeterministic('monetization_status', raw);

describe('monetization_status: negation cannot trigger a positive category', () => {
  it("the exact DM answer that exposed the bug", () => {
    expect(m('I have no paid program or subscriptions')).toBe('none');
    expect(m('I have no paid program or subscriptions.')).toBe('none');
  });

  it.each([
    ['I have no merch', 'none'],
    ["I haven't sold anything yet", 'none'],
    ['I haven’t sold anything yet', 'none'], // curly apostrophe, as iOS types it
    ['I have never sold directly to fans', 'none'],
    ["I don't have subscriptions", 'none'],
    ['I do not have a paid program', 'none'],
    ['Not yet', 'none'],
    ['No', 'none'],
    ['None', 'none'],
    ['Nope', 'none'],
    ['No.', 'none'],
  ])('%s -> %s', (raw, expected) => expect(m(raw)).toBe(expected));
});

describe('monetization_status: legitimate positives are preserved', () => {
  it.each([
    ['I have a paid membership', 'direct_some'],
    ['I have sold directly to fans', 'direct_some'],
    ['I have merch', 'merch_only'],
    ['Yes', 'direct_some'],
    ['Yes I have', 'direct_some'],
    ['I have before', 'direct_some'],
    ["I've sold merch and tickets", 'merch_only'],
    ['Yes merch', 'merch_only'],
    ['Patreon. Direct to consumer type shit', 'direct_some'],
    ['yeah, patreon every month', 'direct_established'],
    ['ALL THE TIME', 'direct_established'],
    ['Only streaming', 'streaming_only'],
  ])('%s -> %s', (raw, expected) => expect(m(raw)).toBe(expected));
});

describe('monetization_status: mixed evidence keeps its positive half', () => {
  it.each([
    ["I don't have memberships but I sell merch", 'merch_only'],
    ['I have no subscriptions but I sell tickets', 'merch_only'],
    ['no memberships just merch', 'merch_only'],
    ['no, just merch', 'merch_only'],
    ['I haven’t sold anything. Just streams', 'streaming_only'],
  ])('%s -> %s', (raw, expected) => expect(m(raw)).toBe(expected));
});

describe('monetization_status: real production answers that were misread before the fix', () => {
  it.each([
    // "patreon" inside a negated clause used to win.
    ['I don’t have anyone of Patreon etc', 'none'],
    // "drop" (a release verb) used to match the merch/music "drops" rule.
    ['No but I kno that when I drop everything there are people waiting for it', 'none'],
  ])('%s -> %s', (raw, expected) => expect(m(raw)).toBe(expected));
});

describe('monetization_status: unreadable still escalates instead of guessing', () => {
  it.each(['idk man', 'If they even real', 'Hand to hand $10 a copy'])('%s -> null', (raw) => {
    expect(m(raw)).toBeNull();
  });
});

describe('the other enum fields are untouched (no negatedValue)', () => {
  it('a field without negatedValue still uses whole-sentence first-match', () => {
    // team_status has no alias rules; an exact enum value still resolves.
    expect(normalizeDeterministic('team_status', 'solo')).toBe('solo');
  });
});

describe('splitAnswerClauses', () => {
  it('splits on punctuation, contrast words and just/only phrases', () => {
    expect(splitAnswerClauses("i don't have memberships but i sell merch")).toEqual([
      "i don't have memberships",
      'i sell merch',
    ]);
    expect(splitAnswerClauses('nah, only streaming so far')).toEqual(['nah', 'only streaming so far']);
    expect(splitAnswerClauses('no memberships just merch')).toEqual(['no memberships', 'just merch']);
  });
});
