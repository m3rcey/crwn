// The offline guide fallback: what the support chat answers with when the AI is
// unavailable. Pure, no network, so it is exactly the part worth pinning.

import { describe, expect, it } from 'vitest';
import { offlineAnswer, searchGuides, SUPPORT_ASSISTANT_PROMPT } from './supportKnowledge';

describe('searchGuides', () => {
  it('finds a guide for a real support question', () => {
    // Josh's actual message when the assistant was down.
    const hits = searchGuides('hello i have a problem with my tiers');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].path).toMatch(/^\/getting-started\/guides\//);
  });

  it('ranks by relevance and respects the limit', () => {
    const hits = searchGuides('how do i get paid out', 2);
    expect(hits.length).toBeLessThanOrEqual(2);
    for (let i = 1; i < hits.length; i += 1) {
      expect(hits[i - 1].score).toBeGreaterThanOrEqual(hits[i].score);
    }
  });

  it('returns nothing for a bare greeting rather than a random guide', () => {
    // Pointing someone at an unrelated article is worse than admitting we cannot
    // help: every word here is a stopword, so there is nothing to match on.
    expect(searchGuides('hello')).toEqual([]);
    expect(searchGuides('hi there')).toEqual([]);
  });

  it('returns nothing for gibberish', () => {
    expect(searchGuides('zzzzqqq wibblefrotz')).toEqual([]);
  });
});

describe('offlineAnswer', () => {
  it('names real guides with their paths when something matches', () => {
    const { reply, matched } = offlineAnswer('how do i set up my subscription tiers');
    expect(matched).toBe(true);
    expect(reply).toContain('/getting-started/guides/');
    // It must still say a human was notified: the assistant being down is not
    // the same as the question being answered.
    expect(reply.toLowerCase()).toContain('real person');
  });

  it('reports no match instead of inventing one', () => {
    const { reply, matched } = offlineAnswer('hello');
    expect(matched).toBe(false);
    expect(reply).toBe('');
  });

  it('never uses an em dash', () => {
    const { reply } = offlineAnswer('how do i get paid');
    expect(reply).not.toContain('—');
  });
});

describe('SUPPORT_ASSISTANT_PROMPT', () => {
  it('tells the assistant to try before escalating', () => {
    // The original prompt said "ALWAYS escalate ... you are not confident", which
    // sent a vague opener straight to a human with no attempt.
    expect(SUPPORT_ASSISTANT_PROMPT).toContain('TRY FIRST');
    expect(SUPPORT_ASSISTANT_PROMPT).not.toContain('you are not confident');
  });

  it('still escalates the money and legal cases', () => {
    expect(SUPPORT_ASSISTANT_PROMPT).toMatch(/payout/i);
    expect(SUPPORT_ASSISTANT_PROMPT).toMatch(/refund/i);
    expect(SUPPORT_ASSISTANT_PROMPT).toMatch(/legal/i);
  });

  it('carries the current plan lineup, not a dead one', () => {
    expect(SUPPORT_ASSISTANT_PROMPT).toContain('$49');
    expect(SUPPORT_ASSISTANT_PROMPT).toContain('$199');
    expect(SUPPORT_ASSISTANT_PROMPT).not.toContain('Empire');
  });
});
