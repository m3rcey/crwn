import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { categoryForPlatform } from './stackReplacementSource';
import { CRWN_REPLACES } from './stackReplacement';

// Z7: the onboarding boundary, asserted against source so a future edit has to argue with a test.
const SETUP = readFileSync('src/app/setup/page.tsx', 'utf8');
const CLAIM = readFileSync('src/app/api/lead-results/auto-claim/route.ts', 'utf8');
/** Comments stripped. A comment EXPLAINING why a phrase is banned is not that phrase shipping. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const SETUP_COPY = stripComments(SETUP);

describe('onboarding speaks to an artist who already has a business', () => {
  // §4's banned list. "First paid member" is a real CRWN milestone and stays allowed.
  it.each([
    /your first (track|song|fan|audience)/i,
    /start your music business/i,
    /get your first fans/i,
    /finally monetize/i,
    /become an artist entrepreneur/i,
    /from scratch/i,
  ])('carries no beginner framing matching %s', (pattern) => {
    expect(SETUP_COPY).not.toMatch(pattern);
  });

  it('asks for a track without implying it is the artist first ever', () => {
    expect(SETUP).toContain('Add a track to your page');
  });

  // The established-artist tone the wizard already had, which must not regress.
  it('confirms and reviews rather than teaching from zero', () => {
    expect(SETUP).toContain('Confirm your membership ladder');
    expect(SETUP).toContain('Review your promise schedule');
  });
});

describe('the wizard reuses what the artist already told CRWN', () => {
  it('says back the stack they declared instead of asking again', () => {
    expect(CLAIM).toContain('declaredStack');
    expect(SETUP).toContain('You already run on:');
    // It must be a STATEMENT, never a question.
    expect(SETUP).not.toMatch(/Do you already use|Which tools do you use|What platforms do you use/i);
  });

  it('splits the declared stack with the same map the Stack Replacement audit uses', () => {
    // One taxonomy. The wizard cannot claim to cover a tool the audit would leave in place.
    expect(CLAIM).toContain('categoryForPlatform');
    expect(CLAIM).toContain('CRWN_REPLACES');
    expect(CRWN_REPLACES[categoryForPlatform('Ticketing')]).toBe(false);
    expect(CRWN_REPLACES[categoryForPlatform('Patreon')]).toBe(true);
  });

  it('still carries the calculator context that already worked', () => {
    for (const field of ['tierProjections', 'ladderPrefill', 'shareToEarn', 'subAvatar']) {
      expect(CLAIM, `${field} continuity must survive`).toContain(field);
    }
  });

  it('never asks the artist to self-select a sub-avatar', () => {
    expect(SETUP).not.toMatch(/which (sub-?avatar|type of artist) are you/i);
  });
});

describe('onboarding does not take over another system job', () => {
  it('does not re-derive launch readiness: the Roadmap owns it', () => {
    // Onboarding completion is `setup_completed`; launch readiness is the Roadmap's evaluator.
    expect(SETUP).not.toContain('readConstraint');
    expect(SETUP).not.toContain('assembleConstraintEvidence');
  });

  it('does not issue a Z3 recommendation record', () => {
    expect(SETUP).not.toContain('recordIssuedRecommendation');
  });

  it('completes through the single canonical completion path', () => {
    expect(SETUP).toContain('markComplete');
  });

  it('does not create Promise Calendar obligations for setup chores', () => {
    // Promises come from tier BENEFITS via the canonical applier, not from wizard steps.
    expect(SETUP).not.toMatch(/fulfillment_events.*insert|insert.*fulfillment_events/);
  });
});

describe('the declared-stack split is honest', () => {
  const split = (names: string[]) => {
    const covered: string[] = [];
    const stays: string[] = [];
    for (const n of names) (CRWN_REPLACES[categoryForPlatform(n)] ? covered : stays).push(n);
    return { covered, stays };
  };

  it('keeps what CRWN cannot replace out of the covered list', () => {
    const r = split(['Patreon', 'Discord', 'Ticketing']);
    expect(r.covered).toEqual(['Patreon', 'Discord']);
    expect(r.stays).toEqual(['Ticketing']);
  });

  it('treats an unrecognised tool as staying, never as covered', () => {
    expect(split(['Some tool nobody mapped']).stays).toHaveLength(1);
  });
});
