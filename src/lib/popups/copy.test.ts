import { describe, it, expect } from 'vitest';
import { POPUPS } from './registry';
import { resumeCopyFor } from './index';

// POP-UP COPY LENGTH.
//
// An interruption is read standing up, mid-task, by someone who did not ask for it. The
// pop-ups drifted to essay length: on 2026-08-20 the median body was 35 words and the worst
// was 75, four sentences explaining WHY a change was made. That justification belongs in the
// changelog. The pop-up has one job: say what is different, or what is being lost, and get
// out of the way.
//
// These caps are deliberately generous. They are not a style guide, they are a ratchet: they
// exist so nobody can quietly restore a paragraph. If a pop-up genuinely needs more room, the
// honest move is to argue for raising the cap here, not to slip past it.

const CAP_TITLE_WORDS = 12;
const CAP_BODY_WORDS = 20;

// Bodies that interpolate real numbers spend words on arithmetic the artist needs in order to
// check the claim, so they get measured with the template holes removed rather than exempted.
const withoutTemplates = (s: string) => s.replace(/\$\{[^}]*\}/g, 'X');
const words = (s: string) => withoutTemplates(s).trim().split(/\s+/).filter(Boolean).length;

describe('pop-up copy stays short enough to read standing up', () => {
  it.each(POPUPS.map((p) => [p.key, p] as const))('%s has a short title', (key, def) => {
    expect(words(def.title), `${key} title is ${words(def.title)} words`).toBeLessThanOrEqual(
      CAP_TITLE_WORDS,
    );
  });

  it.each(POPUPS.map((p) => [p.key, p] as const))('%s has a short body', (key, def) => {
    expect(words(def.body), `${key} body is ${words(def.body)} words`).toBeLessThanOrEqual(
      CAP_BODY_WORDS,
    );
  });

  it('the SET stays tight, not just the worst case', () => {
    // A cap alone lets every pop-up sit just under it. The median is what the artist
    // actually meets, so it is held well below the ceiling.
    const sorted = POPUPS.map((p) => words(p.body)).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    expect(median, `median body is ${median} words`).toBeLessThanOrEqual(16);
  });

  // THE HOLE THIS CLOSES. The caps above read the REGISTRY, and the one pop-up the founder
  // was actually looking at does not get its copy from there: `resumeCopyFor` builds it per
  // artist. So the registry compressed to a median of 21 while the served resume body sat at
  // 38 words, and the guard reported everything was fine. Anything that GENERATES pop-up copy
  // gets measured here too, or the cap only covers the copy nobody sees.
  it('the generated resume copy obeys the same caps as the registry', () => {
    const generated = resumeCopyFor({
      title: 'Reach $1,000 per month in recurring support',
      progressPercent: 4,
    });
    expect(words(generated.body), `generated body is ${words(generated.body)} words`).toBeLessThanOrEqual(
      CAP_BODY_WORDS,
    );
    // The title carries the goal's own name, which CRWN does not control, so it is capped
    // against the longest title the builder will emit rather than the registry ceiling.
    const longest = resumeCopyFor({ title: 'g'.repeat(200), progressPercent: 50 });
    expect(longest.title.length).toBeLessThan(90);
  });
});

describe('the copy rules that already applied still apply', () => {
  it.each(POPUPS.map((p) => [p.key, p] as const))('%s uses no em dash or en dash', (key, def) => {
    const all = `${def.title} ${def.body} ${def.cta?.label ?? ''} ${def.dismissLabel ?? ''}`;
    expect(all, `${key} must not use an em dash`).not.toContain('—');
    expect(all, `${key} must not use an en dash`).not.toContain('–');
  });

  it.each(POPUPS.map((p) => [p.key, p] as const))('%s still says something', (key, def) => {
    // Shortening must not empty a pop-up out. A title with no body is a notification.
    expect(words(def.title), `${key} has no title`).toBeGreaterThan(2);
    expect(words(def.body), `${key} has no body`).toBeGreaterThan(5);
  });
});
