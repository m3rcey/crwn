// Onboard a founder-assisted (ICP) launch artist from ONE reviewed config file.
//
// Content lives in src/lib/offerExperience/reference/<artist>.ts and is registered in
// launchPartners.ts; this script only WRITES it. The workflow around it (probe, write the
// config, dry run, apply, verify, hand-offs) is the skill .claude/skills/onboard-icp-artist.
//
// What it builds, each step idempotent:
//   1. identity      artist_profiles row + public name, the same writes as the wizard's
//                    identity route (no emails sent; trg_promote_to_artist promotes the role)
//   2. ladder        Bronze/Silver/Gold/Platinum at the recommended prices, prose cards
//                    (card_lines prose_only), null Stripe ids until Connect enables charges
//   3. identities    tier_benefits rows, one supported key per approved capability, no cadence
//   4. offers        Tier Offer Experiences for the three paid rungs
//   5. funnel        a DRAFT link funnel (/drop/<token>): primary + downsell rungs
//   6. vote magnet   Song Lab project + open poll + public ballot at /<slug>/join/<offerSlug>,
//                    songs matched by title among the artist's FREE tracks. Skipped (not
//                    failed) while the songs are not uploaded yet.
//
// Refuses: a config that fails checkLaunchPartner, a tier whose price differs from the plan,
// any tier with an active subscription, a slug that is taken or reserved.
//
// Run:  npx tsx scripts/onboard-launch-partner.mjs <key>            (dry run)
//       npx tsx scripts/onboard-launch-partner.mjs <key> --apply    (writes)

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { normalizeOfferExperience } from '../src/lib/offerExperience/normalize.ts';
import { isReservedSlug } from '../src/lib/reservedSlugs.ts';
import { resolveFunnelOffers } from '../src/lib/fanAutomations/offerTiers.ts';
import { normalizeOptions, ballotOpenForFreeJoin } from '../src/lib/songLab/core.ts';
import { LAUNCH_PARTNERS } from '../src/lib/offerExperience/reference/launchPartners.ts';
import { checkLaunchPartner, LADDER_RUNGS, LADDER_PRICES_CENTS } from '../src/lib/offerExperience/reference/launchPartner.ts';

const key = process.argv.slice(2).find((a) => !a.startsWith('--'));
const APPLY = process.argv.includes('--apply');
const C = LAUNCH_PARTNERS[key];
const die = (m) => { console.error('ABORT:', m); process.exit(1); };
if (!C) die(`unknown launch partner "${key}". Registered: ${Object.keys(LAUNCH_PARTNERS).join(', ')}`);
const problems = checkLaunchPartner(C);
if (problems.length) die(`config fails the launch checks:\n  - ${problems.join('\n  - ')}`);

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});
console.log(`${C.displayName} (${C.key}) | ${APPLY ? 'MODE: APPLY' : 'MODE: DRY RUN (pass --apply to write)'}`);

// ── 1. Identity ────────────────────────────────────────────────────────────────
const { data: { user } } = await db.auth.admin.getUserById(C.userId);
if (!user || user.email !== C.email) die(`auth user ${C.userId} is not ${C.email}`);

let { data: artist } = await db.from('artist_profiles').select('id, slug').eq('user_id', user.id).maybeSingle();
if (artist) {
  console.log(`artist row exists: ${artist.slug} (${artist.id})`);
} else {
  if (isReservedSlug(C.slug)) die(`slug ${C.slug} is reserved`);
  const { data: taken } = await db.from('artist_profiles').select('id').eq('slug', C.slug).maybeSingle();
  if (taken) die(`slug ${C.slug} is taken`);
  console.log(`will create artist row: slug=${C.slug}, display_name="${C.displayName}"`);
  if (APPLY) {
    const { data: row, error } = await db.from('artist_profiles')
      .insert({ user_id: user.id, slug: C.slug, acquisition_source: 'organic' }).select('id, slug').single();
    if (error) die(`artist insert: ${error.message}`);
    artist = row;
  }
}
if (APPLY) {
  const { error } = await db.from('profiles').update({ display_name: C.displayName, onboarding_completed: true }).eq('id', user.id);
  if (error) die(`profile update: ${error.message}`);
}
if (!artist) { console.log('\n(dry run stops here: everything else hangs off the artist row)'); process.exit(0); }

// ── 2. Ladder ──────────────────────────────────────────────────────────────────
const { data: existing } = await db.from('subscription_tiers')
  .select('id, name, price, access_config').eq('artist_id', artist.id).eq('is_active', true);
