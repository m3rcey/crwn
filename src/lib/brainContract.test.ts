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
  // F-11 (2026-08-12): CLAUDE.md is where the stale "dark until fan-campaigns runs" claim
  // actually lived, and it was not in this list, which is exactly how the drift escaped.
  // CLAUDE.md is the doc every agent reads first; it is held to the same claims.
  'CLAUDE.md',
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

describe('a canonical doc may not call a LIVE feature flag dark', () => {
  // Production `admin_settings` (checked 2026-08-11) has quest_engine ON and popup_engine ON, with
  // 326 real quest_instances rows. Several docs still called both "dark", and that drift nearly
  // caused the Rise Mode resume prompt to be deferred a fourth time on a false premise. A flag's
  // state is not greppable from code, so what is pinned here is the SHAPE of the stale claim.
  const LIVE_FLAGS = ['quest_engine', 'popup_engine'];

  it.each(LIVE_FLAGS)('%s is not described as dark or off', (flag) => {
    for (const [path, src] of CANONICAL_DOCS) {
      const stale = src
        .split('\n')
        .filter((line) => line.includes(flag))
        .filter((line) => /\bdark\b|"enabled": ?false|\{"enabled":false\}|flag is off/i.test(line))
        // A line that ALSO states the flag is live is explaining the history, not asserting the
        // stale claim. That is exactly what a corrected doc looks like, so it must pass.
        .filter((line) => !/\bLIVE\b|"enabled": ?true|is ON\b/.test(line));
      expect(stale, `${path} calls ${flag} dark, but it is ON in production`).toEqual([]);
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
  it('Action Plan is presented as Needs You wherever it is presented at all', () => {
    // The tile and hub entry were removed by the 2026-08-13 surface reduction, so the assertion
    // moved to the surviving surface: the page itself. The retired name must not return anywhere.
    const page = read('src/app/action-plan/page.tsx');
    const studio = read('src/app/(main)/studio/page.tsx');
    const hub = read('src/components/layout/AccountHub.tsx');
    expect(page).toContain('What needs you');
    for (const src of [page, studio, hub]) {
      expect(src).not.toContain("title: 'Action Plan'");
      expect(src).not.toContain("label: 'Action Plan'");
    }
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

describe('DOCS-002 — the static migration-state contract (drift prevention, 2026-08-12)', () => {
  // Two layers, deliberately separate:
  //   STATIC CONTRACT — EXPECTED_MIGRATION_STATE in src/lib/architecture/invariants.ts:
  //     what CRWN expects applied vs pending. Checked here, deterministically.
  //   LIVE PROBE — npm run verify:migrations: what production actually has.
  //     When the probe disagrees with the contract, update the CONTRACT and the
  //     docs together; that disagreement is the drift this exists to surface.
  // F-11 was exactly this class: docs called an applied migration pending, and
  // the phrase-level pins above only caught the exact wording.
  const MIGRATION_DOCS = [
    ...CANONICAL_DOCS,
    ['docs/crwn-brain/18-SOURCE-MAP.md', read('docs/crwn-brain/18-SOURCE-MAP.md')] as const,
    ['TODO.md', read('TODO.md')] as const,
  ];

  it('no scanned doc describes an APPLIED migration as pending', async () => {
    const { EXPECTED_MIGRATION_STATE, MIGRATION_PENDING_WORDS } = await import('./architecture/invariants');
    for (const m of EXPECTED_MIGRATION_STATE) {
      if (m.state !== 'applied') continue;
      for (const [path, src] of MIGRATION_DOCS) {
        const stale = src
          .split('\n')
          .filter((line) => line.includes(m.file))
          .filter((line) => MIGRATION_PENDING_WORDS.test(line))
          // A corrected doc explains the history; a line that also says the
          // migration is applied/live/ran is not asserting the stale claim.
          .filter((line) => !/applied|~~|RETRACTED|FIXED|ran\b|is LIVE|probe-verified/i.test(line));
        expect(
          stale,
          `${path} describes ${m.file} as pending, but the static contract (EXPECTED_MIGRATION_STATE) says it is applied. If production regressed, update the contract WITH the probe evidence; if the doc is stale, fix the doc.`,
        ).toEqual([]);
      }
    }
  });

  it('every applied-or-pending migration in the contract has a live check (probe line, or the SQL check file)', async () => {
    const { EXPECTED_MIGRATION_STATE } = await import('./architecture/invariants');
    const probe = read('scripts/probe-migrations.mjs');
    const sqlCheck = read('supabase/check-unverified-feature-state.sql');
    for (const m of EXPECTED_MIGRATION_STATE) {
      if (m.state === 'unverified') continue; // unverified means exactly: no trustworthy check yet
      if (m.liveCheck === 'sql-check') {
        // Objects PostgREST cannot see (a widened CHECK constraint). The SQL file is the live
        // layer; an anon probe here would return 200 either way and certify nothing.
        expect(
          sqlCheck.includes(m.file),
          `${m.file} declares liveCheck 'sql-check' but supabase/check-unverified-feature-state.sql does not verify it — the static claim has no live check at all.`,
        ).toBe(true);
        continue;
      }
      expect(
        probe.includes(m.file),
        `${m.file} is '${m.state}' in EXPECTED_MIGRATION_STATE but scripts/probe-migrations.mjs has no probe line for it — the static claim has no live check. Add a probe line (the header explains how), or declare liveCheck: 'sql-check' if the object is invisible to PostgREST.`,
      ).toBe(true);
    }
  });

  it('the four migrations reconciled 2026-08-12 stay pinned as applied', async () => {
    // Production evidence: the founder ran supabase/check-unverified-feature-state.sql and all
    // four returned applied=true. These spent months as "docs and TODO disagree", so they are
    // pinned by name: reverting one to 'unverified'/'pending' without new live evidence fails here.
    const { EXPECTED_MIGRATION_STATE } = await import('./architecture/invariants');
    const RECONCILED = [
      'schema-phase2-royalty-readiness.sql',
      'schema-phase2-producer-sessions.sql',
      'schema-phase2-sub-avatar.sql',
      'schema-phase2-earnings-live-tip-type.sql',
    ];
    for (const file of RECONCILED) {
      const entry = EXPECTED_MIGRATION_STATE.find((m) => m.file === file);
      expect(entry, `${file} vanished from EXPECTED_MIGRATION_STATE`).toBeTruthy();
      expect(
        entry!.state,
        `${file} was VERIFIED APPLIED in production on 2026-08-12. Only new live evidence (a probe or the SQL check) may change this, never a doc claim.`,
      ).toBe('applied');
    }
  });

  it('no doc claims a migration-applied feature is dark BECAUSE of its migration', async () => {
    // The specific stale shape this task fixed: "dark (migration unrun)". A feature may still be
    // dark for a FLAG reason, and that is a different sentence. Only the migration reason is banned.
    const { EXPECTED_MIGRATION_STATE } = await import('./architecture/invariants');
    const applied = EXPECTED_MIGRATION_STATE.filter((m) => m.state === 'applied').map((m) => m.file);
    for (const [path, src] of MIGRATION_DOCS) {
      for (const file of applied) {
        const stale = src
          .split('\n')
          .filter((line) => line.includes(file))
          .filter((line) => /\bunrun\b|\bnot run\b|\bunapplied\b|not applied/i.test(line))
          .filter((line) => !/~~|RETRACTED|FIXED|applied/i.test(line));
        expect(stale, `${path} still calls ${file} unrun; it is applied (live-verified).`).toEqual([]);
      }
    }
  });

  it('every migration file the contract names still exists', async () => {
    const { EXPECTED_MIGRATION_STATE } = await import('./architecture/invariants');
    for (const m of EXPECTED_MIGRATION_STATE) {
      expect(existsSync(`supabase/${m.file}`), `supabase/${m.file} named in EXPECTED_MIGRATION_STATE does not exist`).toBe(true);
    }
  });
});
