// Project credits for one launch partner: create the products, read the scorecard, repair credits.
//
// The offer itself is data in the partner's config (`credits`, src/lib/offerExperience/reference),
// the rules are src/lib/projectCredits, and the schema is supabase/schema-phase2-project-credits.sql.
//
// Run:  npx tsx scripts/project-credits.mjs <key>             dry run: the plan, then the scorecard
//       npx tsx scripts/project-credits.mjs <key> --apply     create or update the two products
//       npx tsx scripts/project-credits.mjs <key> --repair    number any paid credit the webhook missed
//
// --apply changes a product's PRICE or SPOTS only while nobody has bought it, because both are
// promises a buyer already saw. Title, description and art are refreshed every time.
// --repair calls the same assigner the webhook calls; it is idempotent, so a re-run changes nothing.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { LAUNCH_PARTNERS } from '../src/lib/offerExperience/reference/launchPartners.ts';
import { checkLaunchPartner } from '../src/lib/offerExperience/reference/launchPartner.ts';
import { CREDIT_LEVELS, creditProductCopy, creditsPath } from '../src/lib/projectCredits/credits.ts';
import { creditsVerdict, funnelLines } from '../src/lib/projectCredits/verdict.ts';

const key = process.argv[2];
const APPLY = process.argv.includes('--apply');
const REPAIR = process.argv.includes('--repair');
const die = (m) => {
  console.error(`project-credits: ${m}`);
  process.exit(1);
};

const C = LAUNCH_PARTNERS[key];
if (!C) die(`no launch partner "${key}"`);
if (!C.credits) die(`${key} has no credits config`);
const problems = checkLaunchPartner(C);
if (problems.length) die(`config refused:\n  ${problems.join('\n  ')}`);

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: artist } = await db.from('artist_profiles').select('id, slug, user_id').eq('slug', C.slug).maybeSingle();
if (!artist || artist.user_id !== C.userId) die(`artist ${C.slug} not found, or not owned by the pinned user`);
const { data: album } = await db
  .from('albums')
  .select('id, title, album_art_url')
  .eq('artist_id', artist.id)
  .eq('title', C.credits.project)
  .maybeSingle();
if (!album) die(`"${C.credits.project}" is not uploaded as an album yet`);

const probe = await db.from('products').select('id, credit_level').limit(1);
if (probe.error) die(`the migration is not applied (${probe.error.code}). Run supabase/schema-phase2-project-credits.sql first.`);

const { data: existingRows } = await db
  .from('products')
  .select('id, title, price, max_quantity, quantity_sold, is_active, credit_level')
  .eq('artist_id', artist.id)
  .eq('credit_album_id', album.id);
const existing = Object.fromEntries((existingRows || []).map((p) => [p.credit_level, p]));

console.log(`${C.displayName}: credits on "${album.title}" | ${APPLY ? 'MODE: APPLY' : 'MODE: DRY RUN (pass --apply to write)'}`);
console.log(`page: https://thecrwn.app${creditsPath(artist.slug, album.title)}\n`);

