import { describe, it, expect } from 'vitest';
import {
  effectiveStatus,
  checkVote,
  tally,
  normalizeOptions,
  mergeOptionEdit,
  normalizeOfferSlug,
  offerIsLive,
  safeLabPath,
  claimDestination,
  isFreshSignup,
  RECOGNITION_DISCLAIMER,
  type SongLabDecisionCore,
  type SongLabOfferCore,
} from './core';

const NOW = new Date('2026-08-20T12:00:00Z');

function decision(over: Partial<SongLabDecisionCore> = {}): SongLabDecisionCore {
  return {
    status: 'open',
    options: [
      { id: 'a', label: 'Hook A' },
      { id: 'b', label: 'Hook B' },
      { id: 'c', label: 'Hook C' },
    ],
    is_free: false,
    allowed_tier_ids: ['tier-free'],
    opens_at: null,
    closes_at: null,
    winning_option_id: null,
    ...over,
  };
}

function offer(over: Partial<SongLabOfferCore> = {}): SongLabOfferCore {
  return {
    benefit_kind: 'vote',
    decision_id: 'dec-1',
    project_id: 'proj-1',
    destination_path: null,
    is_active: true,
    starts_at: null,
    ends_at: null,
    ...over,
  };
}

describe('effectiveStatus', () => {
  it('draft stays draft regardless of windows', () => {
    expect(effectiveStatus(decision({ status: 'draft', opens_at: '2020-01-01T00:00:00Z' }), NOW)).toBe('draft');
  });
  it('closed stays closed even if closes_at is in the future (window never reopens)', () => {
    expect(effectiveStatus(decision({ status: 'closed', closes_at: '2030-01-01T00:00:00Z' }), NOW)).toBe('closed');
  });
  it('open before opens_at is scheduled', () => {
    expect(effectiveStatus(decision({ opens_at: '2026-08-21T00:00:00Z' }), NOW)).toBe('scheduled');
  });
  it('open past closes_at is closed (auto-close reads the window)', () => {
    expect(effectiveStatus(decision({ closes_at: '2026-08-20T11:59:59Z' }), NOW)).toBe('closed');
  });
  it('open inside the window is open', () => {
    expect(effectiveStatus(decision({ opens_at: '2026-08-19T00:00:00Z', closes_at: '2026-08-22T00:00:00Z' }), NOW)).toBe('open');
  });
});

describe('checkVote', () => {
  it('rejects a vote on a non-open decision', () => {
    expect(checkVote({ decision: decision({ status: 'closed' }), now: NOW, optionId: 'a', fanTierId: 'tier-free' }))
      .toEqual({ ok: false, reason: 'not_open' });
    expect(checkVote({ decision: decision({ status: 'draft' }), now: NOW, optionId: 'a', fanTierId: 'tier-free' }))
      .toEqual({ ok: false, reason: 'not_open' });
  });
  it('rejects a stale window submission (open status, expired closes_at)', () => {
    expect(checkVote({ decision: decision({ closes_at: '2026-08-20T11:00:00Z' }), now: NOW, optionId: 'a', fanTierId: 'tier-free' }))
      .toEqual({ ok: false, reason: 'not_open' });
  });
  it('rejects an invalid option id', () => {
    expect(checkVote({ decision: decision(), now: NOW, optionId: 'z', fanTierId: 'tier-free' }))
      .toEqual({ ok: false, reason: 'invalid_option' });
  });
  it('rejects a fan whose tier is not in the allow list, and a fan with no membership', () => {
    expect(checkVote({ decision: decision(), now: NOW, optionId: 'a', fanTierId: 'tier-gold' }))
      .toEqual({ ok: false, reason: 'not_eligible' });
    expect(checkVote({ decision: decision(), now: NOW, optionId: 'a', fanTierId: null }))
      .toEqual({ ok: false, reason: 'not_eligible' });
  });
  it('accepts an eligible tier member; option check runs before eligibility', () => {
    expect(checkVote({ decision: decision(), now: NOW, optionId: 'b', fanTierId: 'tier-free' })).toEqual({ ok: true });
    expect(checkVote({ decision: decision(), now: NOW, optionId: 'z', fanTierId: null }))
      .toEqual({ ok: false, reason: 'invalid_option' });
  });
  it('is_free admits any signed-in fan without a membership', () => {
    expect(checkVote({ decision: decision({ is_free: true }), now: NOW, optionId: 'c', fanTierId: null })).toEqual({ ok: true });
  });
  it('malformed allowed_tier_ids fails closed', () => {
    const d = decision();
    (d as unknown as { allowed_tier_ids: unknown }).allowed_tier_ids = 'tier-free';
    expect(checkVote({ decision: d, now: NOW, optionId: 'a', fanTierId: 'tier-free' }))
      .toEqual({ ok: false, reason: 'not_eligible' });
  });
});

