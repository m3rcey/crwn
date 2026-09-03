import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveReadiness, buildDeliveryRows, EMPTY_FACTS, type DeliveryFacts } from './benefitReadiness';

const NOW = new Date('2026-09-03T12:00:00Z');
const facts = (over: Partial<DeliveryFacts> = {}): DeliveryFacts => ({ ...EMPTY_FACTS, now: NOW, ...over });
const past = '2026-08-01T00:00:00Z';
const future = '2026-10-10T00:00:00Z';

const SILVER = 'silver';
const GOLD = 'gold';
const PLAT = 'platinum';
const TIERS = [
  { id: 'bronze', name: 'Bronze', price: 0 },
  { id: SILVER, name: 'Silver', price: 1000 },
  { id: GOLD, name: 'Gold', price: 2500 },
  { id: PLAT, name: 'Platinum', price: 5000 },
];

describe('members-only music', () => {
  it('is ready when a member-only track carries the rung', () => {
    const f = facts({ tracks: [{ is_free: false, allowed_tier_ids: [SILVER, GOLD, PLAT], public_release_date: null, is_active: true }] });
    expect(resolveReadiness('exclusive_tracks', f, SILVER).state).toBe('ready');
    expect(resolveReadiness('exclusive_tracks', f, 'bronze').state).toBe('nothing_yet');
  });
  it('does not count a free track, an inactive track, or a members-first window', () => {
    const f = facts({
      tracks: [
        { is_free: true, allowed_tier_ids: [], public_release_date: null, is_active: true },
        { is_free: false, allowed_tier_ids: [SILVER], public_release_date: null, is_active: false },
        { is_free: true, allowed_tier_ids: [SILVER], public_release_date: future, is_active: true },
      ],
    });
    expect(resolveReadiness('exclusive_tracks', f, SILVER).state).toBe('nothing_yet');
  });
});

describe('early access', () => {
  it('is active inside a members-first window and ready after one', () => {
    const open = facts({ tracks: [{ is_free: true, allowed_tier_ids: [SILVER], public_release_date: future, is_active: true }] });
    expect(resolveReadiness('early_access', open, SILVER)).toMatchObject({ state: 'active' });
    const done = facts({ tracks: [{ is_free: true, allowed_tier_ids: [SILVER], public_release_date: past, is_active: true }] });
    expect(resolveReadiness('early_access', done, SILVER).state).toBe('ready');
    expect(resolveReadiness('early_access', facts(), SILVER).state).toBe('nothing_yet');
  });
  it('a future date with NO tiers is public, not a window (the lock-out bug rule)', () => {
    const f = facts({ tracks: [{ is_free: true, allowed_tier_ids: [], public_release_date: future, is_active: true }] });
    expect(resolveReadiness('early_access', f, SILVER).state).toBe('nothing_yet');
  });
});

describe('behind the scenes and stems', () => {
  it('count only gated rows for the rung', () => {
    const f = facts({
      posts: [{ is_free: false, allowed_tier_ids: [SILVER, GOLD], created_at: past }, { is_free: true, allowed_tier_ids: [], created_at: past }],
      memberFiles: [{ allowed_tier_ids: [SILVER, GOLD, PLAT], is_active: true }, { allowed_tier_ids: [PLAT], is_active: false }],
    });
    expect(resolveReadiness('exclusive_posts', f, SILVER).state).toBe('ready');
    expect(resolveReadiness('exclusive_posts', f, PLAT).state).toBe('nothing_yet');
    expect(resolveReadiness('stems', f, GOLD).state).toBe('ready');
    expect(resolveReadiness('stems', f, 'bronze').state).toBe('nothing_yet');
  });
});

describe('the Vault (D5)', () => {
  it('needs setup with no gated collection, is empty with zero tracks, ready with a gated track', () => {
    expect(resolveReadiness('vault_collection', facts(), GOLD).state).toBe('needs_setup');
    const empty = facts({ playlists: [{ is_free: false, allowed_tier_ids: [GOLD, PLAT], is_active: true, trackCount: 0, gatedTrackCount: 0 }] });
    expect(resolveReadiness('vault_collection', empty, GOLD)).toEqual({ state: 'nothing_yet', fact: 'The Vault is empty.' });
    const filled = facts({ playlists: [{ is_free: false, allowed_tier_ids: [GOLD, PLAT], is_active: true, trackCount: 3, gatedTrackCount: 3 }] });
    expect(resolveReadiness('vault_collection', filled, GOLD).state).toBe('ready');
    expect(resolveReadiness('vault_collection', filled, PLAT).state).toBe('ready');
    expect(resolveReadiness('vault_collection', filled, SILVER).state).toBe('needs_setup');
  });
  it('a Vault holding only public tracks is not ready: the playlist gate is cosmetic, the track gate is real', () => {
    const f = facts({ playlists: [{ is_free: false, allowed_tier_ids: [GOLD, PLAT], is_active: true, trackCount: 2, gatedTrackCount: 0 }] });
    expect(resolveReadiness('vault_collection', f, GOLD)).toMatchObject({ state: 'nothing_yet' });
  });
});

