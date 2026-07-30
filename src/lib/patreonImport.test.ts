import { describe, it, expect } from 'vitest';
import {
  detectPatreonCsv,
  parsePledgeCents,
  parsePatreonRows,
  patreonTierBreakdown,
  suggestCrwnTier,
  patreonTags,
} from './patreonImport';

const HEADERS = [
  'Name',
  'Email',
  'Patron Status',
  'Lifetime Amount',
  'Pledge Amount',
  'Charge Frequency',
  'Tier',
  'City',
  'State',
  'Country',
  'Phone',
];

const row = (over: Partial<Record<string, string>> = {}): string[] =>
  HEADERS.map((h) =>
    ({
      Name: 'Jae Fan',
      Email: 'JAE@example.com',
      'Patron Status': 'Active patron',
      'Lifetime Amount': '$60.00',
      'Pledge Amount': '$5.00',
      'Charge Frequency': 'monthly',
      Tier: 'The Homies',
      City: 'St. Louis',
      State: 'MO',
      Country: 'US',
      Phone: '',
      ...over,
    })[h] ?? '',
  );

describe('detectPatreonCsv', () => {
  it('recognizes the Relationship Manager export', () => {
    expect(detectPatreonCsv(HEADERS)).toBe(true);
    expect(detectPatreonCsv(['email', 'name', 'city'])).toBe(false);
  });

  it('recognizes older exports by the two amount columns', () => {
    expect(detectPatreonCsv(['Email', 'Pledge Amount', 'Lifetime Amount'])).toBe(true);
  });
});

describe('parsePledgeCents', () => {
  it('parses dollar strings, plain numbers, and junk', () => {
    expect(parsePledgeCents('$5.00')).toBe(500);
    expect(parsePledgeCents('12')).toBe(1200);
    expect(parsePledgeCents('')).toBe(0);
    expect(parsePledgeCents('n/a')).toBe(0);
  });
});

describe('parsePatreonRows', () => {
  it('shapes members, lowercases emails, and drops rows without one', () => {
    const members = parsePatreonRows(HEADERS, [row(), row({ Email: '' })]);
    expect(members).toHaveLength(1);
    expect(members[0]).toMatchObject({
      email: 'jae@example.com',
      name: 'Jae Fan',
      active: true,
      pledgeCents: 500,
      tierName: 'The Homies',
      city: 'St. Louis',
    });
  });

  it('flags former patrons as inactive', () => {
    const members = parsePatreonRows(HEADERS, [row({ 'Patron Status': 'Former patron' })]);
    expect(members[0].active).toBe(false);
  });
});

describe('patreonTierBreakdown', () => {
  it('groups by tier and pledge, biggest first, bucketing free members', () => {
    const members = parsePatreonRows(HEADERS, [
      row(),
      row({ Email: 'b@x.com' }),
      row({ Email: 'c@x.com', Tier: 'Vault Access', 'Pledge Amount': '$25.00' }),
      row({ Email: 'd@x.com', Tier: '', 'Pledge Amount': '', 'Patron Status': 'Free member' }),
    ]);
    const groups = patreonTierBreakdown(members);
    expect(groups[0]).toMatchObject({ tierName: 'The Homies', pledgeCents: 500, count: 2 });
    expect(groups.map((g) => g.tierName)).toContain('Free member');
  });
});

describe('suggestCrwnTier', () => {
  const tiers = [
    { name: 'Bronze', price: 0 },
    { name: 'Silver', price: 1000 },
    { name: 'Gold', price: 2500 },
    { name: 'Platinum', price: 10000 },
  ];

  it('maps free pledges to the free front door', () => {
    expect(suggestCrwnTier(0, tiers)?.name).toBe('Bronze');
  });

  it('maps paid pledges to the closest paid tier', () => {
    expect(suggestCrwnTier(500, tiers)?.name).toBe('Silver');
    expect(suggestCrwnTier(2500, tiers)?.name).toBe('Gold');
    expect(suggestCrwnTier(7000, tiers)?.name).toBe('Platinum');
  });

  it('breaks ties toward the cheaper rung', () => {
    expect(suggestCrwnTier(1750, tiers)?.name).toBe('Silver');
  });

  it('returns null when no matching kind of tier exists', () => {
    expect(suggestCrwnTier(500, [{ name: 'Bronze', price: 0 }])).toBeNull();
    expect(suggestCrwnTier(0, [{ name: 'Silver', price: 1000 }])).toBeNull();
  });
});

describe('patreonTags', () => {
  it('tags the source, the Patreon tier, and inactive status', () => {
    const [active, former] = parsePatreonRows(HEADERS, [
      row(),
      row({ Email: 'f@x.com', 'Patron Status': 'Former patron' }),
    ]);
    expect(patreonTags(active)).toEqual(['patreon', 'patreon-tier:The Homies']);
    expect(patreonTags(former)).toContain('patreon-inactive');
  });
});
