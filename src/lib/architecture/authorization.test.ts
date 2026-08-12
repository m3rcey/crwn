// AUTH-001: every admin route is gated by requireAdmin or is a registered
// exception carrying a DIFFERENT authority (cron secret, internal secret,
// compatibility wrapper, intentionally public endpoint).
//
// SEC-001 (2026-08-12) proved the ORIGINAL version of this suite was unsound.
// It "verified" each exception by regex-matching a source string — for
// /api/admin/approvals the mark was /role === 'admin'/. That route looked up
// the role of whatever user id the REQUEST carried (`?userId=`, `body.adminUserId`),
// so an unauthenticated caller who knew any admin's UUID held full admin
// authority. The string was present, the test was green, and the route had no
// authentication at all.
//
// The lesson, and the rule this suite now enforces: an authorization test must
// assert the AUTHORITY SOURCE, never the presence of an admin-shaped string.
// Role authority is only valid when the identity it reads was derived from the
// SESSION (requireAdmin / auth.getUser), never from a request parameter.
import { describe, it, expect } from 'vitest';
import { listSourceFiles, readStripped, violation } from './sourceScan';
import { ADMIN_ROUTE_EXCEPTIONS } from './exceptions';

/** Reads a role to decide authority (the shape SEC-001 abused). */
const ROLE_AUTHORITY = /role\s*===\s*['"]admin['"]|\.eq\(\s*['"]role['"]|select\(\s*['"][^'"]*\brole\b/;

/**
 * Authority that does NOT come from an identity the caller merely claimed.
 *
 * Session identity (requireAdmin / auth.getUser) is the canonical source. A
 * shared secret the caller must POSSESS (CRON_SECRET, an internal secret) or a
 * provider signature is a different but equally non-forgeable authority, and a
 * route holding one of those may legitimately query `role` as DATA — e.g.
 * admin/agent/autonomous verifies CRON_SECRET first, then looks up an admin id
 * purely to stamp action logs. That is not the SEC-001 class.
 *
 * What is NEVER authority: a user id the request handed us. Possession of a
 * secret is proof; naming a UUID is a claim.
 */
