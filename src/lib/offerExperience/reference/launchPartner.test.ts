import { describe, it, expect } from 'vitest';
import { LAUNCH_PARTNERS } from './launchPartners';
import { checkLaunchPartner, dropLinkSlug, LADDER_PRICES_CENTS, type LaunchPartnerConfig } from './launchPartner';
import { PRINCE_DRE } from './princeDre';

describe('every registered launch partner passes the launch checks', () => {
  for (const [key, config] of Object.entries(LAUNCH_PARTNERS)) {
    it(`${key} is safe to apply`, () => {
      expect(config.key).toBe(key);
      expect(checkLaunchPartner(config)).toEqual([]);
    });
  }
});

describe('the checks actually refuse what they claim to', () => {
  const clone = (): LaunchPartnerConfig => JSON.parse(JSON.stringify(PRINCE_DRE));

  it('ladder prices come from the recommended template', () => {
    expect(LADDER_PRICES_CENTS).toEqual({ Bronze: 0, Silver: 1000, Gold: 2500, Platinum: 10000 });
  });
  it('refuses a merch promise', () => {
    const c = clone(); c.benefits.Gold.push('Early merch access');
    expect(checkLaunchPartner(c).join()).toContain('merch');
  });
  it('refuses a scarcity promise', () => {
    const c = clone(); c.benefits.Platinum.push('Limited seats');
    expect(checkLaunchPartner(c).join()).toContain('limited');
  });
  it('refuses a retired or manual benefit key', () => {
    const c = clone(); c.identities.Gold.push({ key: 'monthly_merch', line: c.benefits.Gold[1] });
    expect(checkLaunchPartner(c).join()).toContain('not a supported key');
  });
  it('refuses a Join-tier CTA', () => {
    const c = clone(); c.offers.Gold.cta = 'Join Gold';
    expect(checkLaunchPartner(c).length).toBeGreaterThan(0);
  });
  it('refuses an em dash', () => {
    const c = clone(); c.promises.Bronze = 'Stay close — always';
    expect(checkLaunchPartner(c).join()).toContain('dash');
  });
  it('refuses a vote with one song, and allows the pending empty state', () => {
    const c = clone();
    c.vote!.options = [{ label: 'Only', trackTitle: 'Only' }];
    expect(checkLaunchPartner(c).join()).toContain('2 to 4');
    // Pending: no songs yet, and so no projects built from them.
    c.vote!.options = [];
    c.content = undefined;
    expect(checkLaunchPartner(c)).toEqual([]);
  });
  it('refuses a project that lists a song the launch does not have', () => {
    const c = clone(); c.content!.projects[0].trackTitles.push('Not A Real Song');
    expect(checkLaunchPartner(c).join()).toContain('unknown track');
  });
  it('refuses two content tracks with the same title', () => {
    const c = clone(); c.content!.tracks.push({ ...c.content!.tracks[0] });
    expect(checkLaunchPartner(c).join()).toContain('share a title');
  });
  it('refuses a vote headline a link preview would cut off', () => {
    const c = clone(); c.vote!.headline = '3 UNRELEASED PROJECTS. ONE SONG FROM EACH.';
    expect(checkLaunchPartner(c).join()).toContain('link preview');
  });
  it('the drop link is personalized: artist slug plus the magnet song, never a random token', () => {
    expect(dropLinkSlug(PRINCE_DRE)).toBe('princedre-round-here');
    const c = clone(); c.drop!.linkSlug = 'Not A Slug!';
    expect(checkLaunchPartner(c).join()).toContain('clean lowercase slug');
  });
  it('refuses a downsell that is not cheaper than the primary', () => {
    const c = clone(); c.funnelDownsell = 'Platinum';
    expect(checkLaunchPartner(c).join()).toContain('downsell');
  });
});
