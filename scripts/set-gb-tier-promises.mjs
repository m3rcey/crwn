// Replace GB The G1ft's legacy tier descriptions with his approved one-line promises.
//
// The description renders under the tier name on the public card (SubscribeSection.tsx),
// and GB's four still read "Basic level of fan access ", "Basic level + Exclusive perks",
// "Basic level + Silver level + More Exclusive perks" and "" — placeholder text from when
// the tiers were first created, left behind by the 2026-09-03 benefit cleanup.
//
// The promises come from GB_TIER_PROMISES in src/lib/offerExperience/reference/gbBenefits.ts,
// never retyped here, so the snapshot its tests pin is the only place the words live.
//
// Writes ONE column on FOUR rows. It never reads or writes a price, a Stripe id, a
// subscription or another artist. Idempotent: a row already holding its promise is skipped.
//
// Run:  npx tsx scripts/set-gb-tier-promises.mjs           (dry run, default)
//       npx tsx scripts/set-gb-tier-promises.mjs --apply   (writes)

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { GB_TIER_PROMISES } from '../src/lib/offerExperience/reference/gbBenefits.ts';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: gb, error: gbErr } = await db.from('artist_profiles').select('id').eq('slug', 'gb').single();
if (gbErr || !gb) { console.error('GB not found:', gbErr?.message); process.exit(1); }
console.log('artist: gb =', gb.id, APPLY ? '| MODE: APPLY' : '| MODE: DRY RUN (pass --apply to write)');

const { data: tiers, error: tErr } = await db.from('subscription_tiers')
  .select('id, name, price, description, stripe_price_id, stripe_annual_price_id')
  .eq('artist_id', gb.id).order('price');
if (tErr) { console.error('tier read failed:', tErr.message); process.exit(1); }

const billingBefore = tiers.map((t) => `${t.name}|${t.price}|${t.stripe_price_id}|${t.stripe_annual_price_id}`);
let subsBefore = 0;
for (const t of tiers) {
  const { count } = await db.from('subscriptions')
    .select('id', { count: 'exact', head: true }).eq('tier_id', t.id).eq('status', 'active');
  subsBefore += count || 0;
}

for (const tier of tiers) {
  const promise = GB_TIER_PROMISES[tier.name];
  if (!promise) { console.log(`\n${tier.name}: no approved promise on file, skipped`); continue; }
  console.log(`\n======== ${tier.name} ($${tier.price / 100}) ${tier.id}`);
  console.log('  before:', JSON.stringify(tier.description));
  console.log('  after :', JSON.stringify(promise));
  if (tier.description === promise) { console.log('  (already set, nothing to write)'); continue; }
  if (APPLY) {
    const { error } = await db.from('subscription_tiers')
      .update({ description: promise }).eq('id', tier.id).eq('artist_id', gb.id);
    if (error) { console.error(`  WRITE FAILED: ${error.message}`); process.exit(1); }
  }
}

console.log('\n================ AFTER ================');
const { data: after } = await db.from('subscription_tiers')
  .select('id, name, price, description, stripe_price_id, stripe_annual_price_id')
  .eq('artist_id', gb.id).order('price');
let subsAfter = 0;
for (const t of after) {
  const { count } = await db.from('subscriptions')
    .select('id', { count: 'exact', head: true }).eq('tier_id', t.id).eq('status', 'active');
  subsAfter += count || 0;
  console.log(`${t.name.padEnd(9)} $${String(t.price / 100).padEnd(3)} ${JSON.stringify(t.description)}  | ${count} active`);
}
const billingAfter = after.map((t) => `${t.name}|${t.price}|${t.stripe_price_id}|${t.stripe_annual_price_id}`);
console.log('\nbilling identifiers unchanged:', JSON.stringify(billingBefore) === JSON.stringify(billingAfter));
console.log('active subscriptions:', subsBefore, '->', subsAfter, subsBefore === subsAfter ? '(unchanged)' : '(CHANGED — INVESTIGATE)');
