import { describe, it, expect } from 'vitest';
import {
  BALLOT_CTA_LABEL,
  FORBIDDEN_BALLOT_CTA,
  isPlausibleEmail,
  cleanFirstName,
  validateBallotSubmission,
  needsIdentity,
  ballotDisclosure,
  possessive,
  ballotErrorFor,
  successCta,
  BALLOT_CLOSED_ERROR,
  BALLOT_NETWORK_ERROR,
  MAX_FIRST_NAME_LENGTH,
} from './voteForm';

describe('ballot CTA language', () => {
  it('is the vote verb, never signup language', () => {
    expect(BALLOT_CTA_LABEL).toBe('Cast my vote');
    expect(FORBIDDEN_BALLOT_CTA).toContain('join free');
    // The guard that matters: the shipped label is not one of the banned ones.
    expect(FORBIDDEN_BALLOT_CTA).not.toContain(BALLOT_CTA_LABEL.toLowerCase());
  });
});

describe('isPlausibleEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(isPlausibleEmail('someone@gmail.com')).toBe(true);
    expect(isPlausibleEmail('  first.last+tag@sub.domain.org ')).toBe(true);
  });
  it('rejects the typos an attendee actually makes', () => {
    expect(isPlausibleEmail('someone')).toBe(false);
    expect(isPlausibleEmail('someone@')).toBe(false);
    expect(isPlausibleEmail('someone@gmail')).toBe(false);
    expect(isPlausibleEmail('someone@@gmail.com')).toBe(false);
    expect(isPlausibleEmail('some one@gmail.com')).toBe(false);
    expect(isPlausibleEmail('someone@.com')).toBe(false);
    expect(isPlausibleEmail('')).toBe(false);
    expect(isPlausibleEmail('a@b.' + 'x'.repeat(300))).toBe(false);
  });
});

describe('cleanFirstName', () => {
  it('trims, collapses and caps', () => {
    expect(cleanFirstName('  Mary   Jane  ')).toBe('Mary Jane');
    expect(cleanFirstName('x'.repeat(100))).toHaveLength(MAX_FIRST_NAME_LENGTH);
  });
});

describe('validateBallotSubmission', () => {
  const base = { selectedOptionId: 'a', signedIn: false, firstName: 'Mary', email: 'mary@gmail.com' };

  it('accepts a complete anonymous submission', () => {
    expect(validateBallotSubmission(base)).toBeNull();
  });
  it('demands the song FIRST, before any identity complaint', () => {
    const r = validateBallotSubmission({ ...base, selectedOptionId: null, firstName: '', email: 'nope' });
    expect(r).toEqual({ field: 'option', message: 'Choose a song first.' });
  });
  it('asks for a first name and a valid email in plain English', () => {
    expect(validateBallotSubmission({ ...base, firstName: '   ' }))
      .toEqual({ field: 'firstName', message: 'Enter your first name.' });
    expect(validateBallotSubmission({ ...base, email: 'mary@' }))
      .toEqual({ field: 'email', message: 'Enter a valid email.' });
  });
  it('never asks a signed-in fan for identity, but still needs the song', () => {
    expect(validateBallotSubmission({ selectedOptionId: 'b', signedIn: true, firstName: '', email: '' })).toBeNull();
    expect(validateBallotSubmission({ selectedOptionId: null, signedIn: true, firstName: '', email: '' }))
      .toEqual({ field: 'option', message: 'Choose a song first.' });
  });
});

describe('needsIdentity', () => {
  it('is true only for a logged-out visitor', () => {
    expect(needsIdentity(false)).toBe(true);
    expect(needsIdentity(true)).toBe(false);
  });
});

describe('possessive', () => {
  it('gives a name ending in s the bare apostrophe', () => {
    expect(possessive('Julius Williams')).toBe("Julius Williams'");
    expect(possessive('GB The G1ft')).toBe("GB The G1ft's");
    expect(possessive('  Ross  ')).toBe("Ross'");
    expect(possessive('')).toBe('');
  });
});

describe('ballotDisclosure', () => {
  it('names the artist and states join, free, and no card', () => {
    const text = ballotDisclosure('Julius Williams');
    expect(text).toContain('Julius Williams');
    expect(text.toLowerCase()).toContain('join');
    expect(text.toLowerCase()).toContain('free');
    expect(text.toLowerCase()).toContain('no card');
  });
  it('promises only what a free member actually gets, never member-only content', () => {
    const text = ballotDisclosure('Julius Williams').toLowerCase();
    expect(text).toContain('result');
    expect(text).toContain('upcoming shows');
    expect(text).not.toContain('exclusive');
    expect(text).not.toContain('member content');
  });
  it('falls back to a neutral noun when the artist name is not presentable', () => {
    expect(ballotDisclosure('   ')).toContain('this artist');
  });
  it('carries no em dash (copy rule)', () => {
    expect(ballotDisclosure('Julius Williams').includes('—')).toBe(false);
  });
});

describe('successCta (the vote screen is the end of the journey)', () => {
  it('offers NOTHING when the artist configured no reward', () => {
    // The live percentages are already on screen. Sending the fan to the public Lab, which
    // hides an open vote's tally, would contradict the numbers they are looking at.
    expect(successCta(null, 'Julius Williams')).toBeNull();
    expect(successCta(undefined, 'Julius Williams')).toBeNull();
    expect(successCta('   ', 'Julius Williams')).toBeNull();
  });

  it('offers the reward, and only the reward, when one is configured', () => {
    const cta = successCta('/julius-williams', 'Julius Williams');
    expect(cta).toEqual({ href: '/julius-williams', label: 'See what Julius Williams left for you' });
  });

  it('never sends the fan to the vote-status page', () => {
    for (const reward of [null, '/julius-williams', '/julius-williams/lab']) {
      const cta = successCta(reward, 'Julius Williams');
      expect(cta?.label ?? '').not.toMatch(/how the vote is going/i);
    }
  });
});

describe('ballotErrorFor', () => {
  it('translates the route reasons an attendee can hit', () => {
    expect(ballotErrorFor('not_open')).toBe(BALLOT_CLOSED_ERROR);
    expect(ballotErrorFor('invalid_option')).toContain('no longer on the list');
  });
  it('passes a short server sentence through and never leaks a long one', () => {
    expect(ballotErrorFor(null, 'This offer is not available right now')).toBe('This offer is not available right now');
    expect(ballotErrorFor(null, 'x'.repeat(200))).toBe(BALLOT_NETWORK_ERROR);
    expect(ballotErrorFor(undefined, null)).toBe(BALLOT_NETWORK_ERROR);
  });
});
