import { describe, it, expect } from 'vitest';
import {
  normalizeTag,
  normalizeChannel,
  normalizePlatform,
  parseCampaignAttribution,
  sanitizeStoredAttribution,
  mergeAttribution,
  attributionToFunnelDims,
  buildCampaignUrl,
  hasAttribution,
  EMPTY_ATTRIBUTION,
  MAX_TAG_LENGTH,
  ACQUISITION_CHANNELS,
  SOURCE_PLATFORMS,
} from './campaignAttribution';

const q = (s: string) => new URLSearchParams(s);

describe('normalizeTag: the security boundary', () => {
  it('slugifies ordinary marketing values', () => {
    expect(normalizeTag('KCamp Streaming Loss')).toBe('kcamp-streaming-loss');
    expect(normalizeTag('  Vault_V2  ')).toBe('vault_v2');
    expect(normalizeTag('kcamp.v1')).toBe('kcamp.v1');
  });

  it('strips everything that could be markup, script, or SQL', () => {
    expect(normalizeTag('<script>alert(1)</script>')).toBe('scriptalert1script');
    expect(normalizeTag('"><img src=x onerror=y>')).toBe('img-srcx-onerrory');
    expect(normalizeTag("'; DROP TABLE funnel_events; --")).toBe('drop-table-funnel_events');
    // Whatever survives contains only slug characters, which is the actual guarantee.
    for (const hostile of ['<b>x</b>', 'a\nb', 'a\tb', '{{7*7}}', '${x}', 'a/../../b']) {
      const out = normalizeTag(hostile);
      if (out) expect(out).toMatch(/^[a-z0-9._-]+$/);
    }
  });

  it('bounds length and never ends on a separator', () => {
    const long = 'a'.repeat(500);
    expect(normalizeTag(long)!.length).toBe(MAX_TAG_LENGTH);
    const cut = normalizeTag('b'.repeat(63) + '-' + 'c'.repeat(20));
    expect(cut!.endsWith('-')).toBe(false);
  });

  it('returns null for empty, whitespace-only, and non-string values', () => {
    expect(normalizeTag('')).toBeNull();
    expect(normalizeTag('   ')).toBeNull();
    expect(normalizeTag('!!!')).toBeNull();
    expect(normalizeTag(null)).toBeNull();
    expect(normalizeTag(undefined)).toBeNull();
    expect(normalizeTag({})).toBeNull();
    expect(normalizeTag([])).toBeNull();
    expect(normalizeTag(true)).toBeNull();
  });
});

describe('allowlists', () => {
  it('accepts every declared channel and drops anything else', () => {
    for (const c of ACQUISITION_CHANNELS) expect(normalizeChannel(c)).toBe(c);
    expect(normalizeChannel('ORGANIC')).toBe('organic');
    expect(normalizeChannel('growth-hack')).toBeNull();
    expect(normalizeChannel('<b>organic</b>')).toBeNull();
  });

  it('accepts every declared platform and normalizes the rest to other', () => {
    for (const p of SOURCE_PLATFORMS) expect(normalizePlatform(p)).toBe(p);
    expect(normalizePlatform('IG')).toBe('instagram');
    expect(normalizePlatform('Twitter')).toBe('x');
    expect(normalizePlatform('myspace')).toBe('other');
    expect(normalizePlatform('')).toBeNull();
  });
});

describe('parseCampaignAttribution', () => {
  it('reads the canonical tagged link', () => {
    const a = parseCampaignAttribution(
      q('utm_source=instagram&utm_medium=organic&utm_campaign=kcamp_streaming_loss&utm_content=kcamp_v1&angle=streaming_loss&keyword=vault&variant=b'),
    );
    expect(a).toEqual({
      channel: 'organic',
      platform: 'instagram',
      campaign: 'kcamp_streaming_loss',
      creative: 'kcamp_v1',
      variant: 'b',
      angle: 'streaming_loss',
      keyword: 'vault',
      ref: null,
      entry: null,
    });
  });

  it('accepts the plain-English aliases a hand-written link uses', () => {
    const a = parseCampaignAttribution(q('platform=tiktok&channel=organic&campaign=vault_v2&creative=vault_v2_hook1'));
    expect(a.platform).toBe('tiktok');
    expect(a.channel).toBe('organic');
    expect(a.campaign).toBe('vault_v2');
    expect(a.creative).toBe('vault_v2_hook1');
  });

  it('keeps the params that already existed (ref, from)', () => {
    const a = parseCampaignAttribution(q('ref=lead-magnet&from=rnb_empire_builder'));
    expect(a.ref).toBe('lead-magnet');
    expect(a.entry).toBe('rnb_empire_builder');
  });

  it('is empty for an untagged link, so existing links keep working', () => {
    expect(parseCampaignAttribution(q(''))).toEqual(EMPTY_ATTRIBUTION);
    expect(parseCampaignAttribution(q('result=abc123&foo=bar'))).toEqual(EMPTY_ATTRIBUTION);
    expect(hasAttribution(parseCampaignAttribution(q('')))).toBe(false);
    expect(parseCampaignAttribution(null)).toEqual(EMPTY_ATTRIBUTION);
    expect(parseCampaignAttribution(undefined)).toEqual(EMPTY_ATTRIBUTION);
  });

  it('drops hostile and malformed values instead of storing them', () => {
    const a = parseCampaignAttribution(
      q(`utm_medium=%3Cscript%3E&utm_campaign=${'x'.repeat(400)}&keyword=%22%3E%3Cimg%3E`),
    );
    expect(a.channel).toBeNull(); // not on the allowlist
    expect(a.campaign!.length).toBe(MAX_TAG_LENGTH);
    expect(a.campaign).toMatch(/^[a-z0-9._-]+$/);
    expect(a.keyword).toBe('img');
  });

  it('never invents a field the parser does not declare', () => {
    const a = parseCampaignAttribution(q('stage=first_paid_conversion&calculator=worth&artist_id=1'));
    expect(Object.keys(a).sort()).toEqual(Object.keys(EMPTY_ATTRIBUTION).sort());
    expect(hasAttribution(a)).toBe(false);
  });
});

