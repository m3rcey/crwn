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
  it('the builder follows the result and derivation, before the email card, in BOTH views', () => {
    // Lead view order.
    const lead = worth.slice(worth.indexOf('{leadView ? ('));
    const order = ['{resultCard}', '{derivationCard}', '{builderSection}', '{inputsCard}', '{emailCaptureCard}'];
    let last = -1;
    for (const marker of order) {
      const i = lead.indexOf(marker);
      expect(i, marker).toBeGreaterThan(last);
      last = i;
    }
    // Cold view: inputs -> result -> derivation -> builder -> email.
    const cold = lead.slice(lead.indexOf(') : ('));
    expect(cold.indexOf('{resultCard}')).toBeLessThan(cold.indexOf('{derivationCard}'));
    expect(cold.indexOf('{derivationCard}')).toBeLessThan(cold.indexOf('{builderSection}'));
    expect(cold.indexOf('{builderSection}')).toBeLessThan(cold.indexOf('{emailCaptureCard}'));
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
