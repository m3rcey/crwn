// READ-ONLY. GB's Stripe products as they exist on the PLATFORM account, to see whether the
// description a fan meets at checkout still matches the tier card. No writes.
import { readFileSync } from 'node:fs';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const stripe = new Stripe(pick('STRIPE_SECRET_KEY'));
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });

const { data: gb } = await db.from('artist_profiles').select('id').eq('slug', 'gb').single();
const { data: tiers } = await db.from('subscription_tiers')
  .select('name, price, description, stripe_price_id, stripe_product_id').eq('artist_id', gb.id).order('price');

for (const t of tiers) {
  console.log('\n' + t.name, '$' + t.price / 100);
  console.log('  CRWN description  :', JSON.stringify(t.description));
  if (!t.stripe_product_id) { console.log('  stripe            : none (free tier)'); continue; }
  const p = await stripe.products.retrieve(t.stripe_product_id);
  console.log('  stripe product    :', p.id, '| name:', JSON.stringify(p.name));
  console.log('  stripe description:', JSON.stringify(p.description));
  const price = await stripe.prices.retrieve(t.stripe_price_id);
  console.log('  stripe price      :', price.id, '| amount:', price.unit_amount, '| active:', price.active);
}
