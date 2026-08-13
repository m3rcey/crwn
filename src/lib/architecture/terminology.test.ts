// TERM-001: retired user-facing vocabulary must not reappear.
//
// The scan is deliberately NARROW: it matches only label/title/name string
// literals and JSX text, on comment-stripped source, so compatibility
// identifiers (hrefs, tourIds, legacyNames, route paths) and comments can
// never trip it. constraint/ownership.test.ts owns the original "Action Plan"
// scan (.tsx JSX); this suite extends coverage to .ts files and the other
// retired terms, driven by RETIRED_TERMS in the registry.
import { describe, it, expect } from 'vitest';
import { listSourceFiles, readStripped, violation } from './sourceScan';
import { RETIRED_TERMS } from './invariants';
import { TERMINOLOGY_EXCEPTIONS } from './exceptions';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

describe('TERM-001 — retired vocabulary stays retired', () => {
  const excepted = new Set(TERMINOLOGY_EXCEPTIONS.map(e => e.subject));
  const files = [...listSourceFiles('src/app'), ...listSourceFiles('src/components')].filter(
    f => !excepted.has(f),
  );

  it.each(RETIRED_TERMS.map(t => [t.term, t] as const))(
    'no user-facing surface says "%s"',
    (_term, entry) => {
      const e = esc(entry.term);
      // label:/title:/name: '<term>' (either quote), or JSX text >  <term>  <
      const pattern = new RegExp(
        `(?:label|title|name):\\s*['"\`][^'"\`]*${e}|>\\s*${e}\\s*<`,
        'i',
      );
      const offenders = files.filter(f => pattern.test(readStripped(f)));
      expect(
        offenders,
        violation(
          'TERM-001',
          `retired term "${entry.term}" reappeared in user-facing copy (${offenders.join(', ')}). Use "${entry.replacement}". ${entry.reason}`,
          { docs: 'docs/crwn-brain/02-FEATURE-MAP.md' },
        ),
      ).toEqual([]);
    },
  );

  it('the scan itself still sees user-facing string surfaces (positive control)', () => {
    // Vacuity guard: if label/title extraction breaks, every denylist check above passes while
    // examining nothing, and this fails first. The control was 'Needs You' until the 2026-08-13
    // surface reduction hid that tile; 'Offer Builder' is now a core, always-visible Studio and
    // AccountHub label, which makes it a more durable anchor than a hideable one.
    const pattern = /(?:label|title):\s*'Offer Builder'/;
    const seen = files.some(f => pattern.test(readStripped(f)));
    expect(seen, 'the label/title extraction no longer matches even the live "Offer Builder" label — the terminology scan is examining nothing').toBe(true);
  });
});
