import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { QUEST_TEMPLATES } from './templates';

// QUEST ACHIEVEMENT IS HISTORICAL; READINESS IS CURRENT (founder decision D3, 2026-09-03).
//
// A completed quest instance is never reopened and its XP is never clawed back. The surfaces
// that tell an artist "this needs attention again" are the roadmap and the constraint engine,
// which are derived on read and hold nothing. These tests pin the engine side of that
// asymmetry from the source, so a well-meaning "revert" path cannot appear quietly.

const evaluator = readFileSync('src/lib/quests/evaluator.ts', 'utf8');
const index = readFileSync('src/lib/quests/index.ts', 'utf8');

describe('completion is monotonic', () => {
  it('the evaluator returns early for every terminal status before evaluating', () => {
    expect(evaluator).toMatch(/\['completed',\s*'skipped',\s*'expired',\s*'failed',\s*'archived'\]\.includes\(instance\.status\)\)\s*return null/);
  });

  it('every progress write is guarded against a completed instance', () => {
    const writes = [...evaluator.matchAll(/\.from\('quest_instances'\)\s*\.update\(/g)].length;
    const guarded = [...evaluator.matchAll(/\.neq\('status',\s*'completed'\)/g)].length;
    expect(writes).toBeGreaterThan(0);
    expect(guarded).toBeGreaterThanOrEqual(writes);
  });

  it('refresh only reads open instances, so a completed one is never re-evaluated', () => {
    expect(index).toMatch(/statuses:\s*\['available',\s*'active',\s*'in_progress',\s*'ready_to_complete'\]/);
  });

  it('no code path moves a completed instance back to an open status', () => {
    for (const src of [evaluator, index]) {
      // A revert would read: update({ status: 'available' | 'active' ... }).eq('status', 'completed')
      expect(src).not.toMatch(/status:\s*'(available|active|in_progress|locked)'[\s\S]{0,200}\.eq\('status',\s*'completed'\)/);
      expect(src).not.toMatch(/uncomplete|reopenQuest|revertQuest|clawback/i);
    }
  });

  it('XP is an append-only ledger', () => {
    expect(evaluator).toContain("from('xp_ledger')");
    expect(evaluator).not.toMatch(/from\('xp_ledger'\)\s*\.delete\(/);
  });
});

describe('the funnel quests complete from canonical state', () => {
  it('every funnel quest is a domain check, except the one acknowledged test', () => {
    expect(QUEST_TEMPLATES.artist_lead_magnet.completionCondition).toEqual({ kind: 'domain', check: 'artist_has_lead_magnet' });
    expect(QUEST_TEMPLATES.artist_offer_experience.completionCondition).toEqual({ kind: 'domain', check: 'artist_offer_experience_live' });
    expect(QUEST_TEMPLATES.artist_funnel_followup.completionCondition).toEqual({ kind: 'domain', check: 'artist_funnel_nurture_active' });
    expect(QUEST_TEMPLATES.artist_funnel_live.completionCondition).toEqual({ kind: 'domain', check: 'artist_funnel_live' });
    expect(QUEST_TEMPLATES.artist_funnel_tested.completionCondition).toEqual({ kind: 'manual' });
  });

  it('the manual test quest gates nothing financial: it is not a prerequisite of any domain quest', () => {
    for (const t of Object.values(QUEST_TEMPLATES)) {
      if (t.prerequisites?.includes('artist_funnel_tested')) {
        expect(t.completionCondition.kind, t.key).toBe('manual');
      }
    }
  });

  it('existing artists are credited on the next load: the templates are not repeatable and carry no manual gate', () => {
    for (const key of ['artist_lead_magnet', 'artist_offer_experience', 'artist_funnel_followup', 'artist_funnel_live']) {
      expect(QUEST_TEMPLATES[key].repeatable ?? false).toBe(false);
    }
  });
});
