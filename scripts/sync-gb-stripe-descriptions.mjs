// Bring GB's Stripe PRODUCT descriptions in line with his approved tier promises.
//
// WHY THIS IS NEEDED. /api/stripe/create-price copies the tier description onto the Stripe
// product ONCE, at creation. There is no update path, so GB's products still carried the
// placeholder text his cards used to show, and Stripe Checkout renders the product
// description in the order summary. A fan pressing "Take Me Backstage" was reading
// "Basic level + Exclusive perks" on the page where they actually pay.
//
// WHAT THIS TOUCHES. `description` on three existing products. It creates no product and no
// price, changes no amount, cancels and migrates nobody, and cannot alter what any
// subscriber is charged: prices are separate objects and are not read or written here. The
// old value of each is printed before the write so it can be put back by hand.
//
// Run:  npx tsx scripts/sync-gb-stripe-descriptions.mjs           (dry run, default)
//       npx tsx scripts/sync-gb-stripe-descriptions.mjs --apply   (writes)

import { readFileSync } from 'node:fs';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const stripe = new Stripe(pick('STRIPE_SECRET_KEY'));
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: gb, error: gbErr } = await db.from('artist_profiles').select('id').eq('slug', 'gb').single();
if (gbErr || !gb) { console.error('GB not found:', gbErr?.message); process.exit(1); }
const { data: tiers } = await db.from('subscription_tiers')
  .select('name, price, description, stripe_price_id, stripe_product_id')
  .eq('artist_id', gb.id).order('price');

console.log(APPLY ? 'MODE: APPLY' : 'MODE: DRY RUN (pass --apply to write)');

for (const t of tiers) {
  if (!t.stripe_product_id) { console.log(`\n${t.name}: no Stripe product (free tier), skipped`); continue; }
  const before = await stripe.products.retrieve(t.stripe_product_id);
  // Only GB's own products, and only ones this artist row actually points at.
  if (before.metadata?.artist_id && before.metadata.artist_id !== gb.id) {
    console.error(`\n${t.name}: product ${before.id} is not GB's, REFUSED`); process.exit(1);
  }
  console.log(`\n${t.name} (${before.id})`);
  console.log('  old description:', JSON.stringify(before.description));
  console.log('  new description:', JSON.stringify(t.description));
  if (before.description === t.description) { console.log('  (already in sync)'); continue; }
  if (!APPLY) continue;
  const after = await stripe.products.update(before.id, { description: t.description || undefined });
  console.log('  written        :', JSON.stringify(after.description));
  const price = await stripe.prices.retrieve(t.stripe_price_id);
  console.log('  price unchanged:', price.id, price.unit_amount, 'active=' + price.active);
}
