import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveArtistHome, formatHomeMoney, type ArtistHomeInput } from './artistHome';
import { resolveRiseNextMove } from './riseNextMove';
import { resolveOperatingFlow } from './constraint/presentation';
import { buildRoadmapDefs, assembleRoadmap, type RoadmapStepResult } from './artistRoadmap';

const settled = (over: Partial<ArtistHomeInput> = {}): ArtistHomeInput => ({
  isArtist: true,
  settled: true,
  haveCanonicalAnswer: true,
  hasMove: true,
  stats: { members: 0, paidMembers: 0, mrrCents: 0 },
  firstPaidDone: false,
  earnedThisMonthCents: 0,
  ...over,
});

describe('a fan never receives the artist command center', () => {
  it('returns no money row, no move and no state for a non-artist, whatever else is passed', () => {
    const v = resolveArtistHome(
      settled({ isArtist: false, stats: { members: 9, paidMembers: 4, mrrCents: 10000 }, firstPaidDone: true }),
    );
    expect(v.money).toBeNull();
    expect(v.showMove).toBe(false);
    expect(v.state).toBe('loading');
  });
});

describe('the lifecycle is derived from canonical facts', () => {
  it('while the reads are in flight it holds the move slot and shows no money', () => {
    const v = resolveArtistHome(settled({ settled: false }));
    expect(v.state).toBe('loading');
    expect(v.showMove).toBe(true);
    expect(v.money).toBeNull();
  });

  it('ready but never paid: no "$0" banner, the move leads, the storefront keeps its loss line', () => {
    const v = resolveArtistHome(settled());
    expect(v.state).toBe('building');
    expect(v.money).toBeNull();
    expect(v.showMove).toBe(true);
    expect(v.storefrontVoice).toBe('loss');
  });

  it('a first paying member turns the money row on and demotes the storefront to utility', () => {
    const v = resolveArtistHome(
      settled({ stats: { members: 3, paidMembers: 1, mrrCents: 1000 }, firstPaidDone: true, earnedThisMonthCents: 920 }),
    );
    expect(v.state).toBe('earning');
    expect(v.storefrontVoice).toBe('utility');
    expect(v.money).toEqual({ earnedThisMonthCents: 920, earnedPending: false, recurringMonthlyCents: 1000, payingMembers: 1 });
  });

  it('a one-time buyer with no subscription still counts as paid, through the first-paid fact', () => {
    const v = resolveArtistHome(settled({ firstPaidDone: true, earnedThisMonthCents: 1999 }));
    expect(v.state).toBe('earning');
    expect(v.money?.payingMembers).toBe(0);
    expect(v.money?.earnedThisMonthCents).toBe(1999);
  });

  it('an artist paid before with nothing this month gets a REAL $0, because the read succeeded', () => {
    const v = resolveArtistHome(settled({ firstPaidDone: true, earnedThisMonthCents: 0 }));
    expect(v.money?.earnedThisMonthCents).toBe(0);
    expect(v.money?.earnedPending).toBe(false);
  });
});

describe('missing evidence is never zero', () => {
  it('a failed earnings read is null, not $0', () => {
    const v = resolveArtistHome(settled({ firstPaidDone: true, stats: { members: 2, paidMembers: 2, mrrCents: 2000 }, earnedThisMonthCents: null }));
    expect(v.money?.earnedThisMonthCents).toBeNull();
    expect(v.money?.earnedPending).toBe(false);
  });

  it('an earnings read still in flight is pending, not $0', () => {
    const v = resolveArtistHome(settled({ firstPaidDone: true, earnedThisMonthCents: undefined }));
    expect(v.money?.earnedThisMonthCents).toBeNull();
    expect(v.money?.earnedPending).toBe(true);
  });

  it('paid once but the stats did not load: no money row rather than a guessed one', () => {
    const v = resolveArtistHome(settled({ firstPaidDone: true, stats: null }));
    expect(v.state).toBe('earning');
    expect(v.money).toBeNull();
  });

  it('both canonical reads failed: nothing is claimed and the storefront is the one action left', () => {
    const v = resolveArtistHome(settled({ haveCanonicalAnswer: false, hasMove: false, stats: null, firstPaidDone: null }));
    expect(v.state).toBe('unknown');
    expect(v.money).toBeNull();
    expect(v.showMove).toBe(false);
    expect(v.storefrontPrimary).toBe(true);
  });

  it('a roadmap that did not load is not read as "never paid" when stats show a payer', () => {
    const v = resolveArtistHome(settled({ firstPaidDone: null, stats: { members: 1, paidMembers: 1, mrrCents: 2500 } }));
    expect(v.state).toBe('earning');
  });
});

