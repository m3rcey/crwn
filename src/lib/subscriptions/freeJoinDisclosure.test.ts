import { describe, it, expect } from 'vitest';
import { freeJoinDisclosure, DISCLOSURE_MUST_CONVEY } from './freeJoinDisclosure';
import { ballotDisclosure } from '@/lib/songLab/voteForm';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('free-join disclosure — the informed-join contract', () => {
  it('names the deliverable, the free membership, email, and unsubscribe', () => {
    const text = freeJoinDisclosure('Fight Night Scorecard', 'GB The G1ft').toLowerCase();
    expect(text).toContain('fight night scorecard');
    expect(text).toContain("gb the g1ft's members list");
    for (const element of DISCLOSURE_MUST_CONVEY) expect(text).toContain(element);
  });

  it('survives empty inputs without reading as broken', () => {
    const text = freeJoinDisclosure('', '');
    expect(text).toContain('the drop');
    expect(text).toContain('this artist');
  });

  it("Song Lab's ballot disclosure carries the same substance in its own words", () => {
    const text = ballotDisclosure('GB The G1ft').toLowerCase();
    expect(text).toContain('free');
    expect(text).toContain('unsubscribe');
    // The ballot phrases "email" as what the artist sends; the join relationship is the
    // load-bearing part.
    expect(text).toContain('community');
  });

  it('the drop capture surface actually renders the shared disclosure (source contract)', () => {
    // The whole reason this file exists: the sentence must not be editable away in the
    // component without this test noticing.
    const src = readFileSync(
      join(process.cwd(), 'src/components/drop/DropFunnelClient.tsx'),
      'utf8',
    );
    expect(src).toContain('freeJoinDisclosure(');
    expect(src).not.toMatch(/members list, with early word/); // the old inline prose is gone
  });
});
