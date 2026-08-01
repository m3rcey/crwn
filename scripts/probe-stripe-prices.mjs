// Do the CRWN platform plan prices exist in live Stripe at the amounts
// TIER_PRICING expects? Read-only. Usage: npm run verify:stripe
//
// WHY: platform-checkout retrieves the live price and REFUSES if unit_amount
// differs from the code, so a stale price id does not undercharge, it kills the
// upgrade path outright. That is the safe failure, but it is silent until an
// artist tries to upgrade. This makes it checkable in five seconds.
//
// LIMITATION worth knowing: this proves the PRICES exist and are correct. It
// cannot prove which price id each Vercel env var holds, because Sensitive vars
// are unreadable (see the Vercel note in CLAUDE.md). The definitive check is one
// real Upgrade click.
//
// Prints price ids and amounts only. Never prints the secret key.

import { readFileSync } from 'node:fs';

// Mirrors TIER_PRICING in src/lib/platformTier.ts. Kept as literals so this
// script stays runnable without a TS toolchain; update both together.
const EXPECT = [
  ['Pro monthly', 4900, 'month'],
  ['Pro annual', 49000, 'year'],
  ['Scale monthly', 19900, 'month'],
  ['Scale annual', 199000, 'year'],
];

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const m = env.match(/^STRIPE_SECRET_KEY=(.*)$/m);
if (!m) {
  console.error('STRIPE_SECRET_KEY missing from .env.local');
  process.exit(1);
}
const key = m[1].trim().replace(/^["']|["']$/g, '');

const stripe = async (path) => {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  const j = await r.json();
  if (j.error) throw new Error(`${j.error.type}: ${j.error.message}`);
  return j;
};

const [products, prices] = await Promise.all([
  stripe('products?limit=100&active=true'),
  stripe('prices?limit=100&active=true'),
]);
const nameOf = new Map(products.data.map((p) => [p.id, p.name]));

let missing = 0;
for (const [label, amount, interval] of EXPECT) {
  const hit = prices.data.find(
    (p) => p.active && p.recurring?.interval === interval && p.unit_amount === amount && /^CRWN /.test(nameOf.get(p.product) ?? ''),
  );
  if (hit) {
    console.log(`${label.padEnd(14)} $${(amount / 100).toFixed(2).padStart(8)}  OK  ${hit.id}  (${nameOf.get(hit.product)})`);
  } else {
    console.log(`${label.padEnd(14)} $${(amount / 100).toFixed(2).padStart(8)}  MISSING on any "CRWN *" product`);
    missing += 1;
  }
}

// The old $9.99 Pro price stays active in Stripe on purpose (existing
// subscriptions ride their original price object). Flag anyone still on it.
const subs = await stripe('subscriptions?limit=100&status=all');
const onOld = subs.data.filter(
  (s) => ['active', 'trialing', 'past_due'].includes(s.status) && s.items.data.some((i) => i.price.unit_amount === 999),
);
console.log(`\nsubscribers still on the old $9.99 Pro price: ${onOld.length}`);
console.log(`${missing} expected price(s) missing.`);