const tierIds = {};
for (const name of LADDER_RUNGS) {
  const price = LADDER_PRICES_CENTS[name];
  const access_config = { benefits: C.benefits[name], card_lines: 'prose_only' };
  const found = (existing || []).find((t) => t.name === name);
  if (found) {
    if (found.price !== price) die(`${name} exists at ${found.price}, plan says ${price}; refusing`);
    const { count } = await db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('tier_id', found.id).eq('status', 'active');
    if (count) die(`${name} has ${count} active subscriptions; refusing to rewrite a sold tier`);
    console.log(`${name}: exists (${found.id}), will set promise + prose`);
    if (APPLY) {
      const { error } = await db.from('subscription_tiers')
        .update({ description: C.promises[name], access_config: { ...(found.access_config || {}), ...access_config } })
        .eq('id', found.id).eq('artist_id', artist.id);
      if (error) die(`${name} update: ${error.message}`);
    }
    tierIds[name] = found.id;
  } else {
    console.log(`${name}: will create at $${price / 100}/mo, "${C.promises[name]}"`);
    if (APPLY) {
      const { data: row, error } = await db.from('subscription_tiers').insert({
        artist_id: artist.id, name, price, description: C.promises[name], is_active: true,
        offers_annual: true, annual_discount_percent: 25, access_config,
        stripe_price_id: null, stripe_annual_price_id: null, stripe_product_id: null,
      }).select('id').single();
      if (error) die(`${name} insert: ${error.message}`);
      tierIds[name] = row.id;
    }
  }
}

// ── 6 (planned in dry run too). Vote magnet songs ───────────────────────────────
let voteTracks = null;
if (C.vote && C.vote.options.length) {
  const { data: tracks } = await db.from('tracks').select('id, title, is_free, allowed_tier_ids, public_release_date').eq('artist_id', artist.id);
  voteTracks = [];
  const missing = [];
  for (const o of C.vote.options) {
    const t = (tracks || []).find((x) => x.title.trim().toLowerCase() === o.trackTitle.trim().toLowerCase());
    if (!t) { missing.push(`"${o.trackTitle}" not uploaded`); continue; }
    const windowOpen = t.public_release_date && new Date(t.public_release_date) > new Date() && (t.allowed_tier_ids || []).length;
    if (!t.is_free || windowOpen) { missing.push(`"${o.trackTitle}" is not free forever (fans could not hear it)`); continue; }
    voteTracks.push({ label: o.label, trackId: t.id });
  }
  if (missing.length) { console.log(`\nvote magnet WAITS: ${missing.join('; ')}`); voteTracks = null; }
  else console.log(`\nvote magnet: ${voteTracks.length} songs found, will open the poll at /${artist.slug}/join/${C.vote.offerSlug}`);
} else if (C.vote) {
  console.log('\nvote magnet WAITS: no songs listed in the config yet');
}
if (!APPLY) { console.log('\n(dry run: benefits, offers, funnel and poll are written on --apply)'); process.exit(0); }

// ── 3. Structured benefit identities (no frequency: nothing lands on the calendar) ──
for (const name of LADDER_RUNGS) {
  const rows = C.identities[name].map((it, i) => ({ tier_id: tierIds[name], benefit_type: it.key, config: {}, is_active: true, sort_order: i }));
  const { error: delErr } = await db.from('tier_benefits').delete().eq('tier_id', tierIds[name]);
  if (delErr) die(`${name} benefit delete: ${delErr.message}`);
  if (rows.length) {
    const { error } = await db.from('tier_benefits').insert(rows);
    if (error) die(`${name} benefit insert: ${error.message}`);
  }
}

// ── 4. Tier Offer Experiences ──────────────────────────────────────────────────
for (const [name, config] of Object.entries(C.offers)) {
  const { error } = await db.from('tier_offer_experiences').upsert(
    { artist_id: artist.id, tier_id: tierIds[name], config, is_active: true, updated_at: new Date().toISOString() },
    { onConflict: 'tier_id' },
  );
  if (error) die(`${name} offer write: ${error.message}`);
}

// ── 5. Draft drop-page funnel ──────────────────────────────────────────────────
let { data: funnel } = await db.from('fan_automations').select('id').eq('artist_id', artist.id).neq('status', 'archived').maybeSingle();
const pointers = {
  gold_tier_id: tierIds[C.funnelPrimary], silver_tier_id: tierIds[C.funnelDownsell],
  gold_item_title: C.funnelPrimaryItem.title, gold_item_description: C.funnelPrimaryItem.description,
  updated_at: new Date().toISOString(),
};
if (funnel) {
  const { error } = await db.from('fan_automations').update(pointers).eq('id', funnel.id);
  if (error) die(`funnel update: ${error.message}`);
} else {
  const { data: row, error } = await db.from('fan_automations').insert({
    artist_id: artist.id, provider: 'link', status: 'draft', public_token: randomBytes(9).toString('base64url'), ...pointers,
  }).select('id').single();
  if (error) die(`funnel insert: ${error.message}`);
  funnel = row;
}

