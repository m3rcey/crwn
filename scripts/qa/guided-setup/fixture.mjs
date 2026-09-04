// QA fixture for the Rise Mode Guided Setup browser walk. Throwaway artist, created and
// deleted the way the daily onboarding canary does it. Run with:
//   node --env-file=.env.local fixture.mjs create
//   node --env-file=.env.local fixture.mjs foundation <artistId> <userId>
//   node --env-file=.env.local fixture.mjs gate-track <artistId> <tierId>
//   node --env-file=.env.local fixture.mjs stripe-fake <artistId>
//   node --env-file=.env.local fixture.mjs state <artistId>
//   node --env-file=.env.local fixture.mjs delete <userId> <artistId>
//   node --env-file=.env.local fixture.mjs cleanup-orphans
import { createClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const [cmd, a1, a2] = process.argv.slice(2);

async function create() {
  const stamp = Date.now();
  const email = `qa-guided-${stamp}@thecrwn.app`;
  const password = `QaGuided!${stamp}`;
  const slug = `__qa-guided-${stamp}`;
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const userId = created.user.id;
  await admin.from('profiles').update({ display_name: 'QA Guided Artist', onboarding_completed: true }).eq('id', userId);
  const userClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error: signInErr } = await userClient.auth.signInWithPassword({ email, password });
  if (signInErr) throw signInErr;
  // Service-role insert, exactly as /api/onboarding/identity does (the RLS insert 42501s until
  // the profiles-permission migration runs; the daily canary alarms on it).
  const { error: insErr } = await admin.from('artist_profiles').insert({ user_id: userId, slug, tagline: 'qa', banner_url: '', city: '', state: '', genres: [] });
  if (insErr) throw insErr;
  const { data: ap } = await admin.from('artist_profiles').select('id').eq('user_id', userId).single();
  const artistId = ap.id;
  await admin.from('artist_profiles').update({ setup_completed: true }).eq('id', artistId);
  const { data: tiers, error: tErr } = await admin.from('subscription_tiers').insert([
    { artist_id: artistId, name: 'Bronze', price: 0, description: 'Free entry', access_config: { benefits: [] }, is_active: true },
    { artist_id: artistId, name: 'Gold', price: 2500, description: '', access_config: { benefits: [] }, is_active: true },
  ]).select('id, name');
  if (tErr) throw tErr;
  const { data: track, error: trErr } = await admin.from('tracks').insert({
    artist_id: artistId, title: 'QA Demo (unreleased)', is_free: true, allowed_tier_ids: [], is_active: true,
  }).select('id').single();
  if (trErr) throw trErr;
  console.log(JSON.stringify({ userId, artistId, email, password, slug, bronzeTierId: tiers.find((t) => t.name === 'Bronze').id, goldTierId: tiers.find((t) => t.name === 'Gold').id, trackId: track.id }));
}

/** Foundation facts: profile complete + one fan contact, so Rise Mode reaches First revenue. */
async function foundation(artistId, userId) {
  await admin.from('artist_profiles').update({ tagline: 'Songs for the late drive home', banner_url: 'https://example.com/qa-banner.png' }).eq('id', artistId);
  await admin.from('profiles').update({ bio: 'QA artist bio: unreleased demos and a vote on the next single.' }).eq('id', userId);
  const { error } = await admin.from('fan_contacts').insert({ artist_id: artistId, email: `qa-fan-${Date.now()}@example.com`, name: 'QA Fan', source: 'import' });
  console.log('foundation set; fan contact error:', error?.message ?? 'none');
}

/** A member-only track gated to a tier, so a REAL preview becomes available in the sales page flow. */
async function gateTrack(artistId, tierId) {
  const { error } = await admin.from('tracks').insert({ artist_id: artistId, title: 'Members Only Session Take', is_free: false, allowed_tier_ids: [tierId], is_active: true });
  console.log('gated track error:', error?.message ?? 'none');
}

async function stripeFake(artistId) {
  const { data: ap } = await admin.from('artist_profiles').select('activation_milestones').eq('id', artistId).single();
  const m = { ...(ap?.activation_milestones || {}), stripe_connected: new Date().toISOString() };
  await admin.from('artist_profiles').update({ stripe_connect_id: 'acct_qa_fake_guided', activation_milestones: m }).eq('id', artistId);
  const { data: paid } = await admin.from('subscription_tiers').select('id').eq('artist_id', artistId).gt('price', 0);
  for (const t of paid || []) await admin.from('subscription_tiers').update({ stripe_price_id: `price_qa_fake_${t.id.slice(0, 8)}` }).eq('id', t.id);
  console.log('stripe faked on', (paid || []).length, 'paid tiers');
}

