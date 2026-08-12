// AUTH-001: every admin route is gated by requireAdmin or is a registered
// exception carrying a DIFFERENT authority (cron secret, internal secret,
// compatibility wrapper, verified inline check).
//
// Scope note: this is drift prevention, not the security audit. F-15 verified
// every current exception's inline authority as correct; this suite keeps the
// answer to "which admin routes intentionally skip the shared helper, and why"
// checkable by grep instead of re-derivable by audit.
import { describe, it, expect } from 'vitest';
import { listSourceFiles, readStripped, violation } from './sourceScan';
import { ADMIN_ROUTE_EXCEPTIONS } from './exceptions';

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

  it('every exception still exists, still skips the helper, and still shows its claimed authority', () => {
    const AUTHORITY_MARKS: Record<string, RegExp> = {
      'src/app/api/admin/agent/autonomous/route.ts': /CRON_SECRET/,
      'src/app/api/admin/agent/briefing/route.ts': /CRON_SECRET/,
      'src/app/api/admin/track/route.ts': /INTERNAL_TRACK_SECRET/,
      'src/app/api/admin/milestone/route.ts': /export\s*\{\s*POST\s*\}\s*from\s*'@\/app\/api\/artist\/milestone\/route'/,
      'src/app/api/admin/approvals/route.ts': /role\s*===\s*'admin'/,
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
});
