// The homepage runs the Opportunity Calculator funnel by REUSING the tool
// route's config and component, so the contract worth pinning is the config the
// homepage depends on: the photo-led hero, exactly one primary CTA label, and
// the wizard/result/builder chain the shared component renders from it.
//
// (This repo's vitest setup is node-only: no jsdom, no component tests. So the
// render order itself is enforced by the single shared component in
// PublicToolClient, and what is testable here is that the homepage cannot
// silently lose the hero image, the CTA, or the inputs that make the wizard the
// first actionable step.)

import { describe, expect, it } from 'vitest';
import { getLeadMagnet } from './registry';
import { hasDeliverable, transitionFor, buildCtaFor } from '../opportunityDrafts/deliverableSpecs';

const SLUG = 'opportunity-calculator';

describe('homepage funnel config (opportunity-calculator)', () => {
  const config = getLeadMagnet(SLUG);

  it('exists in the registry: the homepage falls back if it ever does not', () => {
    expect(config).toBeTruthy();
  });

  it('has the photo-led hero the homepage leads with', () => {
    expect(config!.hero.image).toBeTruthy();
    expect(config!.hero.imageAlt.length).toBeGreaterThan(10);
    expect(config!.hero.headline.length).toBeGreaterThan(10);
  });

  it('declares exactly ONE primary CTA label for the hero', () => {
    // The hero renders `primaryCta` and nothing else as a conversion action, so
    // a second above-the-fold CTA cannot appear without changing this shape.
    expect(typeof config!.hero.primaryCta).toBe('string');
    expect(config!.hero.primaryCta.trim().length).toBeGreaterThan(0);
  });

  it('has wizard inputs, so the CTA has a first actionable step to scroll to', () => {
    expect(config!.inputs.length).toBeGreaterThan(0);
    expect(config!.inputs[0].key).toBeTruthy();
  });

  it('drives a builder after the result (the transition target exists)', () => {
    expect(hasDeliverable(SLUG)).toBe(true);
    expect(transitionFor(SLUG).length).toBeGreaterThan(0);
    expect(buildCtaFor(SLUG).length).toBeGreaterThan(0);
  });

  it('keeps its own public route, so existing links to the tool page stay valid', () => {
    expect(config!.publicRoute).toBe('/tools/opportunity-calculator');
  });

  it('speaks to a COLD visitor: the hero never references CRWN\'s other tools', () => {
    // This page and `/` are usually a first impression. Copy that leans on "the
    // all-in-one calculator" or "five separate numbers" assumes the reader has
    // already met the rest of the tool family, and to someone who has not it
    // reads as being about a product they have never seen. It shipped that way.
    const hero = [config!.hero.eyebrow ?? '', config!.hero.headline, config!.hero.subheadline, config!.hero.primaryCta]
      .join(' ')
      .toLowerCase();
    for (const presumptuous of [
      'all-in-one',
      'five separate',
      'other calculator',
      'other tools',
      'separate calculators',
    ]) {
      expect(hero, presumptuous).not.toContain(presumptuous);
    }
  });

  it('writes the hero without em dashes', () => {
    for (const line of [config!.hero.eyebrow ?? '', config!.hero.headline, config!.hero.subheadline]) {
      expect(line).not.toContain('—');
      expect(line).not.toContain('–');
    }
  });
});
