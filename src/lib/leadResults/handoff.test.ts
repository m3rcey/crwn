// Tests for the lead-magnet -> app handoff.
//
// Two things must not silently break:
//   1. The numeric opportunity gets persisted INTO result_data (buildLossResult), because every
//      handoff surface leads with that figure. If it stops being written, the bridge still shows
//      up but with no number, which reads as "there was nothing there".
//   2. getLeadMagnetSeed reads that result back into the exact shape the Action Plan and Rise Mode
//      render, including the external "worth" tool that is NOT in the registry map, the heroValue
//      passthrough, and the convertHref fallback when a tool has no live builder.
//
// The DB-mutating claim itself (autoClaimForUser) is covered by an integration path, not here:
// it binds rows via the service-role client and its safety (verified-email only, unclaimed-only,
// never re-parent another user's row) mirrors the reviewed claimResult it sits beside.

import { describe, expect, it } from 'vitest';

import { buildLossResult, type LossResultParams } from '../acquisition/lossResult';
import { getLeadMagnetSeed } from './handoffSeed';

// ---------------------------------------------------------------------------
// A minimal but valid loss result. money-framed, with a known monthly loss.
function lossParams(overrides: Partial<LossResultParams> = {}): LossResultParams {
  return {
    generatorVersion: '1.0.0',
    headline: 'About $1,240 a month is leaking past you.',
    cause: 'No membership.',
    estimate: [
      { label: 'Monthly on CRWN', value: '$1,240' },
      { label: 'Per year', value: '$14,880' },
    ],
    assumptions: ['2% of your audience converts'],
    consequences: ['Fans have nothing to buy'],
    fanLoss: 'Your fans cannot support you.',
    fix: { title: 'Turn on a tier', steps: ['Create a tier'] },
    flow: ['Loss', 'Setup', 'Fan joins', 'Recovered'],
    shareSummary: 'I mapped my streaming loss.',
    monthlyLossCents: 124_000,
    ...overrides,
  };
}

describe('buildLossResult persists the numeric opportunity into result_data', () => {
  it('writes monthly cents and annual = 12x monthly when a monthly loss is known', () => {
    const r = buildLossResult(lossParams());
    expect(r.estimatedMonthlyCents).toBe(124_000);
    expect(r.estimatedAnnualCents).toBe(124_000 * 12);
  });

  it('leaves both undefined for a score-only tool (no dollar figure)', () => {
    const r = buildLossResult(
      lossParams({ monthlyLossCents: undefined, headline: 'Your leakage score is 72.' }),
    );
    expect(r.estimatedMonthlyCents).toBeUndefined();
    expect(r.estimatedAnnualCents).toBeUndefined();
  });

  it('treats a zero monthly loss as "no figure", not $0', () => {
    const r = buildLossResult(lossParams({ monthlyLossCents: 0 }));
    expect(r.estimatedMonthlyCents).toBeUndefined();
    expect(r.estimatedAnnualCents).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// A fake PostgREST query builder: every filter/modifier returns `this`, and the terminal
// maybeSingle() resolves to a canned { data, error }. Enough to exercise getLeadMagnetSeed.
function fakeDb(response: { data: unknown; error?: unknown }) {
  const calls: { table?: string; eqs: Array<[string, unknown]> } = { eqs: [] };
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  builder.select = chain;
  builder.order = chain;
  builder.limit = chain;
  builder.eq = (col: string, val: unknown) => {
    calls.eqs.push([col, val]);
    return builder;
  };
  builder.maybeSingle = async () => ({ data: response.data, error: response.error ?? null });
  return {
    calls,
    db: {
      from: (t: string) => {
        calls.table = t;
        return builder;
      },
    },
  };
}

describe('getLeadMagnetSeed shapes a claimed result for the handoff surfaces', () => {
  it('returns null when there is no result', async () => {
    const { db } = fakeDb({ data: null });
    expect(await getLeadMagnetSeed(db, { userId: 'u1', artistId: 'a1' })).toBeNull();
  });

  it('returns null (never throws) on a query error', async () => {
    const { db } = fakeDb({ data: null, error: { message: 'boom' } });
    expect(await getLeadMagnetSeed(db, { userId: 'u1', artistId: 'a1' })).toBeNull();
  });

  it('names the external "worth" tool that is not in the registry map', async () => {
    const { db } = fakeDb({
      data: {
        id: 'r1',
        tool_slug: 'worth',
        title: 'Your streaming reality',
        result_data: { heroValue: '$1,240', heroSuffix: '/mo', estimatedMonthlyCents: 124_000 },
        created_at: '2026-07-25T00:00:00Z',
      },
    });
    const seed = await getLeadMagnetSeed(db, { userId: 'u1', artistId: 'a1' });
    expect(seed?.toolName).toBe('Streaming Loss Calculator');
    expect(seed?.heroValue).toBe('$1,240');
    expect(seed?.heroSuffix).toBe('/mo');
    expect(seed?.estimatedMonthlyCents).toBe(124_000);
    // No live builder adapter for worth -> falls back to a real route, never empty.
    expect(seed?.convertHref).toBeTruthy();
  });

  it('scopes by artist_id when an artist row exists, else by user_id', async () => {
    const withArtist = fakeDb({ data: null });
    await getLeadMagnetSeed(withArtist.db, { userId: 'u1', artistId: 'a1' });
    expect(withArtist.calls.eqs).toContainEqual(['artist_id', 'a1']);

    const noArtist = fakeDb({ data: null });
    await getLeadMagnetSeed(noArtist.db, { userId: 'u1', artistId: null });
    expect(noArtist.calls.eqs).toContainEqual(['user_id', 'u1']);
  });

  it('passes a null heroValue through for score-only results', async () => {
    const { db } = fakeDb({
      data: {
        id: 'r2',
        tool_slug: 'royalty-readiness-check',
        title: 'Your readiness',
        result_data: { headline: 'Score 72' },
        created_at: '2026-07-25T00:00:00Z',
      },
    });
    const seed = await getLeadMagnetSeed(db, { userId: 'u1', artistId: 'a1' });
    expect(seed).not.toBeNull();
    expect(seed?.heroValue).toBeNull();
    expect(seed?.estimatedMonthlyCents).toBeNull();
  });
});
