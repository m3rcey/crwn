import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { POPUPS, type PopupDef } from './popups/registry';
import { resumeCopyFor, resumeVisualPercent } from './popups';
import { recommendNextQuest } from './quests/recommend';
import type { QuestInstance } from './quests/types';

// RISE MODE RESUME.
//
// "I came back. What was I in the middle of?" — continuity of unfinished execution. It is NOT
// "what matters most now": the Constraint Engine owns that, Manager explains it, Needs You reports
// events.
//
// The resume prompt is an existing pop-up over canonical quest state. There is no Resume Engine,
// no resume table, and no second progress store, and these tests exist to keep it that way.
//
// The correction made on 2026-08-11 was to the CLAIM, not the plumbing: quest progress is derived
// from DomainChecks over live database state (`syncQuest` sets `in_progress` whenever evaluated
// progress rises above 0), so it never proved the artist had started anything.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'));
const POPUP_API = read('src/app/api/popups/route.ts');
const EVALUATOR = read('src/lib/quests/evaluator.ts');
const REGISTRY_RAW = readFileSync('src/lib/popups/registry.ts', 'utf8');

const resume = POPUPS.find((p) => p.key === 'artist_resume_rise')!;
const stripe = POPUPS.find((p) => p.key === 'artist_connect_stripe')!;
const broadcast = POPUPS.find((p) => p.key === 'artist_first_broadcast')!;

// `cta` is OPTIONAL on PopupDef, and legitimately so: a survey pop-up has no CTA. The resume
// prompt's entire job is to return the artist to Rise Mode, so a missing CTA is a real product
// defect rather than a typing detail. Assert it where it is read, so the failure names the
// pop-up instead of surfacing as a TypeError on an undefined property.
function requireCta(p: PopupDef): NonNullable<PopupDef['cta']> {
  expect(p.cta, `${p.key} must define a CTA`).toBeDefined();
  if (!p.cta) throw new Error(`${p.key} has no CTA`);
  return p.cta;
}

const quest = (over: Partial<QuestInstance>): QuestInstance =>
  ({
    id: 'q',
    template_key: 't',
    title: 'T',
    status: 'active',
    progress_percent: 0,
    quest_type: 'side_quest',
    priority_score: 100,
    ...over,
  } as unknown as QuestInstance);

describe('eligibility: only genuinely partial, open work', () => {
  it('the popup exists and is gated on resumable state', () => {
    expect(resume).toBeTruthy();
    expect(REGISTRY_RAW).toContain('c.resumable');
  });

  it('0% and 100% are excluded at the query, not in the UI', () => {
    // The boundary must live where the data is selected, or a client could render an ineligible one.
    expect(POPUP_API).toContain(".gt('progress_percent', 0)");
    expect(POPUP_API).toContain(".lt('progress_percent', 100)");
  });

  it('only OPEN instances are considered', () => {
    expect(POPUP_API).toMatch(/\.in\('status', \['active', 'in_progress'\]\)/);
  });

  it('requires the quest engine flag, so setup-gated artists are not prompted', () => {
    expect(REGISTRY_RAW).toContain('c.featureFlags.quest_engine');
  });

  it('never fires on its own destination', () => {
    // The destination moved to /quests on 2026-08-19 when the copy started NAMING the goal.
    // /profile/artist renders ONE constraint-resolved move, not this quest, so a prompt that
    // names a task and lands there would name X and show Y. The invariant is unchanged: a
    // prompt may never fire on the page it is sending you to.
    expect(requireCta(resume).href).toBe('/quests');
    expect(resume.pages).not.toContain('/quests');
  });

  it('is allowed to fire on Rise Mode, now that Rise Mode is not the destination', () => {
    // /profile/artist was excluded while it WAS the destination. Once the CTA moved to
    // /quests that reason expired, so the prompt may fire there like any other surface.
    // (It was added on 2026-08-19 when artists briefly landed here at login. That landing
    // was reverted to /home on 2026-08-20; the entry stays because the ORIGINAL objection,
    // never interrupt someone on the page you are sending them to, no longer applies.)
    expect(resume.pages).toContain('/profile/artist');
  });
});

