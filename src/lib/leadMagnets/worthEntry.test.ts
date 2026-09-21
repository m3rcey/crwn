// `/worth?listeners=N` must land on N.
//
// The defect (fixed 2026-09-20): every prefilled outreach link showed the generic 150,000 default
// in the field and computed the result from it. Reproduced in a browser at commit 2cacf8f4 for
// 4,000 / 20,000 / 250,000: all three rendered "1 Your audience 150,000 listeners".
//
// The cause was ORDERING, not parsing. The query was read in a client effect, which runs after the
// first render, while the entry wizard snapshots `initialValues` on its first render and ignores
// later props. So the tests that matter are both kinds: the parsing contract, and the source-level
// guarantee that the value is known on the first render.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { WORTH_ENTRY_INPUTS, WORTH_QUERY_ALIASES, worthPrefillFromQuery } from './worthEntry';
import { calculate, getAssumptions } from '@/lib/leadCalculator';

const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const component = () => read('app/(public)/worth/WorthExperience.tsx');
const page = () => read('app/(public)/worth/page.tsx');

/** Exactly how the page turns its listener STRING into the model's number. */
const asModelInput = (listeners: string) => ({
  monthlyListeners: parseInt(listeners.replace(/\D/g, ''), 10) || 0,
  engagedFollowers: 0,
  currentStreamingCents: 0,
});

describe('a valid ?listeners= is honored', () => {
  it.each([4_000, 20_000, 250_000])('?listeners=%d prefills that exact number', (n) => {
    expect(worthPrefillFromQuery({ listeners: String(n) })?.listeners).toBe(String(n));
  });

  it('prefills followers and streaming under their frozen URL names', () => {
    const p = worthPrefillFromQuery({ listeners: '4000', followers: '20000', streaming: '150.50' });
    expect(p).toEqual({ listeners: '4000', followers: '20000', streaming: '150.5' });
  });

  it('accepts a URLSearchParams and a server searchParams record identically', () => {
    const expected = { listeners: '4000' };
    expect(worthPrefillFromQuery(new URLSearchParams('listeners=4000'))).toEqual(expected);
    expect(worthPrefillFromQuery({ listeners: '4000' })).toEqual(expected);
    // A repeated param arrives as an array; the first wins, as URLSearchParams.get does.
    expect(worthPrefillFromQuery({ listeners: ['4000', '99'] })).toEqual(expected);
  });

  it('strips the thousands separators a human pastes', () => {
    expect(worthPrefillFromQuery({ listeners: '250,000' })?.listeners).toBe('250000');
  });
});

