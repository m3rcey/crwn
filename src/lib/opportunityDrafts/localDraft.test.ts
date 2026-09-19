// Draft continuity, pinned after the 2026-09-19 audit.
//
// What the audit saw, in one shared browser: a new Proof of Demand result opened an earlier
// listening-session builder, a new Own Your Fans builder opened on someone else's hoodie copy, and
// a new Vault opened on an earlier Vault's name and inventory. The cause was a local draft keyed by
// TOOL ONLY, restored into whatever result was on screen, SERVER TOKEN INCLUDED.
//
// These tests drive the real decision functions over a fake Storage, the same calls the two
// builders make, so the scenarios below are the audit's scenarios and not a paraphrase of them.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  OYF_DRAFT_KEY,
  clearLocalDrafts,
  decideRestore,
  deliverableDraftKey,
  earlierDraftKey,
  openLocalDraft,
  resultFingerprint,
  resumeEarlierDraft,
  writeLocalDraft,
} from './localDraft';

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    get length() {
      return map.size;
    },
    dump: () => Object.fromEntries(map),
  };
}

const VAULT = 'vault-revenue-planner';
const DEMAND = 'proof-of-demand-test-builder';
const jaylen = { tierName: 'Gold', priceCents: 1000, cadence: 'monthly', inventory: [{ key: 'unreleasedSongs', count: 12 }] };
const marcus = { tierName: 'Gold', priceCents: 2500, cadence: 'weekly', inventory: [{ key: 'demos', count: 40 }] };

describe('a result has one identity', () => {
  it('is the same for the same answers, whatever order the keys arrive in', () => {
    const a = resultFingerprint(VAULT, { cadence: 'monthly', priceCents: 1000, nested: { x: 1, y: [1, 2] } });
    const b = resultFingerprint(VAULT, { nested: { y: [1, 2], x: 1 }, priceCents: 1000, cadence: 'monthly' });
    expect(a).toBe(b);
  });

  it('changes when any answer changes, and differs between tools', () => {
    expect(resultFingerprint(VAULT, jaylen)).not.toBe(resultFingerprint(VAULT, marcus));
    expect(resultFingerprint(VAULT, jaylen)).not.toBe(resultFingerprint(VAULT, { ...jaylen, priceCents: 1100 }));
    expect(resultFingerprint(VAULT, jaylen)).not.toBe(resultFingerprint(DEMAND, jaylen));
  });
});

describe('result A opens its own builder', () => {
  it('restores the draft built from this result, token included, after a refresh', () => {
    const s = fakeStorage();
    const origin = resultFingerprint(VAULT, jaylen);
    writeLocalDraft(s, deliverableDraftKey(VAULT), origin, 'tok-jaylen', { values: { tierName: 'Jaylen Vault' } });
    const opened = openLocalDraft(s, deliverableDraftKey(VAULT), origin);
    expect(opened.restore?.token).toBe('tok-jaylen');
    expect(opened.restore?.values).toEqual({ tierName: 'Jaylen Vault' });
    expect(opened.earlier).toBeNull();
  });
});

describe('result B in the same browser never opens result A', () => {
  it('does not restore the earlier draft, and does not inherit its server token', () => {
    const s = fakeStorage();
    const key = deliverableDraftKey(VAULT);
    writeLocalDraft(s, key, resultFingerprint(VAULT, jaylen), 'tok-jaylen', { values: { tierName: 'Jaylen Vault' } });

    const opened = openLocalDraft(s, key, resultFingerprint(VAULT, marcus));
    // The audit failure: this used to return Jaylen's values AND Jaylen's token.
    expect(opened.restore).toBeNull();
    // It is not destroyed either. It is set aside, offered by name, and out of the live slot.
    expect(opened.earlier?.values).toEqual({ tierName: 'Jaylen Vault' });
    expect(s.getItem(key)).toBeNull();
    expect(s.getItem(earlierDraftKey(key))).toContain('Jaylen Vault');
  });

  it('gives the new result its own slot, so its first keystroke cannot overwrite the earlier draft', () => {
    const s = fakeStorage();
    const key = deliverableDraftKey(VAULT);
    const marcusOrigin = resultFingerprint(VAULT, marcus);
    writeLocalDraft(s, key, resultFingerprint(VAULT, jaylen), 'tok-jaylen', { values: { tierName: 'Jaylen Vault' } });
    openLocalDraft(s, key, marcusOrigin);
    // Marcus types. No token yet, so the builder POSTs a NEW row instead of PUTting Jaylen's.
    writeLocalDraft(s, key, marcusOrigin, null, { values: { tierName: 'Marcus Private Vault' } });

    expect(JSON.parse(s.getItem(key)!)).toMatchObject({ token: null, values: { tierName: 'Marcus Private Vault' } });
    expect(JSON.parse(s.getItem(earlierDraftKey(key))!)).toMatchObject({ token: 'tok-jaylen', values: { tierName: 'Jaylen Vault' } });
  });

  it('keeps different tools apart', () => {
    const s = fakeStorage();
    writeLocalDraft(s, deliverableDraftKey(VAULT), resultFingerprint(VAULT, jaylen), 'tok-v', { values: { tierName: 'Jaylen Vault' } });
    const opened = openLocalDraft(s, deliverableDraftKey(DEMAND), resultFingerprint(DEMAND, { title: 'Hoodie drop' }));
    expect(opened.restore).toBeNull();
    expect(opened.earlier).toBeNull();
  });

  it('treats a draft stored before origins existed as earlier, never as this result', () => {
    const key = deliverableDraftKey(DEMAND);
    const s = fakeStorage({ [key]: JSON.stringify({ token: 'tok-old', values: { title: 'Listening session' } }) });
    const opened = openLocalDraft(s, key, resultFingerprint(DEMAND, { title: 'Hoodie drop' }));
    expect(opened.restore).toBeNull();
    expect(opened.earlier?.values).toEqual({ title: 'Listening session' });
  });

  it('applies the same rule to the Own Your Fans slot, which had no scoping at all', () => {
    const s = fakeStorage();
    const tasha = resultFingerprint('own-your-fans', { artistName: 'Tasha', inputs: { social_followers: 40000 } });
    const marcusOyf = resultFingerprint('own-your-fans', { artistName: 'Marcus', inputs: { social_followers: 40000 } });
    expect(tasha).not.toBe(marcusOyf); // same follower count must not collide
    writeLocalDraft(s, OYF_DRAFT_KEY, tasha, 'tok-tasha', { draft: { headline: 'Cop the hoodie first' } });
    const opened = openLocalDraft(s, OYF_DRAFT_KEY, marcusOyf);
    expect(opened.restore).toBeNull();
    expect(opened.earlier?.draft).toEqual({ headline: 'Cop the hoodie first' });
  });

  it('ignores malformed storage instead of restoring garbage', () => {
    expect(decideRestore('{not json', 'x').kind).toBe('none');
    expect(decideRestore('[]', 'x').kind).toBe('none');
    expect(decideRestore(null, 'x').kind).toBe('none');
  });
});

