// READ-ONLY. Render GB's Promise to Delivery panel rows from PRODUCTION facts, through the same
// pure resolver the route uses (src/lib/benefitReadiness.ts). Proves what the panel will say
// without a session. Mirrors the route's reads; writes nothing.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { buildDeliveryRows, STATE_COPY } from '../src/lib/benefitReadiness.ts';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });
const rows = async (q) => { const { data, error } = await q; return error ? [] : data ?? []; };

const slug = process.argv[2] || 'gb';
const { data: artist } = await db.from('artist_profiles').select('id, slug, song_lab_enabled, platform_tier').eq('slug', slug).single();
const a = artist.id;
const tiers = await rows(db.from('subscription_tiers').select('id, name, price').eq('artist_id', a).eq('is_active', true));
const benefits = await rows(db.from('tier_benefits').select('tier_id, benefit_type, config').in('tier_id', tiers.map((t) => t.id)).eq('is_active', true));
const [tracks, posts, memberFiles, playlists, decisions, sessions, automations, products, credits, flag] = await Promise.all([
  rows(db.from('tracks').select('is_free, allowed_tier_ids, public_release_date, is_active').eq('artist_id', a)),
  rows(db.from('community_posts').select('is_free, allowed_tier_ids, created_at').eq('artist_id', a).eq('is_artist_post', true)),
  rows(db.from('member_files').select('allowed_tier_ids, is_active').eq('artist_id', a)),
  rows(db.from('playlists').select('id, is_free, allowed_tier_ids, is_active').eq('artist_id', a).eq('is_artist_playlist', true)),
  rows(db.from('song_lab_decisions').select('status, is_free, allowed_tier_ids, opens_at, closes_at, closed_at, stage_label').eq('artist_id', a)),
  rows(db.from('live_sessions').select('status, scheduled_at, is_free, allowed_tier_ids, is_active, accepts_submissions, submission_tier_ids, submission_deadline').eq('artist_id', a)),
  rows(db.from('fan_automations').select('status').eq('artist_id', a)),
  rows(db.from('products').select('id').eq('artist_id', a).eq('is_active', true)),
  rows(db.from('release_credits').select('id').eq('artist_id', a)),
  db.from('admin_settings').select('value').eq('key', 'producer_sessions').maybeSingle(),
]);
const facts = {
  now: new Date(), tracks, posts, memberFiles,
  playlists: playlists.filter((p) => p.is_free === false).map((p) => ({ ...p, trackCount: 0, gatedTrackCount: 0 })),
  decisions, sessions, automations,
  productCount: products.length, releaseCreditCount: credits.length,
  platformAllowsDMs: artist.platform_tier !== 'starter',
  songLabEnabled: artist.song_lab_enabled === true,
  producerSessionsEnabled: !!flag.data?.value?.enabled,
};
const out = buildDeliveryRows({ tiers, benefits, facts, artistSlug: artist.slug });
console.log(`${slug}: ${out.length} rows (song lab ${facts.songLabEnabled ? 'on' : 'off'}, producer sessions ${facts.producerSessionsEnabled ? 'on' : 'off'})`);
for (const r of out) {
  console.log(`  ${r.tierName.padEnd(9)} ${r.label.padEnd(40)} ${STATE_COPY[r.state].padEnd(22)} ${r.fact}${r.servesTierNames.length ? ' [serves ' + r.servesTierNames.join(', ') + ']' : ''}`);
  if (r.fastAction) console.log(`            -> ${r.fastAction.label}: ${r.fastAction.href}`);
}
