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
    c.drip = undefined;
    // With no songs uploaded there is nothing to drop either; a drop naming a missing song is refused.
    expect(checkLaunchPartner(c).join()).toContain('is not a song this launch uploads');
    c.drops = undefined;
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
    expect(PRINCE_DRE.drops!.map((d) => dropLinkSlug(PRINCE_DRE, d)).slice(0, 3)).toEqual(['princedre-round-here', 'princedre-letter-to-la', 'princedre-send-it-up']);
    const c = clone(); c.drops![0].linkSlug = 'Not A Slug!';
    expect(checkLaunchPartner(c).join()).toContain('clean lowercase slug');
    const d = clone(); d.drops![1].linkSlug = 'princedre-round-here';
    expect(checkLaunchPartner(d).join()).toContain('share a link');
  });
  it('refuses a price override that inverts the ladder, is not whole dollars, or names Bronze', () => {
    const c = clone(); c.prices = { Platinum: 2500 };
    expect(checkLaunchPartner(c).join()).toContain('Platinum must cost more than Gold');
    const d = clone(); d.prices = { Platinum: 4999 };
    expect(checkLaunchPartner(d).join()).toContain('whole dollars');
    const e = clone(); (e.prices as Record<string, number>) = { Bronze: 500 };
    expect(checkLaunchPartner(e).join()).toContain('not a paid rung');
  });
  it('refuses a downsell that is not cheaper than the primary', () => {
    const c = clone(); c.funnelDownsell = 'Platinum';
    expect(checkLaunchPartner(c).join()).toContain('downsell');
  });
});

// The member drip may only DELAY a rung on content it does not yet have. These are the ways a
// config could turn it into taking access away from paying members, or into a promise that
// nothing delivers.
describe('the drip checks refuse what would strand a member', () => {
  const clone = (): LaunchPartnerConfig => JSON.parse(JSON.stringify(PRINCE_DRE));

  it('refuses dripping the top rung (nobody would keep the projects from day one)', () => {
    const c = clone(); c.drip!.rung = 'Platinum';
    expect(checkLaunchPartner(c).join()).toContain('top rung');
  });
  it('refuses a project with nothing above the drip rung (it would delay content the rung already has)', () => {
    const c = clone(); c.drip!.projects[0] = { title: 'Shotta In Da Jungle', months: 1 };
    expect(checkLaunchPartner(c).join()).toContain('nothing to delay');
  });
  it('refuses months out of order, fractional, or out of range', () => {
    const c = clone(); c.drip!.projects[1].months = 1;
    expect(checkLaunchPartner(c).join()).toContain('must open after');
    const d = clone(); d.drip!.projects[0].months = 1.5;
    expect(checkLaunchPartner(d).join()).toContain('whole months');
    const e = clone(); e.drip!.projects[2].months = 25;
    expect(checkLaunchPartner(e).join()).toContain('whole months');
  });
  it('refuses a project the launch does not upload', () => {
    const c = clone(); c.drip!.projects[0].title = 'Not A Tape';
    expect(checkLaunchPartner(c).join()).toContain('not a project this launch uploads');
  });
  it('refuses a project that would drip on a clock AND wait on a live vote', () => {
    const c = clone(); c.vote!.retired = false;
    expect(checkLaunchPartner(c).join()).toContain('live vote');
  });
});
