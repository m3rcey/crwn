// ATTR-001 / ID-005: attribution dimension parity.
//
// The Post-Win build hit this class twice: a dimension added to the
// CampaignAttribution interface was silently dropped by one of the explicit
// key maps (sanitizeStoredAttribution, buildCampaignUrl). This suite derives
// the dimension set from ONE canonical list (ATTRIBUTION_DIMENSIONS in the
// registry), cross-checks it against the product interface, and asserts every
// key map covers every dimension it is supposed to.
import { describe, it, expect } from 'vitest';
import { EMPTY_ATTRIBUTION, ATTRIBUTION_INPUT_KEY } from '../analytics/campaignAttribution';
import { ARTIST_REF_PARAM } from '../postWinReferral';
import { ATTRIBUTION_DIMENSIONS } from './invariants';
import { ATTRIBUTION_COVERAGE_EXCEPTIONS } from './exceptions';
import { readStripped, violation } from './sourceScan';

const SRC_PATH = 'src/lib/analytics/campaignAttribution.ts';

/** Slice one exported function body out of the module source. */
function fnBody(src: string, name: string): string {
  const start = src.indexOf(`export function ${name}`);
  expect(start, `campaignAttribution.ts no longer exports ${name} — the parity scan is examining nothing`).toBeGreaterThan(-1);
  const next = src.indexOf('export ', start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

describe('ATTR-001 — one canonical dimension list, full key-map parity', () => {
  const src = readStripped(SRC_PATH);
  const MAP_FNS = {
    parser: 'parseCampaignAttribution',
    sanitizer: 'sanitizeStoredAttribution',
    builder: 'buildCampaignUrl',
    dims: 'attributionToFunnelDims',
  } as const;

  it('the registry list and the product interface agree exactly (a new dimension must be registered)', () => {
    const productFields = Object.keys(EMPTY_ATTRIBUTION).sort();
    const registryFields = ATTRIBUTION_DIMENSIONS.map(d => d.field).sort();
    expect(
      productFields,
      violation(
        'ATTR-001',
        'CampaignAttribution fields and ATTRIBUTION_DIMENSIONS in src/lib/architecture/invariants.ts disagree. Register the new dimension (field + query param + which maps must carry it) so no key map can silently drop it.',
        { owner: SRC_PATH, docs: 'docs/crwn-brain/25-POST-WIN-REFERRAL.md' },
      ),
    ).toEqual(registryFields);
  });

  it('every dimension is covered by every map that must carry it', () => {
    for (const dim of ATTRIBUTION_DIMENSIONS) {
      for (const map of dim.coveredBy) {
        const body = fnBody(src, MAP_FNS[map]);
        // Each map spells the dimension differently: the parser and URL builder
        // use the quoted query-param name; the sanitizer re-parses via param
        // names as OBJECT KEYS (`utm_medium: v.channel`); the dims mapper reads
        // the interface field (`a.channel`).
        const covered =
          map === 'dims'
            ? body.includes(`a.${dim.field}`)
            : map === 'sanitizer'
              ? new RegExp(`(?<![a-z_'])${dim.param}\\s*:`).test(body)
              : body.includes(`'${dim.param}'`);
        expect(
          covered,
          violation(
            'ATTR-001',
            `${MAP_FNS[map]} does not carry attribution dimension '${dim.field}' (param '${dim.param}'). A dimension dropped by one map silently disappears from stored rows or rebuilt URLs — the exact Post-Win bug class.`,
            { file: SRC_PATH, docs: 'docs/crwn-brain/25-POST-WIN-REFERRAL.md' },
          ),
        ).toBe(true);
      }
    }
  });

  it('every map a dimension deliberately omits has a registered exception', () => {
    const allMaps = Object.keys(MAP_FNS) as Array<keyof typeof MAP_FNS>;
    const exceptions = new Set(ATTRIBUTION_COVERAGE_EXCEPTIONS.map(e => e.subject));
    for (const dim of ATTRIBUTION_DIMENSIONS) {
      for (const map of allMaps) {
        if (dim.coveredBy.includes(map)) continue;
        expect(
          exceptions.has(`${map}:${dim.field}`),
          `dimension '${dim.field}' omits map '${map}' with no registered exception — either cover it or document why in src/lib/architecture/exceptions.ts`,
        ).toBe(true);
      }
    }
    // Stale-exception detection: an exception for a covered pair is dead weight.
    for (const e of ATTRIBUTION_COVERAGE_EXCEPTIONS) {
      const [map, field] = e.subject.split(':');
      const dim = ATTRIBUTION_DIMENSIONS.find(d => d.field === field);
      expect(dim, `exception ${e.subject} names unknown dimension '${field}'`).toBeTruthy();
      expect(
        dim!.coveredBy.includes(map as never),
        `exception ${e.subject} is stale: the dimension now covers that map — remove the exception`,
      ).toBe(false);
    }
  });
});

describe('ID-005 — frozen attribution identifiers', () => {
  it('storage key and Post-Win param never change (stored rows + live links depend on them)', () => {
    expect(ATTRIBUTION_INPUT_KEY, violation('ID-005', 'ATTRIBUTION_INPUT_KEY changed; every stored lead_magnet_results attribution row is keyed to _attribution')).toBe('_attribution');
    expect(ARTIST_REF_PARAM, violation('ID-005', "ARTIST_REF_PARAM changed; artist_ref is the ratified Post-Win param and deliberately NOT 'ref' (the recruiter money param)")).toBe('artist_ref');
  });

  it('frozen query-param names all survive in the normalizer', () => {
    const src = readStripped(SRC_PATH);
    for (const dim of ATTRIBUTION_DIMENSIONS) {
      expect(src.includes(`'${dim.param}'`), violation('ID-005', `query param '${dim.param}' vanished from campaignAttribution.ts; live campaign links use it`)).toBe(true);
    }
  });
});
