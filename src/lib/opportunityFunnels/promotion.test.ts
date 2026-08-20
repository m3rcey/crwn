// PAUSED MEANS UNPROMOTED, NEVER BROKEN.
//
// The 2026-08-13 pre-PMF surface reduction cut the publicly promoted calculator set to the
// tools with content actually driving them (live-experience re-promoted 2026-08-16). Every other tool stays fully live: same route, same slug,
// same analytics toolId, same DM keywords, same result links. The ONLY thing that changes is
// whether it appears in the /tools directory.
//
// This file exists because the failure mode is silent and expensive. A two-year-old Reel whose
// comment keyword stops resolving does not error anywhere: it just stops converting, and the only
// signal is acquisition slowly going quiet.

import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { LEAD_MAGNETS, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';
import { PROMOTED_TOOL_KEYS, OPPORTUNITY_FUNNELS, getFunnelByToolKey } from './registry';

const EXPECTED_PROMOTED = [
  'worth',
  'vault-revenue-planner',
  'share-to-earn-planner',
  'executive-producer-session',
  'own-your-fans-calculator',
  'opportunity-calculator',
  // Founder decision 2026-08-16: Live Experiences is promoted in content with EP Sessions.
  'live-experience-calculator',
  // Founder decision 2026-08-20: the tour and proof-of-demand calculators come back, with the
  // same promoted-tool contract (doorway, trimmed hero, illustrated webp).
  'between-tour-calculator',
  'proof-of-demand-test-builder',
];

describe('the promoted set is exactly the tools with content behind them', () => {
  it('promotes exactly the expected set and nothing else', () => {
    expect([...PROMOTED_TOOL_KEYS].sort()).toEqual([...EXPECTED_PROMOTED].sort());
  });

  it('every promoted key resolves to a real tool', () => {
    const known = new Set([...LEAD_MAGNETS.map((m) => m.slug), ...EXTERNAL_TOOLS.map((t) => t.key)]);
    for (const key of PROMOTED_TOOL_KEYS) {
      expect(known.has(key), `promoted key '${key}' is not a registered tool`).toBe(true);
    }
  });

  it('exactly the promoted tools are lifecycle active; every other tool is paused', () => {
    for (const f of OPPORTUNITY_FUNNELS) {
      const expected = PROMOTED_TOOL_KEYS.has(f.toolKey) ? 'active' : 'paused';
      expect(f.lifecycle, `${f.toolKey} should be ${expected}`).toBe(expected);
    }
  });

  it('a new tool cannot promote itself by default', () => {
    // Derived from PROMOTED_TOOL_KEYS, so the default for anything unlisted is paused. If this
    // ever inverts, adding a calculator silently puts it in front of every visitor.
    const unlisted = OPPORTUNITY_FUNNELS.filter((f) => !PROMOTED_TOOL_KEYS.has(f.toolKey));
    expect(unlisted.length, 'no unpromoted tools left to check — this assertion went vacuous').toBeGreaterThan(0);
    expect(unlisted.every((f) => f.lifecycle === 'paused')).toBe(true);
  });
});

describe('pausing changes DISCOVERY ONLY — every compatibility boundary survives', () => {
  it('every tool, paused or not, keeps a public route', () => {
    for (const f of OPPORTUNITY_FUNNELS) {
      expect(f.publicRoute, `${f.toolKey} lost its public route`).toBeTruthy();
      expect(f.publicRoute.startsWith('/'), `${f.toolKey} route is not a path`).toBe(true);
    }
  });

  it('every paused LEAD_MAGNET keeps its DM keywords, so old Reels still resolve', () => {
    // The ManyChat keyword table is DERIVED from these (KEYWORD_TOOLS in orchestration.ts). A
    // paused tool whose keywords vanished would orphan every comment on its published content.
    const paused = LEAD_MAGNETS.filter((m) => !PROMOTED_TOOL_KEYS.has(m.slug));
    expect(paused.length).toBeGreaterThan(0);
    for (const m of paused) {
      expect(m.dmKeywords.length, `${m.slug} lost its dmKeywords`).toBeGreaterThan(0);
      const f = getFunnelByToolKey(m.slug);
      expect(f?.dmKeywords).toEqual(m.dmKeywords);
    }
  });

  it('the LIVE keyword table is built from dmKeywords, not from lifecycle', () => {
    // THE ASSERTION THAT MAKES PAUSING SAFE.
    //
    // orchestration.ts builds KEYWORD_TOOLS by flattening every LEAD_MAGNETS entry's dmKeywords.
    // It never consults this layer, so a paused tool's keyword still starts its ManyChat flow.
    //
    // This layer ALSO exposes resolveFunnelByKeyword/resolveFunnelByAlias, which deliberately
    // return null for a non-active funnel. Those have ZERO production consumers today (verified
    // 2026-08-13: referenced only inside registry.ts and its own test). If the orchestrator is
    // ever rewired to use one of them, every paused tool's published Reels go silently dead —
    // no error, no log, just acquisition drying up. So pin the derivation instead of trusting it.
    const orch = readFileSync('src/lib/acquisition/orchestration.ts', 'utf8');
    expect(orch).toContain('LEAD_MAGNETS.flatMap');
    expect(orch).toContain('m.dmKeywords.map');
    expect(orch, 'the ManyChat keyword table must not gate on funnel lifecycle').not.toContain('resolveFunnelByKeyword');
    expect(orch, 'the ManyChat keyword table must not gate on funnel lifecycle').not.toContain('resolveFunnelByAlias');
  });

  it('every paused tool is still present in the live keyword table', () => {
    // Same property, checked from the data side: the orchestrator's table is every tool's
    // keywords, so a paused tool must still appear in it verbatim.
    const orch = readFileSync('src/lib/acquisition/orchestration.ts', 'utf8');
    expect(orch).toMatch(/KEYWORD_TOOLS[\s\S]{0,200}LEAD_MAGNETS/);
    const paused = LEAD_MAGNETS.filter((m) => !PROMOTED_TOOL_KEYS.has(m.slug));
    for (const m of paused) {
      const f = getFunnelByToolKey(m.slug);
      expect(f?.dmKeywords, `${m.slug} lost its keywords`).toEqual(m.dmKeywords);
      expect(f?.publicRoute, `${m.slug} lost its route`).toBe(m.publicRoute);
    }
  });

  it('every tool keeps its analytics toolId, so historical funnel rows stay joinable', () => {
    for (const m of LEAD_MAGNETS) {
      const f = getFunnelByToolKey(m.slug);
      expect(f?.analytics.toolId, `${m.slug} lost its toolId`).toBe(m.analyticsMetadata.toolId);
    }
  });

  it('pausing never marks a tool unsupported or anonymous-unavailable', () => {
    // Those two fields DO gate behaviour elsewhere. Lifecycle must not be used as a backdoor to
    // switch a tool off: an old link has to keep returning a truthful result.
    for (const f of OPPORTUNITY_FUNNELS) {
      expect(f.supported, `${f.toolKey} was marked unsupported`).toBe(true);
      expect(f.anonymousAvailable, `${f.toolKey} stopped being anonymous-available`).toBe(true);
    }
  });
});
