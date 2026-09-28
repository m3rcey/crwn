// Build Prince Dre's founder-assisted launch: identity, the four-rung ladder, structured
// benefit identities, the Tier Offer Experiences, and a DRAFT drop-page funnel (Gold primary,
// Silver downsell). Content lives in src/lib/offerExperience/reference/princeDre.ts; this
// script only writes it, the same way GB's three scripts did (configure-gb-offer,
// configure-gb-tier-benefits, set-gb-tier-promises), in one idempotent pass.
//
// Deliberately NOT done here:
//   - Stripe. He has no Connect account yet. Paid tiers are inserted with null Stripe ids,
//     exactly like the setup wizard's tiers, and backfillTierPrices() creates the prices the
//     moment his Connect account reports charges enabled (the wizard's Stripe screen).
//   - The lead magnet and the catalog. The funnel stays a DRAFT with no magnet, which the
//     drop page renders only to the owner as a preview. It is activated once the magnet
//     track is uploaded.
//   - Emails. The identity route sends a welcome email and a founder alert; this does not.
//
// Idempotent: an existing artist row, tier, benefit set, experience or draft funnel is
// reused, never duplicated. It refuses to touch a tier whose price differs from the plan,
// or any tier that already has an active subscription.
//
// Run:  npx tsx scripts/configure-prince-dre.mjs           (dry run, default)
//       npx tsx scripts/configure-prince-dre.mjs --apply   (writes)

import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { normalizeOfferExperience } from '../src/lib/offerExperience/normalize.ts';
import { isReservedSlug } from '../src/lib/reservedSlugs.ts';
import { resolveFunnelOffers } from '../src/lib/fanAutomations/offerTiers.ts';
import {
  DRE_SLUG, DRE_DISPLAY_NAME, DRE_TIER_PROMISES, DRE_TIER_PRICES_CENTS, DRE_APPROVED_BENEFITS,
  DRE_BENEFIT_IDENTITIES, DRE_FUNNEL_PRIMARY_ITEM, DRE_PLATINUM_OFFER, DRE_GOLD_OFFER, DRE_SILVER_OFFER,
} from '../src/lib/offerExperience/reference/princeDre.ts';

const DRE_EMAIL = 'princedremusicbusiness@gmail.com';
const DRE_USER_ID = '7cece8ba-bd78-4cd6-9fa4-55849c2bf144'; // his Google signup, 2026-09-28
const RUNGS = ['Bronze', 'Silver', 'Gold', 'Platinum'];
const OFFERS = { Platinum: DRE_PLATINUM_OFFER, Gold: DRE_GOLD_OFFER, Silver: DRE_SILVER_OFFER };

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const die = (m) => { console.error('ABORT:', m); process.exit(1); };
console.log(APPLY ? 'MODE: APPLY' : 'MODE: DRY RUN (pass --apply to write)');

// Validate all content before any write.
for (const [name, offer] of Object.entries(OFFERS)) {
  if (!normalizeOfferExperience(offer, name)) die(`${name} offer fails the write contract`);
}

// ── 1. Identity ────────────────────────────────────────────────────────────────
const { data: { user } } = await db.auth.admin.getUserById(DRE_USER_ID);
if (!user || user.email !== DRE_EMAIL) die(`auth user ${DRE_USER_ID} is not ${DRE_EMAIL}`);
console.log('\nuser:', user.id, user.email);

let { data: artist } = await db.from('artist_profiles').select('id, slug').eq('user_id', user.id).maybeSingle();
if (artist) {
  console.log(`artist row exists: ${artist.slug} (${artist.id})`);
} else {
  if (isReservedSlug(DRE_SLUG)) die(`slug ${DRE_SLUG} is reserved`);
  const { data: taken } = await db.from('artist_profiles').select('id').eq('slug', DRE_SLUG).maybeSingle();
  if (taken) die(`slug ${DRE_SLUG} is taken`);
  console.log(`will create artist row: slug=${DRE_SLUG}, display_name="${DRE_DISPLAY_NAME}"`);
  if (APPLY) {
    const { data: row, error } = await db.from('artist_profiles')
      .insert({ user_id: user.id, slug: DRE_SLUG, acquisition_source: 'organic' })
      .select('id, slug').single();
    if (error) die(`artist insert: ${error.message}`);
    artist = row;
  }
}
if (APPLY) {
  const { error } = await db.from('profiles')
    .update({ display_name: DRE_DISPLAY_NAME, onboarding_completed: true }).eq('id', user.id);
  if (error) die(`profile update: ${error.message}`);
}
if (!artist) { console.log('\n(dry run stops here: tiers need the artist row)'); process.exit(0); }

// ── 2. Tiers ───────────────────────────────────────────────────────────────────
const { data: existing } = await db.from('subscription_tiers')
  .select('id, name, price, is_active, access_config, description').eq('artist_id', artist.id).eq('is_active', true);
