import { describe, it, expect } from 'vitest';
import { shareTitle, shareMetadata, SHARE_TITLE_MAX } from './shareMetadata';
import { LEAD_MAGNET_SLUGS, getLeadMagnet } from './leadMagnets/registry';

describe('shareTitle', () => {
  it('never exceeds the preview width', () => {
    const long = 'A very long artist-written headline that would be cut off in a link preview';
    expect(shareTitle(long).length).toBeLessThanOrEqual(SHARE_TITLE_MAX);
    expect(shareTitle(long).endsWith('…')).toBe(true);
  });

  it('leaves a short title alone', () => {
    expect(shareTitle('Speechless')).toBe('Speechless');
  });

  it('collapses whitespace and falls back when empty', () => {
    expect(shareTitle('  two   words \n')).toBe('two words');
    expect(shareTitle('   ')).toBe('CRWN');
    expect(shareTitle(null)).toBe('CRWN');
  });
});

describe('shareMetadata', () => {
  it('never re-states the site boilerplate as the page title', () => {
    const meta = shareMetadata({ title: "M3rcey's Song Lab", description: 'Vote on the next song.' });
    expect(meta.title).toBe("M3rcey's Song Lab");
    expect(meta.openGraph?.title).toBe("M3rcey's Song Lab");
    expect((meta.twitter as { title?: string })?.title).toBe("M3rcey's Song Lab");
  });

  it('falls back to the CRWN mark and a square card when no image is given', () => {
    const meta = shareMetadata({ title: 'Fan drive', description: 'One job.' });
    expect((meta.twitter as { card?: string })?.card).toBe('summary');
  });
});

// Every public calculator is pasted into DMs. Its title has to say which tool it is,
// inside the width a link preview actually renders.
describe('lead magnet share titles', () => {
  it('fit the preview width', () => {
    for (const slug of LEAD_MAGNET_SLUGS) {
      const config = getLeadMagnet(slug)!;
      expect(shareTitle(config.name).length, slug).toBeLessThanOrEqual(SHARE_TITLE_MAX);
    }
  });
});
