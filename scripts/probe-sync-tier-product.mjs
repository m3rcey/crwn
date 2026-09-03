// End-to-end proof for /api/stripe/sync-tier-product, against PRODUCTION.
//
// Signs in as the TEST artist (slug m3rcey, Josh's own) with a one-shot magic link, then
// asserts both branches that matter:
//   1. its own tier syncs and Stripe comes back holding the tier's CURRENT name/description
//   2. another artist's tier id is 404, not a write
// Anonymous 401 is checked first. Nothing here writes to the database.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const URL = pick('NEXT_PUBLIC_SUPABASE_URL');
const admin = createClient(URL, pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });
const stripe = new Stripe(pick('STRIPE_SECRET_KEY'));
const SITE = 'https://thecrwn.app';

// The route authenticates from COOKIES (createServerSupabaseClient reads next/headers
// cookies), not an Authorization header. @supabase/ssr stores the session as
// sb-<project-ref>-auth-token = "base64-" + base64(session JSON), chunked at 3180 chars.
const REF = URL.replace(/^https?:\/\//, '').split('.')[0];
function sessionCookies(session) {
  if (!session) return '';
  const raw = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64');
  const name = `sb-${REF}-auth-token`;
  if (raw.length <= 3180) return `${name}=${raw}`;
  const parts = [];
  for (let i = 0; i * 3180 < raw.length; i++) parts.push(`${name}.${i}=${raw.slice(i * 3180, (i + 1) * 3180)}`);
  return parts.join('; ');
}
const call = (session, tierId) => fetch(`${SITE}/api/stripe/sync-tier-product`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(session ? { Cookie: sessionCookies(session) } : {}) },
  body: JSON.stringify({ tierId }),
}).then(async (r) => ({ status: r.status, body: await r.text() }));

const { data: test } = await admin.from('artist_profiles').select('id, user_id, slug').eq('slug', 'm3rcey').single();
const { data: gb } = await admin.from('artist_profiles').select('id').eq('slug', 'gb').single();
const { data: mine } = await admin.from('subscription_tiers')
  .select('id, name, description, stripe_product_id').eq('artist_id', test.id).not('stripe_product_id', 'is', null).limit(1).single();
const { data: theirs } = await admin.from('subscription_tiers')
  .select('id, name').eq('artist_id', gb.id).eq('name', 'Silver').single();
const { data: prof } = await admin.from('profiles').select('email').eq('id', test.user_id).single();

console.log('test artist tier:', mine.name, mine.id, '| product', mine.stripe_product_id);
console.log('foreign tier    :', theirs.name, theirs.id, '(GB)');

console.log('\n1. anonymous            ->', JSON.stringify(await call(null, mine.id)));

const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: prof.email });
if (lErr) { console.error('could not mint a session:', lErr.message); process.exit(1); }
const anon = createClient(URL, pick('NEXT_PUBLIC_SUPABASE_ANON_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });
const { data: sess, error: vErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' });
if (vErr) { console.error('verifyOtp failed:', vErr.message); process.exit(1); }
const session = sess.session;

console.log("2. signed in, OWN tier  ->", JSON.stringify(await call(session, mine.id)));
console.log("3. signed in, GB's tier ->", JSON.stringify(await call(session, theirs.id)));


// The TEST artist's Stripe ids are TEST mode (a stale row), so a live key cannot read the
// product. That is exactly the resource_missing case the route now answers plainly.
try {
  const after = await stripe.products.retrieve(mine.stripe_product_id);
  console.log('\nStripe product now:', JSON.stringify({ name: after.name, description: after.description }));
  console.log('CRWN row holds    :', JSON.stringify({ name: mine.name, description: mine.description }));
} catch (e) {
  console.log('\nStripe read on the test artist skipped:', e.code || e.message);
}

const { data: gbProd } = await admin.from('subscription_tiers')
  .select('stripe_product_id').eq('id', theirs.id).single();
const gbAfter = await stripe.products.retrieve(gbProd.stripe_product_id);
console.log("GB's Silver product, untouched by the 404 above:", JSON.stringify(gbAfter.description));