describe('tally', () => {
  it('counts votes per option and names the leader', () => {
    const t = tally(decision().options, [
      { option_id: 'a' }, { option_id: 'b' }, { option_id: 'b' },
    ]);
    expect(t).toEqual({ counts: { a: 1, b: 2, c: 0 }, total: 3, leading: 'b' });
  });
  it('empty ballot has no leader (nothing auto-finalizes)', () => {
    expect(tally(decision().options, []).leading).toBeNull();
  });
  it('a tie keeps the first option as leading and never throws', () => {
    const t = tally(decision().options, [{ option_id: 'a' }, { option_id: 'b' }]);
    expect(t.leading).toBe('a');
    expect(t.total).toBe(2);
  });
});

describe('normalizeOptions / mergeOptionEdit', () => {
  it('builds stable a/b/c ids from labels', () => {
    expect(normalizeOptions(['Beat A', ' Beat B '])).toEqual([
      { id: 'a', label: 'Beat A' },
      { id: 'b', label: 'Beat B' },
    ]);
  });
  it('rejects fewer than 2 or more than 4 options', () => {
    expect(normalizeOptions(['only one'])).toBeNull();
    expect(normalizeOptions(['1', '2', '3', '4', '5'])).toBeNull();
    expect(normalizeOptions('not an array')).toBeNull();
  });
  it('accepts {label} objects and drops empty labels', () => {
    expect(normalizeOptions([{ label: 'A' }, { label: 'B' }, { label: '  ' }])).toEqual([
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ]);
  });
  it('edit keeps existing ids by position so cast votes still point at the same choice', () => {
    const existing = [{ id: 'a', label: 'Old A' }, { id: 'b', label: 'Old B' }];
    expect(mergeOptionEdit(existing, ['New A', 'New B', 'New C'])).toEqual([
      { id: 'a', label: 'New A' },
      { id: 'b', label: 'New B' },
      { id: 'c', label: 'New C' },
    ]);
  });
});

describe('offer slug and window', () => {
  it('normalizes spacing and case, enforces charset and length', () => {
    expect(normalizeOfferSlug('  Final Vote ')).toBe('final-vote');
    expect(normalizeOfferSlug('ok-slug-9')).toBe('ok-slug-9');
    expect(normalizeOfferSlug('-bad')).toBeNull();
    expect(normalizeOfferSlug('ab')).toBeNull();
    expect(normalizeOfferSlug('has/slash')).toBeNull();
    expect(normalizeOfferSlug(42)).toBeNull();
  });
  it('offerIsLive honors is_active and the date window', () => {
    expect(offerIsLive(offer(), NOW)).toBe(true);
    expect(offerIsLive(offer({ is_active: false }), NOW)).toBe(false);
    expect(offerIsLive(offer({ starts_at: '2026-08-21T00:00:00Z' }), NOW)).toBe(false);
    expect(offerIsLive(offer({ ends_at: '2026-08-20T11:00:00Z' }), NOW)).toBe(false);
  });
});

describe('claimDestination + safeLabPath', () => {
  it('vote offers deep-link the decision on the Lab', () => {
    expect(claimDestination(offer(), 'gb')).toBe('/gb/lab?d=dec-1');
  });
  it('content offers use the artist path only when it is a safe internal path', () => {
    expect(claimDestination(offer({ benefit_kind: 'content', destination_path: '/gb/track/abc' }), 'gb'))
      .toBe('/gb/track/abc');
    expect(claimDestination(offer({ benefit_kind: 'content', destination_path: 'https://evil.example' }), 'gb'))
      .toBe('/gb/lab');
    expect(claimDestination(offer({ benefit_kind: 'content', destination_path: '//evil.example' }), 'gb'))
      .toBe('/gb/lab');
  });
  it('recognition and missing-decision vote offers land on the Lab', () => {
    expect(claimDestination(offer({ benefit_kind: 'recognition' }), 'gb')).toBe('/gb/lab');
    expect(claimDestination(offer({ decision_id: null }), 'gb')).toBe('/gb/lab');
  });
  it('safeLabPath blocks protocol-relative, scheme, backslash and control tricks', () => {
    expect(safeLabPath('/ok/path')).toBe('/ok/path');
    expect(safeLabPath('//host')).toBeNull();
    expect(safeLabPath('/a\\b')).toBeNull();
    expect(safeLabPath('/a://b')).toBeNull();
    expect(safeLabPath('nope')).toBeNull();
  });
});

describe('isFreshSignup', () => {
  it('inside the 30 minute window counts, outside does not, garbage never throws', () => {
    expect(isFreshSignup('2026-08-20T11:45:00Z', NOW)).toBe(true);
    expect(isFreshSignup('2026-08-20T11:00:00Z', NOW)).toBe(false);
    expect(isFreshSignup(null, NOW)).toBe(false);
    expect(isFreshSignup('garbage', NOW)).toBe(false);
  });
});

describe('recognition boundary', () => {
  it('the disclaimer names every excluded right and carries no em dash', () => {
    for (const word of ['songwriting', 'production', 'ownership', 'publishing', 'royalties', 'approval', 'creative control']) {
      expect(RECOGNITION_DISCLAIMER.toLowerCase()).toContain(word);
    }
    expect(RECOGNITION_DISCLAIMER.includes('\u2014')).toBe(false);
  });
});