const products = {};
for (const level of CREDIT_LEVELS) {
  const want = C.credits[level];
  const have = existing[level];
  if (!want) {
    if (have) console.log(`${level}: exists but is no longer in the config; left as it is (deactivate it in Shop if intended)`);
    products[level] = have ?? null;
    continue;
  }
  const copy = creditProductCopy(level, album.title, C.displayName);
  const base = {
    title: copy.title,
    description: copy.description,
    image_url: album.album_art_url,
    is_active: true,
  };
  if (!have) {
    console.log(`${level}: ${APPLY ? 'creating' : 'will create'} "${copy.title}" at $${want.priceCents / 100}, ${want.seats} spots`);
    if (APPLY) {
      const { data, error } = await db
        .from('products')
        .insert({
          ...base,
          artist_id: artist.id,
          type: 'digital',
          delivery_type: 'instant',
          access_level: 'public',
          is_free: false,
          allowed_tier_ids: [],
          price: want.priceCents,
          max_quantity: want.seats,
          quantity_sold: 0,
          credit_album_id: album.id,
          credit_level: level,
        })
        .select('id, title, price, max_quantity, quantity_sold')
        .single();
      if (error) die(`${level}: insert failed: ${error.message}`);
      products[level] = data;
    }
    continue;
  }
  const sold = have.quantity_sold || 0;
  const repriced = have.price !== want.priceCents || have.max_quantity !== want.seats;
  const update = { ...base };
  if (repriced && sold > 0) {
    console.log(`${level}: ${sold} sold, so price and spots stay at $${have.price / 100} / ${have.max_quantity} (config says $${want.priceCents / 100} / ${want.seats})`);
  } else if (repriced) {
    Object.assign(update, { price: want.priceCents, max_quantity: want.seats });
    console.log(`${level}: ${APPLY ? 'repricing' : 'will reprice'} to $${want.priceCents / 100}, ${want.seats} spots`);
  } else {
    console.log(`${level}: in place, $${have.price / 100}, ${sold} of ${have.max_quantity} sold`);
  }
  if (APPLY) {
    const { error } = await db.from('products').update(update).eq('id', have.id);
    if (error) die(`${level}: update failed: ${error.message}`);
  }
  products[level] = have;
}

// ── Repair: a completed purchase of a credits product with no credit row ────────────────────────
const ids = Object.values(products).filter(Boolean).map((p) => p.id);
if (ids.length) {
  const { data: purchases } = await db.from('purchases').select('id').in('product_id', ids).eq('status', 'completed');
  const { data: credited } = await db.from('project_credits').select('purchase_id').eq('album_id', album.id);
  const have = new Set((credited || []).map((r) => r.purchase_id));
  const missing = (purchases || []).filter((p) => !have.has(p.id));
  if (missing.length) {
    console.log(`\n${missing.length} paid purchase(s) have no credit yet${REPAIR ? ', numbering them:' : ' (run with --repair)'}`);
    if (REPAIR) {
      for (const p of missing) {
        const { data, error } = await db.rpc('assign_project_credit', { p_purchase: p.id });
        console.log(`  ${p.id}: ${error ? `failed, ${error.message}` : `#${data}`}`);
      }
    }
  }
}

// ── Scorecard: the pre-committed verdict (src/lib/projectCredits/verdict.ts) ────────────────────
async function distinct(productId, eventType, placement) {
  if (!productId) return 0;
  let q = db.from('product_offer_events').select('visitor_hash').eq('product_id', productId).eq('event_type', eventType);
  if (placement) q = q.eq('placement', placement);
  const { data } = await q;
  return new Set((data || []).map((r) => r.visitor_hash)).size;
}
async function standing(level) {
  const { data } = await db
    .from('project_credits')
    .select('id, purchase:purchases(status)')
    .eq('album_id', album.id)
    .eq('level', level);
  return (data || []).filter((r) => r.purchase?.status === 'completed').length;
}

const f = products.founding;
const s = products.supporter;
const funnel = {
  primaryViewers: await distinct(f?.id, 'offer_viewed', 'primary'),
  primaryCheckouts: await distinct(f?.id, 'offer_checkout_started'),
  declines: await distinct(f?.id, 'offer_declined', 'primary'),
  downsellViewers: await distinct(s?.id, 'offer_viewed', 'downsell'),
  downsellCheckouts: await distinct(s?.id, 'offer_checkout_started'),
  foundingSold: await standing('founding'),
  foundingCap: f?.max_quantity ?? null,
  supporterSold: await standing('supporter'),
  supporterCap: s?.max_quantity ?? null,
};
const verdict = creditsVerdict(funnel);
console.log('\nScorecard (distinct visitors; founder devices never counted)');
for (const line of funnelLines(funnel)) console.log(`  ${line}`);
console.log(`\nVerdict: ${verdict.headline}\n  ${verdict.next}`);
