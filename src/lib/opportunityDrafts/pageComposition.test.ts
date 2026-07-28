import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { DELIVERABLE_SPECS, buildCtaFor, transitionFor, DELIVERABLE_TOOL_SLUGS } from './deliverableSpecs';

// Structural tests for the universal Opportunity Funnel page composition:
// result -> transition -> BUILDER -> secondary actions -> supporting content.
// These read the actual source so a reordering regression fails loudly.

const root = process.cwd();
const publicToolClient = readFileSync(join(root, 'src/components/lead-magnets/PublicToolClient.tsx'), 'utf-8');
const worth = readFileSync(join(root, 'src/app/(public)/worth/WorthExperience.tsx'), 'utf-8');

describe('CTA contract: the builder is the CTA', () => {
  it('every deliverable tool has a transition line and a build CTA that never mentions signup', () => {
    for (const slug of DELIVERABLE_TOOL_SLUGS) {
      const t = transitionFor(slug);
      const c = buildCtaFor(slug);
      expect(t.length, slug).toBeGreaterThan(10);
      expect(c.length, slug).toBeGreaterThan(3);
      for (const banned of ['sign up', 'signup', 'account', 'login', 'book a call']) {
        expect(t.toLowerCase(), `${slug} transition`).not.toContain(banned);
        expect(c.toLowerCase(), `${slug} cta`).not.toContain(banned);
      }
    }
  });

  it('the three priority tools carry the founder-approved transitions', () => {
    expect(transitionFor('worth')).toBe('Turn this estimate into an offer your fans can join.');
    expect(transitionFor('share-to-earn-planner')).toBe('Turn this estimate into a campaign your fans can share.');
    expect(transitionFor('executive-producer-session')).toBe('Turn this opportunity into a session offer.');
    expect(buildCtaFor('worth')).toBe('Build my offer');
    expect(buildCtaFor('share-to-earn-planner')).toBe('Build my campaign');
    expect(buildCtaFor('executive-producer-session')).toBe('Build my session');
  });

  it('no spec transition or CTA uses an em dash', () => {
    for (const spec of DELIVERABLE_SPECS) {
      expect(spec.transition || '').not.toMatch(/[–—]/);
      expect(spec.buildCta || '').not.toMatch(/[–—]/);
    }
  });
});

describe('PublicToolClient page order (shared template for 16 tools + OYF)', () => {
  // Slice the full-result phase for order checks.
  const fullPhase = publicToolClient.slice(publicToolClient.indexOf("phase === 'full'"));

  it('renders the result-to-builder transition in the result afterHero slot (no signup CTA there)', () => {
    expect(fullPhase).toContain('<ResultToBuilder');
    expect(fullPhase.indexOf('<ResultToBuilder')).toBeLessThan(fullPhase.indexOf('ref={builderRef}'));
    // The old embedded signup CTA is gone from the template entirely.
    expect(publicToolClient).not.toContain('LeadEmailCta');
    expect(publicToolClient).not.toContain('continueCtaFor(');
  });

  it('the builder appears before email capture, explore link, and supporting content', () => {
    const builder = fullPhase.indexOf('ref={builderRef}');
    expect(builder).toBeGreaterThan(-1);
    expect(builder).toBeLessThan(fullPhase.indexOf('LeadCaptureForm'));
    expect(builder).toBeLessThan(fullPhase.indexOf('Explore another CRWN tool'));
    expect(builder).toBeLessThan(fullPhase.indexOf('<ToolShowcase'));
    expect(builder).toBeLessThan(fullPhase.indexOf('<CrwnShowcase'));
  });

  it('no signup link renders between the result and the builder', () => {
    const between = fullPhase.slice(0, fullPhase.indexOf('ref={builderRef}'));
    expect(between).not.toContain('/signup');
    expect(between).not.toContain('BOOK_CALL');
  });
});

describe('Worth page order', () => {
  it('the builder follows the result, CTA and derivation, before the inputs and email card', () => {
    const flow = worth.slice(worth.indexOf('{useEntryWizard ? ('));
    const order = ['{resultCard}', '{resultCta}', '{derivationCard}', '{builderSection}', '{inputsCard}', '{emailCaptureCard}'];
    let last = -1;
    for (const marker of order) {
      const i = flow.indexOf(marker);
      expect(i, marker).toBeGreaterThan(last);
      last = i;
    }
  });

  it('cold /worth opens as a one-question-per-screen wizard, homepage keeps its own flow', () => {
    expect(worth).toContain('const useEntryWizard = !homepage && !leadView && !entryDone;');
    expect(worth).toContain('<Wizard');
  });

  it('the long marketing tour is gated to the homepage, not the calculator', () => {
    for (const heading of ['Go live, and get paid for it', 'A gated community they pay to be in', 'Keep up to 92%']) {
      const i = worth.indexOf(heading);
      expect(i, heading).toBeGreaterThan(-1);
      expect(worth.lastIndexOf('{homepage && (', i), heading).toBeGreaterThan(-1);
    }
  });

  it('the misleading book-a-call CTA is gone and upper marketing CTAs are homepage-only', () => {
    expect(worth).not.toContain('Book a free 15-min call, keep this money');
    // The two upper PrimaryCTA blocks are gated to the homepage.
    const first = worth.indexOf('Show me how to capture my');
    const gate = worth.lastIndexOf('{homepage && (', first);
    expect(gate).toBeGreaterThan(-1);
  });

  it('exactly one optional help CTA remains on the tool view, framed as help', () => {
    expect(worth).toContain('Need help setting this up?');
  });
});