describe('creative voting', () => {
  const dec = (over: Partial<DeliveryFacts['decisions'][number]>) => ({
    status: 'open', is_free: false, allowed_tier_ids: [GOLD, PLAT], opens_at: null, closes_at: null, closed_at: null, stage_label: 'Hook', ...over,
  });
  it('is active for an open decision the rung may vote in, and not for a rung it excludes', () => {
    const f = facts({ songLabEnabled: true, decisions: [dec({})] });
    expect(resolveReadiness('creative_voting', f, GOLD)).toEqual({ state: 'active', fact: 'A decision is open now: Hook.' });
    expect(resolveReadiness('creative_voting', f, SILVER).state).toBe('nothing_yet');
  });
  it('is upcoming before opens_at, ready after a close, and needs setup when Song Lab is off', () => {
    expect(resolveReadiness('creative_voting', facts({ songLabEnabled: true, decisions: [dec({ opens_at: future })] }), GOLD).state).toBe('upcoming');
    expect(resolveReadiness('creative_voting', facts({ songLabEnabled: true, decisions: [dec({ status: 'closed', closed_at: past })] }), GOLD).state).toBe('ready');
    expect(resolveReadiness('creative_voting', facts({ songLabEnabled: true, decisions: [dec({ closes_at: past })] }), GOLD).state).toBe('nothing_yet');
    expect(resolveReadiness('creative_voting', facts({ songLabEnabled: false }), GOLD).state).toBe('needs_setup');
  });
});

describe('sessions and submissions', () => {
  const sess = (over: Partial<DeliveryFacts['sessions'][number]>) => ({
    status: 'scheduled', scheduled_at: future, is_free: false, allowed_tier_ids: [GOLD, PLAT], is_active: true,
    accepts_submissions: false, submission_tier_ids: null, submission_deadline: null, ...over,
  });
  it('live is active, a future schedule is upcoming, an ended one is ready', () => {
    expect(resolveReadiness('group_live_qa', facts({ sessions: [sess({ status: 'live' })] }), GOLD).state).toBe('active');
    expect(resolveReadiness('group_live_qa', facts({ sessions: [sess({})] }), GOLD).state).toBe('upcoming');
    expect(resolveReadiness('group_live_qa', facts({ sessions: [sess({ status: 'ended' })] }), GOLD).state).toBe('ready');
    expect(resolveReadiness('group_live_qa', facts({ sessions: [sess({})] }), SILVER).state).toBe('nothing_yet');
  });
  it('a submission window is active only for a rung that may watch AND may submit, before the deadline', () => {
    const open = sess({ accepts_submissions: true, submission_tier_ids: [PLAT], submission_deadline: future });
    const f = facts({ producerSessionsEnabled: true, sessions: [open] });
    expect(resolveReadiness('fan_submissions', f, PLAT).state).toBe('active');
    // Gold can watch but submission_tier_ids narrows to Platinum: never widened.
    expect(resolveReadiness('fan_submissions', f, GOLD).state).toBe('nothing_yet');
    const closed = facts({ producerSessionsEnabled: true, sessions: [sess({ ...open, submission_deadline: past })] });
    expect(resolveReadiness('fan_submissions', closed, PLAT).state).toBe('nothing_yet');
    expect(resolveReadiness('fan_submissions', facts({ producerSessionsEnabled: false }), PLAT).state).toBe('needs_setup');
  });
});

describe('recognition, funnel, messaging, shop, credits', () => {
  it('recognition is automatically ready and names no fan', () => {
    const r = resolveReadiness('member_recognition', facts(), PLAT);
    expect(r.state).toBe('ready');
    expect(r.fact).not.toMatch(/@|[0-9a-f]{8}-/);
  });
  it('the welcome unlock reads the drop funnel status', () => {
    expect(resolveReadiness('welcome_unlock', facts(), 'bronze').state).toBe('needs_setup');
    expect(resolveReadiness('welcome_unlock', facts({ automations: [{ status: 'draft' }] }), 'bronze').state).toBe('needs_setup');
    expect(resolveReadiness('welcome_unlock', facts({ automations: [{ status: 'active' }] }), 'bronze').state).toBe('ready');
  });
  it('messaging needs the plan, discounts need a product, credits need one written', () => {
    expect(resolveReadiness('direct_messaging', facts(), SILVER).state).toBe('needs_setup');
    expect(resolveReadiness('direct_messaging', facts({ platformAllowsDMs: true }), SILVER).state).toBe('ready');
    expect(resolveReadiness('shop_discount', facts(), SILVER).state).toBe('nothing_yet');
    expect(resolveReadiness('shop_discount', facts({ productCount: 2 }), SILVER).state).toBe('ready');
    expect(resolveReadiness('credits_on_releases', facts({ releaseCreditCount: 1 }), PLAT).state).toBe('ready');
  });
});