describe('selection: one source of truth, no second ranking', () => {
  it('the popup picks highest progress first, exactly like recommendNextQuest', () => {
    expect(POPUP_API).toMatch(/\.order\('progress_percent', \{ ascending: false \}\)/);
    expect(POPUP_API).toContain('.limit(1)');
  });

  it('recommendNextQuest uses the identical rule, so the two cannot disagree', () => {
    const rec = recommendNextQuest([
      quest({ id: 'a', progress_percent: 20, title: 'Twenty' }),
      quest({ id: 'b', progress_percent: 80, title: 'Eighty' }),
      quest({ id: 'c', progress_percent: 0, title: 'Zero' }),
    ]);
    expect(rec?.questId).toBe('b');
  });

  it('a quest at 0 is not "underway" for either surface', () => {
    const rec = recommendNextQuest([quest({ id: 'z', progress_percent: 0, quest_type: 'side_quest' })]);
    // Falls through the in-progress branch; whatever it picks, it is not picked for being underway.
    expect(rec?.reason ?? '').not.toMatch(/of the way through/);
  });

  it('a completed quest ends eligibility with no resume-specific record', () => {
    const rec = recommendNextQuest([quest({ id: 'done', progress_percent: 100, status: 'completed' })]);
    expect(rec).toBeNull();
    // No `resume_completed` concept anywhere: quest completion is the only truth.
    expect(POPUP_API).not.toContain('resume_completed');
    expect(REGISTRY_RAW).not.toContain('resume_completed');
  });
});

describe('the prompt claims only what the data proves', () => {
  it('does not assert the artist started or abandoned anything', () => {
    const copy = `${resume.title} ${resume.body} ${requireCta(resume).label} ${resume.goal}`.toLowerCase();
    for (const claim of ['you left', 'already started', 'half done', 'abandon', 'pick it back up', 'where you left off']) {
      expect(copy, `resume copy must not claim "${claim}"`).not.toContain(claim);
    }
  });

  it('is truthful for a 4% outcome target as well as a 90% task', () => {
    // Production held "Reach $1,000 per month in recurring support" at 4% as an ELIGIBLE row.
    // The static fallback carries no interpolation, so it has to be true at both ends.
    const copy = `${resume.title} ${resume.body}`.toLowerCase();
    expect(copy).toContain('partway');
    expect(copy).not.toMatch(/finish what you were doing|resume your work/);
  });

  it('progress is derived from live state, which is WHY the copy is careful', () => {
    // If this ever becomes a real engagement signal, the copy may become stronger. Until then it
    // may not. `in_progress` is set from evaluated progress, not from an artist action.
    expect(EVALUATOR).toMatch(/nextStatus = result\.progressPercent > 0 \? 'in_progress'/);
  });

  it('carries no em dash, per the copy rule', () => {
    expect(`${resume.title}${resume.body}${requireCta(resume).label}${resume.dismissLabel}`).not.toContain('—');
  });
});

