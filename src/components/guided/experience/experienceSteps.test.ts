import { describe, it, expect } from 'vitest';
import {
  buildConfig,
  buildPreview,
  canContinue,
  canUseReal,
  defaultDecision,
  draftFaqs,
  mediaCandidates,
  previewableBenefits,
  resumeIndex,
  suggestCtas,
  suggestDescription,
  suggestPromise,
  visibleSteps,
  type BenefitFacts,
  type ExperienceState,
} from './experienceSteps';
import { normalizeOfferExperience } from '@/lib/offerExperience/normalize';

const TIER = { id: 'gold', name: 'Gold', price: 2500, description: 'Vote on the songs before anyone hears them' };
const TRACKS: BenefitFacts = { benefit: 'exclusive_tracks', state: 'ready', fact: '3 tracks play for this rung.', gatedTrackTitles: ['Midnight', 'Tape B'] };
const VOTING: BenefitFacts = { benefit: 'creative_voting', state: 'nothing_yet', fact: 'No decision has been opened.', gatedTrackTitles: [] };
const CALL: BenefitFacts = { benefit: 'one_on_one_call', state: 'manual', fact: 'You deliver this.', gatedTrackTitles: [] };

function state(over: Partial<ExperienceState> = {}): ExperienceState {
  return {
    tier: TIER,
    benefits: [TRACKS, VOTING, CALL],
    promise: '',
    description: '',
    cta: '',
    decisions: {},
    vslUrl: '',
    faqs: [],
    inheritedFrom: null,
    ...over,
  };
}

describe('what gets a preview screen', () => {
  it('supported CRWN-delivered benefits only; manual promises stay words', () => {
    expect(previewableBenefits([TRACKS, VOTING, CALL]).map((b) => b.benefit)).toEqual(['exclusive_tracks', 'creative_voting']);
    const keys = visibleSteps(state()).filter((s) => s.key === 'preview-benefit').map((s) => s.benefit);
    expect(keys).toEqual(['exclusive_tracks', 'creative_voting']);
  });

  it('a real preview is offered only when readiness says the thing exists', () => {
    expect(canUseReal('ready')).toBe(true);
    expect(canUseReal('active')).toBe(true);
    expect(canUseReal('upcoming')).toBe(true);
    expect(canUseReal('nothing_yet')).toBe(false);
    expect(canUseReal('needs_setup')).toBe(false);
    expect(defaultDecision(TRACKS).choice).toBe('real');
    expect(defaultDecision(VOTING).choice).toBe('example');
  });
});

describe('truth is a choice, never a typed flag', () => {
  it('an example decision produces an example preview; real and media produce real ones', () => {
    expect(buildPreview({ benefit: 'creative_voting', choice: 'example', title: '', description: '', mediaUrl: null }, VOTING)?.truth).toBe('example');
    expect(buildPreview({ benefit: 'exclusive_tracks', choice: 'real', title: '', description: '', mediaUrl: null }, TRACKS)?.truth).toBe('real');
    const media = buildPreview({ benefit: 'exclusive_tracks', choice: 'media', title: '', description: '', mediaUrl: 'https://cdn.example/art.jpg' }, TRACKS);
    expect(media?.truth).toBe('real');
    expect(media?.kind).toBe('image');
    expect(media?.posterUrl).toBe('https://cdn.example/art.jpg');
  });

  it('a media choice with a signed or private url produces nothing, never a leak', () => {
    expect(buildPreview({ benefit: 'exclusive_tracks', choice: 'media', title: '', description: '', mediaUrl: 'https://x/y?token=abc' }, TRACKS)).toBeNull();
    expect(buildPreview({ benefit: 'exclusive_tracks', choice: 'media', title: '', description: '', mediaUrl: 'http://plain.example/a.jpg' }, TRACKS)).toBeNull();
  });

  it('a skipped benefit produces no preview', () => {
    expect(buildPreview({ benefit: 'exclusive_tracks', choice: 'skip', title: '', description: '', mediaUrl: null }, TRACKS)).toBeNull();
  });

  it('the preview kind comes from the registry, and a real collection lists the artist\'s own gated tracks', () => {
    const p = buildPreview({ benefit: 'exclusive_tracks', choice: 'real', title: '', description: '', mediaUrl: null }, TRACKS)!;
    expect(p.kind).toBe('audio');
    expect(p.items?.map((i) => i.title)).toEqual(['Midnight', 'Tape B']);
    expect(p.description).toContain('3 tracks');
    const v = buildPreview({ benefit: 'creative_voting', choice: 'example', title: '', description: '', mediaUrl: null }, VOTING)!;
    expect(v.kind).toBe('decision');
    expect(v.options?.length).toBe(3);
  });
});

