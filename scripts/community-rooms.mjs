// Set up an artist's tier rooms (one community room per membership rung) without waiting
// for the artist to open their own community tab, which does the same thing on its own.
//
// The plan is the SAME pure function the app uses (planTierRooms in
// src/lib/community/rooms.ts): one artist-only room per active tier, each admitting that
// rung and every rung priced above it. Additive only: never deactivates a room and never
// removes a tier from a room's list.
//
// Needs schema-phase2-community-tier-rooms.sql applied first (it refuses otherwise).
//
// Run:  npx tsx scripts/community-rooms.mjs <slug>            (dry run, writes nothing)
//       npx tsx scripts/community-rooms.mjs <slug> --apply    (writes)

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { planTierRooms } from '../src/lib/community/rooms.ts';

const [slug, flag] = process.argv.slice(2);
if (!slug) {
  console.error('Usage: npx tsx scripts/community-rooms.mjs <slug> [--apply]');
  process.exit(1);
}
const apply = flag === '--apply';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fail = (msg) => { console.error(`community-rooms: ${msg}`); process.exit(1); };

const { data: artist } = await db.from('artist_profiles').select('id, slug').eq('slug', slug).maybeSingle();
if (!artist) fail(`no artist with slug "${slug}"`);

const probe = await db.from('community_channels').select('tier_id').limit(1);
if (probe.error) fail('community_channels.tier_id is missing. Apply supabase/schema-phase2-community-tier-rooms.sql first.');

const [{ data: tiers }, { data: channels }] = await Promise.all([
  db.from('subscription_tiers').select('id, name, price').eq('artist_id', artist.id).eq('is_active', true),
  db.from('community_channels').select('*').eq('artist_id', artist.id),
]);
if (!tiers?.length) fail('this artist has no active tiers');

const plan = planTierRooms(tiers, channels || []);
console.log(`${slug}: ${tiers.length} active tiers, ${(channels || []).filter((c) => c.tier_id).length} rooms today`);
for (const r of plan.create) console.log(`  create  ${r.name} room  (admits ${r.allowed_tier_ids.length} tier${r.allowed_tier_ids.length === 1 ? '' : 's'})`);
for (const u of plan.update) console.log(`  update  ${u.id}  ${JSON.stringify({ ...u, id: undefined })}`);
if (!plan.create.length && !plan.update.length) {
  console.log('  nothing to do');
  process.exit(0);
}
if (!apply) {
  console.log('Dry run. Re-run with --apply to write.');
  process.exit(0);
}

if (plan.create.length) {
  const { error } = await db.from('community_channels').insert(plan.create.map((r) => ({ ...r, artist_id: artist.id })));
  if (error) fail(`create failed: ${error.message}`);
}
for (const { id, ...fields } of plan.update) {
  const { error } = await db.from('community_channels').update(fields).eq('id', id).eq('artist_id', artist.id);
  if (error) fail(`update failed: ${error.message}`);
}

// Read back: one room per active tier, each admitting its rung.
const { data: after } = await db.from('community_channels').select('name, tier_id, allowed_tier_ids, artist_only_posting').eq('artist_id', artist.id).not('tier_id', 'is', null);
const missing = tiers.filter((t) => !(after || []).some((r) => r.tier_id === t.id && r.allowed_tier_ids.includes(t.id) && r.artist_only_posting));
if (missing.length) fail(`read-back failed: no room for ${missing.map((t) => t.name).join(', ')}`);
console.log(`Done. ${after.length} rooms: ${after.map((r) => r.name).join(', ')}`);
