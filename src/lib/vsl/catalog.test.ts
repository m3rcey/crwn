import { describe, it, expect } from 'vitest';
import { VSLS, getVsl, isVslLive, liveVsls, watchPath } from './catalog';
import { PROSPECT_NURTURE_SEQUENCE } from '@/lib/prospectNurture/sequence';
import type { NurtureBlock } from '@/lib/prospectNurture/types';

describe('the VSL catalog', () => {
  it('has four videos with unique slugs and unique positions', () => {
    expect(VSLS).toHaveLength(4);
    expect(new Set(VSLS.map((v) => v.slug)).size).toBe(4);
    expect(VSLS.map((v) => v.n)).toEqual([1, 2, 3, 4]);
  });

  it('gives every video a poster under public/vsl and a watch path from its slug', () => {
    for (const v of VSLS) {
      expect(v.poster, v.slug).toBe(`/vsl/${v.slug}.webp`);
      expect(watchPath(v.slug)).toBe(`/watch/${v.slug}`);
    }
  });

  it('treats a video with no hosted URL as not live', () => {
    // The whole gate. `url` is null until an MP4 exists, and every user-facing surface asks
    // isVslLive rather than getVsl, so an unhosted video cannot reach a lead through any of them.
    const unhosted = { ...VSLS[0], url: null };
    expect(isVslLive(unhosted)).toBe(false);
    expect(isVslLive({ ...VSLS[0], url: 'https://example.com/a.mp4' })).toBe(true);
    expect(isVslLive(null)).toBe(false);
    expect(liveVsls().every((v) => Boolean(v.url))).toBe(true);
  });

  it('returns null for an unknown slug rather than throwing', () => {
    expect(getVsl('nope')).toBeNull();
  });
});

describe('the nurture sequence references only real videos', () => {
  const videoBlocks = PROSPECT_NURTURE_SEQUENCE.emails.flatMap((e) =>
    e.body.filter((b: NurtureBlock): b is Extract<NurtureBlock, { kind: 'video' }> => b.kind === 'video'),
  );

  it('places one video in four emails and no more', () => {
    expect(videoBlocks).toHaveLength(4);
  });

  it('names a catalogued slug in every video block', () => {
    // A typo here would be silent: the block renders nothing when a slug does not resolve, which is
    // the correct behaviour for an unhosted video and the wrong behaviour for a misspelled one.
    for (const b of videoBlocks) expect(getVsl(b.vsl), b.vsl).not.toBeNull();
  });

  it('uses each video exactly once', () => {
    expect(new Set(videoBlocks.map((b) => b.vsl)).size).toBe(4);
  });

  it('places them in series order down the sequence', () => {
    // The videos argue in order: what the number is, what to sell, how to launch, what if it fails.
    // A lead who watches them as they arrive should get them in that order.
    const order = PROSPECT_NURTURE_SEQUENCE.emails
      .flatMap((e) => e.body.filter((b) => b.kind === 'video'))
      .map((b) => getVsl((b as Extract<NurtureBlock, { kind: 'video' }>).vsl)!.n);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
