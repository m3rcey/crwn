import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import {
  BENEFIT_REGISTRY,
  benefitDelivery,
  isSupportedBenefit,
  selectableBenefits,
  recommendedBenefits,
  fastActionHref,
  readBenefitPointer,
  effortLabel,
  PILLAR_ORDER,
  CADENCE_OPTIONS,
} from './benefitRegistry';
import { BENEFIT_CATALOG, getBenefitDefinition, getBenefitDisplayText } from './benefitCatalog';
import { PROMISE_BENEFITS } from './promisePlan';
import { PREVIEW_KINDS } from './offerExperience/types';

// The keys that were in production before the registry existed. Renaming any of them
// orphans tier_benefits rows, fulfillment_obligations.benefit_type identities and the two
// enforcement gates (tierHasMessaging, release credits) that match on the string.
const LEGACY_KEYS = [
  'exclusive_tracks', 'exclusive_albums', 'exclusive_posts', 'early_access', 'community_badge',
  'shop_discount', 'supporter_wall', 'priority_replies', 'direct_messaging', 'one_on_one_call',
  'group_live_qa', 'custom_song_request', 'custom_experience', 'monthly_merch',
  'credits_on_releases', 'shoutout',
];

// Added 2026-09-03. Each names a capability that was ALREADY live with no benefit identity.
const ADDED_KEYS = [
  'stems', 'vault_collection', 'creative_voting', 'fan_submissions', 'member_recognition',
  'welcome_unlock', 'drop_alerts',
];

