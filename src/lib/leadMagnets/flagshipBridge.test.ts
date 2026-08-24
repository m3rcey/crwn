import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { flagshipBridgeFor, FLAGSHIP_SLUG } from './flagshipBridge';
import { LEAD_MAGNETS, getLeadMagnet } from './registry';
import { PROMOTED_TOOL_KEYS } from '@/lib/opportunityFunnels/registry';

// The narrow-result -> flagship bridge (founder decision 2026-08-24): after a narrow calculator
// delivers its complete result, the whole-business Opportunity Calculator is offered as a
// SECONDARY continuation, carrying the originating tool as `?from=` so the flagship's existing
// entryContext machinery acknowledges the angle. Eligibility is DERIVED from the flagship's
// entryContexts, never listed twice.

const root = process.cwd();
const publicToolClient = readFileSync(join(root, 'src/components/lead-magnets/PublicToolClient.tsx'), 'utf-8');
const worth = readFileSync(join(root, 'src/app/(public)/worth/WorthExperience.tsx'), 'utf-8');

describe('flagshipBridgeFor eligibility', () => {
  it('bridges exactly the tools the flagship declares an entry context for', () => {
    const flagship = getLeadMagnet(FLAGSHIP_SLUG)!;
    const contextKeys = new Set(Object.keys(flagship.entryContexts ?? {}));
    for (const m of LEAD_MAGNETS) {
      if (m.slug === FLAGSHIP_SLUG) continue;
      const bridge = flagshipBridgeFor(m.slug);
      if (contextKeys.has(m.slug)) {
        expect(bridge, `${m.slug} has a declared context and must bridge`).not.toBeNull();
      } else {
        expect(bridge, `${m.slug} has no declared context and must not bridge`).toBeNull();
      }
    }
  });

  it('never bridges the flagship to itself', () => {
    expect(flagshipBridgeFor(FLAGSHIP_SLUG)).toBeNull();
  });

  it('never bridges Royalty Readiness: the fan-economy continuation does not apply to it', () => {
    // docs/POSITIONING.md section 18: royalty recovery is money already earned elsewhere, and its
    // own result copy states that fans lose nothing. If this fails because someone added a royalty
    // entry context, that is a positioning decision to take to the founder, not a test to update.
    expect(flagshipBridgeFor('royalty-readiness-check')).toBeNull();
  });

  it('returns null for unknown slugs and junk', () => {
    expect(flagshipBridgeFor('not-a-tool')).toBeNull();
    expect(flagshipBridgeFor('')).toBeNull();
  });

  it('covers every promoted carousel angle except the deliberate exemptions', () => {
    // The approved batch architecture: every promoted narrow door continues into the flagship.
    // Royalty is exempt by positioning; the flagship is the destination, not a door.
    for (const slug of PROMOTED_TOOL_KEYS) {
      if (slug === FLAGSHIP_SLUG || slug === 'worth') continue; // worth asserted separately below
      expect(flagshipBridgeFor(slug), slug).not.toBeNull();
    }
    // /worth renders outside the registry template but is eligible through the same helper.
    expect(flagshipBridgeFor('worth')).not.toBeNull();
  });
});

describe('the bridge destination preserves the originating context', () => {
  it('points at the flagship route with from=<slug>, and every from resolves to a declared context', () => {
    const flagship = getLeadMagnet(FLAGSHIP_SLUG)!;
    for (const m of LEAD_MAGNETS) {
      const bridge = flagshipBridgeFor(m.slug);
      if (!bridge) continue;
      expect(bridge.href).toBe(`/tools/${FLAGSHIP_SLUG}?from=${m.slug}`);
      // The from value must be a key the flagship's wizard actually reorders on, or the arrival
      // lands on a generic questionnaire and the bridge lied about acknowledging the angle.
      expect(Object.keys(flagship.entryContexts ?? {}), m.slug).toContain(m.slug);
    }
  });

  it('never points at signup and never gates anything', () => {
    for (const m of LEAD_MAGNETS) {
      const bridge = flagshipBridgeFor(m.slug);
      if (!bridge) continue;
      expect(bridge.href).not.toContain('/signup');
      for (const text of [bridge.label, bridge.body]) {
        expect(text.toLowerCase()).not.toContain('sign up');
        expect(text.toLowerCase()).not.toContain('account');
        expect(text.toLowerCase()).not.toContain('unlock');
      }
    }
  });

  it('copy follows positioning rules: no em dashes, no beginner framing, no revenue promise', () => {
    const bridge = flagshipBridgeFor('vault-revenue-planner')!;
    for (const text of [bridge.label, bridge.body]) {
      expect(text).not.toMatch(/[–—]/);
      expect(text.toLowerCase()).not.toMatch(/first fans|get your first fans|guarantee|passive income|go viral/);
    }
    // The category word, and the doorway rule: one lens on one fan economy.
    expect(bridge.label.toLowerCase()).toContain('fan economy');
    expect(bridge.body.toLowerCase()).toContain('one lens on one fan economy');
  });
});

describe('bridge placement in the shared template', () => {
  // Same source-scan style as pageComposition.test.ts: the property that matters is behavioural.
  const fullPhase = publicToolClient.slice(publicToolClient.indexOf("phase === 'full' && result && !editing"));

  it('renders BELOW the builder, so the complete narrow result and its builder come first', () => {
    const bridge = fullPhase.indexOf('flagshipBridgeFor(config.slug)');
    const builder = fullPhase.indexOf('ref={builderRef}');
    expect(bridge, 'bridge missing from the result surface').toBeGreaterThan(-1);
    expect(builder).toBeGreaterThan(-1);
    expect(bridge, 'bridge must not sit between the result and the builder').toBeGreaterThan(builder);
  });

  it('is a secondary treatment, never the gold CTA', () => {
    const start = fullPhase.indexOf('flagshipBridgeFor(config.slug)');
    const block = fullPhase.slice(start, fullPhase.indexOf('Optional hand-raiser', start));
    expect(block).not.toContain('bg-crwn-gold ');
    expect(block).toContain('bg-crwn-surface');
  });

  it('uses the EXISTING ctaClicked event with a variant, not a new event name', () => {
    expect(publicToolClient).toContain("variant: 'flagship_bridge'");
    expect(publicToolClient).not.toContain('flagship_bridge_clicked');
  });
});

describe('the /worth bridge and completion instrumentation', () => {
  it('renders the bridge below the builder section', () => {
    const flow = worth.slice(worth.indexOf('{useEntryWizard ? ('));
    const bridge = flow.indexOf('{flagshipBridgeCard}');
    expect(bridge, '/worth bridge missing').toBeGreaterThan(-1);
    expect(bridge).toBeGreaterThan(flow.indexOf('{builderSection}'));
  });

  it('emits the canonical completion event when the entry wizard finishes', () => {
    // /worth was the one calculator that never emitted resultGenerated, so its funnel line
    // showed starts with zero completions. The event fires in the entry wizard's onComplete,
    // the same moment PublicToolClient emits it.
    expect(worth).toContain("trackLeadMagnet(LM_EVENTS.resultGenerated, { toolSlug: 'worth', context: 'public' })");
    // It fires as part of finishing the wizard: before entryDone flips and the wizard unmounts,
    // so it can only fire once per completion, and never on a tokenized ?result= arrival.
    const emit = worth.indexOf("LM_EVENTS.resultGenerated, { toolSlug: 'worth'");
    const done = worth.indexOf('setEntryDone(true)');
    expect(emit).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(-1);
    expect(emit).toBeLessThan(done);
  });
});
