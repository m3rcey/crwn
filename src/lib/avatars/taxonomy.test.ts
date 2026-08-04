import { describe, it, expect } from 'vitest';
import {
  SUB_AVATARS,
  SUB_AVATAR_IDS,
  SUB_AVATAR_PRECEDENCE,
  SUB_AVATAR_TAXONOMY_VERSION,
  SHARED_CALCULATOR_SLUG,
  ENTRY_CONTEXT_INPUT_KEY,
  entryContextToSubAvatar,
  genreFamilyOf,
  getSubAvatar,
  isSubAvatarId,
} from './taxonomy';
import { getLeadMagnet } from '../leadMagnets/registry';

describe('sub-avatar taxonomy', () => {
  it('pins the four canonical ids: renaming one moves analytics data and fails here first', () => {
    expect(SUB_AVATAR_IDS).toEqual([
      'highest_priority_empire_builder',
      'established_independent_operator',
      'brand_led_hip_hop_artist',
      'rnb_empire_builder',
    ]);
    expect(SUB_AVATAR_TAXONOMY_VERSION).toBe('subAvatar@2');
  });

  it('routes EVERY avatar at the one all-in-one calculator', () => {
    for (const a of SUB_AVATARS) {
      expect(a.entryRoute).toBe(`/tools/${SHARED_CALCULATOR_SLUG}?from=${a.id}`);
      expect(a.entryContext).toBe(a.id);
    }
  });

  it('the shared calculator declares an entry context for every avatar, and it only reorders', () => {
    const cfg = getLeadMagnet(SHARED_CALCULATOR_SLUG)!;
    const stepIds = new Set(cfg.wizardSteps.map((s) => s.id));
    for (const a of SUB_AVATARS) {
      const ctx = cfg.entryContexts?.[a.entryContext];
      expect(ctx, `missing entry context for ${a.id}`).toBeTruthy();
      // Priority steps must be real steps, or the reorder silently drops them.
      for (const id of ctx!.priorityStepIds) expect(stepIds.has(id), `${a.id} names unknown step ${id}`).toBe(true);
      expect(ctx!.priorityStepIds).toEqual(a.priorityStepIds);
      expect(ctx!.priorityStepIds).not.toContain('review');
    }
  });

  it('the shared calculator asks genre, because two avatars are genre-defined', () => {
    const cfg = getLeadMagnet(SHARED_CALCULATOR_SLUG)!;
    const genre = cfg.inputs.find((i) => i.key === 'genre_family');
    expect(genre).toBeTruthy();
    expect(genre!.options?.map((o) => o.value)).toEqual(['hiphop', 'rnb', 'other']);
  });

  it('recognizes an avatar entry context and refuses everything else', () => {
    expect(entryContextToSubAvatar('rnb_empire_builder')).toBe('rnb_empire_builder');
    expect(entryContextToSubAvatar('RNB_EMPIRE_BUILDER')).toBe('rnb_empire_builder');
    // A tool context is a topic, not an identity claim.
    expect(entryContextToSubAvatar('vault-revenue-planner')).toBeNull();
    expect(entryContextToSubAvatar('worth')).toBeNull();
    expect(entryContextToSubAvatar(null)).toBeNull();
    expect(entryContextToSubAvatar('nonsense')).toBeNull();
  });

  it('precedence follows declaration order, which is what keeps cohorts disjoint', () => {
    expect(SUB_AVATAR_PRECEDENCE.highest_priority_empire_builder).toBe(0);
    expect(SUB_AVATAR_PRECEDENCE.rnb_empire_builder).toBe(3);
  });

  it('maps only the two genre families it can act on, and guesses nothing else', () => {
    expect(genreFamilyOf('Hip-Hop')).toBe('hiphop');
    expect(genreFamilyOf('drill')).toBe('hiphop');
    expect(genreFamilyOf('R&B')).toBe('rnb');
    expect(genreFamilyOf('neo-soul')).toBe('rnb');
    expect(genreFamilyOf('afrobeats')).toBe('other');
    expect(genreFamilyOf('')).toBe('other');
    expect(genreFamilyOf(null)).toBe('other');
  });

  it('carries no em dashes in artist-facing copy (house copy rule)', () => {
    for (const a of SUB_AVATARS) {
      const copy = [
        a.label,
        a.pain,
        a.promise,
        a.firstOffer,
        a.entryNote,
        ...a.nurtureThemes,
        ...a.postLaunchFocus.map((f) => f.label),
      ].join(' ');
      expect(copy).not.toMatch(/—|–/);
    }
  });

  it('helpers agree with the id list, and the input key is reserved', () => {
    expect(isSubAvatarId('brand_led_hip_hop_artist')).toBe(true);
    expect(isSubAvatarId('membership_stack_consolidator')).toBe(false); // retired in v1
    expect(getSubAvatar('highest_priority_empire_builder')?.label).toBe('Highest Priority Empire Builder');
    expect(getSubAvatar('nope')).toBeNull();
    expect(ENTRY_CONTEXT_INPUT_KEY.startsWith('_')).toBe(true);
  });
});
