import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { POPUPS, type PopupDef } from './popups/registry';

// THE NEXT-MOVE POP-UP (key `artist_resume_rise`, frozen).
//
// "Do the one thing that matters, without opening Rise Mode." It brings the canonical next move
// to whatever page the artist is already on.
//
// WHAT IT STOPPED BEING, 2026-08-20. It used to name a part-done QUEST and open /quests. On a
// real account that was incoherent twice: it named "Complete Your Artist Destination" while Rise
// Mode named "Complete your public profile" and reported the launch gate as the real blocker, and
// its CTA opened the XP board that the 2026-08-13 pre-PMF reduction had deliberately hidden. Two
// systems naming two different next moves is exactly the collage that reduction deleted.
//
// THE RULE THESE TESTS HOLD: there is ONE next move, and this pop-up renders it verbatim. It may
// never rank, diagnose, or issue anything. The key stays frozen (popup_events history and every
// artist's frequency caps are keyed to it), which is why a pop-up about the next move is still
// called `artist_resume_rise`.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'));
const POPUP_API = read('src/app/api/popups/route.ts');
const POPUP_HOST = read('src/components/popups/PopupHost.tsx');
const RISE_MODE = read('src/app/(main)/profile/artist/page.tsx');
const REGISTRY_RAW = readFileSync('src/lib/popups/registry.ts', 'utf8');

const move = POPUPS.find((p) => p.key === 'artist_resume_rise')!;
const stripe = POPUPS.find((p) => p.key === 'artist_connect_stripe')!;
const broadcast = POPUPS.find((p) => p.key === 'artist_first_broadcast')!;

// `cta` is OPTIONAL on PopupDef, and legitimately so: a survey pop-up has no CTA. This pop-up's
// entire job is to send the artist somewhere, so a missing CTA is a real product defect rather
// than a typing detail. Assert it where it is read, so the failure names the pop-up instead of
// surfacing as a TypeError on an undefined property.
function requireCta(p: PopupDef): NonNullable<PopupDef['cta']> {
  expect(p.cta, `${p.key} must define a CTA`).toBeDefined();
  if (!p.cta) throw new Error(`${p.key} has no CTA`);
  return p.cta;
}

describe('one next move: the pop-up and Rise Mode cannot disagree', () => {
  it('resolves through the SAME two resolvers Rise Mode uses', () => {
    for (const fn of ['resolveOperatingFlow', 'resolveRiseNextMove']) {
      expect(POPUP_HOST, `pop-up must use ${fn}`).toContain(fn);
      expect(RISE_MODE, `Rise Mode must use ${fn}`).toContain(fn);
    }
  });

  it('reads the SAME two endpoints Rise Mode reads, and no others', () => {
    for (const route of ['/api/artist/constraint', '/api/artist/roadmap']) {
      expect(POPUP_HOST, `pop-up must read ${route}`).toContain(route);
      expect(RISE_MODE, `Rise Mode must read ${route}`).toContain(route);
    }
  });

  it('renders NOTHING when there is no move, rather than inventing a nudge', () => {
    // A pop-up that cannot name real work must not spend the artist's one interruption.
    expect(POPUP_HOST).toContain('if (!next.move) return null');
  });

  it('no longer reads quest state at all', () => {
    // The quest gate and the quest_instances read went with the redesign. If either comes
    // back, the pop-up has a second source of truth again. Asserted against CODE, not prose:
    // the registry comment legitimately explains that ctx.resumable was deleted.
    expect(read('src/lib/popups/registry.ts')).not.toContain('resumable');
    expect(POPUP_API).not.toContain('quest_instances');
  });

  it('never sends the artist to the hidden quest board', () => {
    // /quests survived the pre-PMF reduction as a route, not as a destination CRWN promotes.
    expect(requireCta(move).href).not.toBe('/quests');
    expect(POPUP_HOST).not.toContain("'/quests'");
  });
});

describe('ownership: the pop-up decides nothing strategic', () => {
  it('does not diagnose or issue, on either side of the wire', () => {
    for (const src of [POPUP_API, POPUP_HOST]) {
      expect(src).not.toContain('readConstraint');
      expect(src).not.toContain('assembleConstraintEvidence');
      expect(src).not.toContain('recordIssuedRecommendation');
    }
  });

  it('involves no Manager and no model call', () => {
    expect(POPUP_API).not.toContain('generateActions');
    expect(POPUP_API).not.toContain('deepseek');
    expect(REGISTRY_RAW).not.toContain('artist_agent_actions');
  });

  it('adds no progress persistence: the canonical rows remain the only store', () => {
    expect(POPUP_API).not.toMatch(/localStorage|sessionStorage/);
    expect(POPUP_HOST).not.toMatch(/localStorage|sessionStorage/);
    expect(POPUP_API).not.toMatch(/resume_state|resume_progress|CREATE TABLE/);
  });
});

describe('targeting and restraint', () => {
  it('never fires on the page it would send you to', () => {
    // The fallback destination is Rise Mode, which ALREADY renders this exact move. A pop-up
    // of the same content on the same screen is absurd, so that page is excluded.
    expect(requireCta(move).href).toBe('/profile/artist');
    expect(move.pages).not.toContain('/profile/artist');
  });

  it('ranks BELOW money that cannot reach the artist', () => {
    expect(move.priority).toBeLessThan(stripe.priority);
    expect(move.priority).toBeLessThan(broadcast.priority);
  });

  it('keeps its frequency cap, and the daily governor still applies on top', () => {
    expect(move.frequency).toEqual({ type: 'everyN', days: 4, max: 3 });
    const ENGINE = read('src/lib/popups/index.ts');
    expect(ENGINE).toContain('shownToday');
    expect(ENGINE).toMatch(/\.sort\(\(a, b\) => b\.priority - a\.priority\)/);
  });

  it('is not an announcement, so it carries no announcedAt', () => {
    expect(move.announcedAt).toBeUndefined();
  });

  it('the frozen key is unchanged, so nobody who dismissed it sees it again', () => {
    expect(move.key).toBe('artist_resume_rise');
  });
});

describe('the static fallback promises nothing it cannot deliver', () => {
  it('names no specific work, since it ships only when resolution failed', () => {
    const copy = `${move.title} ${move.body}`.toLowerCase();
    // The real copy names the move. The fallback must not, or it would name work that the
    // failed read never confirmed.
    for (const claim of ['stripe', 'tier', 'track', 'profile', 'promise']) {
      expect(copy, `fallback must not name "${claim}"`).not.toContain(claim);
    }
  });

  it('does not claim the artist started or abandoned anything', () => {
    // Carried from the 2026-08-11 correction: progress is derived from live database state,
    // so CRWN can never prove an artist began a thing.
    const copy = `${move.title} ${move.body} ${requireCta(move).label} ${move.goal}`.toLowerCase();
    for (const claim of ['you left', 'already started', 'half done', 'abandon', 'pick it back up', 'where you left off']) {
      expect(copy, `copy must not claim "${claim}"`).not.toContain(claim);
    }
  });

  it('carries no em dash, per the copy rule', () => {
    expect(`${move.title}${move.body}${requireCta(move).label}${move.dismissLabel}`).not.toContain('—');
  });
});
