import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// Z12: the CRWN Brain contract.
//
// A PROCESS safeguard already exists and works: `.claude/hooks/doc-sync-reminder.sh` fires once per
// commit range whenever `src/` or `supabase/` changed and tells the agent to reconcile the derived
// state. That covers "did anyone think about the docs".
//
// It cannot cover "is this specific claim still true". A reminder is answered by a human or an
// agent, and both of them read the doc that is already wrong. So the drift that actually happened
// was never a missing reminder, it was a canonical doc confidently describing a shipped system as
// unbuilt, and a security warning naming a hole that had been closed for weeks.
//
// This file is the smallest durable complement: a handful of doc-to-code facts that are cheap to
// check and have ALREADY gone stale at least once. It is deliberately not a documentation engine.
// The rule for adding a case: only pin a claim where the doc and the code can drift silently AND
// the drift would send the next reader down a wrong path.

const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const START = read('docs/crwn-brain/00-START-HERE.md');
const VISION = read('docs/crwn-brain/01-PRODUCT-VISION.md');
const CANONICAL_DOCS = [
  'docs/crwn-brain/00-START-HERE.md',
  'docs/crwn-brain/01-PRODUCT-VISION.md',
  'docs/crwn-brain/02-FEATURE-MAP.md',
  'docs/crwn-brain/13-CURRENT-STATE.md',
  'docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md',
  'docs/crwn-brain/23-ZERO-TO-ONE-STRATEGY.md',
  'docs/crwn-brain/24-RECOMMENDATION-OUTCOME-LINKAGE.md',
].map((p) => [p, read(p)] as const);

describe('a canonical doc may not call a SHIPPED system unbuilt', () => {
  // Each entry: the doc phrase that would be a lie, and the code that proves it is one.
  const SHIPPED: { system: string; proof: string; forbidden: RegExp }[] = [
    {
      system: 'Virality Engine V1',
      proof: 'src/lib/campaigns/archetypes.ts',
      forbidden: /`22-VIRALITY-ENGINE-ARCHITECTURE\.md`[^\n]*`Not implemented\.`/,
    },
    {
      system: 'Zero To One implementation',
      proof: 'src/lib/constraint/recommendationStore.ts',
      forbidden: /`23-ZERO-TO-ONE-STRATEGY\.md`[^\n]*`Not implemented\.`/,
    },
  ];

  it.each(SHIPPED)('$system is live, so no doc may mark it "Not implemented"', ({ proof, forbidden }) => {
    expect(existsSync(proof), `${proof} should exist`).toBe(true);
    for (const [path, src] of CANONICAL_DOCS) {
      expect(forbidden.test(src), `${path} calls a shipped system unimplemented`).toBe(false);
    }
  });

  it('does not describe an APPLIED migration as pending', () => {
    // Z3's table is applied in production and `npm run verify:migrations` proves it. A doc saying
    // "dark until it runs" tells the next agent the evidence layer is collecting nothing.
    for (const [path, src] of CANONICAL_DOCS) {
      expect(
        /dark until schema-phase3-recommendation-outcomes\.sql runs/i.test(src),
        `${path} says the Z3 migration has not run`,
      ).toBe(false);
      expect(
        /dark until schema-phase3-fan-campaigns\.sql runs/i.test(src),
        `${path} says the Z11 migration has not run`,
      ).toBe(false);
    }
  });
});

describe('a canonical doc may not warn about a hole that is closed', () => {
  it('does not claim /api/ai-manager/generate lacks an ownership check', () => {
    const route = read('src/app/api/ai-manager/generate/route.ts');
    expect(route).toContain('requireArtistOwner');
    // A stale security warning is worse than none: it burns the next agent's time and invites a
    // "fix" to code that is already correct.
    //
    // A RETRACTED mention is fine and in fact desirable, so history stays readable. The claim only
    // fails when it is still presented as live, i.e. the line neither strikes it through (`~~`) nor
    // says it was retracted or fixed.
    for (const [path, src] of CANONICAL_DOCS) {
      const live = src
        .split('\n')
        .filter((line) => /ai-manager\/generate[^\n]*no ownership check/i.test(line))
        .filter((line) => !/~~|RETRACTED|FIXED/i.test(line));
      expect(live, `${path} still presents a closed ownership hole as live`).toEqual([]);
    }
  });
});

describe('positioning may not drift back', () => {
  it('no canonical doc positions CRWN as a mashup of other products', () => {
    for (const [path, src] of CANONICAL_DOCS) {
      expect(/Skool meets EVEN meets YouTube/i.test(src), `${path} carries the retired mashup positioning`).toBe(false);
    }
  });

  it('the ratified category appears where positioning is stated', () => {
    expect(START + VISION).toMatch(/Fan Economy Operating System/);
  });

  it('no artist-facing surface calls CRWN an all-in-one platform', () => {
    // The category is an operating system for one job, not a bundle. (Describing the all-in-one
    // CALCULATOR is fine and unrelated: that is a tool name, not a category claim.)
    const about = read('src/app/about/page.tsx');
    expect(about).not.toMatch(/All-In-One Platform/i);
  });
});

describe('renamed surfaces stay renamed', () => {
  it('Action Plan is presented as Needs You', () => {
    const studio = read('src/app/(main)/studio/page.tsx');
    const hub = read('src/components/layout/AccountHub.tsx');
    expect(studio).toContain("title: 'Needs You'");
    expect(hub).toContain("label: 'Needs You'");
    expect(studio).not.toContain("title: 'Action Plan'");
    expect(hub).not.toContain("label: 'Action Plan'");
  });
});

describe('docs do not hardcode figures that go stale the next commit', () => {
  it('no canonical doc pins an exact vitest count', () => {
    // "820 vitest tests across 50 files" was wrong within days. A doc should say how to find the
    // number, not what it was.
    for (const [path, src] of CANONICAL_DOCS) {
      expect(/\d{3,} vitest tests across \d+ files/.test(src), `${path} pins a test count`).toBe(false);
    }
  });
});

describe('the process safeguard that complements this file still exists', () => {
  it('the doc-sync Stop hook is present and wired', () => {
    expect(existsSync('.claude/hooks/doc-sync-reminder.sh')).toBe(true);
    const settings = read('.claude/settings.json') + read('.claude/settings.local.json');
    expect(settings).toContain('doc-sync-reminder.sh');
  });
});