describe('manual and retired never claim readiness', () => {
  it('manual promises resolve to manual; retired keys to retired; unknown keys to retired', () => {
    expect(resolveReadiness('one_on_one_call', facts(), PLAT).state).toBe('manual');
    expect(resolveReadiness('custom_experience', facts(), PLAT).state).toBe('manual');
    expect(resolveReadiness('supporter_wall', facts(), PLAT).state).toBe('retired');
    expect(resolveReadiness('not_a_key', facts(), PLAT).state).toBe('retired');
  });
});

describe('buildDeliveryRows', () => {
  it('shows an inherited benefit once, on the tier that owns it, naming the tiers it serves', () => {
    const rows = buildDeliveryRows({
      tiers: TIERS,
      benefits: [
        { tier_id: SILVER, benefit_type: 'stems', config: {} },
        { tier_id: GOLD, benefit_type: 'stems', config: {} },
        { tier_id: GOLD, benefit_type: 'creative_voting', config: {} },
      ],
      facts: facts({ songLabEnabled: true }),
      artistSlug: 'gb',
    });
    expect(rows.map((r) => `${r.tierName}:${r.benefit}`)).toEqual(['Silver:stems', 'Gold:creative_voting']);
    expect(rows[0].servesTierNames).toEqual(['Gold', 'Platinum']);
  });

  it('keeps the same key with a DIFFERENT config as its own row', () => {
    const rows = buildDeliveryRows({
      tiers: TIERS,
      benefits: [
        { tier_id: SILVER, benefit_type: 'early_access', config: { days_early: 7 } },
        { tier_id: GOLD, benefit_type: 'early_access', config: { days_early: 14 } },
      ],
      facts: facts(),
      artistSlug: 'gb',
    });
    expect(rows).toHaveLength(2);
  });

  it('sorts setup first within a tier and carries the tier pointer in the fast action', () => {
    const rows = buildDeliveryRows({
      tiers: TIERS,
      benefits: [
        { tier_id: GOLD, benefit_type: 'member_recognition', config: {} },
        { tier_id: GOLD, benefit_type: 'vault_collection', config: {} },
      ],
      facts: facts(),
      artistSlug: 'gb',
    });
    expect(rows.map((r) => r.state)).toEqual(['needs_setup', 'ready']);
    expect(rows[0].fastAction).toEqual({ label: 'Add to Vault', href: `/studio/music?benefit=vault_collection&tier=${GOLD}` });
    expect(rows[1].fastAction).toBeNull();
  });

  it('marks a scheduled benefit and leaves an unscheduled one unmarked', () => {
    const rows = buildDeliveryRows({
      tiers: TIERS,
      benefits: [
        { tier_id: SILVER, benefit_type: 'exclusive_posts', config: { frequency: 'weekly' } },
        { tier_id: GOLD, benefit_type: 'group_live_qa', config: { frequency: '' } },
      ],
      facts: facts(),
      artistSlug: null,
    });
    expect(rows.find((r) => r.benefit === 'exclusive_posts')!.scheduled).toBe(true);
    expect(rows.find((r) => r.benefit === 'group_live_qa')!.scheduled).toBe(false);
  });

  it('a benefit on a tier the artist does not own never produces a row', () => {
    const rows = buildDeliveryRows({
      tiers: TIERS,
      benefits: [{ tier_id: 'someone-elses-tier', benefit_type: 'stems', config: {} }],
      facts: facts(),
      artistSlug: 'gb',
    });
    expect(rows).toEqual([]);
  });
});

describe('readiness never grants: source assertions', () => {
  // Comments explain what the module refuses to touch, so strip them before scanning code.
  const src = readFileSync('src/lib/benefitReadiness.ts', 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  it('the module never writes, never imports a database client, never handles a key or URL', () => {
    expect(src).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/file_key|audio_url|signed/i);
  });
  it('facts carry counts and dates only', () => {
    // No fan id, no file key, no URL type reaches the facts interface.
    const iface = src.slice(src.indexOf('export interface DeliveryFacts'), src.indexOf('export const EMPTY_FACTS'));
    expect(iface).not.toMatch(/fan_id|file_key|url|email|name:/i);
  });
});
