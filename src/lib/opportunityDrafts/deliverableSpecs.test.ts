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
    // Worth is now the four-tier ladder: the entry PAID tier carries the modeled price.
    expect(getDeliverableSpec('worth')!.prefill({ ladder: [{ name: 'Silver', priceCents: 1000 }] }).t1Price).toBe(10);
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

  // Z2B-2: the artist answered these in the calculator, so the builder must not ask again.
  describe('Clip-to-Earn carries the calculator answers into the builder', () => {
    const spec = () => getDeliverableSpec('clip-to-earn-campaign-planner')!;

    it('prefills source, moments, rules and reward from the conversion payload', () => {
      const v = spec().prefill({
        sourceContent: 'my new single "Crown"',
        moments: ['A hook moment from my new single "Crown"'],
        rules: ['Length: 7-15s', 'Platforms: TikTok'],
        rewardDetail: 'a signed vinyl',
      });
      expect(v.sourceContent).toBe('my new single "Crown"');
      expect(v.moments).toEqual(['A hook moment from my new single "Crown"']);
      expect(v.rules).toEqual(['Length: 7-15s', 'Platforms: TikTok']);
      expect(v.rewardConcept).toBe('a signed vinyl');
    });

    // A result saved before those payload keys existed must behave exactly as it did before.
    it('falls back to the generic defaults for a historical payload with none of the new keys', () => {
      const v = spec().prefill({ title: 'Clip x', rewardType: 'badge' });
      expect(v.sourceContent).toBe('');
      expect(v.rewardConcept).toBe('');
      expect((v.moments as string[])[0]).toBe('The hook everyone repeats');
      expect((v.rules as string[])[0]).toBe('Use the original audio');
    });

    // Never invented: the calculator asks for neither, so they stay defaulted.
    it('does not invent a campaign length or eligibility the calculator never asked for', () => {
      const v = spec().prefill({ sourceContent: 'a live set' });
      expect(v.durationDays).toBe(30);
      expect(v.eligibility).toBe('Any fan');
    });
  });

  it('every preview note makes clear nothing is published yet', () => {
    for (const spec of DELIVERABLE_SPECS) {
      expect(spec.preview.note, spec.toolSlug).toBeTruthy();
    }
  });
});

describe('sanitizeDeliverableValues (public trust boundary)', () => {
  const spec = getDeliverableSpec('worth')!; // four-tier ladder fields
  const vault = getDeliverableSpec('vault-revenue-planner')!; // has a real option field (cadence)

  it('keeps allowlisted fields and clamps them', () => {
    const v = sanitizeDeliverableValues(spec, { t1Name: 'x'.repeat(200), t1Price: 999999, t1Benefits: ['a', 'b'] });
    expect(String(v.t1Name)).toHaveLength(40);
    expect(v.t1Price).toBe(500); // clamped to field max
    expect(v.t1Benefits).toEqual(['a', 'b']);
  });

  it('drops unknown keys entirely (no PII, no injected fields)', () => {
    const v = sanitizeDeliverableValues(spec, { email: 'fan@example.com', artistId: 'abc', t1Name: 'Silver' });
    expect(JSON.stringify(v)).not.toContain('@');
    expect(JSON.stringify(v)).not.toContain('artistId');
    expect(v.t1Name).toBe('Silver');
  });

  it('strips markup from copy and caps list length', () => {
    const v = sanitizeDeliverableValues(spec, { t1Name: '<script>alert(1)</script>', t1Benefits: Array(50).fill('x') });
    expect(String(v.t1Name)).not.toContain('<');
    expect((v.t1Benefits as string[]).length).toBeLessThanOrEqual(20);
  });

  it('rejects an option value outside the spec', () => {
    expect(sanitizeDeliverableValues(vault, { cadence: 'hacked' }).cadence).toBeUndefined();
    expect(sanitizeDeliverableValues(vault, { cadence: 'monthly' }).cadence).toBe('monthly');
  });

  it('coerces malformed numbers safely', () => {
    expect(sanitizeDeliverableValues(spec, { t1Price: 'abc' }).t1Price).toBeUndefined();
    expect(sanitizeDeliverableValues(spec, { t1Price: -20 }).t1Price).toBe(0);
  });
});
