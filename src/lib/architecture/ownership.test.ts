// PRIORITY-002: tree-wide Z3 single-issuer contract.
//
// Eleven per-surface tests already assert "this file does not issue"; this walk
// closes the class: a NEW file cannot become a second issuer either. Only the
// constraint route (the issuer) and the store (the definition) may reference
// recordIssuedRecommendation in production code.
import { describe, it, expect } from 'vitest';
import { listSourceFiles, readStripped, violation } from './sourceScan';

const APPROVED_Z3_WRITERS = [
  'src/app/api/artist/constraint/route.ts', // the ONE issuer
  'src/lib/constraint/recommendationStore.ts', // the definition + its own internals
];

describe('PRIORITY-002 — Z3 single issuer', () => {
  const files = listSourceFiles('src');

  it('only the approved writer set references recordIssuedRecommendation', () => {
    const referencing = files.filter(f => readStripped(f).includes('recordIssuedRecommendation'));
    const rogue = referencing.filter(f => !APPROVED_Z3_WRITERS.includes(f));
    expect(
      rogue,
      violation(
        'PRIORITY-002',
        `these files reference recordIssuedRecommendation but only /api/artist/constraint may issue Z3 recommendations: ${rogue.join(', ')}`,
        { owner: 'src/app/api/artist/constraint/route.ts', docs: 'docs/crwn-brain/24-RECOMMENDATION-OUTCOME-LINKAGE.md' },
      ),
    ).toEqual([]);
  });

  it('the approved issuer still actually issues (the scan is examining the right thing)', () => {
    // Positive control: if the call is renamed or moved, this fails instead of
    // the walk silently matching nothing forever.
    expect(readStripped('src/app/api/artist/constraint/route.ts')).toContain('recordIssuedRecommendation(');
    expect(readStripped('src/lib/constraint/recommendationStore.ts')).toContain(
      'export async function recordIssuedRecommendation',
    );
  });

  it('no production file writes the constraint_recommendations table except the store', () => {
    const writers = files.filter(f => {
      if (f === 'src/lib/constraint/recommendationStore.ts') return false;
      const src = readStripped(f).replace(/\n\s*/g, '');
      return /from\(['"]constraint_recommendations['"]\)\s*\.?\s*(insert|upsert)/.test(src);
    });
    expect(
      writers,
      violation('PRIORITY-002', `direct constraint_recommendations writes outside the store: ${writers.join(', ')}`, {
        owner: 'src/lib/constraint/recommendationStore.ts',
      }),
    ).toEqual([]);
  });
});
