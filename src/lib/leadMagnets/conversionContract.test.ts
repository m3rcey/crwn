// The CONVERSION CONTRACT of the public calculator funnel.
//
// Everything pinned here is a thing that, when it silently drifts, costs qualified artists rather
// than throwing an error. The registry is plain data imported into client bundles, so nothing else
// checks it: a step id renamed on an input but not on its wizard step renders an EMPTY screen with a
// Continue button, an entry context pointing at a step that no longer exists silently stops
// reordering, and a generic CTA or an email wall can be reintroduced by one word.
//
// It also pins the identifiers the funnel is measured by (slugs, tool ids, DM keywords). Those are
// referenced by ManyChat triggers, campaign links, `funnel_events.calculator` and every historical
// row already in the table, so renaming one is not a refactor, it is a break in the reporting spine.

import { describe, expect, it } from 'vitest';

import { LEAD_MAGNETS, LEAD_MAGNET_BY_SLUG, EXTERNAL_TOOLS, getLeadMagnet } from './registry';
import { validateAll, validateStep } from './validation';
import type { LeadMagnetConfig } from './types';

// The two-question loss tools: one audience number, one proof dropdown, no review screen.
const AUDIENCE_STEP_TOOLS = [
  'founder-window-builder',
  'movement-page-blueprint',
  'fan-journey-builder',
  'top-fan-leaderboard-builder',
  'supporter-promise-calendar',
  'team-split-deal-builder',
  'share-to-earn-planner',
  'own-your-fans-calculator',
  'live-experience-calculator',
  'executive-producer-session',
];

const GENERIC_CTA = /^(start|continue|submit|learn more|get started|click here|next)\b/i;

describe('active calculator inventory', () => {
  it('is 19 registry tools plus the standalone /worth route, 20 in total', () => {
    expect(LEAD_MAGNETS).toHaveLength(19);
    expect(EXTERNAL_TOOLS.map((t) => t.href)).toContain('/worth');
    expect(LEAD_MAGNETS.length + EXTERNAL_TOOLS.length).toBe(20);
  });

  it('freezes the slugs, because they are the funnel_events calculator dimension', () => {
    expect(LEAD_MAGNETS.map((m) => m.slug).sort()).toEqual(
      [
        'artist-quest-path',
        'between-tour-calculator',
        'clip-to-earn-campaign-planner',
        'executive-producer-session',
        'fan-journey-builder',
        'fan-mission-generator',
        'fan-stack-calculator',
        'founder-window-builder',
        'live-experience-calculator',
        'movement-page-blueprint',
        'opportunity-calculator',
        'own-your-fans-calculator',
        'proof-of-demand-test-builder',
        'royalty-readiness-check',
        'share-to-earn-planner',
        'supporter-promise-calendar',
        'team-split-deal-builder',
        'top-fan-leaderboard-builder',
        'vault-revenue-planner',
      ].sort(),
    );
  });

  it('keeps analytics toolId identical to the slug, and the public route derived from it', () => {
    for (const m of LEAD_MAGNETS) {
      expect(m.analyticsMetadata.toolId).toBe(m.slug);
      expect(m.publicRoute).toBe(`/tools/${m.slug}`);
    }
  });

  it('keeps every DM keyword, because ManyChat triggers and campaign links are built from them', () => {
    const keywords = LEAD_MAGNETS.flatMap((m) => m.dmKeywords);
    // Unique across tools, or a typed keyword routes to two funnels.
    expect(new Set(keywords).size).toBe(keywords.length);
    for (const required of ['worth', 'share', 'producer', 'vault', 'own', 'free', 'plan']) {
      const owned = required === 'worth' ? true : keywords.includes(required);
      expect(owned, `keyword "${required}" is a live acquisition entry point`).toBe(true);
    }
  });
});

