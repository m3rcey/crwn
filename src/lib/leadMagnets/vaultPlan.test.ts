// The Vault keeps the artist's own facts, pinned after the 2026-09-19 audit.
//
// What the audit saw: 12 unreleased songs, 30 voice memos, monthly, $10 went in. The builder came
// back with demos, alternate versions, session photos and "every two weeks". "First five drops"
// listed two. A monthly plan still read week by week. And "100% ready" described a content count.
//
// The scenario below IS that scenario, run through the real generator and the real builder spec.

import { describe, expect, it } from 'vitest';
import { generateResult } from './resultGenerators';
import { getDeliverableSpec } from '@/lib/opportunityDrafts/deliverableSpecs';
import {
  VAULT_INVENTORY_TYPES,
  buildVaultSchedule,
  parseVaultInventory,
  parseVaultInventoryLines,
  planVaultDrops,
  readVaultInventory,
  replanOnCadenceChange,
  vaultDropPlanLines,
  vaultDropsTitle,
  vaultInventoryLines,
  vaultSuggestedTypes,
} from './vaultPlan';

const JAYLEN = { artistName: 'Jaylen', unreleasedSongs: 12, voiceMemos: 30, dropFrequency: 'monthly', monthlyPrice: 10, willingPrivate: true };
const spec = getDeliverableSpec('vault-revenue-planner')!;

const run = (v: Record<string, string | number | boolean>) => generateResult('vaultRevenuePlan', v);
const section = (r: ReturnType<typeof run>, key: string) => r.sections.find((s) => s.key === key)!;
const everyWord = (r: ReturnType<typeof run>) => JSON.stringify(r);

/** Content types Jaylen never entered. None of their words may appear anywhere in his plan. */
const NOT_ENTERED = /\bdemos?\b|alternate versions?|photos?|studio clips?|behind-the-scenes|lyric/i;

describe('inventory the artist entered is fact', () => {
  it('stays exactly 12 songs and 30 voice memos, from the result to the builder', () => {
    const r = run(JAYLEN);
    expect(section(r, 'inventory').items).toEqual(['12 unreleased songs', '30 voice memos']);

    const draft = spec.prefill(r.conversionPayload as Record<string, unknown>);
    expect(draft.categories).toEqual(['12 unreleased songs', '30 voice memos']);
  });

  it('never shows a content type the artist did not enter, anywhere in the result or the builder', () => {
    const r = run(JAYLEN);
    expect(everyWord(r)).not.toMatch(NOT_ENTERED);
    const draft = spec.prefill(r.conversionPayload as Record<string, unknown>);
    expect(JSON.stringify(draft)).not.toMatch(NOT_ENTERED);
  });

  it('offers unentered types only as unselected ideas, in help text', () => {
    const field = spec.steps.flatMap((s) => s.fields).find((f) => f.key === 'categories')!;
    expect(field.help).toMatch(/only for something you really have/);
    // Suggestions exist, and they are exactly the types Jaylen did not enter.
    const suggested = vaultSuggestedTypes(readVaultInventory(JAYLEN));
    expect(suggested).toContain('demos');
    expect(suggested).not.toContain('unreleased songs');
    expect(suggested).not.toContain('voice memos');
  });

  it('prefills nothing invented when the payload carries no inventory (a result saved before this fix)', () => {
    const draft = spec.prefill({ tierName: 'Gold', priceCents: 1000, cadence: 'monthly' });
    expect(draft.categories).toEqual([]);
    expect(draft.cadence).toBe('monthly');
    expect(spec.prefill({}).cadence).toBe(''); // no cadence is chosen FOR the artist
    expect(spec.prefill({}).dropPlan).toEqual([]);
  });

  it('rebuilds a trusted inventory from a stored payload: unknown keys and bad counts drop', () => {
    expect(parseVaultInventory([{ key: 'unreleasedSongs', count: 12 }, { key: 'madeUp', count: 9 }, { key: 'demos', count: -4 }, 'junk'])).toEqual([
      { key: 'unreleasedSongs', label: 'Unreleased songs', count: 12 },
    ]);
    expect(parseVaultInventory('nope')).toEqual([]);
  });
});

