// Contract tests for the per-calculator modules.
//
// These exist because module copy is SENT copy: `moduleQuickWin` and `moduleUseCase` are injected
// verbatim into the emails, and `featureName` lands mid-sentence in "the first version of your ___
// in the CRWN app". Three defects reached production here while the suite was green, all because
// the content rules only ever read `sequence.ts`:
//
//   - the `worth` module carried "Streaming pays you fractions of a cent" (banned ICP framing)
//   - `feature_name` resolved to "Worth Calculator", a tool name, not a buildable feature
//   - the all-in-one calculator had NO module and emitted "your Your CRWN business system"
//
// Every rule below is one I had to check by hand. That is the point of writing them down.

import { describe, it, expect } from 'vitest';
import { moduleFor } from './calculatorModules';
import { LEAD_MAGNETS } from '@/lib/leadMagnets/registry';
import { PROMOTED_TOOL_KEYS } from '@/lib/opportunityFunnels/registry';

const ALL_SLUGS = [...LEAD_MAGNETS.map((m) => m.slug), 'worth'];

/**
 * The four sub-avatar modules OVERRIDE the calculator's entirely when one resolves, so they are
 * sent copy too and every rule here applies to them equally. Covering only the slug modules would
 * leave the override path, which is the one that runs for the all-in-one calculator's tagged
 * traffic, completely ungoverned.
 */
const AVATAR_IDS = [
  'highest_priority_empire_builder',
  'established_independent_operator',
  'brand_led_hip_hop_artist',
  'rnb_empire_builder',
];

interface ModuleKey {
  label: string;
  slug: string;
  avatar?: string;
}

/** Every module a lead can actually be sent: one per calculator, plus the four avatar overrides. */
const ALL_MODULE_KEYS: ModuleKey[] = [
  ...ALL_SLUGS.map((slug) => ({ label: slug, slug })),
  ...AVATAR_IDS.map((avatar) => ({ label: `avatar:${avatar}`, slug: 'opportunity-calculator', avatar })),
];

/** The three fields a lead actually reads, plus the module itself. */
function sentCopy(slug: string, avatar?: string) {
  const m = moduleFor(slug, avatar);
  return { m, copy: [m.quickWin, m.firstBuild, m.useCase].join(' \n ') };
}

describe('every calculator has a usable module', () => {
  it('gives every PROMOTED tool bespoke copy, never the generic fallback', () => {
    // The fallback is deliberately weak. A tool being actively marketed must not use it: that is
    // exactly how the all-in-one calculator, the primary front door, ended up with no advice in it.
    const generic = /Build the first small version of your|Turn on your .* and set up its first version/;
    for (const slug of PROMOTED_TOOL_KEYS) {
      const { copy } = sentCopy(slug);
      expect(copy, `${slug} is falling through to the generic fallback module`).not.toMatch(generic);
    }
  });

  it('never emits a doubled possessive or an empty interpolation', () => {
    for (const { label, slug, avatar } of ALL_MODULE_KEYS) {
      const { copy } = sentCopy(slug, avatar);
      expect(copy, label).not.toMatch(/\byour\s+your\b/i);
      expect(copy, label).not.toMatch(/\bthe\s+the\b/i);
      expect(copy, label).not.toMatch(/\bundefined\b|\bnull\b/);
      expect(copy, label).not.toMatch(/\{\{|\}\}/);
    }
  });

  it('uses a BUILDABLE feature name, never a tool name', () => {
    for (const { label, slug, avatar } of ALL_MODULE_KEYS) {
      const { m } = sentCopy(slug, avatar);
      expect(m.featureName, `${label} feature name`).not.toMatch(/calculator|quiz|planner|blueprint/i);
      expect(m.featureName.length, `${label} feature name`).toBeGreaterThan(3);
      expect(m.featureName, `${label} feature name should not be possessive`).not.toMatch(/^(your|the)\s/i);
    }
  });

  it('holds the ICP voice: no beginner framing anywhere in module copy', () => {
    // docs/ICP.md. This artist already sells directly. Patterns are loose on purpose: the first
    // version of this rule was `/streaming pays (pennies|fractions)/` and missed the copy that
    // actually shipped, "Streaming pays YOU fractions of a cent", over a single word.
    const BANNED: [RegExp, string][] = [
      [/streaming\b[^.]{0,30}\b(pennies|fractions? of a cent|almost nothing|next to nothing)/i, 'streaming pays pennies'],
      [/(earn|pay)s? you (almost|next to) nothing\b/i, 'earns you nothing'],
      [/even if (you|your audience) (is|are) (small|tiny)/i, 'audience is small'],
      [/you (do not|don't) need a (big|large) audience/i, 'no audience needed'],
      [/maybe your fans (will|would) pay/i, 'fans might not pay'],
    ];
    for (const { label: key, slug, avatar } of ALL_MODULE_KEYS) {
      const { copy } = sentCopy(slug, avatar);
      for (const [re, label] of BANNED) {
        const hit = copy.match(re);
        expect(hit, `${key}: banned ICP framing (${label}): ${hit?.[0] ?? ''}`).toBeNull();
      }
    }
  });

  it('obeys the standing copy rules', () => {
    for (const { label, slug, avatar } of ALL_MODULE_KEYS) {
      const { copy } = sentCopy(slug, avatar);
      // No em dash or en dash, anywhere a lead can read.
      expect(copy, `${label} uses a dash CRWN does not allow`).not.toMatch(/[—–]/);
      // "the CRWN app", never bare CRWN as the product.
      const bare = copy.match(/\bCRWN\b(?! app)/g) ?? [];
      expect(bare, `${label} says bare CRWN ${bare.length} times`).toHaveLength(0);
    }
  });

  it('invents no price, guarantee or proof', () => {
    for (const { label, slug, avatar } of ALL_MODULE_KEYS) {
      const { copy } = sentCopy(slug, avatar);
      expect(copy, label).not.toMatch(/\$\d/);
      expect(copy, label).not.toMatch(/\bguarantee(d|s)?\b/i);
      expect(copy, label).not.toMatch(/\b\d{2,}%/);
      expect(copy, label).not.toMatch(/\b(case stud(y|ies)|testimonial)\b/i);
    }
  });

  it('gives every module a real in-app destination', () => {
    for (const { label, slug, avatar } of ALL_MODULE_KEYS) {
      const { m } = sentCopy(slug, avatar);
      expect(m.destinationRoute, label).toMatch(/^\//);
      expect(m.destinationRoute, label).not.toMatch(/\s/);
    }
  });

  it('says something specific, not a restatement of the feature name', () => {
    // A quick win is "one low-effort thing you can do this week". If it only names the feature, it
    // is not advice. The all-in-one calculator failed this before it had a module.
    for (const { label, slug, avatar } of ALL_MODULE_KEYS) {
      const { m } = sentCopy(slug, avatar);
      expect(m.quickWin.length, `${label} quickWin is too thin to be advice`).toBeGreaterThan(80);
      expect(m.useCase.length, `${label} useCase is too thin`).toBeGreaterThan(60);
    }
  });
});