describe('benefit registry identity', () => {
  it('keeps every legacy key and adds only the audited new ones', () => {
    const keys = BENEFIT_REGISTRY.map((b) => b.key).sort();
    expect(keys).toEqual([...LEGACY_KEYS, ...ADDED_KEYS].sort());
  });

  it('has no duplicate keys', () => {
    const keys = BENEFIT_REGISTRY.map((b) => b.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never uses fan-facing copy as identity', () => {
    for (const b of BENEFIT_REGISTRY) {
      expect(b.key).toMatch(/^[a-z_]+$/);
      expect(b.label).not.toBe(b.key);
    }
  });
});

describe('support classification (D2, D3, section 1)', () => {
  it('recommends exactly the fan-economy set', () => {
    expect(recommendedBenefits().map((b) => b.key)).toEqual([
      'exclusive_tracks', 'early_access', 'exclusive_posts', 'stems', 'vault_collection',
      'creative_voting', 'fan_submissions', 'member_recognition', 'group_live_qa',
    ]);
  });

  it('orders recommended benefits by pillar: access, influence, contribution, status, experience', () => {
    const pillars = recommendedBenefits().map((b) => PILLAR_ORDER.indexOf(b.pillar!));
    for (let i = 1; i < pillars.length; i++) expect(pillars[i]).toBeGreaterThanOrEqual(pillars[i - 1]);
  });

  it('keeps direct messaging, shop discount and credits real but NOT recommended', () => {
    for (const k of ['direct_messaging', 'shop_discount', 'credits_on_releases']) {
      expect(benefitDelivery(k)?.support).toBe('additional');
      expect(isSupportedBenefit(k)).toBe(true);
    }
  });

  it('retires the three benefits CRWN sold and never delivered', () => {
    for (const k of ['exclusive_albums', 'community_badge', 'supporter_wall']) {
      expect(benefitDelivery(k)?.support).toBe('retired');
      expect(isSupportedBenefit(k)).toBe(false);
      expect(selectableBenefits().map((b) => b.key)).not.toContain(k);
      // Existing rows still resolve and render.
      expect(getBenefitDefinition(k as never)).toBeDefined();
      expect(getBenefitDisplayText(k)).toBeTruthy();
    }
  });

  it('classifies the artist-delivered promises as manual, with no readiness and no fast action', () => {
    for (const k of ['one_on_one_call', 'priority_replies', 'custom_song_request', 'custom_experience', 'monthly_merch', 'shoutout']) {
      const b = benefitDelivery(k)!;
      expect(b.support).toBe('manual');
      expect(b.readiness).toBeUndefined();
      expect(b.fastAction).toBeUndefined();
    }
  });

  it('gives every supported benefit a readiness resolver', () => {
    for (const b of BENEFIT_REGISTRY.filter((x) => isSupportedBenefit(x.key))) {
      expect(b.readiness, b.key).toBeDefined();
    }
  });

  it('gives every supported benefit except automatic recognition a fast action to an existing route', () => {
    for (const b of BENEFIT_REGISTRY.filter((x) => isSupportedBenefit(x.key))) {
      if (b.key === 'member_recognition') {
        expect(b.fastAction).toBeUndefined();
        continue;
      }
      expect(b.fastAction, b.key).toBeDefined();
      const path = b.fastAction!.path.split('?')[0];
      if (path.includes('{slug}')) continue; // the public artist page: src/app/[slug]
      const dir = `src/app/(main)${path}`;
      expect(existsSync(`${dir}/page.tsx`), `${b.key}: ${dir}/page.tsx`).toBe(true);
    }
  });

  it('suggests an existing Tier Offer Experience preview kind wherever it suggests one', () => {
    for (const b of BENEFIT_REGISTRY) {
      if (b.previewKind) expect(PREVIEW_KINDS).toContain(b.previewKind);
    }
  });
});

describe('cadence policy (section 9)', () => {
  it('every schedulable benefit defaults to No fixed schedule', () => {
    for (const b of BENEFIT_REGISTRY.filter((x) => x.cadence === 'optional')) {
      const f = b.configFields?.find((c) => c.key === 'frequency');
      expect(f, b.key).toBeDefined();
      expect(f!.default).toBe('');
      expect(f!.options?.[0]).toEqual({ value: '', label: 'No fixed schedule' });
    }
  });

  it('a benefit with a frequency field is in PROMISE_BENEFITS and vice versa', () => {
    const withField = BENEFIT_REGISTRY.filter((b) => b.configFields?.some((c) => c.key === 'frequency')).map((b) => b.key).sort();
    expect(withField).toEqual(Object.keys(PROMISE_BENEFITS).sort());
  });

  it('no frequency option is a code default: the first option is the empty one', () => {
    expect(CADENCE_OPTIONS[0].value).toBe('');
  });

  it('effort copy says recurring only when a schedule was chosen', () => {
    const bts = benefitDelivery('exclusive_posts')!;
    expect(effortLabel(bts, {})).toBe('Add when you have something');
    expect(effortLabel(bts, { frequency: 'weekly' })).toBe('Recurring because you chose a schedule');
    expect(effortLabel(bts, { frequency: '' })).toBe('Add when you have something');
  });
});

describe('fan-facing card lines never imply an unconfigured number or schedule', () => {
  it('early access with no day count names no number', () => {
    expect(getBenefitDisplayText('early_access', {})).not.toMatch(/\d/);
    expect(getBenefitDisplayText('early_access', { days_early: '' })).not.toMatch(/\d/);
    expect(getBenefitDisplayText('early_access', { days_early: 7 })).toBe('7-day early access to new music');
    expect(getBenefitDisplayText('early_access', { days_early: '14' })).toBe('14-day early access to new music');
  });

  it('behind the scenes and sessions carry a cadence word only when configured', () => {
    for (const k of ['exclusive_posts', 'group_live_qa', 'creative_voting']) {
      expect(getBenefitDisplayText(k, {}).toLowerCase()).not.toMatch(/weekly|monthly|quarterly/);
      expect(getBenefitDisplayText(k, { frequency: 'monthly' })).toMatch(/^Monthly /);
    }
  });

  it('an existing obligation title wins over the generic line', () => {
    expect(getBenefitDisplayText('exclusive_posts', { frequency: 'monthly', obligation_title: 'Monthly Vault unlock' })).toBe('Monthly Vault unlock');
    expect(getBenefitDisplayText('group_live_qa', { frequency: 'quarterly', obligation_title: 'Private group listening event' })).toBe('Quarterly private group listening event');
  });

  it('credits copy never claims rights', () => {
    const b = benefitDelivery('credits_on_releases')!;
    const text = `${b.label} ${b.fanMeaning} ${b.delivery} ${b.cardLine}`.toLowerCase();
    expect(text).not.toMatch(/royalt|ownership|publishing|producer credit|songwriting/);
    expect(b.disclaimer).toMatch(/recognition only/i);
  });

  it('no em dash anywhere in artist- or fan-facing copy', () => {
    for (const b of BENEFIT_REGISTRY) {
      const all = [b.label, b.fanMeaning, b.cardLine, b.delivery, b.disclaimer ?? ''].join(' ');
      expect(all, b.key).not.toMatch(/[—–]/);
    }
  });
});

describe('fast action pointers (section 16)', () => {
  it('carries the originating tier as a query pointer', () => {
    expect(fastActionHref('exclusive_tracks', { tierId: 'silver' })).toBe('/studio/music?benefit=exclusive_tracks&tier=silver');
    expect(fastActionHref('drop_alerts', { tierId: 'bronze' })).toBe('/studio/fans?view=compose&benefit=drop_alerts&tier=bronze');
  });

  it('routes behind-the-scenes to the artist page composer, and nowhere without a slug', () => {
    expect(fastActionHref('exclusive_posts', { tierId: 'silver', artistSlug: 'gb' })).toBe('/gb?tab=community&benefit=exclusive_posts&tier=silver');
    expect(fastActionHref('exclusive_posts', { tierId: 'silver' })).toBeNull();
  });

  it('recognition has no repetitive artist action', () => {
    expect(fastActionHref('member_recognition', { tierId: 'platinum' })).toBeNull();
  });

  it('reads a pointer back only for registry keys', () => {
    expect(readBenefitPointer('?benefit=stems&tier=abc')).toEqual({ benefit: 'stems', tierId: 'abc' });
    expect(readBenefitPointer('?benefit=not_a_key&tier=abc')).toBeNull();
    expect(readBenefitPointer('?benefit=stems')).toBeNull();
  });
});

describe('the catalog is derived, not duplicated', () => {
  it('lists exactly the registry, retired keys marked unavailable', () => {
    expect(BENEFIT_CATALOG.map((b) => b.type)).toEqual(BENEFIT_REGISTRY.map((b) => b.key));
    for (const c of BENEFIT_CATALOG) {
      expect(c.available).toBe(benefitDelivery(c.type)!.support !== 'retired');
    }
  });
});
