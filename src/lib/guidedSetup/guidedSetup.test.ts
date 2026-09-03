import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { GUIDED_FLOWS, GUIDED_FLOW_KEYS, guidedFlowHref, isGuidedFlowKey, safeSitePath, RISE_MODE_PATH } from './flows';
import { buildRoadmapDefs } from '../artistRoadmap';
import { questCta } from '../../components/quests/questRoutes';
import { GUIDED_SETUP_EVENT_NAMES, ALL_OPPORTUNITY_EVENT_NAMES, sanitizeOpportunityMeta } from '../opportunityFunnels/analytics';

// GUIDED SETUP (founder requirement, 2026-09-03).
//
//   Rise Mode quest -> contextual entry -> guided flow -> canonical product state -> completion
//   on the next read.
//
// These tests pin the contract the flows share, and the boundary with initial onboarding:
// /setup owns setup_completed and its twelve screens; /build owns nothing and writes only the
// rows the existing surfaces already own.

describe('the flow registry', () => {
  it('every flow has a same-site href and a legacy surface until its builder ships', () => {
    for (const key of GUIDED_FLOW_KEYS) {
      const def = GUIDED_FLOWS[key];
      expect(def.href.startsWith('/')).toBe(true);
      expect(def.href.startsWith('//')).toBe(false);
      if (def.legacyHref) expect(def.legacyHref.startsWith('/')).toBe(true);
      expect(def.title).not.toMatch(/tier_offer|fan_automation|sequence|entitlement|automation id/i);
    }
    expect(isGuidedFlowKey('offer')).toBe(true);
    expect(isGuidedFlowKey('../etc')).toBe(false);
  });

  it('refuses an off-site return path', () => {
    expect(safeSitePath('https://evil.example/', RISE_MODE_PATH)).toBe(RISE_MODE_PATH);
    expect(safeSitePath('//evil.example', RISE_MODE_PATH)).toBe(RISE_MODE_PATH);
    expect(safeSitePath('/studio/fans', RISE_MODE_PATH)).toBe('/studio/fans');
    expect(safeSitePath(null, RISE_MODE_PATH)).toBe(RISE_MODE_PATH);
  });

  it('the quest board hands out the SAME entry as the roadmap for each funnel quest', () => {
    const cta = (key: string) => questCta({ template_key: key, category: 'offer' }).href;
    expect(cta('artist_lead_magnet')).toBe(guidedFlowHref('magnet'));
    expect(cta('artist_offer_experience')).toBe(guidedFlowHref('experience'));
    expect(cta('artist_funnel_followup')).toBe(guidedFlowHref('followup'));
    expect(cta('artist_funnel_live')).toBe(guidedFlowHref('funnel'));
    expect(cta('artist_funnel_tested')).toBe(guidedFlowHref('test'));
    const roadmap = Object.fromEntries(buildRoadmapDefs({}).flatMap((s) => s.steps).map((s) => [s.key, s.href]));
    expect(roadmap['revenue-magnet']).toBe(cta('artist_lead_magnet'));
    expect(roadmap['revenue-experience']).toBe(cta('artist_offer_experience'));
    expect(roadmap['revenue-followup']).toBe(cta('artist_funnel_followup'));
    expect(roadmap['revenue-live']).toBe(cta('artist_funnel_live'));
  });
});