describe('the built config passes the same normalizer the drop page reads through', () => {
  it('a whole state normalizes with every preview intact', () => {
    const s = state({
      promise: 'Hear the songs first and help pick the single',
      description: 'Members-only music and a vote on what comes next.',
      cta: 'Hear it first',
      decisions: {
        exclusive_tracks: { benefit: 'exclusive_tracks', choice: 'real', title: '', description: '', mediaUrl: null },
        creative_voting: { benefit: 'creative_voting', choice: 'example', title: '', description: '', mediaUrl: null },
      },
      faqs: draftFaqs(state()),
    });
    const cfg = buildConfig(s);
    const normalized = normalizeOfferExperience(cfg, 'Gold');
    expect(normalized).not.toBeNull();
    expect(normalized!.previews.length).toBe(2);
    expect(normalized!.previews.map((p) => p.truth)).toEqual(['real', 'example']);
    expect(normalized!.faqs?.length).toBe(3);
    expect(normalized!.vsl).toBeUndefined();
  });

  it('a Join button or the tier name is refused before publish', () => {
    const steps = visibleSteps(state());
    const cta = steps.find((s) => s.key === 'cta')!;
    expect(canContinue(cta, state({ cta: 'Join Gold' }))).toBe(false);
    expect(canContinue(cta, state({ cta: 'Unlock the Gold vault' }))).toBe(false);
    expect(canContinue(cta, state({ cta: 'Hear it first' }))).toBe(true);
  });

  it('suggested buttons are all benefit-based and never name the tier', () => {
    for (const c of suggestCtas([TRACKS, VOTING], 'Gold')) {
      expect(c.toLowerCase()).not.toMatch(/^join|gold/);
      expect(c.length).toBeLessThanOrEqual(40);
    }
    expect(suggestCtas([], 'Gold').length).toBeGreaterThan(0);
  });

  it('a video is optional and a non-public link is dropped, so nothing broken ever renders', () => {
    const cfg = buildConfig(state({ promise: 'p', description: 'd', cta: 'Hear it first', vslUrl: 'https://cdn.example/v.mp4?X-Amz-Signature=1' }));
    expect(cfg.vsl).toBeUndefined();
  });
});

describe('prefill', () => {
  it('promise from the tier, then the first benefit; description from the benefit labels', () => {
    expect(suggestPromise(state())).toBe(TIER.description);
    expect(suggestPromise(state({ tier: { ...TIER, description: null } }))).toContain('Songs, demos');
    expect(suggestDescription(state())).toContain('Hear music only members get');
    expect(suggestDescription(state())).toContain('Everything opens the moment you join.');
  });

  it('the FAQ drafts promise no cadence and no result', () => {
    for (const f of draftFaqs(state())) {
      expect(f.a).not.toMatch(/every (week|month)|weekly|monthly|guarantee|will earn/i);
      expect(f.a).not.toContain('—');
    }
  });

  it('media candidates keep only plainly public artwork', () => {
    const list = mediaCandidates({
      avatarUrl: 'https://cdn.example/a.jpg',
      bannerUrl: 'https://cdn.example/a.jpg',
      albumArt: [{ title: 'Midnight', url: 'https://cdn.example/m.jpg' }, { title: 'Signed', url: 'https://x/y?token=1' }, { title: 'None', url: null }],
    });
    expect(list.map((m) => m.label)).toEqual(['Your profile photo', 'Artwork: Midnight']);
  });
});

describe('resume', () => {
  it('a first visit always starts at the promise, even though it is pre-filled', () => {
    // Browser QA (2026-09-03): the flow skipped straight to the button because the promise was
    // suggested. A suggestion the artist never saw is not a decision they made.
    const steps = visibleSteps(state());
    const prefilled = state({ promise: 'p', description: 'd', cta: 'Hear it first' });
    expect(steps[resumeIndex(steps, prefilled, false, false)].key).toBe('promise');
  });

  it('with a draft, lands on the first open decision; with a published page, on review', () => {
    const steps = visibleSteps(state());
    expect(steps[resumeIndex(steps, state(), false, true)].key).toBe('promise');
    const withPromise = state({ promise: 'p', description: 'd' });
    expect(steps[resumeIndex(steps, withPromise, false, true)].key).toBe('cta');
    const withCta = state({ promise: 'p', description: 'd', cta: 'Hear it first' });
    expect(steps[resumeIndex(steps, withCta, false, true)].key).toBe('preview-benefit');
    const decided = state({
      promise: 'p', description: 'd', cta: 'Hear it first',
      decisions: { exclusive_tracks: defaultDecision(TRACKS), creative_voting: defaultDecision(VOTING) },
    });
    expect(steps[resumeIndex(steps, decided, false, true)].key).toBe('vsl');
    expect(steps[resumeIndex(steps, decided, true)].key).toBe('preview');
  });
});
