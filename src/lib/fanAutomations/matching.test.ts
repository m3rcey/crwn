import { describe, it, expect } from 'vitest';
import {
  commentMatchesAutomation,
  isOwnComment,
  normalizeKeyword,
  pickAutomation,
  textMatchesKeywords,
  triggerFromRow,
  type AutomationTrigger,
  type IncomingComment,
} from './matching';

function auto(overrides: Partial<AutomationTrigger> = {}): AutomationTrigger {
  return {
    id: 'a1',
    status: 'active',
    triggerMediaIds: ['media-1'],
    triggerKeywords: ['vault'],
    createdAt: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function comment(overrides: Partial<IncomingComment> = {}): IncomingComment {
  return { commentId: 'c1', mediaId: 'media-1', fromId: 'fan-9', text: 'VAULT please', ...overrides };
}

describe('matching', () => {
  it('a valid comment on the right post with the keyword matches', () => {
    expect(commentMatchesAutomation(comment(), auto())).toBe(true);
  });

  it('the wrong post never matches, even with the keyword', () => {
    expect(commentMatchesAutomation(comment({ mediaId: 'media-2' }), auto())).toBe(false);
  });

  it('a missing media id never matches a post-scoped automation', () => {
    expect(commentMatchesAutomation(comment({ mediaId: '' }), auto())).toBe(false);
  });

  it('the wrong keyword never matches', () => {
    expect(commentMatchesAutomation(comment({ text: 'love this' }), auto())).toBe(false);
  });

  it('keyword matching is case- and whitespace-insensitive', () => {
    expect(textMatchesKeywords('  VaUlT  now ', ['vault'])).toBe(true);
    expect(normalizeKeyword('  VaUlT\n NOW ')).toBe('vault now');
  });

  it('empty keyword list means any comment on a matching post', () => {
    expect(commentMatchesAutomation(comment({ text: 'anything' }), auto({ triggerKeywords: [] }))).toBe(true);
  });

  it('empty media list means every post', () => {
    expect(commentMatchesAutomation(comment({ mediaId: 'media-77' }), auto({ triggerMediaIds: [] }))).toBe(true);
  });

  it('a paused or draft automation never matches', () => {
    expect(commentMatchesAutomation(comment(), auto({ status: 'paused' }))).toBe(false);
    expect(commentMatchesAutomation(comment(), auto({ status: 'draft' }))).toBe(false);
  });

  it('the connected account commenting on itself is recognized (the loop guard)', () => {
    expect(isOwnComment({ fromId: 'acct-1' }, 'acct-1')).toBe(true);
    expect(isOwnComment({ fromId: 'fan-9' }, 'acct-1')).toBe(false);
    expect(isOwnComment({ fromId: '' }, 'acct-1')).toBe(false);
  });

  it('exactly one automation answers: the oldest match wins deterministically', () => {
    const older = auto({ id: 'old', createdAt: '2026-07-01T00:00:00Z', triggerMediaIds: [] });
    const newer = auto({ id: 'new', createdAt: '2026-08-01T00:00:00Z', triggerMediaIds: [] });
    expect(pickAutomation(comment(), [newer, older])?.id).toBe('old');
  });

  it('no match returns null, never a fallback automation', () => {
    expect(pickAutomation(comment({ text: 'hi' }), [auto()])).toBeNull();
  });

  it('triggerFromRow refuses junk jsonb instead of matching on it', () => {
    const t = triggerFromRow({
      id: 'a', status: 'active', created_at: '2026-08-01',
      trigger_media_ids: 'not-an-array', trigger_keywords: [42, '', ' Vault '],
    });
    expect(t.triggerMediaIds).toEqual([]);
    expect(t.triggerKeywords).toEqual(['vault']);
  });
});
