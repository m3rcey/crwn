// Tests for the IG/ManyChat -> funnel attribution mapping.
//
// The whole point of the bridge is that "Highest Converting Video" reflects the real acquisition
// channel, where the video IS the Instagram post. This locks that mapping: post -> video, creator
// -> source, keyword -> campaign fallback.

import { describe, expect, it } from 'vitest';

import { igFunnelDims } from './acquisitionFunnelMirror';

describe('igFunnelDims maps ManyChat attribution onto funnel dimensions', () => {
  it('uses the IG post as the video and the creator as the source', () => {
    expect(
      igFunnelDims({
        calculator: 'executive-producer-session',
        video: 'reel_12345',
        creatorAccount: 'm3rcey',
        keyword: 'PRODUCER',
      }),
    ).toEqual({
      calculator: 'executive-producer-session',
      video: 'reel_12345',
      referrer: 'ig:m3rcey',
      // No utm_campaign on IG, so the trigger keyword stands in, normalized like every other tag.
      campaign: 'producer',
    });
  });

  it('prefers a real utm_campaign over the keyword when present', () => {
    expect(igFunnelDims({ keyword: 'LIVE', campaign: 'summer_push' }).campaign).toBe('summer_push');
  });

  it('normalizes hand-typed tags, so a DM flow and a tagged link land on ONE row', () => {
    // The DM path's tags are typed by hand into a ManyChat body; the web path's arrive normalized.
    expect(igFunnelDims({ campaign: 'KCamp Streaming Loss', video: 'KCamp_V1' })).toMatchObject({
      campaign: 'kcamp-streaming-loss',
      video: 'kcamp_v1',
    });
  });

  it('drops a tag that normalizes to nothing rather than storing junk', () => {
    expect(igFunnelDims({ campaign: '!!!', keyword: '???' }).campaign).toBeNull();
  });

  it('falls back to a plain "instagram" source when no creator is known', () => {
    expect(igFunnelDims({ video: 'post_9' }).referrer).toBe('instagram');
  });

  it('leaves video null when the post id was never captured (nothing to attribute)', () => {
    const d = igFunnelDims({ calculator: 'worth', creatorAccount: 'x' });
    expect(d.video).toBeNull();
    expect(d.referrer).toBe('ig:x');
  });
});
