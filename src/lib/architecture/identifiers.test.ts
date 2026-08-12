// ID-001/004/006: compatibility identifiers that must never be casually renamed.
// Each freeze is append-only: adding is fine, renaming or removing breaks
// history keyed to the identifier (funnel rows, popup frequency state, tour
// dismissals, deployed clients).
import { describe, it, expect } from 'vitest';
import { FUNNEL_STAGES } from '../analytics/funnelEvents';
import { POPUPS } from '../popups/registry';
import {
  FROZEN_FUNNEL_STAGES,
  FROZEN_POPUP_KEYS,
  FROZEN_TOUR_IDS,
  COMPATIBILITY_ROUTES,
} from './invariants';
import { existsSync, listSourceFiles, readStripped, violation } from './sourceScan';

describe('ID-001 — funnel stages are append-only', () => {
  it('every frozen stage survives, in order, at the front of FUNNEL_STAGES', () => {
    expect(
      FUNNEL_STAGES.slice(0, FROZEN_FUNNEL_STAGES.length),
      violation(
        'ID-001',
        'FUNNEL_STAGES changed a frozen stage name or order. Historical funnel_events rows and the funnel_events CHECK are keyed to these; append new stages, never rename or remove. If a stage was deliberately added mid-list, update FROZEN_FUNNEL_STAGES in the registry in the same change.',
        { owner: 'src/lib/analytics/funnelEvents.ts', docs: 'docs/crwn-brain/13-CURRENT-STATE.md' },
      ),
    ).toEqual([...FROZEN_FUNNEL_STAGES]);
  });
});

describe('ID-004 — pop-up keys are frozen', () => {
  it('every frozen key still exists in the registry', () => {
    const keys = new Set(POPUPS.map(p => p.key));
    const missing = FROZEN_POPUP_KEYS.filter(k => !keys.has(k));
    expect(
      missing,
      violation(
        'ID-004',
        `pop-up key(s) renamed or removed: ${missing.join(', ')}. popup_events history and every user's frequency caps are keyed to these; a renamed key re-fires the pop-up for every user who dismissed it. Retire a pop-up by removing its targeting, not its key — or update FROZEN_POPUP_KEYS with the founder-visible reason.`,
        { owner: 'src/lib/popups/registry.ts' },
      ),
    ).toEqual([]);
  });

  it('new pop-up keys get frozen too (the freeze list tracks the registry)', () => {
    const frozen = new Set(FROZEN_POPUP_KEYS);
    const unfrozen = POPUPS.map(p => p.key).filter(k => !frozen.has(k));
    expect(
      unfrozen,
      `new pop-up key(s) not yet in FROZEN_POPUP_KEYS: ${unfrozen.join(', ')}. Add them to the registry freeze so a later rename cannot reset their frequency history.`,
    ).toEqual([]);
  });
});

describe('ID-006 — tour persistence ids and compatibility routes', () => {
  it('every frozen tourId still exists somewhere in source', () => {
    const files = listSourceFiles('src');
    for (const id of FROZEN_TOUR_IDS) {
      const found = files.some(f => readStripped(f).includes(`tourId: '${id}'`) || readStripped(f).includes(`data-tour="${id}"`));
      expect(
        found,
        violation('ID-006', `tourId '${id}' vanished. Tour dismissal state persists under this id; renaming it replays the tour for everyone.`, {
          docs: 'docs/crwn-brain/02-FEATURE-MAP.md',
        }),
      ).toBe(true);
    }
  });

  it('every compatibility route survives', () => {
    for (const r of COMPATIBILITY_ROUTES) {
      expect(
        existsSync(r.path),
        violation('ID-006', `compatibility path ${r.path} was deleted. Reason it exists: ${r.reason}`),
      ).toBe(true);
    }
  });
});
