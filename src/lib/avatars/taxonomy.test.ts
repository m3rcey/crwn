import { describe, it, expect } from 'vitest';
import {
  SUB_AVATARS,
  SUB_AVATAR_IDS,
  SUB_AVATAR_TAXONOMY_VERSION,
  calculatorToSubAvatar,
  getSubAvatar,
  isSubAvatarId,
  AVATAR_CALCULATOR_SLUGS,
} from './taxonomy';
import { LEAD_MAGNET_SLUGS } from '../leadMagnets/registry';

describe('sub-avatar taxonomy', () => {
  it('pins the four canonical ids: renaming one moves analytics data and fails here first', () => {
    expect(SUB_AVATAR_IDS).toEqual([
      'membership_stack_consolidator',
      'touring_access_seller',
      'live_community_creator',
      'catalog_vault_seller',
    ]);
    expect(SUB_AVATAR_TAXONOMY_VERSION).toBe('subAvatar@1');
  });

  it('pins the calculator-to-avatar mapping', () => {
    expect(calculatorToSubAvatar('fan-stack-calculator')).toBe('membership_stack_consolidator');
    expect(calculatorToSubAvatar('between-tour-calculator')).toBe('touring_access_seller');
    expect(calculatorToSubAvatar('live-experience-calculator')).toBe('live_community_creator');
    expect(calculatorToSubAvatar('executive-producer-session')).toBe('live_community_creator');
    expect(calculatorToSubAvatar('vault-revenue-planner')).toBe('catalog_vault_seller');
  });

  it('does NOT guess an avatar for unmapped calculators', () => {
    expect(calculatorToSubAvatar('worth')).toBeNull();
    expect(calculatorToSubAvatar('opportunity-calculator')).toBeNull();
    expect(calculatorToSubAvatar('own-your-fans-calculator')).toBeNull();
    expect(calculatorToSubAvatar(null)).toBeNull();
    expect(calculatorToSubAvatar('nonsense')).toBeNull();
  });

  it('every avatar entry calculator exists in the live lead-magnet registry', () => {
    for (const slug of AVATAR_CALCULATOR_SLUGS) {
      expect(LEAD_MAGNET_SLUGS, `registry is missing ${slug}`).toContain(slug);
    }
  });

  it('every avatar names its primary calculator inside its own slug list', () => {
    for (const a of SUB_AVATARS) {
      expect(a.calculatorSlugs).toContain(a.calculatorSlug);
    }
  });

  it('carries no em dashes in artist-facing copy (house copy rule)', () => {
    for (const a of SUB_AVATARS) {
      const copy = [a.label, a.pain, a.promise, a.firstOffer, ...a.nurtureThemes, ...a.postLaunchFocus.map((f) => f.label)].join(' ');
      expect(copy).not.toMatch(/—|–/);
    }
  });

  it('helpers agree with the id list', () => {
    expect(isSubAvatarId('catalog_vault_seller')).toBe(true);
    expect(isSubAvatarId('label')).toBe(false);
    expect(getSubAvatar('touring_access_seller')?.label).toBe('Touring Access Seller');
    expect(getSubAvatar('nope')).toBeNull();
  });
});