describe('telemetry rides the existing sink', () => {
  it('the three guided-setup events are allowlisted server-side through the derived constant', () => {
    expect(GUIDED_SETUP_EVENT_NAMES).toEqual(['guided_setup_started', 'guided_setup_step_reached', 'guided_setup_completed']);
    for (const n of GUIDED_SETUP_EVENT_NAMES) expect(ALL_OPPORTUNITY_EVENT_NAMES).toContain(n);
    const route = readFileSync('src/app/api/lead-magnets/analytics/route.ts', 'utf8');
    expect(route).toContain('...ALL_OPPORTUNITY_EVENT_NAMES');
  });

  it('flow, step and totalSteps survive the sanitizer; an email in a flow key does not', () => {
    const out = sanitizeOpportunityMeta({ flow: 'offer', step: 3, totalSteps: 6, artistId: 'a1', email: 'x@y.z' });
    expect(out).toMatchObject({ flow: 'offer', step: '3', totalSteps: '6', artistId: 'a1' });
    expect(sanitizeOpportunityMeta({ flow: 'me@example.com' }).flow).toBeUndefined();
  });

  it('the writer stores only the flow key and the artist id in metadata', () => {
    const server = readFileSync('src/lib/leadMagnets/server.ts', 'utf8');
    expect(server).toContain('metadata: eventMetadata(meta)');
    expect(server).toMatch(/\/\^\[a-z_\]\{1,40\}\$\//);
  });
});

describe('a subscription is built through the guided flow (founder decision D2, 2026-09-03)', () => {
  it('the legacy offer builder offers no subscription goal', () => {
    const legacy = readFileSync('src/app/offers/new/page.tsx', 'utf8');
    // The GOALS array carries no membership preset; a tier made there had free-text benefits
    // with no registry identity, so no delivery path and no readiness.
    expect(legacy).not.toMatch(/offerType: 'subscription'/);
    expect(legacy).not.toContain("id: 'grow-supporters'");
    expect(legacy).not.toContain("id: 'vault-access'");
  });

  it('every membership door points at the guided flow, and the share-to-earn seed at referrals', () => {
    const starter = readFileSync('src/lib/leadResults/starterOffer.ts', 'utf8');
    expect(starter).not.toContain("'/offers/new");
    expect(starter).toContain('/build/offer');
    const dest = readFileSync('src/lib/leadResults/postSetupDestination.ts', 'utf8');
    expect(dest).not.toContain("path: '/offers/new'");
    expect(dest).toContain("path: '/build/offer'");
    expect(dest).toContain("path: '/account/referrals'");
    const cta = questCta({ template_key: 'anything_uncatalogued', category: 'offer' }).href;
    expect(cta.startsWith(guidedFlowHref('offer'))).toBe(true);
  });

  it('the guided flow writes structured benefits through the one tier write path', () => {
    const flow = readFileSync('src/components/guided/offer/OfferFlow.tsx', 'utf8');
    expect(flow).toContain("fetch('/api/tier-benefits'");
    expect(flow).toContain('applyTemplateTier(');
    expect(flow).toContain('TierBenefitsSelector');
    expect(flow).not.toMatch(/BENEFIT_SUGGESTIONS|free-text/);
    // Never a hardcoded ladder or price: the recommended template is the only source.
    expect(flow).not.toMatch(/priceCents: (1000|2500|10000)\b/);
  });
});

describe('the onboarding boundary holds', () => {
  const setup = readFileSync('src/app/setup/page.tsx', 'utf8');

  it('/setup keeps its twelve one-field screens and gains no revenue-building screen', () => {
    const keys = [...setup.matchAll(/^\s*\{\s*key:\s*'([a-z-]+)'/gm)].map((m) => m[1]);
    expect(keys).toEqual([
      'artist-name',
      'artist-link',
      'photo',
      'ladder',
      'promises',
      'stripe',
      'content-plan',
      'track-audio',
      'track-title',
      'product-type',
      'product-title',
      'product-price',
    ]);
    expect(setup).not.toContain('/build/');
    expect(setup).not.toMatch(/tier_offer_experiences|fan_automations|lead magnet builder/);
  });

  it('/setup is the only surface that completes setup', () => {
    const files = walk('src/app/build');
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toContain('complete-setup');
      expect(src, f).not.toContain('setup_completed');
    }
    // The wizard completes through the one hook, which posts to the one route.
    expect(setup).toContain('markComplete');
    expect(readFileSync('src/hooks/useArtistSetup.ts', 'utf8')).toContain('/api/artist/complete-setup');
  });

  it('a guided flow never writes a "wizard complete" flag of its own', () => {
    for (const dir of ['src/app/build', 'src/components/guided', 'src/lib/guidedSetup']) {
      if (!existsSync(dir)) continue;
      for (const f of walk(dir)) {
        const src = readFileSync(f, 'utf8');
        expect(src, f).not.toMatch(/wizard_complete|_wizard_done|guided_complete/);
      }
    }
  });
});

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}
