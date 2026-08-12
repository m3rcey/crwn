import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';

// WHO PAYS THE ARTIST.
//
// Canonical answer, established 2026-08-11 against live Stripe: **Stripe does.** Every connected
// account is Express on Stripe's own automatic `daily` schedule (`delay_days: 2`). CRWN passes no
// `settings.payouts` at account creation, so it has never configured the schedule and does not own
// payout timing.
//
// `/api/cron/weekly-payout` was retired the same day. It had never created a payout: it filtered
// `artist_profiles.is_active`, a column that does not exist, so it returned "No connected artists
// found" every Monday after taking its `cron_run_log` lock. The estate held 5 payout objects, all
// `automatic: true`, none created through the API.
//
// The ONE CRWN-initiated artist payout is the artist's own $2 cashout. These tests exist so a
// future cleanup cannot quietly reintroduce a scheduled job that moves artists' money.

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const read = (p: string) => stripComments(readFileSync(p, 'utf8'));

const CRON_DIR = 'src/app/api/cron';
const VERCEL = JSON.parse(readFileSync('vercel.json', 'utf8')) as { crons?: { path: string; schedule: string }[] };

describe('the retired weekly payout stays retired', () => {
  it('the route is gone', () => {
    expect(existsSync('src/app/api/cron/weekly-payout')).toBe(false);
    expect(existsSync('src/app/api/cron/weekly-payout/route.ts')).toBe(false);
  });

  it('it is no longer scheduled', () => {
    const paths = (VERCEL.crons ?? []).map((c) => c.path);
    expect(paths).not.toContain('/api/cron/weekly-payout');
  });

  it('nothing still references it as a live route', () => {
    for (const f of ['vercel.json', 'POST_DEPLOY_CHECKLIST.md']) {
      const src = readFileSync(f, 'utf8');
      expect(src, `${f} must not schedule or instruct triggering the retired cron`).not.toMatch(
        /\/api\/cron\/weekly-payout/,
      );
    }
  });
});

describe('NO scheduled job may create an artist payout', () => {
  // The load-bearing regression test: walk every cron route and assert none of them calls
  // `payouts.create`. This is what makes "Stripe owns artist payout timing" enforceable rather
  // than merely documented.
  const cronFiles: string[] = [];
  for (const dir of readdirSync(CRON_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const f = `${CRON_DIR}/${dir.name}/route.ts`;
    if (existsSync(f)) cronFiles.push(f);
  }

  it('found the cron routes to scan', () => {
    expect(cronFiles.length).toBeGreaterThan(15);
  });

  it('no cron route calls stripe.payouts.create', () => {
    for (const f of cronFiles) {
      expect(read(f), `${f} must not create artist payouts`).not.toMatch(/payouts\s*\.\s*create/);
    }
  });

  it('no cron route mutates a payout schedule or account settings', () => {
    for (const f of cronFiles) {
      const src = read(f);
      expect(src, `${f} must not update Stripe accounts`).not.toMatch(/accounts\s*\.\s*update/);
      expect(src, `${f} must not set a payout schedule`).not.toMatch(/settings\s*:\s*\{[\s\S]{0,200}payouts/);
    }
  });
});

describe('the one CRWN-initiated artist payout is unchanged', () => {
  const CASHOUT = read('src/app/api/stripe/cashout/route.ts');

  it('still exists, still artist-initiated, still fee-bearing', () => {
    expect(CASHOUT).toMatch(/payouts\s*\.\s*create/);
    expect(CASHOUT).toContain('CASHOUT_FEE_CENTS');
    expect(CASHOUT).toContain('auth.getUser()');
    expect(CASHOUT).toContain('checkRateLimit');
  });

  it('is the ONLY payouts.create in the whole application', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      // src/lib/architecture holds the drift-prevention registry, whose rule
      // TEXT names the banned call. It is test-infrastructure data, not
      // production code, and its own suites scan everything else.
      if (dir === 'src/lib/architecture') return;
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = `${dir}/${e.name}`;
        if (e.isDirectory()) walk(p);
        else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
          if (p.endsWith('.test.ts')) continue;
          if (/payouts\s*\.\s*create/.test(read(p))) hits.push(p);
        }
      }
    };
    walk('src');
    expect(hits).toEqual(['src/app/api/stripe/cashout/route.ts']);
  });
});

describe('the other money rails are untouched by this retirement', () => {
  // `transfers.create` (platform -> connected account) is a DIFFERENT rail from `payouts.create`
  // (connected balance -> bank). Retiring the artist payout cron must not have disturbed any of
  // these, and they must not be confused with artist payouts.
  const RAILS: [string, string][] = [
    ['fan referral cashout', 'src/app/api/stripe/fan-cashout/route.ts'],
    ['team split cashout', 'src/app/api/stripe/team-split-cashout/route.ts'],
    ['recruiter qualify', 'src/app/api/cron/recruiter-qualify/route.ts'],
    ['recruiter recurring', 'src/app/api/cron/recruiter-recurring/route.ts'],
  ];

  it('each still exists and still uses transfers, not payouts', () => {
    for (const [label, f] of RAILS) {
      expect(existsSync(f), `${label} must still exist`).toBe(true);
      const src = read(f);
      expect(src, `${label} must use transfers`).toMatch(/transfers\s*\.\s*create/);
      expect(src, `${label} must NOT create a bank payout`).not.toMatch(/payouts\s*\.\s*create/);
    }
  });

  it('Connect onboarding still creates Express accounts and still sets no payout schedule', () => {
    const CONNECT = read('src/app/api/stripe/connect/route.ts');
    expect(CONNECT).toMatch(/accounts\s*\.\s*create/);
    expect(CONNECT).toContain("type: 'express'");
    // CRWN deliberately does not configure the schedule: Stripe's default is the canonical one.
    // If this ever changes, payout ownership changes with it and the Brain must be updated.
    expect(CONNECT, 'CRWN must not set a payout schedule at account creation').not.toMatch(
      /settings\s*:\s*\{[\s\S]{0,300}payouts/,
    );
  });
});