const tierIds = {};
for (const name of RUNGS) {
  const price = DRE_TIER_PRICES_CENTS[name];
  const access_config = { benefits: DRE_APPROVED_BENEFITS[name], card_lines: 'prose_only' };
  const found = (existing || []).find((t) => t.name === name);
  if (found) {
    if (found.price !== price) die(`${name} exists at ${found.price}, plan says ${price}; refusing`);
    const { count } = await db.from('subscriptions').select('id', { count: 'exact', head: true })
      .eq('tier_id', found.id).eq('status', 'active');
    if (count) die(`${name} has ${count} active subscriptions; refusing to rewrite a sold tier`);
    console.log(`${name}: exists (${found.id}), will set description + prose`);
    if (APPLY) {
      const { error } = await db.from('subscription_tiers')
        .update({ description: DRE_TIER_PROMISES[name], access_config: { ...(found.access_config || {}), ...access_config } })
        .eq('id', found.id).eq('artist_id', artist.id);
      if (error) die(`${name} update: ${error.message}`);
    }
    tierIds[name] = found.id;
  } else {
    console.log(`${name}: will create at $${price / 100}/mo, "${DRE_TIER_PROMISES[name]}"`);
    if (APPLY) {
      const { data: row, error } = await db.from('subscription_tiers').insert({
        artist_id: artist.id, name, price, description: DRE_TIER_PROMISES[name], is_active: true,
        offers_annual: true, annual_discount_percent: 25, access_config,
        stripe_price_id: null, stripe_annual_price_id: null, stripe_product_id: null,
      }).select('id').single();
      if (error) die(`${name} insert: ${error.message}`);
      tierIds[name] = row.id;
    }
  }
}
if (!APPLY) { console.log('\n(dry run: benefits, offers and funnel are written after the tiers exist)'); process.exit(0); }

// ── 3. Structured benefit identities (no frequency: nothing lands on the calendar) ──
for (const name of RUNGS) {
  const rows = DRE_BENEFIT_IDENTITIES[name].map((it, i) => ({
    tier_id: tierIds[name], benefit_type: it.key, config: {}, is_active: true, sort_order: i,
  }));
  const { error: delErr } = await db.from('tier_benefits').delete().eq('tier_id', tierIds[name]);
  if (delErr) die(`${name} benefit delete: ${delErr.message}`);
  const { error } = await db.from('tier_benefits').insert(rows);
  if (error) die(`${name} benefit insert: ${error.message}`);
}

// ── 4. Tier Offer Experiences ──────────────────────────────────────────────────
for (const [name, config] of Object.entries(OFFERS)) {
  const { error } = await db.from('tier_offer_experiences').upsert(
    { artist_id: artist.id, tier_id: tierIds[name], config, is_active: true, updated_at: new Date().toISOString() },
    { onConflict: 'tier_id' },
  );
  if (error) die(`${name} offer write: ${error.message}`);
}

// ── 5. Draft drop-page funnel: Gold primary, Silver downsell, no magnet yet ─────
let { data: funnel } = await db.from('fan_automations').select('id, public_token, status')
  .eq('artist_id', artist.id).neq('status', 'archived').maybeSingle();
const pointers = {
  gold_tier_id: tierIds.Gold, silver_tier_id: tierIds.Silver,
  gold_item_title: DRE_FUNNEL_PRIMARY_ITEM.title, gold_item_description: DRE_FUNNEL_PRIMARY_ITEM.description,
  updated_at: new Date().toISOString(),
};
if (funnel) {
  const { error } = await db.from('fan_automations').update(pointers).eq('id', funnel.id);
  if (error) die(`funnel update: ${error.message}`);
} else {
  const { data: row, error } = await db.from('fan_automations').insert({
    artist_id: artist.id, provider: 'link', status: 'draft',
    public_token: randomBytes(9).toString('base64url'), ...pointers,
  }).select('id, public_token, status').single();
  if (error) die(`funnel insert: ${error.message}`);
  funnel = row;
}

// ── 6. Read-back through the same paths the pages use ─────────────────────────
console.log('\n================ READ-BACK ================');
const { data: prof } = await db.from('profiles').select('display_name, role, onboarding_completed').eq('id', user.id).single();
console.log('profile:', JSON.stringify(prof));
if (prof.role !== 'artist') die('role was not promoted to artist');
const { data: tiers } = await db.from('subscription_tiers')
  .select('id, name, price, description, is_active, access_config, stripe_price_id').eq('artist_id', artist.id).eq('is_active', true).order('price');
for (const t of tiers) {
  const { data: b } = await db.from('tier_benefits').select('benefit_type, config').eq('tier_id', t.id).order('sort_order');
  if ((b || []).some((r) => r.config?.frequency)) die(`${t.name}: a frequency was written`);
  console.log(`${t.name.padEnd(9)} $${String(t.price / 100).padEnd(4)} "${t.description}" | ${t.access_config?.benefits?.length} lines, ${t.access_config?.card_lines} | keys: ${(b || []).map((r) => r.benefit_type).join(', ')} | stripe: ${t.stripe_price_id ? 'yes' : 'pending connect'}`);
}
for (const name of Object.keys(OFFERS)) {
  const { data: row } = await db.from('tier_offer_experiences').select('config, is_active').eq('tier_id', tierIds[name]).single();
  const back = normalizeOfferExperience(row.config, name);
  if (!back) die(`${name} stored offer fails the read contract`);
  console.log(`${name} offer: active=${row.is_active} cta="${back.cta}" previews=${back.previews.length}`);
}
const { data: f } = await db.from('fan_automations')
  .select('status, public_token, gold_tier_id, silver_tier_id').eq('id', funnel.id).single();
const { primary, downsell } = resolveFunnelOffers(tiers, f);
console.log(`funnel: ${f.status} /drop/${f.public_token} | primary=${primary?.name} downsell=${downsell?.name}`);
if (primary?.name !== 'Gold' || downsell?.name !== 'Silver') die('funnel does not resolve Gold -> Silver');
const { count: subs } = await db.from('fulfillment_obligations').select('id', { count: 'exact', head: true }).eq('artist_id', artist.id);
console.log('fulfillment_obligations:', subs ?? 0, '(expected 0: no cadence approved)');
console.log(`\npublic page: https://thecrwn.app/${artist.slug}`);
console.log(`drop page (owner-only preview while draft): https://thecrwn.app/drop/${f.public_token}`);