describe('sanitizeStoredAttribution: a stored row is still untrusted', () => {
  it('re-normalizes what it reads back', () => {
    const a = sanitizeStoredAttribution({ platform: 'IG', campaign: '<b>Camp</b>', channel: 'nope' });
    expect(a.platform).toBe('instagram');
    expect(a.campaign).toBe('bcampb');
    expect(a.channel).toBeNull();
  });

  it('survives garbage without throwing', () => {
    for (const v of [null, undefined, 'string', 42, [], { campaign: { nested: true } }]) {
      expect(() => sanitizeStoredAttribution(v)).not.toThrow();
    }
    expect(sanitizeStoredAttribution(null)).toEqual(EMPTY_ATTRIBUTION);
  });
});

describe('mergeAttribution: persisted attribution is FIRST-TOUCH', () => {
  const first = parseCampaignAttribution(q('utm_source=instagram&utm_campaign=kcamp_streaming_loss&utm_content=kcamp_v1'));

  it('never lets a later visit overwrite what the first one set', () => {
    const later = parseCampaignAttribution(q('utm_source=tiktok&utm_campaign=other_campaign&utm_content=other_v9'));
    const merged = mergeAttribution(first, later);
    expect(merged.platform).toBe('instagram');
    expect(merged.campaign).toBe('kcamp_streaming_loss');
    expect(merged.creative).toBe('kcamp_v1');
  });

  it('never lets an EMPTY later visit erase the first one (the duplicate-visit case)', () => {
    const merged = mergeAttribution(first, parseCampaignAttribution(q('')));
    expect(merged).toEqual(first);
  });

  it('lets a later visit ADD a dimension the first one left empty', () => {
    const merged = mergeAttribution(first, parseCampaignAttribution(q('angle=streaming_loss&keyword=vault')));
    expect(merged.campaign).toBe('kcamp_streaming_loss');
    expect(merged.angle).toBe('streaming_loss');
    expect(merged.keyword).toBe('vault');
  });

  it('handles null on either side', () => {
    expect(mergeAttribution(null, first)).toEqual(first);
    expect(mergeAttribution(first, null)).toEqual(first);
    expect(mergeAttribution(null, null)).toEqual(EMPTY_ATTRIBUTION);
  });
});

describe('attributionToFunnelDims', () => {
  it('maps onto the existing reporting dimensions and carries the rest in metadata', () => {
    const dims = attributionToFunnelDims(
      parseCampaignAttribution(q('utm_source=instagram&utm_medium=organic&utm_campaign=c1&utm_content=v1&angle=a1&keyword=k1&variant=b')),
    );
    expect(dims.campaign).toBe('c1');
    expect(dims.referrer).toBe('instagram');
    expect(dims.video).toBe('v1');
    expect(dims.metadata).toEqual({ channel: 'organic', platform: 'instagram', angle: 'a1', keyword: 'k1', variant: 'b' });
  });

  it('returns nothing for an untagged visit, so a spread cannot blank a dimension', () => {
    expect(attributionToFunnelDims(parseCampaignAttribution(q('')))).toEqual({});
    expect(attributionToFunnelDims(null)).toEqual({});
    // Spreading an empty result leaves an existing dimension untouched.
    const event = { campaign: 'already-set', ...attributionToFunnelDims(null) };
    expect(event.campaign).toBe('already-set');
  });
});

describe('buildCampaignUrl: what the builder emits, the parser accepts', () => {
  it('round-trips every dimension', () => {
    const url = buildCampaignUrl('https://thecrwn.app/tools/worth', {
      platform: 'instagram',
      channel: 'organic',
      campaign: 'kcamp_streaming_loss',
      creative: 'kcamp_v1',
      angle: 'streaming_loss',
      keyword: 'vault',
      variant: 'b',
    });
    const parsed = parseCampaignAttribution(new URL(url).searchParams);
    expect(parsed.platform).toBe('instagram');
    expect(parsed.channel).toBe('organic');
    expect(parsed.campaign).toBe('kcamp_streaming_loss');
    expect(parsed.creative).toBe('kcamp_v1');
    expect(parsed.angle).toBe('streaming_loss');
    expect(parsed.keyword).toBe('vault');
    expect(parsed.variant).toBe('b');
  });

  it('normalizes on the way out, so a typed value cannot produce a link the reports drop', () => {
    const url = buildCampaignUrl('https://thecrwn.app/tools/worth', {
      platform: 'Instagram Reels' as never,
      campaign: 'K Camp Streaming Loss',
    });
    expect(url).toContain('utm_campaign=k-camp-streaming-loss');
    // 'instagram reels' is not an alias, so it lands on the safe bucket rather than raw text.
    expect(url).toContain('utm_source=other');
  });

  it('omits every empty field and preserves unrelated existing params', () => {
    expect(buildCampaignUrl('https://thecrwn.app/tools/worth', {})).toBe('https://thecrwn.app/tools/worth');
    const url = buildCampaignUrl('https://thecrwn.app/tools/worth?result=tok123', { campaign: 'c1' });
    expect(url).toContain('result=tok123');
    expect(url).toContain('utm_campaign=c1');
  });
});
