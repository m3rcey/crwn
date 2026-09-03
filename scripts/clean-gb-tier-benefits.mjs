// Remove the legacy/default structured benefits from GB The G1ft's four tiers.
//
// WHY THIS EXISTS
// GB's public tier card is built in src/app/[slug]/page.tsx as
// `[...structured tier_benefits, ...access_config.benefits]`. GB's founder-approved offer
// lives entirely in `access_config.benefits`. The `tier_benefits` rows are older, generic
// ladder defaults seeded when the tiers were first created (Bronze/Silver/Gold on
// 2026-05-06, Platinum on 2026-09-02 from the tier template), and they printed ABOVE the
// approved offer: "7-day early access to new music", "Exclusive Albums", '"JR" community
// badge', "20% shop discount", "Name on Supporter Wall". None of those are GB's offer.
//
// SCOPE. GB's four tier ids only, and only the benefit types the founder listed per tier.
// Nothing here reads or writes a price, a Stripe id, a subscription, or another artist.
//
// Idempotent: deletes by (tier_id, benefit_type), so a second run removes nothing and
// still prints the same final state.
//
// Run:  npx tsx scripts/clean-gb-tier-benefits.mjs           (dry run, default)
//       npx tsx scripts/clean-gb-tier-benefits.mjs --apply   (writes)

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { getBenefitDisplayText } from '../src/lib/benefitCatalog.ts';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Per-tier removal lists, exactly as the founder specified. Written as an allowlist of what
// GOES rather than "delete everything", so a future approved structured benefit survives.
const REMOVE = {
  Bronze: ['early_access', 'exclusive_posts', 'supporter_wall'],
  // exclusive_tracks goes too: access_config already promises "Alternate versions and
  // members only music", so the generic line was a second, differently-worded copy of the
  // same promise sitting above it.
  Silver: ['early_access', 'exclusive_posts', 'community_badge', 'shop_discount', 'supporter_wall', 'exclusive_tracks'],
  Gold: ['exclusive_tracks', 'exclusive_albums', 'early_access', 'exclusive_posts', 'community_badge', 'shop_discount', 'supporter_wall'],
  // community_badge ("PLATINUM") is removed rather than kept: it is the same generic badge
  // implementation as Silver's "JR" and Gold's "SR", nothing in CRWN renders a badge from
  // it, and GB's approved "Platinum recognition" line already carries that concept in
  // access_config. The recognition survives; the unenforced duplicate does not.
  Platinum: ['exclusive_tracks', 'exclusive_albums', 'exclusive_posts', 'early_access', 'community_badge', 'shop_discount', 'supporter_wall'],
};

const { data: gb, error: gbErr } = await db.from('artist_profiles').select('id, slug').eq('slug', 'gb').single();
if (gbErr || !gb) { console.error('GB not found:', gbErr?.message); process.exit(1); }
console.log('artist: gb =', gb.id, APPLY ? '\nMODE: APPLY' : '\nMODE: DRY RUN (pass --apply to write)');

const { data: tiers, error: tErr } = await db.from('subscription_tiers')
  .select('id, name, price, stripe_price_id, stripe_annual_price_id, access_config, is_active')
  .eq('artist_id', gb.id).order('price');
if (tErr) { console.error('tier read failed:', tErr.message); process.exit(1); }

const billingBefore = tiers.map((t) => `${t.name}|${t.price}|${t.stripe_price_id}|${t.stripe_annual_price_id}`);
let subsBefore = 0;
for (const t of tiers) {
  const { count } = await db.from('subscriptions')
    .select('id', { count: 'exact', head: true }).eq('tier_id', t.id).eq('status', 'active');
  subsBefore += count || 0;
}
console.log('active subscriptions before:', subsBefore);

const render = (rows) => rows.map((r) => `${r.benefit_type} -> "${getBenefitDisplayText(r.benefit_type, r.config)}"`);

for (const tier of tiers) {
  const kill = REMOVE[tier.name];
  if (!kill) { console.log(`\n${tier.name}: NOT IN PLAN, skipped`); continue; }

  const { data: before, error: bErr } = await db.from('tier_benefits')
    .select('*').eq('tier_id', tier.id).order('sort_order');
  if (bErr) { console.error(`${tier.name}: benefit read failed:`, bErr.message); process.exit(1); }

  const doomed = before.filter((r) => kill.includes(r.benefit_type));
  const keeping = before.filter((r) => !kill.includes(r.benefit_type));

  console.log(`\n======== ${tier.name} ($${tier.price / 100}) ${tier.id}`);
  console.log('  structured rows before:', before.length);
  for (const line of render(before)) console.log('    -', line);
  console.log('  TO REMOVE:', doomed.length);
  for (const line of render(doomed)) console.log('    x', line);
  if (keeping.length) { console.log('  KEEPING structured:'); for (const line of render(keeping)) console.log('    =', line); }
  console.log('  approved offer in access_config (untouched):');
  for (const b of tier.access_config?.benefits || []) console.log('    •', b);

  if (APPLY && doomed.length) {
    const { error: dErr } = await db.from('tier_benefits')
      .delete().eq('tier_id', tier.id).in('benefit_type', kill);
    if (dErr) { console.error(`${tier.name}: DELETE FAILED:`, dErr.message); process.exit(1); }
  }
}

// Re-read and prove the outcome.
console.log('\n================ AFTER ================');
let subsAfter = 0;
for (const tier of tiers) {
  const { data: after } = await db.from('tier_benefits')
    .select('*').eq('tier_id', tier.id).order('sort_order');
  const { count } = await db.from('subscriptions')
    .select('id', { count: 'exact', head: true }).eq('tier_id', tier.id).eq('status', 'active');
  subsAfter += count || 0;
  const lines = [...render(after || []), ...(tier.access_config?.benefits || [])];
  console.log(`\n${tier.name}: ${after?.length ?? 0} structured rows | ${count} active subscribers`);
  for (const l of lines) console.log('   •', l);
}

const { data: tiersAfter } = await db.from('subscription_tiers')
  .select('id, name, price, stripe_price_id, stripe_annual_price_id')
  .eq('artist_id', gb.id).order('price');
const billingAfter = tiersAfter.map((t) => `${t.name}|${t.price}|${t.stripe_price_id}|${t.stripe_annual_price_id}`);
console.log('\nbilling identifiers unchanged:', JSON.stringify(billingBefore) === JSON.stringify(billingAfter));
console.log('active subscriptions:', subsBefore, '->', subsAfter, subsBefore === subsAfter ? '(unchanged)' : '(CHANGED — INVESTIGATE)');
