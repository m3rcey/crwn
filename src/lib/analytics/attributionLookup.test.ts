import { describe, it, expect } from 'vitest';
import { attributionFromRows, resolveAttribution, attributionDimsFor, withAttribution } from './attributionLookup';
import { ATTRIBUTION_INPUT_KEY, parseCampaignAttribution } from './campaignAttribution';

const tag = (s: string) => parseCampaignAttribution(new URLSearchParams(s));

const row = (query: string) => ({ input_data: { [ATTRIBUTION_INPUT_KEY]: tag(query) } });

describe('attributionFromRows: first touch owns the artist', () => {
  it('returns null when no row carries a tag', () => {
    expect(attributionFromRows([])).toBeNull();
    expect(attributionFromRows(null)).toBeNull();
    expect(attributionFromRows([{ input_data: {} }, { input_data: null }])).toBeNull();
  });

  it('takes the OLDEST row (rows arrive oldest first) for every dimension it filled', () => {
    const merged = attributionFromRows([
      row('utm_source=instagram&utm_campaign=kcamp_streaming_loss&utm_content=kcamp_v1'),
      row('utm_source=tiktok&utm_campaign=later_campaign&utm_content=later_v2'),
    ]);
    expect(merged!.platform).toBe('instagram');
    expect(merged!.campaign).toBe('kcamp_streaming_loss');
    expect(merged!.creative).toBe('kcamp_v1');
  });

  it('lets a later row ADD a dimension the first left empty', () => {
    const merged = attributionFromRows([row('utm_campaign=c1'), row('angle=streaming_loss&keyword=vault')]);
    expect(merged!.campaign).toBe('c1');
    expect(merged!.angle).toBe('streaming_loss');
    expect(merged!.keyword).toBe('vault');
  });

  it('re-validates what it reads: a hand-edited stored row cannot inject anything', () => {
    const merged = attributionFromRows([
      { input_data: { [ATTRIBUTION_INPUT_KEY]: { campaign: '<script>x</script>', channel: 'not-a-channel', platform: 'IG' } } },
    ]);
    expect(merged!.campaign).toBe('scriptxscript');
    expect(merged!.channel).toBeNull();
    expect(merged!.platform).toBe('instagram');
  });

  it('skips a row whose stored tag normalizes to nothing', () => {
    const merged = attributionFromRows([{ input_data: { [ATTRIBUTION_INPUT_KEY]: { campaign: '!!!' } } }, row('utm_campaign=c2')]);
    expect(merged!.campaign).toBe('c2');
  });
});

// A minimal stand-in for the supabase query builder these helpers use.
function fakeDb(byColumn: Record<string, { input_data: Record<string, unknown> }[]>, opts?: { throws?: boolean }) {
  return {
    from() {
      let column = '';
      let value = '';
      const builder = {
        select: () => builder,
        eq: (col: string, v: string) => {
          column = col;
          value = v;
          return builder;
        },
        order: () => builder,
        limit: () => {
          if (opts?.throws) throw new Error('table missing');
          return Promise.resolve({ data: byColumn[`${column}:${value}`] ?? [] });
        },
      };
      return builder;
    },
  };
}

describe('resolveAttribution', () => {
  it('prefers the artist scope', async () => {
    const db = fakeDb({
      'artist_id:a1': [row('utm_campaign=artist_scope')],
      'user_id:u1': [row('utm_campaign=user_scope')],
    });
    const a = await resolveAttribution(db, { userId: 'u1', artistId: 'a1' });
    expect(a!.campaign).toBe('artist_scope');
  });

  it('falls back to the user scope when the artist has no rows (pre-claim)', async () => {
    const db = fakeDb({ 'user_id:u1': [row('utm_campaign=user_scope')] });
    const a = await resolveAttribution(db, { userId: 'u1', artistId: 'a1' });
    expect(a!.campaign).toBe('user_scope');
  });

  it('returns null with no identifiers and never queries', async () => {
    expect(await resolveAttribution(fakeDb({}), {})).toBeNull();
    expect(await resolveAttribution(fakeDb({}), { userId: null, artistId: null })).toBeNull();
  });

  it('never throws when the table is missing or the query fails', async () => {
    await expect(resolveAttribution(fakeDb({}, { throws: true }), { userId: 'u1' })).resolves.toBeNull();
  });

  it('attributionDimsFor returns {} for an unattributed artist, so a spread is always safe', async () => {
    expect(await attributionDimsFor(fakeDb({}), { userId: 'u1' })).toEqual({});
  });
});

describe('withAttribution: stronger attribution is never overwritten', () => {
  it('fills empty dimensions', () => {
    const out = withAttribution(
      { stage: 'first_paid_conversion' } as Record<string, unknown>,
      { campaign: 'c1', referrer: 'instagram', video: 'v1', metadata: { angle: 'a1' } },
    );
    expect(out).toMatchObject({ campaign: 'c1', referrer: 'instagram', video: 'v1' });
    expect(out.metadata).toEqual({ angle: 'a1' });
  });

  it('keeps a dimension the event already set', () => {
    const out = withAttribution({ campaign: 'set-by-caller', metadata: { kind: 'subscription' } }, { campaign: 'c1', metadata: { angle: 'a1' } });
    expect(out.campaign).toBe('set-by-caller');
    // The event's own metadata wins on a key collision; attribution only adds.
    expect(out.metadata).toEqual({ angle: 'a1', kind: 'subscription' });
  });
});
