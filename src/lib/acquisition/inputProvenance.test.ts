import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  generationProvenance,
  recalcProvenance,
  inputsChanged,
  provenanceOf,
  readProvenance,
  fromFieldSource,
  PROVENANCE_KEY,
} from './inputProvenance';
import { scoreLead, EMPTY_BEHAVIOR } from './leadScoring';
import { getTool } from './toolAdapters';

// "Did this artist actually tell us this?" (docs/crwn-brain/34-FOUNDER-FOLLOW-UP.md, Provenance).

// The shape of a real WORTH DM lead: two answers typed in the DM, parsed deterministically.
const DM_FIELD_PROVENANCE = {
  monthly_listeners: { source: 'deterministic' },
  monetization_status: { source: 'deterministic' },
};
const DM_PROFILE = { monthly_listeners: 700_000, monetization_status: 'none' };

describe('input provenance', () => {
  it('1. two explicit DM answers + the fields CRWN fills are told apart', () => {
    const gen = generationProvenance(DM_PROFILE, DM_FIELD_PROVENANCE);
    expect(gen).toEqual({ monthly_listeners: 'user_explicit', monetization_status: 'user_explicit' });
    // The optional fields were never asked, so they are simply absent at generation.
    expect(gen.social_followers).toBeUndefined();
    // When a real edit later fills them from the form's empty inputs, they are defaults.
    const before = { ...DM_PROFILE, [PROVENANCE_KEY]: gen };
    const after = { ...before, monthly_listeners: 650_000, social_followers: 0, streaming_revenue_cents: 0 };
    const p = recalcProvenance(before, after);
    expect(p.social_followers).toBe('system_default');
    expect(p.streaming_revenue_cents).toBe('system_default');
  });

  it('2. an explicit answer keeps its provenance through a recalculation that did not touch it', () => {
    const before = { ...DM_PROFILE, social_followers: 0, [PROVENANCE_KEY]: generationProvenance(DM_PROFILE, DM_FIELD_PROVENANCE) };
    const after = { ...before, social_followers: 40_000 };
    const p = recalcProvenance(before, after);
    expect(p.monthly_listeners).toBe('user_explicit');
    expect(p.monetization_status).toBe('user_explicit');
    expect(p.social_followers).toBe('user_explicit'); // she typed this one
  });

  it('3. a default is never tagged user_explicit', () => {
    const before = { monthly_listeners: 10_000 };
    const p = recalcProvenance(before, { monthly_listeners: 12_000, social_followers: 0, streaming_revenue_cents: 0 });
    expect(p.social_followers).not.toBe('user_explicit');
    expect(p.streaming_revenue_cents).not.toBe('user_explicit');
  });

  it('5. verified sources are distinguishable from what the artist said', () => {
    expect(fromFieldSource('verified_crwn')).toBe('enriched_verified');
    expect(fromFieldSource('claude_extraction')).toBe('derived');
    expect(fromFieldSource('deterministic')).toBe('user_explicit');
    // No existing source can mint founder_verified or user_explicit by accident.
    expect(fromFieldSource(undefined)).toBe('unknown');
    expect(fromFieldSource('provider_metadata')).toBe('unknown');
    expect(provenanceOf({ [PROVENANCE_KEY]: { merch: 'founder_verified' } }, 'merch')).toBe('founder_verified');
  });

  it('7. the scorer is not moved by a provenance map riding on a profile', () => {
    const base = { monthly_listeners: 700_000, monetization_status: 'none' };
    const a = scoreLead({ profile: base as never, behavior: EMPTY_BEHAVIOR });
    const b = scoreLead({ profile: { ...base, [PROVENANCE_KEY]: { monthly_listeners: 'unknown' } } as never, behavior: EMPTY_BEHAVIOR });
    expect(b).toEqual(a);
  });

  it('8. a row written before provenance existed reads unknown for every field, never user_explicit', () => {
    const legacy = { monthly_listeners: 700_000, monetization_status: 'direct_some' };
    expect(readProvenance(legacy)).toBeNull();
    for (const f of Object.keys(legacy)) expect(provenanceOf(legacy, f)).toBe('unknown');
    expect(provenanceOf(null, 'monthly_listeners')).toBe('unknown');
  });

  it('9. an Anthony-shaped row: a view-time auto-save is NOT a recalculation', () => {
    // original_input_data: the two DM answers. input_data: the same numbers after the result
    // page auto-saved on load, with the empty optional fields written as 0.
    const original = { monthly_listeners: 700_000, monetization_status: 'direct_some' };
    const afterAutoSave = { ...original, social_followers: 0, streaming_revenue_cents: 0 };
    expect(inputsChanged(original, afterAutoSave)).toBe(false);
    // A real edit is.
    expect(inputsChanged(original, { ...afterAutoSave, monthly_listeners: 650_000 })).toBe(true);
    expect(inputsChanged(original, { ...afterAutoSave, social_followers: 12_000 })).toBe(true);
  });

  it('10. a stored result with a provenance map still computes normally', () => {
    const tool = getTool('worth')!;
    const plain = tool.execute({ monthly_listeners: 700_000, monetization_status: 'none' } as never);
    const tagged = tool.execute({
      monthly_listeners: 700_000,
      monetization_status: 'none',
      [PROVENANCE_KEY]: { monthly_listeners: 'user_explicit' },
    } as never);
    expect(tagged.headline).toBe(plain.headline);
  });
});

describe('wiring (source scans)', () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('6. behavior still counts views, claims and setup; a recalculation must change a number', () => {
    const src = read('src/lib/acquisition/rescore.ts');
    expect(src).toMatch(/resultViewed: rows\.some\(\(r\) => !!r\.viewed_at\)/);
    expect(src).toMatch(/resultRecalculated: rows\.some\(\(r\) => !!r\.recalculated_at && inputsChanged\(r\.original_input_data, r\.input_data\)\)/);
  });

  it('the recalculate route no-ops an unchanged save before any write', () => {
    const src = read('src/app/api/lead-results/[token]/recalculate/route.ts');
    const guard = src.indexOf('if (!inputsChanged(before, corrected))');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf(".from('lead_magnet_results')"));
    expect(guard).toBeLessThan(src.indexOf('recomputeScore'));
  });

  it('the result page does not post on first render', () => {
    const src = read('src/app/(public)/worth/WorthExperience.tsx');
    expect(src).toMatch(/if \(recalcBaseline\.current === null\) \{\s*recalcBaseline\.current = key;\s*return;/);
  });

  it('new DM results carry provenance in both snapshots', () => {
    const src = read('src/lib/acquisition/resultGeneration.ts');
    expect(src).toMatch(/input_data: inputSnapshot,\s*original_input_data: inputSnapshot,/);
  });
});
