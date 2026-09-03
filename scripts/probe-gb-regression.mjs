// READ-ONLY post-cleanup regression check: Offer Experience rows, Go Bad entitlement.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });
const GB = '61cfacee-7971-4252-8c75-bf83de8e3900';

const { data: tiers } = await db.from('subscription_tiers').select('id, name').eq('artist_id', GB);
const nameOf = (id) => tiers.find((t) => t.id === id)?.name ?? id;

const { data: exps, error: eErr } = await db.from('tier_offer_experiences')
  .select('tier_id, is_active, config').eq('artist_id', GB);
console.log('tier_offer_experiences:', eErr ? 'ERROR ' + eErr.message : exps.length);
for (const e of exps || []) console.log('  ', nameOf(e.tier_id), '| active=' + e.is_active, '| cta="' + (e.config?.cta ?? '?') + '"', '| previews=' + (e.config?.previews?.length ?? 0));

const { data: tracks } = await db.from('tracks')
  .select('id, title, is_free, allowed_tier_ids, public_release_date').eq('artist_id', GB);
console.log('\nGB tracks:');
for (const t of tracks || []) {
  const allowed = (t.allowed_tier_ids || []).map(nameOf);
  console.log('  ', t.title, '| is_free=' + t.is_free, '| allowed_tiers=' + JSON.stringify(allowed), '| public_release_date=' + t.public_release_date);
}

// The oracle itself, asked exactly as the player asks it.
for (const t of tracks || []) {
  const { data, error } = await db.rpc('can_play_track', { p_track_id: t.id, p_user_id: null });
  console.log('  can_play_track(anonymous,', t.title + '):', error ? 'ERROR ' + error.message : data);
}

const { data: fanAut } = await db.from('fan_automations')
  .select('public_token, status, gold_tier_id, silver_tier_id, magnet_track_id').eq('artist_id', GB);
console.log('\nfan_automations:');
for (const a of fanAut || []) console.log('  ', a.public_token, '| status=' + a.status, '| primary=' + nameOf(a.gold_tier_id), '| downsell=' + nameOf(a.silver_tier_id));
