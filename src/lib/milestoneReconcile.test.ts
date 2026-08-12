import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  deriveMilestones,
  mergeMilestones,
  shouldEnrollForRule,
  MAX_STALL_WINDOW_DAYS,
  type ArtistEvidence,
} from './milestoneReconcile';

// F-04 (product consistency audit, 2026-08-12).
//
// Activation milestones were browser fire-and-forget writes into a route that swallowed
// every error; the nudge rules prerequisite-chain on them, so one lost write silenced every
// downstream lifecycle email forever. This suite pins the reconciliation layer that derives
// milestone truth from canonical rows, and the Decision-D boundary: backfilled TRUTH must
// never become a fresh lifecycle EVENT.

const base: ArtistEvidence = {
  artistId: 'a1',
  artistCreatedAt: '2026-01-01T00:00:00Z',
  setupCompleted: false,
  setupCompletedEventAt: null,
  firstTrackAt: null,
  firstAlbumAt: null,
  firstTierAt: null,
  firstPaidSubEarningAt: null,
};

describe('deriveMilestones — canonical evidence in, truth out', () => {
  it('a real track row reconciles first_track_uploaded, at the track timestamp', () => {
    const d = deriveMilestones({ ...base, firstTrackAt: '2026-02-03T12:00:00Z' });
    expect(d.first_track_uploaded).toBe('2026-02-03T12:00:00Z');
  });

  it('a real paid tier row reconciles tiers_created', () => {
    const d = deriveMilestones({ ...base, firstTierAt: '2026-02-05T09:00:00Z' });
    expect(d.tiers_created).toBe('2026-02-05T09:00:00Z');
  });

  it('the setup_completed funnel event reconciles onboarding_completed at the EVENT time', () => {
    const d = deriveMilestones({
      ...base,
      setupCompleted: true,
      setupCompletedEventAt: '2026-01-02T08:00:00Z',
    });
    expect(d.onboarding_completed).toBe('2026-01-02T08:00:00Z');
  });

  it('legacy artist (flag true, no event) falls back to signup date, never now()', () => {
    const d = deriveMilestones({ ...base, setupCompleted: true });
    expect(d.onboarding_completed).toBe(base.artistCreatedAt);
  });

  it('missing evidence does not become true — null never becomes a timestamp', () => {
    const d = deriveMilestones(base);
    expect(d).toEqual({});
  });

  it('never derives stripe_connected — that stays canonical to the live Stripe check', () => {
    const d = deriveMilestones({
      ...base,
      setupCompleted: true,
      firstTrackAt: '2026-02-01T00:00:00Z',
      firstTierAt: '2026-02-02T00:00:00Z',
      firstPaidSubEarningAt: '2026-02-10T00:00:00Z',
    });
    expect('stripe_connected' in d).toBe(false);
  });

  it('a paid subscription earning reconciles first_subscriber', () => {
    const d = deriveMilestones({ ...base, firstPaidSubEarningAt: '2026-03-01T00:00:00Z' });
    expect(d.first_subscriber).toBe('2026-03-01T00:00:00Z');
  });
});

describe('mergeMilestones — first write wins, idempotent', () => {
  it('fills a missing milestone and reports the change', () => {
    const { merged, changed } = mergeMilestones({}, { first_track_uploaded: '2026-02-03T00:00:00Z' });
    expect(changed).toBe(true);
    expect(merged.first_track_uploaded).toBe('2026-02-03T00:00:00Z');
  });

  it('NEVER overwrites an existing timestamp — live truth beats re-derivation', () => {
    const { merged, changed } = mergeMilestones(
      { first_track_uploaded: '2026-02-01T00:00:00Z' },
      { first_track_uploaded: '2026-02-03T00:00:00Z' },
    );
    expect(changed).toBe(false);
    expect(merged.first_track_uploaded).toBe('2026-02-01T00:00:00Z');
  });

  it('repeated reconciliation is a no-op after the first pass', () => {
    const derived = { tiers_created: '2026-02-05T00:00:00Z' };
    const first = mergeMilestones({}, derived);
    const second = mergeMilestones(first.merged, derived);
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.merged).toEqual(first.merged);
  });
});

