import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ARTIST_TERMS_POINTS,
  ARTIST_TERMS_VERSION,
  LAUNCH_ADDENDUM_INTRO,
  LAUNCH_ADDENDUM_OUTRO,
  LAUNCH_ADDENDUM_STEPS,
  LAUNCH_ADDENDUM_VERSION,
  appendAcceptance,
  artistTermsStatus,
  cleanSignature,
  readAcceptances,
} from './artistTerms';
import { GUARANTEE_MIN_CONTACTS, GUARANTEE_MIN_PROVEN_BUYERS } from '@/lib/launchPartner';

const entry = (over: Partial<ReturnType<typeof readAcceptances>[number]> = {}) => ({
  version: ARTIST_TERMS_VERSION,
  launchAddendumVersion: null,
  acceptedAt: '2026-09-30T00:00:00.000Z',
  name: 'Test Artist',
  ip: null,
  userAgent: null,
  ...over,
});

describe('artist terms: who owes what', () => {
  it('a fan owes nothing, whatever the metadata says', () => {
    expect(artistTermsStatus({}, { isArtist: false, launchPartner: true }).required).toBe(false);
  });

  it('an artist with no record owes the terms', () => {
    expect(artistTermsStatus({}, { isArtist: true, launchPartner: false })).toEqual({ needsTerms: true, needsAddendum: false, required: true });
  });

  it('an artist who accepted the CURRENT version owes nothing; an old version does not count', () => {
    expect(artistTermsStatus({ artist_terms: [entry()] }, { isArtist: true, launchPartner: false }).required).toBe(false);
    expect(artistTermsStatus({ artist_terms: [entry({ version: '2020-01-01' })] }, { isArtist: true, launchPartner: false }).needsTerms).toBe(true);
  });

  it('a launch partner also owes the addendum, and accepting the terms alone does not settle it', () => {
    const s = artistTermsStatus({ artist_terms: [entry()] }, { isArtist: true, launchPartner: true });
    expect(s).toEqual({ needsTerms: false, needsAddendum: true, required: true });
    const done = artistTermsStatus({ artist_terms: [entry({ launchAddendumVersion: LAUNCH_ADDENDUM_VERSION })] }, { isArtist: true, launchPartner: true });
    expect(done.required).toBe(false);
  });

  it('garbage metadata reads as no acceptance, never as accepted', () => {
    for (const junk of [null, undefined, 'x', { artist_terms: 'yes' }, { artist_terms: [{ version: 1 }] }, { artist_terms: [null] }]) {
      expect(artistTermsStatus(junk, { isArtist: true, launchPartner: false }).needsTerms).toBe(true);
    }
  });

  it('acceptances append as a history and never rewrite an earlier one', () => {
    const old = entry({ version: '2026-01-01', name: 'Old' });
    const next = appendAcceptance([old], entry());
    expect(next).toHaveLength(2);
    expect(next[0].name).toBe('Old');
    expect(appendAcceptance(Array.from({ length: 25 }, () => old), entry())).toHaveLength(20);
  });

  it('a signature is a real typed name', () => {
    expect(cleanSignature('  Andre   Smith ')).toBe('Andre Smith');
    for (const bad of ['', ' ', 'x', 7, null, 'y'.repeat(121)]) expect(cleanSignature(bad)).toBeNull();
  });
});

describe('artist terms: the words', () => {
  const all = [...ARTIST_TERMS_POINTS, LAUNCH_ADDENDUM_INTRO, ...LAUNCH_ADDENDUM_STEPS, LAUNCH_ADDENDUM_OUTRO].join('\n');

  it('names the operating company in the hold-harmless point', () => {
    expect(ARTIST_TERMS_POINTS.some((p) => /defend, indemnify and hold harmless JNW Creative Enterprises Inc\./.test(p))).toBe(true);
  });

  it('the launch conditions use the SAME numbers the launch checklist measures', () => {
    expect(LAUNCH_ADDENDUM_STEPS.join(' ')).toContain(`at least ${GUARANTEE_MIN_CONTACTS} fans`);
    expect(LAUNCH_ADDENDUM_STEPS.join(' ')).toContain(`at least ${GUARANTEE_MIN_PROVEN_BUYERS} proven buyers`);
    expect(LAUNCH_ADDENDUM_STEPS.join(' ').toLowerCase()).toMatch(/stripe/);
    expect(LAUNCH_ADDENDUM_STEPS.join(' ').toLowerCase()).toMatch(/launch campaign/);
    expect(LAUNCH_ADDENDUM_STEPS.join(' ').toLowerCase()).toMatch(/post on your crwn page/);
    expect(LAUNCH_ADDENDUM_OUTRO).toMatch(/not a promise of any amount of money/);
  });

  it('carries no em dash or en dash', () => {
    expect(all).not.toMatch(/[–—]/);
  });
});

describe('artist terms: the legal pages say the same thing', () => {
  const terms = readFileSync('src/app/(public)/terms/page.tsx', 'utf8');
  const agreement = readFileSync('src/app/(public)/artist-agreement/page.tsx', 'utf8');

  it('the Terms of Service hold JNW Creative Enterprises harmless for uploaded content', () => {
    expect(terms).toMatch(/defend, indemnify, and hold harmless JNW Creative Enterprises Inc\./);
    expect(terms).toMatch(/If you upload or post any content/);
  });

  it('the Artist Agreement does too, and says acceptance is recorded', () => {
    expect(agreement).toMatch(/defend, indemnify, and hold harmless JNW Creative Enterprises Inc\./);
    expect(agreement).toMatch(/accept the artist terms by signing with your name/);
  });

  it('both pages carry the date the artist terms version took effect', () => {
    expect(terms).toContain('Effective Date: September 30, 2026');
    expect(agreement).toContain('Effective Date: September 30, 2026');
    expect(ARTIST_TERMS_VERSION).toBe('2026-09-30');
  });
});

describe('the operating entity is spelled one way (founder, 2026-09-30)', () => {
  it('no source file writes "JNW Creative Enterprises, Inc" (the entity has no comma)', async () => {
    const { readdirSync } = await import('node:fs');
    const files = (readdirSync('src', { recursive: true }) as string[]).filter((f) => /\.(tsx?|mjs|js)$/.test(f) && !f.endsWith('artistTerms.test.ts'));
    const offenders = files.filter((f) => /Creative Enterprises,\s*Inc/i.test(readFileSync(`src/${f}`, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