async function state(artistId) {
  const out = {};
  out.tiers = (await admin.from('subscription_tiers').select('id,name,price,description,stripe_price_id').eq('artist_id', artistId)).data;
  out.benefits = (await admin.from('tier_benefits').select('tier_id,benefit_type,config').in('tier_id', (out.tiers || []).map((t) => t.id))).data;
  out.automations = (await admin.from('fan_automations').select('id,status,provider,magnet_kind,magnet_title,gold_tier_id,silver_tier_id,nurture_sequence_id,public_token').eq('artist_id', artistId)).data;
  out.experiences = (await admin.from('tier_offer_experiences').select('tier_id,is_active,config').eq('artist_id', artistId)).data;
  out.sequences = (await admin.from('sequences').select('id,name,trigger_type,is_active,goal_tier_id').eq('artist_id', artistId)).data;
  out.milestones = (await admin.from('artist_profiles').select('activation_milestones').eq('id', artistId)).data;
  out.funnelEvents = (await admin.from('funnel_events').select('stage,metadata').eq('artist_id', artistId)).data;
  out.quests = (await admin.from('quest_instances').select('template_key,status').in('template_key', ['artist_lead_magnet', 'artist_offer_experience', 'artist_funnel_followup', 'artist_funnel_live', 'artist_funnel_tested']).eq('artist_id', artistId)).data;
  console.log(JSON.stringify(out, null, 1));
}

async function del(userId, artistId) {
  const q = (t, col, val) => admin.from(t).delete().eq(col, val);
  const { data: autos } = await admin.from('fan_automations').select('id').eq('artist_id', artistId);
  for (const a of autos || []) await q('fan_automation_leads', 'automation_id', a.id);
  await q('fan_automations', 'artist_id', artistId);
  await q('tier_offer_experiences', 'artist_id', artistId);
  const { data: tiers } = await admin.from('subscription_tiers').select('id').eq('artist_id', artistId);
  for (const t of tiers || []) await q('tier_benefits', 'tier_id', t.id);
  const { data: seqs } = await admin.from('sequences').select('id').eq('artist_id', artistId);
  for (const s of seqs || []) { await q('sequence_steps', 'sequence_id', s.id); await q('sequence_enrollments', 'sequence_id', s.id); }
  await q('sequences', 'artist_id', artistId);
  for (const t of ['fulfillment_events', 'fulfillment_obligations', 'funnel_events', 'fan_contacts', 'tracks', 'subscriptions', 'community_posts', 'subscription_tiers', 'tier_events']) {
    try { await q(t, 'artist_id', artistId); } catch {}
  }
  for (const t of ['quest_instances', 'xp_ledger', 'user_progression', 'quest_unlocks']) { try { await q(t, 'user_id', userId); } catch {} }
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) console.log('deleteUser error', error.message); else console.log('deleted', userId);
  const { data: left } = await admin.from('artist_profiles').select('id').eq('id', artistId);
  console.log('artist rows left:', (left || []).length);
}

async function cleanupOrphans() {
  let page = 1;
  let found = 0;
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users || [];
    for (const u of users) {
      if (!(u.email || '').startsWith('qa-guided-')) continue;
      found += 1;
      const { data: ap } = await admin.from('artist_profiles').select('id').eq('user_id', u.id).maybeSingle();
      if (ap) await del(u.id, ap.id); else { await admin.auth.admin.deleteUser(u.id); console.log('deleted orphan user', u.email); }
    }
    if (users.length < 1000) break;
    page += 1;
  }
  console.log('orphans handled:', found);
}

if (cmd === 'create') await create();
else if (cmd === 'foundation') await foundation(a1, a2);
else if (cmd === 'gate-track') await gateTrack(a1, a2);
else if (cmd === 'stripe-fake') await stripeFake(a1);
else if (cmd === 'state') await state(a1);
else if (cmd === 'delete') await del(a1, a2);
else if (cmd === 'cleanup-orphans') await cleanupOrphans();
else console.log('usage: see header');
