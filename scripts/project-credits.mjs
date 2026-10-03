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
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { LAUNCH_PARTNERS } from '../src/lib/offerExperience/reference/launchPartners.ts';
import { checkLaunchPartner } from '../src/lib/offerExperience/reference/launchPartner.ts';
import { CREDIT_LEVELS, creditProductCopy, creditsPath, tapeProductCopy } from '../src/lib/projectCredits/credits.ts';
import { loadCreditsScorecards } from '../src/lib/projectCredits/server.ts';

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

// The playback gate grants a product's album once schema-phase2-tape-purchase.sql is applied: only
// then does a credit's copy say the tape is included, and only then can the tape be sold.
const tapeLive = !(await db.from('products').select('grants_album_id').limit(1)).error;
console.log(`whole-tape grants: ${tapeLive ? 'live' : 'NOT YET (schema-phase2-tape-purchase.sql is not applied)'}`);

const products = {};
for (const level of CREDIT_LEVELS) {
  const want = C.credits[level];
  const have = existing[level];
  if (!want) {
    if (have) console.log(`${level}: exists but is no longer in the config; left as it is (deactivate it in Shop if intended)`);
    products[level] = have ?? null;
    continue;
  }
  const copy = creditProductCopy(level, album.title, C.displayName, tapeLive);
  const base = {
    title: copy.title,
    description: copy.description,
    image_url: album.album_art_url,
    is_active: true,
    // On a product, is_free means "anyone may buy it" (ShopSection), not "costs nothing".
    is_free: true,
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

// ── The whole tape, sold once (config `tape`) ─────────────────────────────────────────────────────
if (C.tape) {
  const { data: tapeAlbum } = await db.from('albums').select('id, title, album_art_url').eq('artist_id', artist.id).eq('title', C.tape.project).maybeSingle();
  if (!tapeAlbum) die(`tape: "${C.tape.project}" is not uploaded as an album yet`);
  if (!tapeLive) {
    console.log(`tape: WAITS for the migration; nothing is sold before the gate can deliver it`);
  } else {
    const { count: songCount } = await db.from('album_tracks').select('track_id', { count: 'exact', head: true }).eq('album_id', tapeAlbum.id);
    const copy = tapeProductCopy(tapeAlbum.title, C.displayName, songCount ?? 0);
    const { data: haveTape } = await db.from('products').select('id, price, quantity_sold').eq('artist_id', artist.id).eq('grants_album_id', tapeAlbum.id).maybeSingle();
    // is_free on a product means "anyone may buy it" (ShopSection), not "costs nothing": false with no
    // tiers rendered the tape as "Subscribe to unlock" in the Shop (caught by screenshot, 2026-10-03).
    const fields = { title: copy.title, description: copy.description, image_url: tapeAlbum.album_art_url, is_active: true, is_free: true };
    if (!haveTape) {
      console.log(`tape: ${APPLY ? 'creating' : 'will create'} "${copy.title}" at $${C.tape.priceCents / 100}`);
      if (APPLY) {
        const { error } = await db.from('products').insert({
          ...fields,
          artist_id: artist.id,
          type: 'digital',
          delivery_type: 'instant',
          access_level: 'public',
          allowed_tier_ids: [],
          price: C.tape.priceCents,
          quantity_sold: 0,
          grants_album_id: tapeAlbum.id,
        });
        if (error) die(`tape insert: ${error.message}`);
      }
    } else {
      const reprice = haveTape.price !== C.tape.priceCents && !(haveTape.quantity_sold > 0);
      console.log(`tape: in place at $${haveTape.price / 100}${reprice ? `, ${APPLY ? 'repricing' : 'will reprice'} to $${C.tape.priceCents / 100}` : ''}`);
      if (APPLY) {
        const { error } = await db.from('products').update({ ...fields, ...(reprice ? { price: C.tape.priceCents } : {}) }).eq('id', haveTape.id);
        if (error) die(`tape update: ${error.message}`);
      }
    }
  }
}

// ── The listening session Founding Supporters hold a seat in ───────────────────────────────────
// ONE scheduled live per project, found by credit_album_id, created or moved to the config's date.
// Founding Supporters are seated through live_sessions.credit_album_id (src/lib/live/access.ts);
// `rungs` are paid tiers seated alongside them.
if (C.credits.session) {
  const want = C.credits.session;
  const rungIds = [];
  for (const r of want.rungs ?? []) {
    const { data: t } = await db.from('subscription_tiers').select('id').eq('artist_id', artist.id).eq('name', r).eq('is_active', true).maybeSingle();
    if (!t) die(`session: no active ${r} tier to seat`);
    rungIds.push(t.id);
  }
  const at = new Date(want.scheduledAt).toISOString();
  const { data: have } = await db
    .from('live_sessions')
    .select('id, title, scheduled_at, allowed_tier_ids')
    .eq('artist_id', artist.id)
    .eq('credit_album_id', album.id)
    .eq('status', 'scheduled')
    .eq('is_active', true)
    .maybeSingle();
  const fields = {
    title: want.title,
    description: `Founding Supporters of ${album.title}${rungIds.length ? ` and ${(want.rungs ?? []).join(' and ')} members` : ''} go live with ${C.displayName}.`,
    scheduled_at: at,
    is_free: false,
    allowed_tier_ids: rungIds,
    credit_album_id: album.id,
  };
  const same = have && have.title === fields.title && new Date(have.scheduled_at).toISOString() === at
    && JSON.stringify(have.allowed_tier_ids ?? []) === JSON.stringify(rungIds);
  console.log(`session: ${same ? 'in place' : have ? (APPLY ? 'moving' : 'will move') : (APPLY ? 'scheduling' : 'will schedule')} "${want.title}" for ${want.scheduledAt}${rungIds.length ? `, seating ${(want.rungs ?? []).join(', ')} too` : ''}`);
  if (APPLY && !same) {
    const { error } = have
      ? await db.from('live_sessions').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', have.id)
      : await db.from('live_sessions').insert({
          ...fields,
          artist_id: artist.id,
          max_slots: 100,
          status: 'scheduled',
          room_name: `ls_${randomUUID()}`,
          source_type: 'live',
        });
    if (error) die(`session: ${error.message}`);
  }
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

// ── Scorecard: the pre-committed verdict, from the SAME function the admin Money Model tab reads ──
const { scorecards } = await loadCreditsScorecards(db);
const card = scorecards.find((c) => c.albumTitle === album.title && c.artistSlug === artist.slug);
if (!card) {
  console.log('\nScorecard: no credits products on this project yet.');
} else {
  console.log('\nScorecard (distinct visitors; founder devices never counted)');
  for (const line of card.lines) console.log(`  ${line}`);
  console.log(`\nVerdict: ${card.verdict.headline}\n  ${card.verdict.next}`);
}