describe('one gold button on the screen', () => {
  it('the canonical move outranks the storefront promotion', () => {
    expect(resolveArtistHome(settled({ hasMove: true })).storefrontPrimary).toBe(false);
    expect(resolveArtistHome(settled({ hasMove: true, firstPaidDone: true })).storefrontPrimary).toBe(false);
  });

  it('the storefront takes the gold only when no move exists', () => {
    expect(resolveArtistHome(settled({ hasMove: false })).storefrontPrimary).toBe(true);
  });
});

describe('the move on Home is the same move Rise Mode shows', () => {
  const all = (done: boolean): Record<string, RoadmapStepResult> =>
    Object.fromEntries(
      buildRoadmapDefs({ slug: 'x', goalMonthlyCents: null })
        .flatMap((s) => s.steps)
        .map((s) => [s.key, { done, current: done ? 1 : 0, target: 1 }]),
    );

  it('setup incomplete: the Foundation step is the move, and it returns to Home', () => {
    const roadmap = assembleRoadmap(buildRoadmapDefs({ slug: 'x', goalMonthlyCents: null }), all(false), null);
    const home = resolveRiseNextMove(resolveOperatingFlow(null), roadmap, '/home');
    const rise = resolveRiseNextMove(resolveOperatingFlow(null), roadmap);
    expect(home.move?.title).toBe(rise.move?.title);
    expect(home.stageTitle).toBe('Foundation');
    expect(home.move?.href).toContain('returnTo=%2Fhome');
    expect(rise.move?.href).toContain('returnTo=%2Fprofile%2Fartist');
  });
});

describe('formatHomeMoney', () => {
  it('drops cents on whole dollars and keeps them otherwise', () => {
    expect(formatHomeMoney(124000)).toBe('$1,240');
    expect(formatHomeMoney(1250)).toBe('$12.50');
    expect(formatHomeMoney(0)).toBe('$0');
  });
});

// ---------------------------------------------------------------------------------------------
// The page wiring. Comments are stripped so an explanation of what was removed is not read as
// the thing itself.
// ---------------------------------------------------------------------------------------------
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const page = strip(readFileSync('src/app/(main)/home/page.tsx', 'utf8'));
const lib = strip(readFileSync('src/lib/artistHome.ts', 'utf8'));

describe('Artist Home presents canonical answers and decides nothing of its own', () => {
  it('reads the same two canonical answers Rise Mode reads, plus the analytics month figure', () => {
    expect(page).toContain("fetch('/api/artist/constraint')");
    expect(page).toContain("fetch('/api/artist/roadmap')");
    expect(page).toContain('/api/analytics?artistId=');
    expect(page).toContain('resolveOperatingFlow');
    expect(page).toContain("resolveRiseNextMove(");
    expect(page).toContain("'/home'");
  });

  it('only an artist session fetches artist economics', () => {
    expect(page).toMatch(/if \(artistStatus !== 'artist'[^)]*\) return;/);
  });

  it('computes no money and ranks nothing', () => {
    for (const src of [page, lib]) {
      expect(src).not.toMatch(/\.from\('earnings'\)|\.from\('subscriptions'\)|countsAsPaying|net_amount/);
      expect(src).not.toMatch(/CONSTRAINT_THRESHOLDS|churnRate|readConstraint\(/);
    }
  });

  it('no longer runs the setup-wizard steps as a second progression system', () => {
    expect(page).not.toContain('useArtistSetup');
    expect(page).not.toContain('Finish setup');
  });

  it('does not re-add a link to Rise Mode (CLAUDE.md: no /profile/artist link on /home)', () => {
    expect(page).not.toContain('/profile/artist');
  });

  it('renders the command center above Featured Artists', () => {
    const command = page.indexOf('<NextMoveCard');
    const featured = page.indexOf('data-tour="home-feed"');
    expect(command).toBeGreaterThan(-1);
    expect(featured).toBeGreaterThan(command);
    expect(page.indexOf('data-home="money"')).toBeLessThan(command);
  });
});