describe('shouldEnrollForRule — Decision D: truth is not communication eligibility', () => {
  const rule = {
    triggerType: 'activation_no_tiers',
    requiresMilestone: 'first_track_uploaded',
    missingMilestone: 'tiers_created',
    stallDays: 2,
  };
  const NOW = new Date('2026-08-12T00:00:00Z');

  it('a FRESH stall (past stallDays, inside the window) still enrolls — live lifecycle intact', () => {
    const ok = shouldEnrollForRule(
      rule,
      { first_track_uploaded: '2026-08-05T00:00:00Z' }, // 7 days ago
      '2026-08-01T00:00:00Z',
      NOW,
    );
    expect(ok).toBe(true);
  });

  it('a backfilled SIX-MONTH-OLD stall does NOT enroll — no retroactive nudge storm', () => {
    const ok = shouldEnrollForRule(
      rule,
      { first_track_uploaded: '2026-02-01T00:00:00Z' },
      '2026-01-01T00:00:00Z',
      NOW,
    );
    expect(ok).toBe(false);
  });

  it('the freshness window is a real bound, not decoration', () => {
    expect(MAX_STALL_WINDOW_DAYS).toBeGreaterThanOrEqual(14);
    expect(MAX_STALL_WINDOW_DAYS).toBeLessThanOrEqual(60);
  });

  it('missing prerequisite never enrolls (not stalled, just early — or truth not yet reconciled)', () => {
    expect(shouldEnrollForRule(rule, {}, '2026-08-01T00:00:00Z', NOW)).toBe(false);
  });

  it('milestone already achieved never enrolls', () => {
    const ok = shouldEnrollForRule(
      rule,
      { first_track_uploaded: '2026-08-05T00:00:00Z', tiers_created: '2026-08-06T00:00:00Z' },
      '2026-08-01T00:00:00Z',
      NOW,
    );
    expect(ok).toBe(false);
  });

  it('too early (under stallDays) never enrolls', () => {
    const ok = shouldEnrollForRule(
      rule,
      { first_track_uploaded: '2026-08-11T00:00:00Z' }, // 1 day ago, stallDays 2
      '2026-08-01T00:00:00Z',
      NOW,
    );
    expect(ok).toBe(false);
  });

  it('a garbage timestamp never enrolls — bad data fails closed, not loud', () => {
    const ok = shouldEnrollForRule(rule, { first_track_uploaded: 'not-a-date' }, '2026-08-01T00:00:00Z', NOW);
    expect(ok).toBe(false);
  });
});

// ── Source wiring ───────────────────────────────────────────────────────────

const CRON = readFileSync('src/app/api/cron/activation-nudges/route.ts', 'utf8');
const ARTIST_ROUTE = readFileSync('src/app/api/artist/milestone/route.ts', 'utf8');
const ADMIN_ROUTE = readFileSync('src/app/api/admin/milestone/route.ts', 'utf8');
const RECONCILE = readFileSync('src/lib/milestoneReconcile.ts', 'utf8');

describe('F-04 wiring', () => {
  it('the nudge cron reconciles truth BEFORE evaluating rules, via the shared module', () => {
    expect(CRON).toContain('reconcileAllActivationMilestones');
    expect(CRON).toContain('shouldEnrollForRule');
    // The reconcile call must precede the artist fetch used for rule evaluation.
    expect(CRON.indexOf('reconcileAllActivationMilestones(')).toBeLessThan(
      CRON.indexOf(".not('pipeline_stage'"),
    );
  });

  it('the cron no longer carries its own inline stall arithmetic', () => {
    expect(CRON).not.toContain('daysSinceAnchor');
  });

  it('client milestone tracking failure is observable, not silent (F-04 section 7)', () => {
    expect(ARTIST_ROUTE).toContain('console.error');
    // Still fail-soft: the artist gets ok either way.
    expect(ARTIST_ROUTE).toMatch(/console\.error[\s\S]*?ok:\s*true/);
  });

  it('F-16: canonical route is artist self-service; old admin path is a wrapper only', () => {
    expect(ARTIST_ROUTE).toContain('recordActivationMilestone');
    expect(ADMIN_ROUTE).toContain("export { POST } from '@/app/api/artist/milestone/route'");
    expect(ADMIN_ROUTE.length).toBeLessThan(1000); // a wrapper, not a second implementation
  });

  it('reconciliation derives from paid tiers only — the wizard free Bronze cannot satisfy the monetization chain', () => {
    expect(RECONCILE).toContain(".gt('price', 0)");
  });

  it('reconciliation never writes stripe_connected', () => {
    expect(RECONCILE).not.toMatch(/stripe_connected\s*[:=]/);
  });
});
