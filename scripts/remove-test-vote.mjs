// Remove ONE fan's test vote on ONE artist's Song Lab ballot: the vote, the claim row, the
// "Day One A&R" badge, the FREE membership the vote created, and the "X joined Bronze"
// notification it sent the artist. Built because the founder tests live ballots from his own
// account, and every test vote is otherwise a real member and a real notification.
//
// Guard rails:
//   * Exactly one fan (by user id) on exactly one artist (by slug). Nothing else is matched.
//   * The membership is removed ONLY if it is the synthetic free one (free_<fan>_<artist>, no
//     Stripe customer). A paid or Stripe-backed row makes the script refuse outright.
//   * The notification is matched by type new_subscriber, the fan's display name, and a
//     timestamp within two minutes of the membership, so another fan's join is never touched.
//   * Dry run by default; --apply deletes by the exact ids it printed, and each delete must
//     remove exactly one row or it halts.
//
// Run:  node scripts/remove-test-vote.mjs <artistSlug> <fanUserId>            (dry run)
//       node scripts/remove-test-vote.mjs <artistSlug> <fanUserId> --apply

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [slug, fanId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const APPLY = process.argv.includes('--apply');
const die = (m) => { console.error('HALT:', m); process.exit(1); };
if (!slug || !/^[0-9a-f-]{36}$/.test(fanId || '')) die('usage: node scripts/remove-test-vote.mjs <artistSlug> <fanUserId> [--apply]');

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

const { data: artist } = await db.from('artist_profiles').select('id, user_id').eq('slug', slug).single();
if (!artist) die(`no artist ${slug}`);
const { data: fan } = await db.from('profiles').select('display_name').eq('id', fanId).single();
if (!fan) die(`no profile ${fanId}`);

const rows = [];
const add = (table, list) => { for (const r of list || []) rows.push({ table, id: r.id }); };
add('fan_badge_awards', (await db.from('fan_badge_awards').select('id').eq('artist_id', artist.id).eq('fan_id', fanId).eq('badge_key', 'day_one_anr')).data);
add('song_lab_votes', (await db.from('song_lab_votes').select('id').eq('artist_id', artist.id).eq('fan_id', fanId)).data);
add('song_lab_offer_claims', (await db.from('song_lab_offer_claims').select('id').eq('artist_id', artist.id).eq('fan_id', fanId)).data);

const { data: subs } = await db.from('subscriptions').select('id, stripe_subscription_id, stripe_customer_id, created_at').eq('artist_id', artist.id).eq('fan_id', fanId);
for (const s of subs || []) {
  if (s.stripe_subscription_id !== `free_${fanId}_${artist.id}` || s.stripe_customer_id) die(`membership ${s.id} is not a free test join; refusing`);
  rows.push({ table: 'subscriptions', id: s.id });
  const t = new Date(s.created_at).getTime();
  const { data: notes } = await db.from('notifications').select('id, message, created_at').eq('user_id', artist.user_id).eq('type', 'new_subscriber');
  for (const n of notes || []) {
    const close = Math.abs(new Date(n.created_at).getTime() - t) < 120000;
    if (close && fan.display_name && n.message.startsWith(`${fan.display_name} joined`)) rows.push({ table: 'notifications', id: n.id });
  }
}

if (!rows.length) { console.log(`nothing to remove: ${fan.display_name} has no vote on ${slug}`); process.exit(0); }
for (const r of rows) console.log(`${APPLY ? 'deleting' : 'found   '} ${r.table.padEnd(22)} ${r.id}`);
if (!APPLY) { console.log('\nRe-run with --apply to delete exactly these rows.'); process.exit(0); }

for (const r of rows) {
  const { data, error } = await db.from(r.table).delete().eq('id', r.id).select('id');
  if (error || data?.length !== 1) die(`${r.table} ${r.id}: ${error?.message || `${data?.length} rows`}`);
}
const { count: v } = await db.from('song_lab_votes').select('id', { count: 'exact', head: true }).eq('artist_id', artist.id);
const { count: m } = await db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('artist_id', artist.id);
console.log(`\nremoved ${rows.length} rows. ${slug} now has ${v} votes and ${m} memberships.`);
