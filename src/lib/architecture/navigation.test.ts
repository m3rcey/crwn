// NAV-001/002/003: navigation ownership.
//
// Studio, AccountHub and the bottom nav are three private hardcoded arrays in
// three component files (none exported, and vitest runs node-env so importing
// the components is not an option). Source-text parity is the deliberate
// mechanism. F-10 (Royalty Readiness missing from the hub) is the incident
// this suite exists to prevent.
import { describe, it, expect } from 'vitest';
import { readStripped, violation } from './sourceScan';
import { FAN_HUB_DESTINATIONS } from './invariants';
import { STUDIO_HUB_PARITY_EXCEPTIONS } from './exceptions';

const STUDIO = 'src/app/(main)/studio/page.tsx';
const HUB = 'src/components/layout/AccountHub.tsx';
const NAV = 'src/components/layout/Navigation.tsx';

describe('NAV-001 — every Studio destination appears in the AccountHub complete index', () => {
  it('Studio -> Hub parity holds (or the gap is a registered exception)', () => {
    const studio = readStripped(STUDIO);
    const hub = readStripped(HUB);
    const hrefs = [...studio.matchAll(/href:\s*'([^']+)'/g)].map(m => m[1]);
    expect(hrefs.length, 'no href literals found in the Studio grid — the card shape changed and this scan is examining nothing').toBeGreaterThan(10);

    const excepted = new Set(STUDIO_HUB_PARITY_EXCEPTIONS.map(e => e.subject));
    const missing = [...new Set(hrefs)].filter(h => !excepted.has(h) && !hub.includes(`href: '${h}'`));
    expect(
      missing,
      violation(
        'NAV-001',
        `Studio destination(s) missing from AccountHub: ${missing.join(', ')}. The hamburger is the COMPLETE index — an artist who learned the old tabs must find every destination there. Add the entry (with hub: true if it is a connector page), or register an exception with a reason.`,
        { file: HUB, docs: 'CLAUDE.md (Navigation — three surfaces, one rule each)' },
      ),
    ).toEqual([]);
  });

  it('stale parity exceptions are detected', () => {
    const hub = readStripped(HUB);
    for (const e of STUDIO_HUB_PARITY_EXCEPTIONS) {
      expect(
        hub.includes(`href: '${e.subject}'`),
        `${e.subject} is excepted from hub parity but IS in the hub — remove the stale exception`,
      ).toBe(false);
    }
  });
});

describe('NAV-002 — the fan hub indexes the canonical fan destinations (F-08/F-12)', () => {
  it('fans can reach their money and commitments from the hamburger', () => {
    const hub = readStripped(HUB);
    for (const dest of FAN_HUB_DESTINATIONS) {
      expect(
        hub.includes(`'${dest}'`),
        violation('NAV-002', `fan destination ${dest} lost its AccountHub entry. A fan who earned a commission or owes a mission must be able to navigate to it.`, {
          file: HUB,
        }),
      ).toBe(true);
    }
  });
});

describe('NAV-003 — nav slots say what they open', () => {
  it('the fan slot is Missions -> /command with its stable tour anchor', () => {
    const nav = readStripped(NAV);
    expect(nav, violation('NAV-003', "the fan nav slot must keep href '/command'")).toContain("href: '/command'");
    expect(nav, violation('NAV-003', "the fan nav slot label regressed from 'Missions' (F-08: a fan looking for money must not land on missions unlabeled)")).toContain("label: 'Missions'");
    expect(nav, violation('NAV-003', "tourId 'nav-earn' is a persistence key; renaming it replays the tour for everyone who dismissed it")).toContain("tourId: 'nav-earn'");
  });
});
