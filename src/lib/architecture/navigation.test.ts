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
    // Vacuity guard, not a size target. It only asserts this scan is looking at something: if
    // the card shape changes and the regex stops matching, `missing` would be [] and the parity
    // check would pass while proving nothing. Lowered from 10 on 2026-08-13 when the founder cut
    // the grid to its five core destinations (Music, Albums, Shop, Offer Builder, Live).
    expect(hrefs.length, 'no href literals found in the Studio grid — the card shape changed and this scan is examining nothing').toBeGreaterThanOrEqual(5);

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

describe('NAV-003 — nav slots say what they open, and surviving slots keep their tour anchors', () => {
  // Rewritten 2026-08-13 with the pre-PMF surface reduction. The fan slot was Missions ->
  // /command; the whole fan mission economy is now hidden, and the fan's money lives on /library
  // (ReferralDashboard). The PROPERTY this guards is unchanged: a fan looking for their
  // commission must not be sent somewhere else, and a slot that survives must not have its
  // tourId renamed underneath people who already dismissed the tour.
  it('the fan slot is Library -> /library, the surviving money surface', () => {
    const nav = readStripped(NAV);
    expect(nav, violation('NAV-003', "the fan nav slot must open '/library', which mounts ReferralDashboard (Share-to-Earn earnings + cashout)")).toContain("href: '/library'");
    expect(nav, violation('NAV-003', "the fan nav slot must be labelled for what it opens")).toContain("label: 'Library'");
  });

  it('surviving slots keep their persistence keys', () => {
    const nav = readStripped(NAV);
    for (const tourId of ['nav-home', 'nav-studio', 'nav-rise', 'nav-library']) {
      expect(
        nav,
        violation('NAV-003', `tourId '${tourId}' is a persistence key; renaming it replays the tour for everyone who dismissed it`),
      ).toContain(`tourId: '${tourId}'`);
    }
  });

  it('a retired anchor is not silently reused for a different destination', () => {
    // 'nav-explore', 'nav-messages' and 'nav-earn' are no longer rendered. Reusing one of those
    // ids on a NEW slot would replay a dismissed tour step pointing at the wrong thing.
    const nav = readStripped(NAV);
    for (const retired of ['nav-explore', 'nav-messages', 'nav-earn']) {
      expect(nav, violation('NAV-003', `retired tour anchor '${retired}' was reused`)).not.toContain(`tourId: '${retired}'`);
    }
  });
});
