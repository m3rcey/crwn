import { describe, expect, it } from 'vitest';
import {
  blocksPurchase,
  cardPath,
  cleanCreditName,
  creditLabel,
  creditsPath,
  publicCredits,
  projectSlug,
  RECOGNITION_ONLY,
  resolveProject,
  seatsLeft,
  type CreditRow,
} from './credits';
import { creditsVerdict, MIN_VIEWERS, type CreditsFunnel } from './verdict';

const row = (o: Partial<CreditRow>): CreditRow => ({
  level: 'founding',
  credit_number: 1,
  credit_name: 'Keisha M.',
  listed: true,
  purchase_status: 'completed',
  ...o,
});

describe('cleanCreditName', () => {
  it('keeps an ordinary name, trimmed and collapsed', () => {
    expect(cleanCreditName('  Keisha   M. ')).toBe('Keisha M.');
    expect(cleanCreditName('Big Tone 773')).toBe('Big Tone 773');
  });
  it('refuses anything that would publish contact details', () => {
    expect(cleanCreditName('keisha@gmail.com')).toBeNull();
    expect(cleanCreditName('keisha at www.site.com')).toBeNull();
    expect(cleanCreditName('dre.com')).toBeNull();
    expect(cleanCreditName('Call 773-555-0199')).toBeNull();
  });
  it('refuses empty, symbol-only and over-long names', () => {
    expect(cleanCreditName('')).toBeNull();
    expect(cleanCreditName('!!!')).toBeNull();
    expect(cleanCreditName('x'.repeat(41))).toBeNull();
    expect(cleanCreditName(42)).toBeNull();
  });
});

describe('publicCredits', () => {
  it('names only fans who opted in, and counts the rest', () => {
    const out = publicCredits([
      row({ credit_number: 2, credit_name: 'B' }),
      row({ credit_number: 1, credit_name: 'A' }),
      row({ credit_number: 3, listed: false, credit_name: 'Private Person' }),
      row({ level: 'supporter', credit_number: 1, credit_name: 'C' }),
    ]);
    expect(out.founding.map((c) => c.name)).toEqual(['A', 'B']);
    expect(out.unlisted.founding).toBe(1);
    expect(JSON.stringify(out)).not.toContain('Private Person');
    expect(out.supporter).toEqual([{ level: 'supporter', number: 1, name: 'C' }]);
  });
  it('drops a refunded credit entirely, named or not', () => {
    const out = publicCredits([row({ purchase_status: 'refunded' }), row({ purchase_status: 'refunded', listed: false })]);
    expect(out.founding).toEqual([]);
    expect(out.unlisted.founding).toBe(0);
  });
  it('never prints a stored name that fails the name rule (an email that slipped in)', () => {
    const out = publicCredits([row({ credit_name: 'someone@mail.com' })]);
    expect(out.founding).toEqual([]);
    expect(out.unlisted.founding).toBe(1);
  });
});

describe('blocksPurchase', () => {
  it('lets a supporter upgrade to founding', () => {
    expect(blocksPurchase(['supporter'], 'founding')).toBeNull();
  });
  it('refuses paying twice for the same or a lower credit', () => {
    expect(blocksPurchase(['founding'], 'founding')).toMatch(/Founding Supporter/);
    expect(blocksPurchase(['founding'], 'supporter')).toMatch(/Founding Supporter/);
    expect(blocksPurchase(['supporter'], 'supporter')).toMatch(/Supporter/);
  });
  it('allows a first purchase', () => {
    expect(blocksPurchase([], 'supporter')).toBeNull();
  });
});

describe('paths and projects', () => {
  const albums = [
    { id: 'a1', title: 'Stompin Thru The Trenches' },
    { id: 'a2', title: "Fresh Prince Of O'Block" },
  ];
  it('resolves a project by handle or id', () => {
    expect(resolveProject(albums, 'stompin-thru-the-trenches')?.id).toBe('a1');
    expect(resolveProject(albums, 'fresh-prince-of-o-block')?.id).toBe('a2');
    expect(resolveProject(albums, 'a2')?.id).toBe('a2');
    expect(resolveProject(albums, 'nope')).toBeNull();
  });
  it('resolves neither when two titles share a handle', () => {
    expect(resolveProject([{ id: 'x', title: 'Home' }, { id: 'y', title: 'home!' }], 'home')).toBeNull();
  });
  it('builds the share paths', () => {
    expect(creditsPath('princedre', 'Stompin Thru The Trenches')).toBe('/princedre/credits/stompin-thru-the-trenches');
    expect(cardPath('princedre', 'Stompin Thru The Trenches', 'founding', 7)).toBe(
      '/princedre/credits/stompin-thru-the-trenches/founding/7',
    );
    expect(projectSlug('A'.repeat(80)).length).toBe(60);
  });
  it('labels and seats', () => {
    expect(creditLabel('founding', 7)).toBe('Founding Supporter #7');
    expect(seatsLeft(25, 3)).toBe(22);
    expect(seatsLeft(25, 30)).toBe(0);
    expect(seatsLeft(null, 3)).toBeNull();
  });
  it('states recognition only, in words a fan reads', () => {
    expect(RECOGNITION_ONLY).toMatch(/not ownership/);
    expect(RECOGNITION_ONLY).toMatch(/royalties/);
    expect(RECOGNITION_ONLY).not.toMatch(/[–—]/);
  });
});

describe('the card footer names a real page', () => {
  it('points the story at the project credits page and the preview at the artist page', async () => {
    const { cardFooterLink } = await import('./cardImage');
    expect(cardFooterLink('princedre', 'Stompin Thru The Trenches', true)).toBe('thecrwn.app/princedre/credits/stompin-thru-the-trenches');
    expect(cardFooterLink('princedre', 'Stompin Thru The Trenches', false)).toBe('thecrwn.app/princedre');
  });
});

describe('creditsVerdict (pre-committed rules)', () => {
  const base: CreditsFunnel = {
    primaryViewers: 100,
    primaryCheckouts: 5,
    declines: 40,
    downsellViewers: 40,
    downsellCheckouts: 3,
    foundingSold: 1,
    foundingCap: 25,
    supporterSold: 1,
    supporterCap: 50,
  };
  it('refuses a verdict below the viewer floor, even with an early sale', () => {
    expect(creditsVerdict({ ...base, primaryViewers: MIN_VIEWERS - 1 }).key).toBe('not_enough_traffic');
  });
  it('a sell-out outranks everything', () => {
    expect(creditsVerdict({ ...base, primaryViewers: 3, foundingSold: 25 }).key).toBe('sold_out');
  });
  it('separates "nobody pressed buy" from "nobody finished paying"', () => {
    const none = { ...base, foundingSold: 0, supporterSold: 0 };
    expect(creditsVerdict({ ...none, primaryCheckouts: 0, downsellCheckouts: 0 }).key).toBe('offer_not_landing');
    expect(creditsVerdict(none).key).toBe('checkout_friction');
  });
  it('flags the $150 carrying the offer', () => {
    expect(creditsVerdict({ ...base, foundingSold: 1, supporterSold: 4 }).key).toBe('downsell_carrying');
  });
  it('working at or above 2% of Founding viewers, weak below', () => {
    expect(creditsVerdict(base).key).toBe('working'); // 2 of 100
    expect(creditsVerdict({ ...base, primaryViewers: 200 }).key).toBe('weak'); // 2 of 200
  });
});
