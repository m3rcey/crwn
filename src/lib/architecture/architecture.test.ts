// Registry integrity for the drift-prevention system itself. If this suite
// fails, the registry is lying about what protects CRWN — fix the registry or
// the suite config, never delete an entry to go green.
import { describe, it, expect } from 'vitest';
import { INVARIANTS } from './invariants';
import { ALL_EXCEPTIONS } from './exceptions';
import { existsSync, listSourceFiles, readStripped, readRaw, violation } from './sourceScan';

describe('invariant registry integrity', () => {
  it('invariant ids are unique and well-formed', () => {
    const ids = INVARIANTS.map(i => i.id);
    expect(new Set(ids).size, `duplicate invariant ids: ${ids.filter((x, i) => ids.indexOf(x) !== i)}`).toBe(ids.length);
    for (const i of INVARIANTS) {
      expect(i.id, `${i.id} must be CATEGORY-NNN`).toMatch(/^[A-Z]+-\d{3}$/);
      expect(i.rule.length, `${i.id} rule must be substantive`).toBeGreaterThan(20);
      expect(i.owner.length, `${i.id} must name a canonical owner`).toBeGreaterThan(0);
      expect(i.docs.length, `${i.id} must cite at least one doc to review`).toBeGreaterThan(0);
    }
  });

  it('every enforcedBy file exists (a moved or deleted test silently unprotects its invariant)', () => {
    for (const i of INVARIANTS) {
      for (const f of i.enforcedBy) {
        expect(existsSync(f), violation('REGISTRY', `${i.id} claims enforcement by ${f}, which does not exist`, { file: f })).toBe(true);
      }
    }
  });

  it('every cited doc exists', () => {
    for (const i of INVARIANTS) {
      for (const d of i.docs) {
        expect(existsSync(d), `${i.id} cites missing doc ${d}`).toBe(true);
      }
    }
  });

  it("every invariant with enforcement 'test' names at least one test; 'doc' entries are the honest gaps", () => {
    for (const i of INVARIANTS) {
      if (i.enforcement === 'test') {
        expect(i.enforcedBy.length, `${i.id} says enforcement=test but lists no test`).toBeGreaterThan(0);
      }
    }
  });

  it('every exception references a real invariant and has a reason', () => {
    const ids = new Set(INVARIANTS.map(i => i.id));
    for (const e of ALL_EXCEPTIONS) {
      expect(ids.has(e.invariant), `exception "${e.subject}" references unknown invariant ${e.invariant}`).toBe(true);
      expect(e.reason.length, `exception "${e.subject}" needs a real reason`).toBeGreaterThan(20);
    }
  });

  // EXCEPTION LIVENESS. An allowlist entry that no longer matches real code is not neutral: it
  // reads as "reviewed and approved" while describing something that does not exist. The stale
  // `tracks/check-limit` DELIBERATELY_PUBLIC entry proved that (security.test.ts now checks that
  // list specifically). These two generalize the rule as far as it stays reliable, which means
  // only conditions that are cheap and unambiguous to evaluate from source.
  it('every path-shaped exception subject still exists (a moved or deleted file makes it a claim about nothing)', () => {
    for (const e of ALL_EXCEPTIONS) {
      if (!/^src\/.+\.(ts|tsx)$/.test(e.subject)) continue; // value/identifier subjects: not a path
      expect(
        existsSync(e.subject),
        violation('REGISTRY', `exception for ${e.invariant} names ${e.subject}, which no longer exists. Delete the entry or point it at the file's new home; an exception matching nothing still reads as an approved deviation.`, { file: 'src/lib/architecture/exceptions.ts' }),
      ).toBe(true);
    }
  });

  it('every AUTH-001 exception still exhibits the exceptional condition (the route does NOT call requireAdmin)', () => {
    // The exception exists to say "this admin route carries a DIFFERENT authority". The moment
    // the route is converted to requireAdmin, the exception is stale and must be deleted, or the
    // registry keeps claiming an approved gap that was closed.
    for (const e of ALL_EXCEPTIONS.filter(x => x.invariant === 'AUTH-001')) {
      if (!existsSync(e.subject)) continue; // covered by the test above
      const src = readStripped(e.subject);
      expect(
        src.includes('requireAdmin('),
        violation('REGISTRY', `${e.subject} is listed as an AUTH-001 exception but now calls requireAdmin. The gap it describes is closed: delete the exception rather than leaving an approved deviation on a route that no longer deviates.`, { file: 'src/lib/architecture/exceptions.ts' }),
      ).toBe(false);
    }
  });

  it('every enforcedBy vitest file is part of the architecture suite (npm run verify:architecture)', () => {
    const config = readRaw('vitest.architecture.config.ts');
    const testFiles = new Set(
      INVARIANTS.flatMap(i => i.enforcedBy).filter(f => f.endsWith('.test.ts')),
    );
    for (const f of testFiles) {
      expect(
        config.includes(f),
        violation('REGISTRY', `${f} enforces an invariant but is missing from vitest.architecture.config.ts, so verify:architecture would pass while the invariant is broken`, { file: 'vitest.architecture.config.ts' }),
      ).toBe(true);
    }
  });

  // The test above only protects files an invariant NAMES in enforcedBy. The cybersecurity
  // suites are named by NO invariant, so until this existed they sat in the manifest on trust:
  // deleting their two lines from vitest.architecture.config.ts silently shrank the security
  // gate and every remaining test still passed. The config comment claimed otherwise, which is
  // how a false assurance claim survives review. That is the SEC-001 lesson exactly, applied to
  // the gate itself rather than to a route: an assertion nobody runs on the way to production
  // is decoration. This list is deliberately hardcoded. These suites are load-bearing for the
  // shipping gate, so their membership must be asserted directly and not derived from a
  // registry that may or may not happen to mention them.
  it('the cybersecurity suites are in the shipping gate, not merely present on disk', () => {
    const config = readRaw('vitest.architecture.config.ts');
    const REQUIRED_SECURITY_SUITES = [
      'src/lib/architecture/security.test.ts',
      'src/lib/architecture/headers.test.ts',
      'src/lib/architecture/authorization.test.ts',
      'src/lib/ai/actionValidity.test.ts',
      'src/lib/ai/managerBoundaries.test.ts',
      'src/lib/ai/agentSecurityBoundaries.test.ts',
      'src/lib/architecture/agentContracts.test.ts',
      'src/lib/stripe/payoutOwnership.test.ts',
    ];
    for (const f of REQUIRED_SECURITY_SUITES) {
      expect(existsSync(f), violation('REGISTRY', `required security suite ${f} does not exist`, { file: f })).toBe(true);
      expect(
        config.includes(f),
        violation('REGISTRY', `${f} is a required security suite but is missing from vitest.architecture.config.ts, so verify:architecture would pass while a security invariant is broken`, { file: 'vitest.architecture.config.ts' }),
      ).toBe(true);
    }
  });
});

describe('the drift system is test-time only', () => {
  it('no product code imports the architecture registry, exceptions, or scanner', () => {
    const offenders = listSourceFiles('src')
      .filter(f => !f.startsWith('src/lib/architecture/'))
      .filter(f => {
        const src = readStripped(f);
        return /from\s+['"](@\/lib\/architecture|\.{1,2}\/(?:\.\.\/)*architecture)\//.test(src);
      });
    expect(
      offenders,
      violation('REGISTRY', `product code must not import src/lib/architecture (it reads the repo with node:fs): ${offenders.join(', ')}`),
    ).toEqual([]);
  });
});
