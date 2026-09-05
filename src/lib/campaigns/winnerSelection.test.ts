import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { canRecordWinner } from './winnerSelection';
import { CAMPAIGN_STATUSES } from './lifecycle';

describe('when a winner may be recorded', () => {
  it('REFUSES while entries are still open', () => {
    // The fairness property: a selection made from a list that is still growing could exclude
    // someone who entered legitimately a minute later.
    const g = canRecordWinner('active');
    expect(g.ok).toBe(false);
    expect(g.refusal).toBe('entries_still_open');
    expect(g.reason).toMatch(/End the campaign first/);
  });

  it('REFUSES a draft, which has no entrants at all', () => {
    expect(canRecordWinner('draft')).toMatchObject({ ok: false, refusal: 'campaign_never_ran' });
  });

  it('allows ENDED, the spine\'s own name for "entries are closed"', () => {
    expect(canRecordWinner('ended').ok).toBe(true);
  });

  it('allows ARCHIVED: tidying a finished campaign away does not un-win it', () => {
    expect(canRecordWinner('archived').ok).toBe(true);
  });

  it('covers every campaign status, so a new one cannot silently become permissive', () => {
    for (const s of CAMPAIGN_STATUSES) {
      const g = canRecordWinner(s);
      expect(typeof g.ok).toBe('boolean');
      if (!g.ok) expect(g.reason).toBeTruthy();
    }
    expect(CAMPAIGN_STATUSES.filter((s) => canRecordWinner(s).ok).sort()).toEqual(['archived', 'ended']);
  });
});

describe('CRWN records a winner and never chooses one', () => {
  /**
   * Scans CODE, never comments. The first version of this failed on its own header, which says
   * CRWN never "shuffles" anything: a prose ban on a mechanism is not the mechanism.
   */
  const codeOf = (file: string) =>
    readFileSync(new URL(file, import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => {
        const t = l.trim();
        return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
      })
      .join('\n');

  const src = codeOf('./winnerSelection.ts');
  const store = codeOf('./store.ts');

  it('the selection module contains no randomness of any kind', () => {
    // Mutation-tested 2026-09-04: adding Math.random() to winnerSelection.ts failed this,
    // reverted, green. The boundary is architectural, so it is asserted rather than trusted.
    for (const forbidden of ['Math.random', 'randomUUID', 'randomInt', 'crypto.getRandomValues', 'shuffle', 'sort(']) {
      expect(src, `winner selection must not use ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('recording a winner never reads spend, tier or rank', () => {
    const recorder = store.slice(store.indexOf('export async function recordCampaignWinner'));
    const body = recorder.slice(0, recorder.indexOf('\nexport '));
    for (const forbidden of ['price', 'amount', 'tier_id', 'earnings', 'rank', 'weight', 'Math.random']) {
      expect(body, `recordCampaignWinner must not consider ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('a winner is recorded by UPDATING an existing participation, never by inserting one', () => {
    // Someone who never entered cannot be made to have entered by winning.
    const recorder = store.slice(store.indexOf('export async function recordCampaignWinner'));
    const body = recorder.slice(0, recorder.indexOf('\nexport '));
    expect(body).toContain('.update(');
    expect(body).not.toContain('.insert(');
    expect(body).not.toContain('.upsert(');
  });
});
