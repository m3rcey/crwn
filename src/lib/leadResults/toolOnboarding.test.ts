import { describe, it, expect } from 'vitest';
import { buildDraftConfig } from './postSetupDestination';
import { resolveJourneyDestination } from '@/lib/journey/resolveJourneyDestination';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { getFunnelByToolKey } from '@/lib/opportunityFunnels/registry';
import { getDeliverableSpec } from '@/lib/opportunityDrafts/deliverableSpecs';
import { continueCtaFor } from '@/lib/leadMagnets/continuationCta';
import type { LeadMagnetSeed } from './handoffSeed';

function seed(over: Partial<LeadMagnetSeed>): LeadMagnetSeed {
  return {
    resultId: 'r1', toolSlug: 'fan-mission-generator', toolName: 'Fan Mission', headline: 'x',
    heroValue: null, heroSuffix: null, estimatedMonthlyCents: null, estimatedAnnualCents: null,
    conversionPayload: {}, convertHref: '/x',
    ...over,
  } as LeadMagnetSeed;
}

const artistCtx = { isArtist: true, setupComplete: true, questEngineEnabled: false } as const;

// The two tools onboarded in this batch and their real, existing builders.
const BATCH = [
  { slug: 'fan-mission-generator', route: '/missions/new', adapterKey: 'mission', keyword: 'mission', cta: 'Launch My First Fan Mission' },
  { slug: 'proof-of-demand-test-builder', route: '/proof-of-demand/new', adapterKey: 'proofOfDemand', keyword: 'proof' },
];

describe.each(BATCH)('onboarded tool: $slug', (t) => {
  it('is registered with its route + adapter + keyword (registry)', () => {
    const cfg = getLeadMagnet(t.slug)!;
    expect(cfg).toBeTruthy();
    expect(cfg.conversionTarget.route).toBe(t.route);
    expect(cfg.conversionTarget.adapterKey).toBe(t.adapterKey);
    expect(cfg.dmKeywords).toContain(t.keyword);
  });

  it('is supported + reachable in the funnel layer, public route preserved', () => {
    const f = getFunnelByToolKey(t.slug)!;
    // lifecycle is NOT asserted 'active' any more. Both tools onboarded here (fan-mission,
    // proof-of-demand) were paused from the /tools directory by the 2026-08-13 pre-PMF surface
    // reduction, which is a PROMOTION decision. Everything this test actually protects — the
    // route, the keyword, the adapter, the attribution channels, the auth boundary — is
    // unchanged, and `supported` is the field that would really break an old link.
    expect(f.supported).toBe(true);
    expect(f.promotion).toBe('none'); // available, not promoted (no founder promotion intent)
    expect(f.publicRoute).toBe(`/tools/${t.slug}`);
    expect(f.attributionChannels).toContain('web');
    expect(f.attributionChannels).toContain('instagram');
    expect(f.sourceVideoCompatible).toBe(true);
    expect(f.authBoundary).toBe('signup_to_save');
  });

  it('preserves the result version (unchanged, legacy generator = 1.0.0)', () => {
    expect(getFunnelByToolKey(t.slug)!.resultVersion).toBe('1.0.0');
  });

  it('buildDraftConfig routes to the real builder and prefills via the shared adapter', () => {
    const cfg = buildDraftConfig(seed({ toolSlug: t.slug, conversionPayload: { title: 'My thing', goal_count: 42 } }))!;
    expect(cfg).toBeTruthy();
    expect(cfg.path).toBe(t.route);
    expect(cfg.prefill.lm_title).toBe('My thing');
    expect(cfg.prefill.lm_goal).toBe('42');
  });

  it('resolves post-signup into the right builder (not a dead end)', () => {
    const d = resolveJourneyDestination({ ...artistCtx, seed: seed({ toolSlug: t.slug }) });
    expect(d.path).toBe(t.route);
    expect(d.reason).toBe('builder_restored');
  });

  it('a SAVED deliverable draft restores the artist own work instead', () => {
    const d = resolveJourneyDestination({ ...artistCtx, seed: seed({ toolSlug: t.slug }), savedDeliverableTool: t.slug });
    expect(d.path).toBe(`/plan/${t.slug}`);
    expect(getDeliverableSpec(t.slug)!.continueRoute).toBe(t.route);
  });
});

describe('CTA preservation', () => {
  it('keeps the fan-mission override CTA', () => {
    expect(continueCtaFor('fan-mission-generator')).toBe('Launch My First Fan Mission');
  });
});

describe('tools without a builder mapping still restore their SAVED plan', () => {
  it.each(['movement-page-blueprint', 'clip-to-earn-campaign-planner', 'team-split-deal-builder', 'royalty-readiness-check'])(
    '%s restores to its plan page when a draft was saved',
    (slug) => {
      // No legacy builder mapping...
      expect(buildDraftConfig(seed({ toolSlug: slug }))).toBeNull();
      // ...but the saved deliverable is what the artist actually built.
      const d = resolveJourneyDestination({ ...artistCtx, seed: seed({ toolSlug: slug }), savedDeliverableTool: slug });
      expect(d.reason).toBe('builder_restored');
      expect(d.path).toBe(`/plan/${slug}`);
    },
  );

  it('a tool with NO deliverable and no mapping still falls back safely', () => {
    const d = resolveJourneyDestination({ ...artistCtx, seed: seed({ toolSlug: 'not-a-real-tool' }) });
    expect(d.reason).toBe('fallback_dashboard');
  });
});

describe('no regression: Own Your Fans + Streaming Loss', () => {
  it('Own Your Fans stays primary and resumes to its plan', () => {
    expect(getFunnelByToolKey('own-your-fans-calculator')!.promotion).toBe('primary');
    const d = resolveJourneyDestination({ ...artistCtx, seed: seed({ toolSlug: 'own-your-fans-calculator', toolName: 'Own Your Fans' }) });
    expect(d.path).toBe('/own-your-fans/plan');
  });
  it('Streaming Loss still resumes to the membership builder, now the guided offer flow', () => {
    const d = resolveJourneyDestination({ ...artistCtx, seed: seed({ toolSlug: 'worth', toolName: 'Streaming Loss' }) });
    expect(d.path).toBe('/build/offer');
  });
});
