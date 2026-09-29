// Remove ONE fan's test traffic on ONE artist: everything a founder test leaves behind when he
// votes on a ballot or claims a drop funnel from his own account, so the artist's real member
// list, fan list and notifications stay real.
//
//   vote (signed in or captured)  song_lab_votes, song_lab_offer_claims, the Day One A&R badge
//   vote (verified email, typed)  song_lab_public_votes, matched by the SAME keyed hash of the
//                                 email the ballot stores (participantKey), never guessed
//   drop funnel claim             fan_automation_leads, fan_contacts (by the fan's email)
//   either                        the FREE membership it created, and the "joined" notification
//
// Guard rails:
//   * Exactly one fan (by user id; their email is read from auth) on exactly one artist (slug).
//   * The membership is removed ONLY if it is the synthetic free one (free_<fan>_<artist>, no
//     Stripe customer). A paid or Stripe-backed row makes the script refuse outright.
//   * The notification must be type new_subscriber, within two minutes of that membership, and
//     name the fan (or the anonymous "A fan joined" a nameless claim writes).
//   * Dry run by default; --apply deletes by the exact ids it printed, one row each, or halts.
//
// Run (main checkout, WSL):
//   npx tsx scripts/remove-test-vote.mjs <artistSlug> <fanUserId>            (dry run)
//   npx tsx scripts/remove-test-vote.mjs <artistSlug> <fanUserId> --apply

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { participantKey } from '../src/lib/songLab/publicParticipant.ts';

const [slug, fanId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const APPLY = process.argv.includes('--apply');
const die = (m) => { console.error('HALT:', m); process.exit(1); };
if (!slug || !/^[0-9a-f-]{36}$/.test(fanId || '')) die('usage: npx tsx scripts/remove-test-vote.mjs <artistSlug> <fanUserId> [--apply]');

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const SERVICE = pick('SUPABASE_SERVICE_ROLE_KEY');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), SERVICE, { auth: { persistSession: false } });

const { data: artist } = await db.from('artist_profiles').select('id, user_id').eq('slug', slug).single();
if (!artist) die(`no artist ${slug}`);
const { data: fan } = await db.from('profiles').select('display_name').eq('id', fanId).single();
if (!fan) die(`no profile ${fanId}`);
const { data: { user } } = await db.auth.admin.getUserById(fanId);
const email = (user?.email || '').toLowerCase();

const rows = [];
const add = (table, list) => { for (const r of list || []) rows.push({ table, id: r.id }); };
add('fan_badge_awards', (await db.from('fan_badge_awards').select('id').eq('artist_id', artist.id).eq('fan_id', fanId).eq('badge_key', 'day_one_anr')).data);
add('song_lab_votes', (await db.from('song_lab_votes').select('id').eq('artist_id', artist.id).eq('fan_id', fanId)).data);
add('song_lab_offer_claims', (await db.from('song_lab_offer_claims').select('id').eq('artist_id', artist.id).eq('fan_id', fanId)).data);
const key = email ? participantKey(email, SERVICE) : null;
if (key) add('song_lab_public_votes', (await db.from('song_lab_public_votes').select('id').eq('artist_id', artist.id).eq('participant_key', key)).data);
add('fan_automation_leads', (await db.from('fan_automation_leads').select('id').eq('artist_id', artist.id).eq('fan_user_id', fanId)).data);
if (email) {
  const known = new Set(rows.map((r) => r.id));
  const { data: byEmail } = await db.from('fan_automation_leads').select('id').eq('artist_id', artist.id).ilike('email', email);
  add('fan_automation_leads', (byEmail || []).filter((r) => !known.has(r.id)));
  add('fan_contacts', (await db.from('fan_contacts').select('id').eq('artist_id', artist.id).ilike('email', email)).data);
}

const { data: subs } = await db.from('subscriptions').select('id, stripe_subscription_id, stripe_customer_id, created_at').eq('artist_id', artist.id).eq('fan_id', fanId);
for (const s of subs || []) {
  if (s.stripe_subscription_id !== `free_${fanId}_${artist.id}` || s.stripe_customer_id) die(`membership ${s.id} is not a free test join; refusing`);
  rows.push({ table: 'subscriptions', id: s.id });
  const t = new Date(s.created_at).getTime();
  const { data: notes } = await db.from('notifications').select('id, message, created_at').eq('user_id', artist.user_id).eq('type', 'new_subscriber');
  for (const n of notes || []) {
    const close = Math.abs(new Date(n.created_at).getTime() - t) < 120000;
    const names = (fan.display_name && n.message.startsWith(`${fan.display_name} joined`)) || n.message.startsWith('A fan joined');
    if (close && names) rows.push({ table: 'notifications', id: n.id });
  }
}

if (!rows.length) { console.log(`nothing to remove: ${fan.display_name} has no test traffic on ${slug}`); process.exit(0); }
for (const r of rows) console.log(`${APPLY ? 'deleting' : 'found   '} ${r.table.padEnd(22)} ${r.id}`);
if (!APPLY) { console.log('\nRe-run with --apply to delete exactly these rows.'); process.exit(0); }

for (const r of rows) {
  const { data, error } = await db.from(r.table).delete().eq('id', r.id).select('id');
  if (error || data?.length !== 1) die(`${r.table} ${r.id}: ${error?.message || `${data?.length} rows`}`);
}
const { count: v } = await db.from('song_lab_votes').select('id', { count: 'exact', head: true }).eq('artist_id', artist.id);
const { count: pv } = await db.from('song_lab_public_votes').select('id', { count: 'exact', head: true }).eq('artist_id', artist.id);
const { count: m } = await db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('artist_id', artist.id);
console.log(`\nremoved ${rows.length} rows. ${slug} now has ${v + pv} votes and ${m} memberships.`);
