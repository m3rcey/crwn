import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { POPUPS, type PopupDef } from './popups/registry';
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
    expect(resume.pages).not.toContain('/profile/artist');
    expect(requireCta(resume).href).toBe('/profile/artist');
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
    // The copy is static (no interpolation), so it has to be true at both ends of the range.
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
