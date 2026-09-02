import { describe, it, expect } from 'vitest';
import { normalizeOfferExperience, isBenefitCta, safePosterUrl } from './normalize';
import { OFFER_LIMITS } from './types';

const BASE = {
  promise: 'Put your own ideas in the room while GB is creating.',
  description: 'Get opportunities to submit your own ideas and material for consideration.',
  cta: 'Put My Ideas in the Room',
  previews: [
    { kind: 'submission', truth: 'example', title: 'Send a beat', actionLabel: 'Submit for consideration' },
    { kind: 'decision', truth: 'example', title: 'Final-round decision', options: [{ label: 'Version A' }, { label: 'Version B' }] },
  ],
};

describe('normalizeOfferExperience — the Offer Builder write contract', () => {
  it('accepts a well-formed config', () => {
    const c = normalizeOfferExperience(BASE, 'Platinum');
    expect(c).not.toBeNull();
    expect(c!.previews).toHaveLength(2);
    expect(c!.cta).toBe('Put My Ideas in the Room');
  });

  it('REFUSES a preview with no declared truth state — real is never a default', () => {
    const c = normalizeOfferExperience({
      ...BASE,
      previews: [{ kind: 'decision', title: 'A vote' }],
    }, 'Platinum');
    expect(c!.previews).toHaveLength(0);
  });

  it('an example preview keeps its truth state through normalization', () => {
    const c = normalizeOfferExperience(BASE, 'Platinum');
    expect(c!.previews.every((p) => p.truth === 'example')).toBe(true);
  });

  it('a real preview keeps its truth state too', () => {
    const c = normalizeOfferExperience({
      ...BASE,
      previews: [{ kind: 'audio', truth: 'real', title: 'Go Bad' }],
    }, 'Platinum');
    expect(c!.previews[0].truth).toBe('real');
  });

  it('bounds every string and caps every list', () => {
    const c = normalizeOfferExperience({
      ...BASE,
      promise: 'x'.repeat(1000),
      previews: Array.from({ length: 40 }, (_, i) => ({ kind: 'image', truth: 'example', title: 'p' + i })),
      faqs: Array.from({ length: 40 }, (_, i) => ({ q: 'q' + i, a: 'a' + i })),
    }, 'Platinum');
    expect(c!.promise.length).toBe(OFFER_LIMITS.promise);
    expect(c!.previews.length).toBe(OFFER_LIMITS.maxPreviews);
    expect(c!.faqs!.length).toBe(OFFER_LIMITS.maxFaqs);
  });

  it('drops unknown preview kinds rather than guessing', () => {
    const c = normalizeOfferExperience({
      ...BASE,
      previews: [{ kind: 'hologram', truth: 'example', title: 'x' }],
    }, 'Platinum');
    expect(c!.previews).toHaveLength(0);
  });

  it('vsl url null survives (null means: render nothing fan-facing)', () => {
    const c = normalizeOfferExperience({ ...BASE, vsl: { url: null } }, 'Platinum');
    expect(c!.vsl).toEqual({ url: null });
  });

  it('a placeholder vsl keeps its placeholder flag, which drives the Example video chip', () => {
    const c = normalizeOfferExperience({ ...BASE, vsl: { url: 'https://pub.example/v.mp4', isPlaceholder: true } }, 'Platinum');
    expect(c!.vsl!.isPlaceholder).toBe(true);
  });
});

describe('the benefit-based CTA rule', () => {
  it('accepts outcome CTAs', () => {
    for (const cta of ['Put My Ideas in the Room', 'Help Shape What Comes Next', 'Take Me Backstage', 'Unlock Go Bad', 'Get Me In Early']) {
      expect(isBenefitCta(cta, 'Platinum')).toBe(true);
    }
  });

  it('REFUSES Join/Subscribe/Become/Upgrade buttons', () => {
    for (const cta of ['Join Platinum', 'Subscribe Now', 'Become a Member', 'Upgrade to Gold', 'join now']) {
      expect(isBenefitCta(cta)).toBe(false);
    }
  });

  it('REFUSES a CTA that is really just the tier name', () => {
    expect(isBenefitCta('Get Platinum Today', 'Platinum')).toBe(false);
  });

  it('a config with a tier-name CTA is refused whole, so it can never render', () => {
    expect(normalizeOfferExperience({ ...BASE, cta: 'Join Platinum' }, 'Platinum')).toBeNull();
  });
});

describe('media safety — a preview can never reference protected bytes', () => {
  it('accepts a public artwork url', () => {
    expect(safePosterUrl('https://cdn.example/art.webp')).toBe('https://cdn.example/art.webp');
  });
  it('REFUSES signed storage urls', () => {
    expect(safePosterUrl('https://x.supabase.co/storage/v1/object/sign/audio/a.mp3?token=abc')).toBeNull();
  });
  it('REFUSES anything with credentials-shaped params', () => {
    expect(safePosterUrl('https://x/y?X-Amz-Signature=zz')).toBeNull();
    expect(safePosterUrl('http://insecure.example/a.png')).toBeNull();
  });
});