describe('wizard integrity: no input can point at a screen that does not exist', () => {
  it('declares every input on a real wizard step', () => {
    for (const m of LEAD_MAGNETS) {
      const stepIds = new Set(m.wizardSteps.map((s) => s.id));
      for (const input of m.inputs) {
        expect(stepIds.has(input.step), `${m.slug}: input ${input.key} -> step "${input.step}"`).toBe(true);
      }
    }
  });

  it('has no wizard step with nothing on it (an empty screen with a Continue button)', () => {
    for (const m of LEAD_MAGNETS) {
      for (const step of m.wizardSteps) {
        if (step.id === 'review') continue;
        const hasInput = m.inputs.some((i) => i.step === step.id);
        expect(hasInput, `${m.slug}: step "${step.id}" has no inputs`).toBe(true);
      }
    }
  });

  it('points every entry context at steps that still exist, and never at review', () => {
    for (const m of LEAD_MAGNETS) {
      const stepIds = new Set(m.wizardSteps.map((s) => s.id));
      for (const [key, ctx] of Object.entries(m.entryContexts ?? {})) {
        for (const id of ctx.priorityStepIds) {
          expect(stepIds.has(id), `${m.slug}: entry context ${key} -> step "${id}"`).toBe(true);
          expect(id).not.toBe('review');
        }
      }
    }
  });
});

describe('the email boundary: a result is never held hostage', () => {
  it('never requires lead capture on any tool', () => {
    for (const m of LEAD_MAGNETS) {
      expect(m.leadCapture.required, m.slug).toBe(false);
    }
  });

  it('never labels the secondary action as unlocking something already on screen', () => {
    for (const m of LEAD_MAGNETS) {
      expect(m.cta.publicSecondary ?? '').not.toMatch(/unlock/i);
      expect(m.cta.publicPrimary).not.toMatch(/unlock/i);
    }
  });
});

describe('CTA copy states what the visitor gets', () => {
  it('has no generic hero CTA', () => {
    for (const m of LEAD_MAGNETS) {
      expect(m.hero.primaryCta, m.slug).not.toMatch(GENERIC_CTA);
    }
  });

  it('has no generic result CTA', () => {
    for (const m of LEAD_MAGNETS) {
      expect(m.cta.publicPrimary, m.slug).not.toMatch(GENERIC_CTA);
      if (m.cta.publicSecondary) expect(m.cta.publicSecondary, m.slug).not.toMatch(GENERIC_CTA);
    }
  });

  it('keeps the hero CTA usable as the wizard submit label, which is what PublicToolClient does', () => {
    // The submit button repeats the hero's promise. That only works while every hero CTA is an
    // action that names its own outcome ("See what I am leaving", "Plan my Vault"), short enough for
    // a full-width button on a phone, and not a description of a page ("Calculator", "More info").
    for (const m of LEAD_MAGNETS) {
      expect(m.hero.primaryCta.length, m.slug).toBeLessThan(45);
      expect(m.hero.primaryCta, m.slug).toMatch(/^(See|Plan|Build|Generate|Show|Find)\b/);
    }
  });

  it('uses no em dash anywhere a visitor can read', () => {
    for (const m of LEAD_MAGNETS) {
      const copy = [
        m.name,
        m.description,
        m.hero.eyebrow ?? '',
        m.hero.headline,
        m.hero.subheadline,
        m.hero.primaryCta,
        m.cta.publicPrimary,
        m.cta.publicSecondary ?? '',
        m.leadCapture.consentCopy,
        ...m.wizardSteps.flatMap((s) => [s.title, s.subtitle ?? '']),
        ...m.inputs.flatMap((i) => [i.label, i.help ?? '', ...(i.options ?? []).flatMap((o) => [o.label, o.hint ?? ''])]),
      ].join(' ');
      expect(copy, m.slug).not.toMatch(/[—–]/);
    }
  });
});

describe('positioning claims stay inside what CRWN can evidence', () => {
  it('makes no beginner, intelligence, network-effect or virality claim in calculator copy', () => {
    const banned = [
      /artists like you/i,
      /your first song/i,
      /\bbeginner/i,
      /go(es)? viral\b/i,
      /gets smarter/i,
      /other artists on crwn/i,
    ];
    for (const m of LEAD_MAGNETS) {
      const copy = [m.description, m.hero.headline, m.hero.subheadline, m.hero.primaryCta].join(' ');
      for (const re of banned) expect(copy, `${m.slug} vs ${re}`).not.toMatch(re);
    }
  });
});