// ── 6. Vote magnet ─────────────────────────────────────────────────────────────
if (voteTracks) {
  const v = C.vote;
  const options = normalizeOptions(voteTracks);
  if (!options || options.some((o) => !o.trackId)) die('vote options lost their songs in normalization');
  const { error: flagErr } = await db.from('artist_profiles').update({ song_lab_enabled: true }).eq('id', artist.id);
  if (flagErr) die(`song_lab_enabled: ${flagErr.message}`);

  let { data: project } = await db.from('song_lab_projects').select('id').eq('artist_id', artist.id).eq('title', v.projectTitle).maybeSingle();
  if (!project) {
    const { data, error } = await db.from('song_lab_projects').insert({ artist_id: artist.id, title: v.projectTitle }).select('id').single();
    if (error) die(`project insert: ${error.message}`);
    project = data;
  }
  let { data: poll } = await db.from('song_lab_decisions').select('id, status').eq('project_id', project.id).eq('stage_label', v.stageLabel).maybeSingle();
  if (poll) {
    // Never rewrite the options of a poll that already has votes: ids by position keep a
    // cast vote on its choice, but a changed SONG under the same id would move it.
    const { count } = await db.from('song_lab_votes').select('id', { count: 'exact', head: true }).eq('decision_id', poll.id);
    const { count: pub } = await db.from('song_lab_public_votes').select('id', { count: 'exact', head: true }).eq('decision_id', poll.id);
    if ((count || 0) + (pub || 0) > 0) console.log(`poll has ${(count || 0) + (pub || 0)} votes: options left untouched`);
    else {
      const { error } = await db.from('song_lab_decisions').update({ question: v.question, options, status: 'open', is_free: true, allowed_tier_ids: [] }).eq('id', poll.id);
      if (error) die(`poll update: ${error.message}`);
    }
  } else {
    const { data, error } = await db.from('song_lab_decisions').insert({
      project_id: project.id, artist_id: artist.id, stage_label: v.stageLabel, question: v.question,
      options, status: 'open', is_free: true, allowed_tier_ids: [],
    }).select('id, status').single();
    if (error) die(`poll insert: ${error.message}`);
    poll = data;
  }
  const offerRow = {
    artist_id: artist.id, slug: v.offerSlug, name: v.offerName, headline: v.headline, description: v.description,
    benefit_kind: 'vote', project_id: project.id, decision_id: poll.id, tier_id: tierIds.Bronze, is_active: true,
    updated_at: new Date().toISOString(),
  };
  const { error: offerErr } = await db.from('song_lab_offers').upsert(offerRow, { onConflict: 'artist_id,slug' });
  if (offerErr) die(`ballot offer: ${offerErr.message}`);
}

// ── Read-back through the same paths the pages use ────────────────────────────
console.log('\n================ READ-BACK ================');
const { data: prof } = await db.from('profiles').select('display_name, role').eq('id', user.id).single();
console.log('profile:', JSON.stringify(prof));
if (prof.role !== 'artist') die('role was not promoted to artist');
const { data: tiers } = await db.from('subscription_tiers')
  .select('id, name, price, description, is_active, access_config, stripe_price_id').eq('artist_id', artist.id).eq('is_active', true).order('price');
for (const t of tiers) {
  const { data: b } = await db.from('tier_benefits').select('benefit_type, config').eq('tier_id', t.id).order('sort_order');
  if ((b || []).some((r) => r.config?.frequency)) die(`${t.name}: a frequency was written`);
  console.log(`${t.name.padEnd(9)} $${String(t.price / 100).padEnd(4)} "${t.description}" | ${t.access_config?.benefits?.length} lines | keys: ${(b || []).map((r) => r.benefit_type).join(', ')} | stripe: ${t.stripe_price_id ? 'yes' : 'pending connect'}`);
}
for (const name of Object.keys(C.offers)) {
  const { data: row } = await db.from('tier_offer_experiences').select('config, is_active').eq('tier_id', tierIds[name]).single();
  const back = normalizeOfferExperience(row.config, name);
  if (!back) die(`${name} stored offer fails the read contract`);
  console.log(`${name} offer: active=${row.is_active} cta="${back.cta}" previews=${back.previews.length}`);
}
const { data: f } = await db.from('fan_automations').select('status, public_token, gold_tier_id, silver_tier_id').eq('id', funnel.id).single();
const { primary, downsell } = resolveFunnelOffers(tiers, f);
console.log(`funnel: ${f.status} /drop/${f.public_token} | primary=${primary?.name} downsell=${downsell?.name}`);
if (primary?.name !== C.funnelPrimary || downsell?.name !== C.funnelDownsell) die('funnel does not resolve to the configured rungs');
if (voteTracks) {
  const { data: offer } = await db.from('song_lab_offers').select('slug, is_active, decision_id, tier_id').eq('artist_id', artist.id).eq('slug', C.vote.offerSlug).single();
  const { data: poll } = await db.from('song_lab_decisions').select('id, status, options, is_free, allowed_tier_ids, opens_at, closes_at, winning_option_id').eq('id', offer.decision_id).single();
  const open = ballotOpenForFreeJoin(poll, offer.tier_id, new Date());
  console.log(`vote ballot: ${open ? 'OPEN to anyone' : 'NOT OPEN'} | ${poll.options.length} songs | joins Bronze=${offer.tier_id === tierIds.Bronze}`);
  if (!open) die('the ballot would not render for a new fan');
  console.log(`ballot link: https://thecrwn.app/${artist.slug}/join/${C.vote.offerSlug}`);
}
console.log(`\npublic page: https://thecrwn.app/${artist.slug}`);
console.log(`drop page (owner-only preview while draft): https://thecrwn.app/drop/${f.public_token}`);