describe('the cadence the artist chose is the cadence', () => {
  it('carries monthly from the calculator through the result, the builder and the payload', () => {
    const r = run(JAYLEN);
    expect((r.conversionPayload as { cadence: string }).cadence).toBe('monthly');
    expect(section(r, 'offer').text).toMatch(/A monthly Vault, the cadence you chose/);
    expect(spec.prefill(r.conversionPayload as Record<string, unknown>).cadence).toBe('monthly');
  });

  it('never turns monthly into biweekly, for any inventory', () => {
    for (const songs of [1, 4, 12, 400]) {
      const r = run({ ...JAYLEN, unreleasedSongs: songs, voiceMemos: 0 });
      expect((r.conversionPayload as { cadence: string }).cadence).toBe('monthly');
      expect(everyWord(r)).not.toMatch(/biweekly|every two weeks/i);
    }
  });

  it('keeps a weekly choice weekly even on a short runway, and SAYS the runway is short', () => {
    // This used to be silently swapped for monthly or biweekly.
    const r = run({ ...JAYLEN, unreleasedSongs: 4, voiceMemos: 0, dropFrequency: 'weekly' });
    expect((r.conversionPayload as { cadence: string }).cadence).toBe('weekly');
    expect(section(r, 'offer').text).toMatch(/under two months of content/);
    expect(section(r, 'offer').text).toMatch(/The choice stays yours/);
  });

  it('gives a monthly Vault ONE drop in its first 30 days, and labels every other row as promotion', () => {
    const rows = section(run(JAYLEN), 'schedule').rows!;
    const dropRows = rows.filter((row) => !/Optional promotion, not a drop/.test(row.what));
    expect(dropRows).toHaveLength(1);
    expect(dropRows[0].what).toMatch(/1 unreleased song and 1 voice memo/);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows.filter((x) => x !== dropRows[0])) expect(row.what).toMatch(/^Optional promotion, not a drop/);
  });

  it('schedules four drops weekly, two biweekly, one monthly, one quarterly', () => {
    const drops = planVaultDrops(readVaultInventory(JAYLEN));
    const count = (c: 'weekly' | 'biweekly' | 'monthly' | 'quarterly') =>
      buildVaultSchedule(c, drops).filter((row) => !/Optional promotion/.test(row.what)).length;
    expect([count('weekly'), count('biweekly'), count('monthly'), count('quarterly')]).toEqual([4, 2, 1, 1]);
  });

  it('never schedules a drop the inventory cannot fill', () => {
    const drops = planVaultDrops([{ key: 'voiceMemos', label: 'Voice memos', count: 1 }]);
    expect(drops).toEqual(['1 voice memo']);
    expect(buildVaultSchedule('weekly', drops).filter((row) => !/Optional promotion/.test(row.what))).toHaveLength(1);
  });
});

describe('changing the cadence in the builder changes the schedule', () => {
  const draft = spec.prefill(run(JAYLEN).conversionPayload as Record<string, unknown>);

  it('monthly to biweekly regenerates the drop plan, deterministically', () => {
    const next = { ...draft, cadence: 'biweekly' };
    const derived = spec.derive!('cadence', draft, next, {})!;
    const plan = derived.dropPlan as string[];
    expect(plan).toEqual(vaultDropPlanLines('biweekly', planVaultDrops(parseVaultInventoryLines(draft.categories))));
    expect(plan.filter((l) => !/Optional promotion/.test(l))).toHaveLength(2);
    expect(plan).not.toEqual(draft.dropPlan);
    // Same edit, same answer.
    expect(spec.derive!('cadence', draft, next, {})).toEqual(derived);
  });

  it('works with no calculator payload, because the claimed builder after signup has none', () => {
    expect(spec.derive!('cadence', draft, { ...draft, cadence: 'weekly' }, {})).not.toBeNull();
  });

  it('leaves a plan the artist rewrote alone', () => {
    const edited = { ...draft, dropPlan: ['My own first drop, written by me'] };
    expect(spec.derive!('cadence', edited, { ...edited, cadence: 'weekly' }, {})).toBeNull();
    expect(replanOnCadenceChange(readVaultInventory(JAYLEN), 'monthly', 'weekly', ['mine'])).toBeNull();
  });

  it('only reacts to the cadence field', () => {
    expect(spec.derive!('tierName', draft, { ...draft, tierName: 'Jaylen Vault' }, {})).toBeNull();
  });

  it('reads a type the artist ADDED by hand, since adding it is them selecting it', () => {
    expect(parseVaultInventoryLines(['12 unreleased songs', '5 demos', 'some loose ideas', '1,200 voice memos'])).toEqual([
      { key: 'unreleasedSongs', label: 'Unreleased songs', count: 12 },
      { key: 'demos', label: 'Demos', count: 5 },
      { key: 'voiceMemos', label: 'Voice memos', count: 1200 },
    ]);
    // The builder's own lines round-trip, so the draft is a sufficient source on its own.
    expect(parseVaultInventoryLines(vaultInventoryLines(readVaultInventory(JAYLEN)))).toEqual(readVaultInventory(JAYLEN));
  });
});