describe('the 150,000 default cannot win over an explicit value', () => {
  it('is only reached when no valid prefill exists', () => {
    // The page state seeds from the prefill FIRST and falls back to the default, and that default
    // appears exactly once, in that one expression.
    const src = component();
    expect(src).toContain("useState(prefill?.listeners || '150000')");
    expect(src.match(/150000/g)).toHaveLength(1);
  });

  it('is known on the FIRST render: the server reads the query and passes it as prefill', () => {
    // The whole defect. `page.tsx` must resolve the prefill before the component renders.
    expect(page()).toContain('worthPrefillFromQuery(await searchParams)');
    expect(page()).toContain('<WorthExperience prefill={prefill} />');
  });

  it('never reads the query in a client effect again, which is what arrived too late', () => {
    const src = component();
    expect(src).not.toMatch(/new URLSearchParams\(window\.location\.search\)/);
    expect(src).not.toMatch(/params\.get\('listeners'\)/);
    expect(src).not.toMatch(/setListeners\(l\./);
  });

  it('seeds the entry wizard from that same first-render state', () => {
    // `LeadMagnetWizard` snapshots `initialValues` in a useState initializer, so this prop is only
    // ever read once. It must therefore already hold the artist's number.
    expect(component()).toContain('monthly_listeners: Number(listeners) || undefined');
    expect(readFileSync(join(__dirname, '..', '..', 'components/lead-magnets/LeadMagnetWizard.tsx'), 'utf8'))
      .toContain('if (initialValues) return initialValues;');
  });
});

describe('a plain /worth visit is unchanged', () => {
  it('gets no prefill at all, so the component keeps its own defaults', () => {
    for (const raw of [undefined, null, {}, new URLSearchParams()]) {
      expect(worthPrefillFromQuery(raw)).toBeUndefined();
    }
  });

  it('ignores params that are not the frozen prefill names', () => {
    expect(worthPrefillFromQuery({ utm_source: 'instagram', from: 'worth', result: 'tok' })).toBeUndefined();
    // A config KEY is not a public URL name: only the frozen aliases are read.
    expect(worthPrefillFromQuery({ monthly_listeners: '4000' })).toBeUndefined();
  });
});

describe('an invalid value fails safe: no prefill, never a crash or a malformed result', () => {
  it.each([
    ['empty', ''],
    ['whitespace', '   '],
    ['alphabetic', 'abc'],
    ['negative', '-5'],
    ['infinity', 'Infinity'],
    ['NaN', 'NaN'],
    ['null byte', '\u0000'],
    ['injection-shaped', '<script>alert(1)</script>'],
    ['over the field max', '100000001'],
    ['scientific notation over the max', '1e9'],
  ])('%s is ignored', (_label, value) => {
    expect(worthPrefillFromQuery({ listeners: value })?.listeners).toBeUndefined();
  });

  it('keeps the valid half of a half-broken link', () => {
    expect(worthPrefillFromQuery({ listeners: '4000', followers: 'abc' })).toEqual({ listeners: '4000' });
  });

  it('accepts the boundary values the field itself accepts', () => {
    expect(worthPrefillFromQuery({ listeners: '0' })?.listeners).toBe('0');
    expect(worthPrefillFromQuery({ listeners: '100000000' })?.listeners).toBe('100000000');
    expect(worthPrefillFromQuery({ streaming: '1000000' })?.streaming).toBe('1000000');
    expect(worthPrefillFromQuery({ streaming: '1000001' })?.streaming).toBeUndefined();
  });

  it('validates against the field\'s OWN bounds, so a limit is never invented here', () => {
    const listeners = WORTH_ENTRY_INPUTS.find((i) => i.key === 'monthly_listeners')!;
    expect(listeners.max).toBe(100000000);
    expect(worthPrefillFromQuery({ listeners: String(listeners.max) })?.listeners).toBe(String(listeners.max));
    expect(worthPrefillFromQuery({ listeners: String((listeners.max as number) + 1) })?.listeners).toBeUndefined();
  });
});

describe('URL prefill and manual entry are the same input', () => {
  it.each([4_000, 20_000, 250_000])('%d typed by hand and %d in the link produce identical results', (n) => {
    // Manual entry: the wizard hands back a number, the page stores String(n).
    const manual = asModelInput(String(n));
    // URL: the server prefill seeds the same page state.
    const prefilled = asModelInput(worthPrefillFromQuery({ listeners: String(n) })!.listeners!);
    expect(prefilled).toEqual(manual);

    const a = calculate(manual, getAssumptions('conservative'));
    const b = calculate(prefilled, getAssumptions('conservative'));
    expect(b).toEqual(a);
    expect(prefilled.monthlyListeners).toBe(n);
  });

  it('normalizes a formatted link value to what typing it would give', () => {
    expect(asModelInput(worthPrefillFromQuery({ listeners: '250,000' })!.listeners!)).toEqual(asModelInput('250000'));
  });
});

describe('the questions and their URL names are single-sourced', () => {
  it('the component builds its wizard from the shared questions, not a second copy', () => {
    const src = component();
    expect(src).toContain('inputs: WORTH_ENTRY_INPUTS');
    // The old inline copy, whose bounds could drift from the validator's.
    expect(src).not.toContain("key: 'monthly_listeners'");
  });

  it('keeps the frozen public URL names', () => {
    expect(WORTH_QUERY_ALIASES).toEqual({
      listeners: 'monthly_listeners',
      followers: 'followers',
      streaming: 'streaming_revenue',
    });
    // Every alias points at a real question, or a link would seed a field that does not exist.
    for (const key of Object.values(WORTH_QUERY_ALIASES)) {
      expect(WORTH_ENTRY_INPUTS.some((i) => i.key === key)).toBe(true);
    }
  });

  it('carries no prefill for the proof question, which no link has ever set', () => {
    expect(Object.values(WORTH_QUERY_ALIASES)).not.toContain('monetization_status');
    expect(worthPrefillFromQuery({ monetization_status: 'direct_established' })).toBeUndefined();
  });
});