describe('the earlier draft is resumed only by choice, and the choice destroys nothing', () => {
  it('swaps the two drafts when the artist had already started the new one', () => {
    const s = fakeStorage();
    const key = deliverableDraftKey(VAULT);
    const marcusOrigin = resultFingerprint(VAULT, marcus);
    writeLocalDraft(s, key, resultFingerprint(VAULT, jaylen), 'tok-jaylen', { values: { tierName: 'Jaylen Vault' } });
    openLocalDraft(s, key, marcusOrigin);

    const resumed = resumeEarlierDraft(s, key, marcusOrigin, { token: 'tok-marcus', payload: { values: { tierName: 'Marcus Private Vault' } } });
    expect(resumed).toMatchObject({ token: 'tok-jaylen', values: { tierName: 'Jaylen Vault' } });
    // The resumed draft is now bound to the result on screen, so a refresh restores it.
    expect(openLocalDraft(s, key, marcusOrigin).restore?.values).toEqual({ tierName: 'Jaylen Vault' });
    // And the displaced draft, which had a server row, is still there.
    expect(s.getItem(earlierDraftKey(key))).toContain('Marcus Private Vault');
  });

  it('returns null when there is nothing to resume', () => {
    expect(resumeEarlierDraft(fakeStorage(), deliverableDraftKey(VAULT), 'o', null)).toBeNull();
  });
});

describe('the account boundary: signed out, or claimed, leaves nothing for the next person', () => {
  it('clears every builder draft and nothing else', () => {
    const s = fakeStorage({
      [deliverableDraftKey(VAULT)]: '{}',
      [earlierDraftKey(deliverableDraftKey(VAULT))]: '{}',
      [deliverableDraftKey(DEMAND)]: '{}',
      [OYF_DRAFT_KEY]: '{}',
      [earlierDraftKey(OYF_DRAFT_KEY)]: '{}',
      crwn_invite: 'keep-me',
      'lm:worth:public': 'keep-me-too',
    });
    expect(clearLocalDrafts(s)).toBe(5);
    expect(s.dump()).toEqual({ crwn_invite: 'keep-me', 'lm:worth:public': 'keep-me-too' });
  });

  it('is what account A leaves behind for account B: an empty slot, so B starts from B', () => {
    const s = fakeStorage();
    const key = deliverableDraftKey(VAULT);
    writeLocalDraft(s, key, resultFingerprint(VAULT, jaylen), 'tok-jaylen', { values: { tierName: 'Jaylen Vault' } });
    clearLocalDrafts(s); // A signs out, or A's draft was claimed into A's account
    // Even with IDENTICAL answers (the one case a fingerprint cannot tell apart), B gets nothing.
    const opened = openLocalDraft(s, key, resultFingerprint(VAULT, jaylen));
    expect(opened.restore).toBeNull();
    expect(opened.earlier).toBeNull();
  });
});

describe('both builders and the auth boundary actually use this module', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

  it('restores through openLocalDraft and writes through writeLocalDraft, never raw storage', () => {
    for (const file of ['components/opportunity/DeliverableBuilder.tsx', 'components/opportunity/FanCaptureBuilder.tsx']) {
      const src = read(file);
      expect(src, file).toContain('openLocalDraft(localStorage');
      expect(src, file).toContain('writeLocalDraft(localStorage');
      // The old pattern: read the slot and trust it. Any direct read or write is the bug returning.
      expect(src, file).not.toMatch(/localStorage\.(getItem|setItem)\(/);
      // A dead token (claimed or expired row) must fall through to creating a fresh draft.
      expect(src, file).toMatch(/res\.status !== 404/);
    }
  });

  it('forgets local drafts on sign-out and after a real claim', () => {
    const src = read('hooks/useAuth.tsx');
    expect(src).toContain('clearLocalDrafts(localStorage)');
    expect(src).toMatch(/if \(!error\) forgetLocalDrafts\(\)/);
    expect(src).toMatch(/\(j\.claimed \?\? 0\) > 0\) forgetLocalDrafts\(\)/);
  });
});