// ---- UX redesign: four-tier ladder, benefit CTAs, signup context, no blank boxes ----
import { getDeliverableSpec, specFields as fieldsOf } from './deliverableSpecs';
import { RECOMMENDED_LADDER, benefitLabels } from '@/lib/tierTemplate';

describe('Streaming Loss builds the FULL four-tier ladder', () => {
  const spec = getDeliverableSpec('worth')!;

  it('has one step per tier, in ladder order', () => {
    expect(spec.steps.map((s) => s.id)).toEqual(['wave', 'inner', 'vault', 'throne']);
    expect(spec.deliverableType).toBe('membership_ladder');
  });

  it('prefills all four tiers from the CANONICAL template, not invented copy', () => {
    const v = spec.prefill({});
    const [wave, inner, vault, throne] = RECOMMENDED_LADDER;
    expect(v.t0Name).toBe(wave.name);
    expect(v.t1Name).toBe(inner.name);
    expect(v.t2Name).toBe(vault.name);
    expect(v.t3Name).toBe(throne.name);
    expect(v.t0Benefits).toEqual(benefitLabels(wave));
    expect(v.t3Benefits).toEqual(benefitLabels(throne));
    // Free front door stays free; paid tiers carry the template prices.
    expect(v.t1Price).toBe(inner.priceCents / 100);
    expect(v.t2Price).toBe(vault.priceCents / 100);
    expect(v.t3Price).toBe(throne.priceCents / 100);
  });

  it("prefers the calculator's own modeled prices when present", () => {
    const v = spec.prefill({ ladder: [{ priceCents: 1200 }, { priceCents: 3000 }, { priceCents: 9000 }] });
    expect(v.t1Price).toBe(12);
    expect(v.t2Price).toBe(30);
    expect(v.t3Price).toBe(90);
  });

  it('previews the ladder, and every tier maps to real fields', () => {
    expect(spec.preview.kind).toBe('ladder');
    const keys = new Set(fieldsOf(spec).map((f) => f.key));
    for (const t of spec.preview.tiers || []) {
      expect(keys.has(t.nameKey)).toBe(true);
      expect(keys.has(t.benefitsKey)).toBe(true);
      if (t.priceKey) expect(keys.has(t.priceKey)).toBe(true);
    }
    expect(spec.preview.tiers).toHaveLength(4);
  });
});

describe('benefit-driven save CTAs and builder-specific signup context', () => {
  it('uses the founder-approved save labels', () => {
    expect(getDeliverableSpec('worth')!.saveLabel).toBe('Save my membership');
    expect(getDeliverableSpec('share-to-earn-planner')!.saveLabel).toBe('Save my campaigns');
    expect(getDeliverableSpec('executive-producer-session')!.saveLabel).toBe('Save my session');
    expect(getDeliverableSpec('vault-revenue-planner')!.saveLabel).toBe('Save my Vault');
    expect(getDeliverableSpec('proof-of-demand-test-builder')!.saveLabel).toBe('Save my test');
    expect(getDeliverableSpec('live-experience-calculator')!.saveLabel).toBe('Save my experience');
  });

  it('every tool explains WHY the account is needed, in its own words', () => {
    for (const spec of DELIVERABLE_SPECS) {
      expect(spec.signupContext, spec.toolSlug).toBeTruthy();
      expect(spec.signupContext!.toLowerCase(), spec.toolSlug).toContain('save');
      expect(spec.signupContext!, spec.toolSlug).not.toMatch(/[–—]/);
    }
    // Not generic: no two tools share the same reason.
    const all = DELIVERABLE_SPECS.map((s) => s.signupContext);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe('artists are not shown blank boxes', () => {
  it('Share-to-Earn generates FOUR campaigns, one per canonical tier, all pre-written', () => {
    const spec = getDeliverableSpec('share-to-earn-planner')!;
    const v = spec.prefill({});
    expect(spec.preview.kind).toBe('campaigns');
    expect(spec.preview.tiers).toHaveLength(4);
    // Names come from the canonical ladder, not a second tier source.
    expect([v.c0Name, v.c1Name, v.c2Name, v.c3Name]).toEqual(RECOMMENDED_LADDER.map((t) => t.name));
    // Every campaign message is written for the artist.
    for (const k of ['c0Message', 'c1Message', 'c2Message', 'c3Message']) {
      expect(String(v[k]).length, k).toBeGreaterThan(40);
    }
    expect(String(v.explanation).length).toBeGreaterThan(20);
    // Each tier step explains what that tier includes (context for artists who skipped Worth).
    for (const step of spec.steps.filter((st) => st.id.startsWith('c'))) {
      expect(step.fields.some((f) => (f.help || '').length > 20), step.id).toBe(true);
    }
  });

  it('does not fabricate a share link before signup', () => {
    const spec = getDeliverableSpec('share-to-earn-planner')!;
    expect(spec.preview.note?.toLowerCase()).toContain('generated inside the crwn app');
    const v = spec.prefill({});
    expect(JSON.stringify(v)).not.toContain('thecrwn.app/');
    expect(JSON.stringify(v)).not.toMatch(/\/r\//);
  });

  it('no spec leaves a required-feeling text field empty without a reason', () => {
    // Financial fields may be blank on purpose (never invent a price), and Team Splits is
    // deliberately blank end to end: pre-filling someone's split percentage would be dishonest.
    for (const spec of DELIVERABLE_SPECS.filter((s) => s.toolSlug !== 'team-split-deal-builder')) {
      const v = spec.prefill({});
      const filled = Object.values(v).filter((x) => (Array.isArray(x) ? x.length : String(x ?? '').length)).length;
      expect(filled, `${spec.toolSlug} prefilled fields`).toBeGreaterThan(1);
    }
  });
});
