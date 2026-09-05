// Does the winner column actually behave in PRODUCTION? Self-cleaning behavioural probe.
//
// WHY THIS EXISTS SEPARATELY FROM THE MIGRATION'S SELF-VERIFY. That block runs as a superuser
// with a hand-set `request.jwt.claims`, which proves the trigger's logic. This drives the same
// properties through PostgREST with the REAL service-role key, which is the path the application
// actually takes. Two different callers, same answers, is stronger than either alone.
//
// It creates a throwaway campaign and deletes it in a finally, then asserts nothing is left.
// It NEVER touches a real campaign: the archetype is a reserved marker, and the only fan rows it
// writes belong to that throwaway campaign and disappear with it.
//
// Usage: node scripts/probe-winner-freeze.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MARKER = '__winner_probe';
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log('  [' + (ok ? 'PASS' : 'FAIL') + '] ' + name + (detail ? ' — ' + detail : ''));
};

const { data: artist } = await db.from('artist_profiles').select('id').order('id').limit(1).single();
const { data: fans } = await db.from('profiles').select('id').order('id').limit(2);
if (!artist || !fans || fans.length < 2) {
  console.error('need one artist and two profiles to probe; found', fans?.length ?? 0, 'profiles');
  process.exit(1);
}

let campaignId = null;
try {
  const { data: camp, error: cErr } = await db.from('fan_campaigns')
    .insert({
      artist_id: artist.id, archetype: MARKER, title: MARKER, status: 'draft',
      ends_at: new Date(Date.now() + 86400000).toISOString(),
    })
    .select('id').single();
  if (cErr) throw new Error('could not create the throwaway campaign: ' + cErr.message);
  campaignId = camp.id;

  const { data: parts, error: pErr } = await db.from('fan_campaign_participants')
    .insert([
      { campaign_id: campaignId, fan_id: fans[0].id },
      { campaign_id: campaignId, fan_id: fans[1].id },
    ])
    .select('id, fan_id');
  if (pErr) throw new Error('could not create participants: ' + pErr.message);
  const [p1, p2] = parts;

  // 1. The application may record a winner.
  const now = new Date().toISOString();
  const { data: won, error: e1 } = await db.from('fan_campaign_participants')
    .update({ selected_winner_at: now }).eq('id', p1.id).select('id');
  check('service_role can RECORD a winner', !e1 && won?.length === 1, e1 ? e1.code + ' ' + e1.message : 'one row');

  // 2. THE CHECK THE MIGRATION COULD NOT FINISH: a second winner in the same campaign.
  const { error: e2 } = await db.from('fan_campaign_participants')
    .update({ selected_winner_at: now }).eq('id', p2.id).select('id');
  check('a SECOND winner is refused by the partial unique index', e2?.code === '23505',
    e2 ? e2.code + ' ' + e2.message.slice(0, 60) : 'NO ERROR: the campaign accepted two winners');

  // 3. Append-only: even the application cannot unrecord.
  const { error: e3 } = await db.from('fan_campaign_participants')
    .update({ selected_winner_at: null }).eq('id', p1.id).select('id');
  check('a recorded winner cannot be CLEARED', e3?.code === '42501',
    e3 ? e3.code + ' ' + e3.message.slice(0, 60) : 'NO ERROR: a winner was cleared');

  // 4. ...nor moved to a different instant.
  const { error: e4 } = await db.from('fan_campaign_participants')
    .update({ selected_winner_at: new Date(Date.now() + 1000).toISOString() }).eq('id', p1.id).select('id');
  check('a recorded winner cannot be CHANGED', e4?.code === '42501',
    e4 ? e4.code : 'NO ERROR: a winner was moved');

  // 5. A different campaign may still have its own winner: the index is per campaign.
  const { data: camp2 } = await db.from('fan_campaigns')
    .insert({
      artist_id: artist.id, archetype: MARKER, title: MARKER + '-2', status: 'draft',
      ends_at: new Date(Date.now() + 86400000).toISOString(),
    })
    .select('id').single();
  const { data: p3 } = await db.from('fan_campaign_participants')
    .insert({ campaign_id: camp2.id, fan_id: fans[0].id }).select('id').single();
  const { error: e5 } = await db.from('fan_campaign_participants')
    .update({ selected_winner_at: now }).eq('id', p3.id).select('id');
  check('a DIFFERENT campaign may have its own winner', !e5, e5 ? e5.code : 'per-campaign, as intended');
  await db.from('fan_campaigns').delete().eq('id', camp2.id);
} finally {
  if (campaignId) await db.from('fan_campaigns').delete().eq('id', campaignId);
  const { data: left } = await db.from('fan_campaigns').select('id').eq('archetype', MARKER);
  const { count: parts } = await db.from('fan_campaign_participants').select('*', { count: 'exact', head: true });
  check('cleanup left nothing behind', (left?.length ?? 0) === 0 && parts === 0,
    (left?.length ?? 0) + ' campaigns, ' + parts + ' participants remain');
}

const failed = results.filter((r) => !r.ok);
console.log('\n' + (failed.length ? 'FAILED: ' + failed.map((f) => f.name).join('; ') : 'All winner-freeze properties hold in production.'));
process.exit(failed.length ? 1 : 0);