describe('the served copy names the goal without claiming the artist started it', () => {
  const REAL = { title: 'Reach $1,000 per month in recurring support', progressPercent: 4 };
  const NEARLY = { title: 'Upload your first five tracks', progressPercent: 90 };

  it('names the actual goal, which is the whole point of the 2026-08-19 change', () => {
    expect(resumeCopyFor(REAL).title).toContain(REAL.title);
    expect(resumeCopyFor(NEARLY).title).toContain(NEARLY.title);
  });

  it('instructs the artist to finish it', () => {
    expect(resumeCopyFor(REAL).title.toLowerCase()).toContain('finish');
  });

  it('obeys the SAME forbidden-claims list as the static pair, at both ends of the range', () => {
    for (const r of [REAL, NEARLY]) {
      const c = resumeCopyFor(r);
      const copy = `${c.title} ${c.body}`.toLowerCase();
      for (const claim of ['you left', 'already started', 'half done', 'abandon', 'pick it back up', 'where you left off']) {
        expect(copy, `named resume copy must not claim "${claim}" at ${r.progressPercent}%`).not.toContain(claim);
      }
    }
  });

  it('leaves the NUMBER to the ring and the LOSS to the sentence', () => {
    // The number moved out of the copy on 2026-08-20: the pop-up draws a progress ring from
    // the same snapshot, so stating the percent in prose put it on screen twice inside a
    // 38-word body. The ring cannot say what is being lost, which is the sentence's job.
    expect(resumeVisualPercent(REAL.progressPercent)).toBe(4);
    expect(resumeVisualPercent(NEARLY.progressPercent)).toBe(90);
    expect(resumeCopyFor(REAL).body).not.toMatch(/\d+%/);
    expect(resumeCopyFor(REAL).body.toLowerCase()).not.toMatch(/you (got|made it|reached)/);
  });

  it('says what is LOST, not what was achieved', () => {
    // A ring on its own reads as an achievement badge. Without this the pop-up congratulates.
    expect(resumeCopyFor(REAL).body.toLowerCase()).toMatch(/nothing is earned|pays nothing/);
  });

  it('carries no em dash', () => {
    for (const r of [REAL, NEARLY]) {
      const c = resumeCopyFor(r);
      expect(`${c.title}${c.body}`).not.toContain('—');
    }
  });

  it('the ring never reads 0 or 100, even if the query gate changes upstream', () => {
    // A ring at 0 or 100 contradicts the pop-up having fired at all. The clamp moved with
    // the number, from the copy builder to resumeVisualPercent, so it is still one function.
    expect(resumeVisualPercent(0)).toBe(1);
    expect(resumeVisualPercent(100)).toBe(99);
    expect(resumeVisualPercent(120)).toBe(99);
    expect(resumeVisualPercent(NaN)).toBe(1);
  });

  it('truncates a long stored title instead of rendering it into the heading', () => {
    const long = resumeCopyFor({ title: 'g'.repeat(200), progressPercent: 50 });
    expect(long.title.length).toBeLessThan(90);
  });

  it('falls back to the static pair when the title is empty', () => {
    expect(resumeCopyFor({ title: '   ', progressPercent: 50 }).title).toBe(resume.title);
  });

  it('the route builds it from the SAME snapshot the audience gated on', () => {
    // Not a second query: naming a goal the predicate never saw would be a new source of truth.
    expect(POPUP_API).toContain('resumeCopyFor(ctx.resumable)');
    expect(POPUP_API).toMatch(/def\.key === 'artist_resume_rise' && ctx\.resumable/);
  });
});

describe('precedence: continuation never outranks money or activation', () => {
  it('ranks below Stripe and the first broadcast', () => {
    expect(resume.priority).toBeLessThan(stripe.priority);
    expect(resume.priority).toBeLessThan(broadcast.priority);
  });

  it('the engine picks exactly one winner by priority, so a higher class displaces it', () => {
    const ENGINE = read('src/lib/popups/index.ts');
    expect(ENGINE).toMatch(/\.sort\(\(a, b\) => b\.priority - a\.priority\)/);
  });

  it('the one-per-day cap still applies on top of the per-popup frequency', () => {
    const ENGINE = read('src/lib/popups/index.ts');
    expect(ENGINE).toContain('shownToday');
    expect(resume.frequency).toEqual({ type: 'everyN', days: 4, max: 3 });
  });
});

describe('ownership: resume decides nothing strategic', () => {
  it('does not diagnose or read the Constraint Engine', () => {
    expect(POPUP_API).not.toContain('readConstraint');
    expect(POPUP_API).not.toContain('assembleConstraintEvidence');
  });

  it('issues no Z3 recommendation', () => {
    expect(POPUP_API).not.toContain('recordIssuedRecommendation');
  });

  it('involves no Manager and no model call', () => {
    expect(POPUP_API).not.toContain('generateActions');
    expect(POPUP_API).not.toContain('deepseek');
    expect(REGISTRY_RAW).not.toContain('artist_agent_actions');
  });

  it('adds no progress persistence: quest rows remain the only store', () => {
    // Cross-device works for free precisely because nothing is kept client-side.
    expect(POPUP_API).not.toMatch(/localStorage|sessionStorage/);
    expect(REGISTRY_RAW).not.toMatch(/localStorage|sessionStorage/);
    expect(POPUP_API).not.toMatch(/resume_state|resume_progress|CREATE TABLE/);
  });
});

describe('identity and frequency are compatibility-sensitive', () => {
  it('the popup key is unchanged, so impressions and caps still resolve', () => {
    // popup_events rows are keyed on popup_key; renaming would reset every artist's cap.
    expect(resume.key).toBe('artist_resume_rise');
  });

  it('dismissal is handled by the engine, not by marking work abandoned', () => {
    expect(resume.dismissLabel).toBe('Not now');
    // Nothing in the resume path writes quest status on dismissal.
    expect(POPUP_API).not.toMatch(/status: 'skipped'|status: 'archived'/);
  });
});
