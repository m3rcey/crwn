import { describe, it, expect } from 'vitest';
import {
  DELIVERABLE_SPECS,
  DELIVERABLE_TOOL_SLUGS,
  getDeliverableSpec,
  hasDeliverable,
  sanitizeDeliverableValues,
  specFields,
} from './deliverableSpecs';
import { LEAD_MAGNETS, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';

// Every active public tool EXCEPT Own Your Fans (which has its own purpose-built FanCaptureBuilder).
const OYF = 'own-your-fans-calculator';

describe('universal pre-signup deliverable coverage', () => {
  it('every active public tool has a pre-signup deliverable', () => {
    const active = [...LEAD_MAGNETS.map((m) => m.slug), ...EXTERNAL_TOOLS.map((t) => t.key)];
    const missing = active.filter((slug) => slug !== OYF && !hasDeliverable(slug));
    expect(missing, `tools with no deliverable: ${missing.join(', ')}`).toEqual([]);
    expect(DELIVERABLE_TOOL_SLUGS).toHaveLength(active.length - 1); // all but OYF
  });

  it('every spec is usable: steps, fields, a save label that names the artifact, a real continue route', () => {
    for (const spec of DELIVERABLE_SPECS) {
      expect(spec.steps.length, spec.toolSlug).toBeGreaterThan(0);
      expect(specFields(spec).length, spec.toolSlug).toBeGreaterThan(1);
      expect(spec.saveLabel.toLowerCase(), spec.toolSlug).not.toContain('account');
      expect(spec.saveLabel.toLowerCase(), spec.toolSlug).not.toContain('sign up');
      expect(spec.continueRoute.startsWith('/'), spec.toolSlug).toBe(true);
      // Preview must reference real field keys.
      const keys = new Set(specFields(spec).map((f) => f.key));
      for (const k of [spec.preview.titleKey, spec.preview.subtitleKey, spec.preview.priceKey, spec.preview.benefitsKey, spec.preview.ctaKey, spec.preview.secondaryCtaKey]) {
        if (k) expect(keys.has(k), `${spec.toolSlug} preview key ${k}`).toBe(true);
      }
      for (const k of spec.preview.itemKeys || []) {
        expect(keys.has(k), `${spec.toolSlug} itemKey ${k}`).toBe(true);
      }
    }
  });

  it('prefill is pure and produces values for its own fields', () => {
    for (const spec of DELIVERABLE_SPECS) {
      const v = spec.prefill({});
      expect(typeof v, spec.toolSlug).toBe('object');
      const keys = new Set(specFields(spec).map((f) => f.key));
      for (const k of Object.keys(v)) expect(keys.has(k), `${spec.toolSlug}: prefill key ${k}`).toBe(true);
    }
  });
});

describe('honest prefill: no invented financial figures', () => {
  it('leaves price empty when the tool modeled no price', () => {
    // Founder Window models no price: it must NOT be pre-filled with a number.
    expect(getDeliverableSpec('founder-window-builder')!.prefill({}).price).toBe('');
    // Clip-to-Earn plans a campaign but sets no reward amount.
    expect(getDeliverableSpec('clip-to-earn-campaign-planner')!.prefill({}).rewardConcept).toBe('');
  });

  it('uses the tool modeled price when one exists', () => {
    expect(getDeliverableSpec('vault-revenue-planner')!.prefill({ priceCents: 2500 }).price).toBe(25);
    expect(getDeliverableSpec('live-experience-calculator')!.prefill({ ticketPriceCents: 1500 }).price).toBe(15);
    expect(getDeliverableSpec('worth')!.prefill({ ladder: [{ name: 'Inner Circle', priceCents: 1000 }] }).price).toBe(10);
  });
});

describe('sensitive tools stay honest', () => {
  it('Team Splits is a non-binding scenario and creates no deal', () => {
    const spec = getDeliverableSpec('team-split-deal-builder')!;
    expect(spec.subtitle.toLowerCase()).toContain('not an agreement');
    expect(spec.preview.note?.toLowerCase()).toContain('not binding');
    expect(spec.prefill({}).percent).toBe(''); // never pre-set someone's split
  });

  it('Royalty stays a diagnostic checklist with no dollar figure and no collection claim', () => {
    const spec = getDeliverableSpec('royalty-readiness-check')!;
    const money = specFields(spec).filter((f) => f.type === 'currency');
    expect(money).toEqual([]);
    expect(spec.preview.note?.toLowerCase()).toContain('does not collect royalties');
  });

  it('Quest Path is described as a general order, not a personalized diagnosis', () => {
    const spec = getDeliverableSpec('artist-quest-path')!;
    expect(spec.subtitle.toLowerCase()).toContain('not a result computed from your answers');
  });

  it('every preview note makes clear nothing is published yet', () => {
    for (const spec of DELIVERABLE_SPECS) {
      expect(spec.preview.note, spec.toolSlug).toBeTruthy();
    }
  });
});

describe('sanitizeDeliverableValues (public trust boundary)', () => {
  const spec = getDeliverableSpec('worth')!;

  it('keeps allowlisted fields and clamps them', () => {
    const v = sanitizeDeliverableValues(spec, { tierName: 'x'.repeat(200), price: 999999, benefits: ['a', 'b'] });
    expect(String(v.tierName)).toHaveLength(40);
    expect(v.price).toBe(500); // clamped to field max
    expect(v.benefits).toEqual(['a', 'b']);
  });

  it('drops unknown keys entirely (no PII, no injected fields)', () => {
    const v = sanitizeDeliverableValues(spec, { email: 'fan@example.com', artistId: 'abc', tierName: 'Inner Circle' });
    expect(JSON.stringify(v)).not.toContain('@');
    expect(JSON.stringify(v)).not.toContain('artistId');
    expect(v.tierName).toBe('Inner Circle');
  });

  it('strips markup from copy and caps list length', () => {
    const v = sanitizeDeliverableValues(spec, { tierName: '<script>alert(1)</script>', benefits: Array(50).fill('x') });
    expect(String(v.tierName)).not.toContain('<');
    expect((v.benefits as string[]).length).toBeLessThanOrEqual(20);
  });

  it('rejects an option value outside the spec', () => {
    expect(sanitizeDeliverableValues(spec, { focus: 'hacked' }).focus).toBeUndefined();
    expect(sanitizeDeliverableValues(spec, { focus: 'access' }).focus).toBe('access');
  });

  it('coerces malformed numbers safely', () => {
    expect(sanitizeDeliverableValues(spec, { price: 'abc' }).price).toBeUndefined();
    expect(sanitizeDeliverableValues(spec, { price: -20 }).price).toBe(0);
  });
});