describe('the primary acquisition front door: opportunity-calculator', () => {
  const unified = getLeadMagnet('opportunity-calculator') as LeadMagnetConfig;

  it('exists and is the tool the homepage and all four sub-avatar links mount', () => {
    expect(unified).toBeTruthy();
    for (const avatar of [
      'highest_priority_empire_builder',
      'established_independent_operator',
      'brand_led_hip_hop_artist',
      'rnb_empire_builder',
    ]) {
      expect(Object.keys(unified.entryContexts ?? {})).toContain(avatar);
    }
  });

  it('still asks all fourteen questions after the screen consolidation', () => {
    // Consolidating screens must never become removing fields: every one of these feeds the model,
    // the sub-avatar assignment, the ICP scorer or the builder prefill, and dropping one would shrink
    // the artist's estimate rather than speeding it up.
    expect(unified.inputs.map((i) => i.key).sort()).toEqual(
      [
        'genre_family',
        'social_followers',
        'monthly_listeners',
        'owned_contacts',
        'monetization_status',
        'current_supporters',
        'direct_fan_revenue_cents',
        'unreleased_count',
        'fans_promote',
        'video_output',
        'promoter_overlap',
        'live_willing',
        'session_structure',
        'time_capacity',
      ].sort(),
    );
  });

  it('asks them across 8 screens, ending on review', () => {
    expect(unified.wizardSteps).toHaveLength(8);
    expect(unified.wizardSteps[unified.wizardSteps.length - 1].id).toBe('review');
    expect(unified.wizardSteps[0].id).toBe('audience');
  });

  it('requires exactly one answer, so a visitor can reach a real number from one number', () => {
    expect(unified.inputs.filter((i) => i.required).map((i) => i.key)).toEqual(['social_followers']);
  });

  it('keeps the two dependent questions dependent, so neither is asked pointlessly', () => {
    const overlap = unified.inputs.find((i) => i.key === 'promoter_overlap');
    expect(overlap?.dependsOn?.all).toHaveLength(2);
    const session = unified.inputs.find((i) => i.key === 'session_structure');
    expect(session?.dependsOn?.key).toBe('live_willing');
  });
});

describe('the two-question loss tools', () => {
  it('ask two questions on two screens, with no review screen between them and the number', () => {
    for (const slug of AUDIENCE_STEP_TOOLS) {
      const m = LEAD_MAGNET_BY_SLUG[slug];
      expect(m, slug).toBeTruthy();
      expect(m.wizardSteps.map((s) => s.id), slug).toEqual(['audience', 'proof']);
      expect(m.inputs.map((i) => i.key), slug).toEqual(['social_followers', 'monetization_status']);
    }
  });

  it('keeps monetization_status required, the ICP scorer 40% factor, on the LAST screen', () => {
    for (const slug of AUDIENCE_STEP_TOOLS) {
      const m = LEAD_MAGNET_BY_SLUG[slug];
      const proof = m.inputs.find((i) => i.key === 'monetization_status');
      expect(proof?.required, slug).toBe(true);
      expect(proof?.step, slug).toBe(m.wizardSteps[m.wizardSteps.length - 1].id);
    }
  });
});

describe('submit-time validation is what makes a required question on the last screen real', () => {
  // LeadMagnetWizard skipped validation entirely on the final screen, which was only safe while
  // every tool ended on a review screen owning no inputs. It now validates the WHOLE config before
  // completing. These pin the pure half of that contract.
  const m = LEAD_MAGNET_BY_SLUG['share-to-earn-planner'];

  it('reports the required proof answer as missing even though it is on the last step', () => {
    const errors = validateAll(m, { social_followers: 250000 });
    expect(errors.monetization_status).toBeTruthy();
  });

  it('reports it for the step itself too, so the message renders where the question lives', () => {
    const errors = validateStep(m, 'proof', { social_followers: 250000 });
    expect(errors.monetization_status).toBeTruthy();
  });

  it('passes once both answers exist', () => {
    expect(validateAll(m, { social_followers: 250000, monetization_status: 'direct_some' })).toEqual({});
  });

  it('does not block the unified calculator on its optional questions', () => {
    const unified = LEAD_MAGNET_BY_SLUG['opportunity-calculator'];
    expect(validateAll(unified, { social_followers: 400000 })).toEqual({});
  });
});