const PROVEN_AUTHORITY = /requireAdmin\s*\(|auth\.getUser\s*\(|CRON_SECRET|INTERNAL_[A-Z_]*SECRET|constructEvent\s*\(|verifyWebhookSignature\s*\(/;

/**
 * A caller-supplied identity parameter. `adminUserId` exists only to carry a
 * claimed admin identity, and `?userId=`/`body.userId` feeding an auth decision
 * is the same class. A TARGET id (targetUserId, artistId, ...) is legitimate and
 * is deliberately not matched here.
 */
const CALLER_SUPPLIED_IDENTITY = /\badminUserId\b|searchParams\.get\(\s*['"]userId['"]\s*\)/;

describe('AUTH-001 — admin route gating', () => {
  const adminRoutes = listSourceFiles('src/app/api/admin').filter(f => f.endsWith('/route.ts'));
  const exceptions = new Map(ADMIN_ROUTE_EXCEPTIONS.map(e => [e.subject, e]));

  it('found the admin surface (positive control)', () => {
    expect(adminRoutes.length, 'no admin routes found — the directory layout changed and this scan is examining nothing').toBeGreaterThan(20);
  });

  it('every admin route calls requireAdmin or is a registered exception', () => {
    const unguarded = adminRoutes.filter(f => {
      if (exceptions.has(f)) return false;
      return !readStripped(f).includes('requireAdmin(');
    });
    expect(
      unguarded,
      violation(
        'AUTH-001',
        `admin route(s) neither call requireAdmin nor carry a registered exception: ${unguarded.join(', ')}. Route-level auth is the ONLY auth (middleware excludes /api/ and the admin client bypasses RLS). Gate it with requireAdmin, or register the different authority in src/lib/architecture/exceptions.ts.`,
        { owner: 'src/lib/auth/requireAdmin.ts', docs: 'docs/crwn-brain/11-SECURITY-AND-PRIVACY.md' },
      ),
    ).toEqual([]);
  });

  // SEC-001 CLASS. Applies to EVERY admin route including registered exceptions:
  // an exception may carry a different authority (a secret, a signature), but it
  // may never derive ADMIN authority from an identity the caller handed it.
  it('no admin route derives role authority from a caller-supplied identity', () => {
    const offenders = adminRoutes.filter(f => {
      const src = readStripped(f);
      if (!ROLE_AUTHORITY.test(src)) return false;   // no role-based authority here
      return !PROVEN_AUTHORITY.test(src);            // role read, but identity never proven by session
    });
    expect(
      offenders,
      violation(
        'AUTH-001',
        `admin route(s) decide authority from a role lookup without deriving the identity from the session: ${offenders.join(', ')}. This is the SEC-001 class: looking up the role of a user id the REQUEST supplied grants admin to anyone who knows an admin UUID. Read the acting admin from requireAdmin() (session), and keep any TARGET id strictly separate from the CALLER identity.`,
        { owner: 'src/lib/auth/requireAdmin.ts', docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12.md' },
      ),
    ).toEqual([]);
  });

  it('no admin route accepts a caller-supplied admin identity parameter', () => {
    const offenders = adminRoutes.filter(f => CALLER_SUPPLIED_IDENTITY.test(readStripped(f)));
    expect(
      offenders,
      violation(
        'AUTH-001',
        `admin route(s) read a caller-supplied identity parameter (adminUserId / ?userId=): ${offenders.join(', ')}. Such a parameter exists only to claim an identity, and a claim is not proof. Delete it and use requireAdmin(); if the business action needs a subject, name it targetUserId and treat it as data, never as authority.`,
        { owner: 'src/lib/auth/requireAdmin.ts', docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12.md' },
      ),
    ).toEqual([]);
  });

  it('every exception still exists, still skips the helper, and still shows its claimed authority', () => {
    // An authority mark must name a NON-role authority (a secret, a signature, a
    // re-export). A role-shaped regex is never an acceptable mark again — that is
    // exactly what let SEC-001 through.
    const AUTHORITY_MARKS: Record<string, RegExp> = {
      'src/app/api/admin/agent/autonomous/route.ts': /CRON_SECRET/,
      'src/app/api/admin/agent/briefing/route.ts': /CRON_SECRET/,
      'src/app/api/admin/track/route.ts': /INTERNAL_TRACK_SECRET/,
      'src/app/api/admin/milestone/route.ts': /export\s*\{\s*POST\s*\}\s*from\s*'@\/app\/api\/artist\/milestone\/route'/,
      'src/app/api/admin/crm/outreach/track/[sendId]/route.ts': /sendId/,
      'src/app/api/admin/crm/outreach/unsubscribe/[sendId]/route.ts': /sendId/,
    };
    for (const e of ADMIN_ROUTE_EXCEPTIONS) {
      const src = readStripped(e.subject); // throws loudly if the file moved
      expect(src.includes('requireAdmin('), `${e.subject} now uses requireAdmin — remove the stale exception`).toBe(false);
      const mark = AUTHORITY_MARKS[e.subject];
      expect(mark, `${e.subject} has no authority mark registered in this test — add one so the exception stays verifiable`).toBeTruthy();
      expect(
        mark.test(src),
        violation('AUTH-001', `${e.subject} no longer shows its claimed authority (${mark}). The exception's reason was: ${e.reason}`, { file: e.subject }),
      ).toBe(true);
    }
  });

  it('no registered exception claims a ROLE check as its authority (SEC-001 regression)', () => {
    // The approvals exception claimed "inline profiles.role === admin check,
    // semantics identical to requireAdmin". It was not identical: requireAdmin
    // derives identity from the session; that route derived it from a query
    // string. Any future exception whose only authority is a role check is the
    // same bug wearing the same disguise.
    const roleOnly = ADMIN_ROUTE_EXCEPTIONS.filter(e => {
      const src = readStripped(e.subject);
      return ROLE_AUTHORITY.test(src) && !PROVEN_AUTHORITY.test(src);
    });
    expect(
      roleOnly.map(e => e.subject),
      violation(
        'AUTH-001',
        'a registered admin exception claims a role check as its authority while never deriving identity from the session. An exception must carry a DIFFERENT authority (cron secret, internal secret, provider signature, or a deliberately public endpoint) — never an unauthenticated role lookup.',
        { docs: 'docs/CYBERSECURITY_AUDIT_2026-08-12.md' },
      ),
    ).toEqual([]);
  });
});