describe('"first five drops" is five real drops, or it says how many there are', () => {
  it('gives Jaylen five, built only from songs and voice memos (he used to get two)', () => {
    const s = section(run(JAYLEN), 'firstFive');
    expect(s.title).toBe('First five drops');
    expect(s.items).toHaveLength(5);
    for (const item of s.items!) expect(item).toMatch(/^Drop \d: 1 unreleased song and 1 voice memo$/);
  });

  it('gives a one-type artist five as well (Marcus used to get one)', () => {
    const s = section(run({ artistName: 'Marcus', demos: 40, dropFrequency: 'weekly' }), 'firstFive');
    expect(s.title).toBe('First five drops');
    expect(s.items).toEqual([1, 2, 3, 4, 5].map((n) => `Drop ${n}: 2 demos`));
  });

  it('relabels honestly when the inventory cannot fill five', () => {
    const three = run({ artistName: 'A', unreleasedSongs: 3, dropFrequency: 'monthly' });
    expect(section(three, 'firstFive').title).toBe('Your first two drops');
    expect(section(three, 'firstFive').items).toEqual(['Drop 1: 2 unreleased songs', 'Drop 2: 1 unreleased song']);
    expect(three.summary).toMatch(/your first two drops/);
    expect(three.summary).not.toMatch(/first five/);

    const one = run({ artistName: 'A', voiceMemos: 1, dropFrequency: 'monthly' });
    expect(section(one, 'firstFive').title).toBe('Your first drop');
    expect(section(one, 'firstFive').items).toHaveLength(1);
  });

  it('never lists more pieces than the artist has', () => {
    for (const total of [1, 2, 3, 7, 9, 10, 50]) {
      const drops = planVaultDrops([{ key: 'demos', label: 'Demos', count: total }]);
      const used = drops.reduce((n, d) => n + Number(/^(\d+)/.exec(d)![1]), 0);
      expect(used).toBeLessThanOrEqual(total);
      expect(drops.length).toBe(Math.min(5, Math.ceil(total / 2)));
    }
    expect(vaultDropsTitle(5)).toBe('First five drops');
    expect(vaultDropsTitle(4)).toBe('Your first four drops');
  });

  it('does not call capture ideas "drops" for an artist with no content', () => {
    const r = run({ artistName: 'A', dropFrequency: 'monthly' });
    expect(section(r, 'firstFive').title).toBe('Five things you could capture first');
    expect((r.conversionPayload as { dropPlan: string[] }).dropPlan).toEqual([]);
  });
});

describe('readiness says what it measures', () => {
  it('calls the score content readiness, never launch readiness', () => {
    const r = run(JAYLEN);
    expect(r.headline).toBe('Jaylen, your Vault content is 100% ready');
    expect(r.headline).not.toMatch(/your Vault is \d+% ready/);
    expect(section(r, 'readiness').title).toBe('Your Vault content readiness');
    expect(section(r, 'readiness').scoreLabel).toBe('Enough content to start');
    expect(everyWord(r)).not.toMatch(/Ready to launch/);
    expect(section(r, 'assumptions').items!.join(' ')).toMatch(/measures your content and your runway only/);
  });

  it('did not change the scoring itself', () => {
    // 42 items -> 60, willing -> 20, runway >= 2 months -> 20.
    expect(section(run(JAYLEN), 'readiness').score).toBe(100);
    expect(section(run({ ...JAYLEN, willingPrivate: false }), 'readiness').score).toBe(85);
    // 4 items -> 6, not willing -> 5, under a month of weekly runway -> 0.
    expect(section(run({ artistName: 'A', unreleasedSongs: 4, dropFrequency: 'weekly' }), 'readiness').score).toBe(11);
  });
});

describe('house rules', () => {
  it('writes no em dash or en dash', () => {
    expect(everyWord(run(JAYLEN))).not.toMatch(/[—–]/);
    expect(JSON.stringify(spec.prefill(run(JAYLEN).conversionPayload as Record<string, unknown>))).not.toMatch(/[—–]/);
  });

  it('keeps every inventory key the calculator asks, so stored answers still read', () => {
    expect(VAULT_INVENTORY_TYPES.map((t) => t.key)).toEqual([
      'unreleasedSongs', 'demos', 'voiceMemos', 'studioClips', 'btsVideos', 'lyricSheets', 'altVersions', 'archivedPhotos',
    ]);
  });
});
