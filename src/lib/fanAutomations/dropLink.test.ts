import { describe, it, expect } from 'vitest';
import { DROP_LINK_RE, dropLinkCandidates, isPersonalDropLink, personalDropLink } from './dropLink';
import { LAUNCH_PARTNERS } from '../offerExperience/reference/launchPartners';
import { dropLinkSlug } from '../offerExperience/reference/launchPartner';
import { slugify } from '../slugify';
import { readStripped } from '../architecture/sourceScan';

describe('personalDropLink', () => {
  it('gives a self-built drop the same shape as the live Prince Dre page', () => {
    expect(personalDropLink('princedre', 'Round Here')).toBe('princedre-round-here');
  });

  it('cleans what an artist types into a link-safe gift title', () => {
    expect(personalDropLink('m3rcey', "Letter To LA (feat. JMoney)!")).toBe('m3rcey-letter-to-la-feat-jmoney');
  });

  it('falls back to -drop when the gift has no usable title', () => {
    expect(personalDropLink('m3rcey', '')).toBe('m3rcey-drop');
    expect(personalDropLink('m3rcey', '!!!')).toBe('m3rcey-drop');
    expect(personalDropLink('m3rcey', null)).toBe('m3rcey-drop');
  });

  it('forms nothing without an artist slug, so the random token stays', () => {
    expect(personalDropLink('', 'Round Here')).toBeNull();
    expect(dropLinkCandidates('', 'Round Here')).toEqual([]);
  });

  it('never exceeds what the drop page will open (64 characters), even with a suffix', () => {
    const long = 'a'.repeat(80);
    for (const link of dropLinkCandidates(long, long + ' ' + long)) {
      expect(link.length).toBeLessThanOrEqual(64);
      expect(DROP_LINK_RE.test(link)).toBe(true);
    }
  });

  it('offers numbered fallbacks for a song given away from two drops', () => {
    const c = dropLinkCandidates('princedre', 'Round Here');
    expect(c[0]).toBe('princedre-round-here');
    expect(c[1]).toBe('princedre-round-here-2');
    expect(c).toHaveLength(9);
  });
});

describe('isPersonalDropLink', () => {
  it('recognizes a personal link and refuses a random token', () => {
    expect(isPersonalDropLink('princedre-round-here')).toBe(true);
    expect(isPersonalDropLink('q3Xv9aB1kLm_')).toBe(false);
    expect(isPersonalDropLink(null)).toBe(false);
  });
});

describe('the launch script and self-built drops share one rule', () => {
  it('leaves every launch-partner drop link exactly where it is live today', () => {
    for (const c of Object.values(LAUNCH_PARTNERS)) {
      for (const d of c.drops ?? []) {
        const before = d.linkSlug ?? `${c.slug}-${slugify(d.magnetTrackTitle)}`;
        expect(dropLinkSlug(c, d)).toBe(before);
      }
    }
  });
});

describe('the activate route renames only a drop that has never been live', () => {
  // A live drop's link may be printed on a poster or sitting in a DM. Renaming it after its first
  // activation would break every one of them, so the guard is pinned at the source.
  const src = readStripped('src/app/api/fan-automations/[id]/route.ts');

  it('gates the personal link on a first activation of a still-random token', () => {
    expect(src).toMatch(/update\.status === 'active' && !existing\.activated_at && !isPersonalDropLink\(existing\.public_token\)/);
  });

  it('assigns public_token in exactly one place', () => {
    expect(src.match(/update\.public_token =/g) ?? []).toHaveLength(1);
  });
});
