// Seed / update GB The G1ft's Tier Offer Experiences from the reviewed reference
// configuration in src/lib/offerExperience/reference/gb.ts.
//
// Idempotent and auditable: every run validates each config through the SAME normalizer
// the read path uses (a config that fails would silently fall back to the compact card,
// so refusing to write it is strictly better), upserts one row per tier, then re-reads
// and prints what production now holds. GB-only by construction: rows are keyed by his
// tier ids, and the DB trigger refuses a tier that is not his.
//
// Run: npx tsx scripts/configure-gb-offer.mjs
// Requires: supabase/schema-phase2-tier-offer-experiences.sql applied.

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { normalizeOfferExperience } from '../src/lib/offerExperience/normalize.ts';
import { GB_PLATINUM_OFFER, GB_GOLD_OFFER, GB_SILVER_OFFER } from '../src/lib/offerExperience/reference/gb.ts';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: gb, error: gbErr } = await db.from('artist_profiles').select('id').eq('slug', 'gb').single();
if (gbErr || !gb) { console.error('GB not found:', gbErr?.message); process.exit(1); }
const { data: tiers } = await db.from('subscription_tiers')
  .select('id, name, price').eq('artist_id', gb.id).eq('is_active', true);
const byName = (n) => (tiers || []).find((t) => t.name === n);

const plan = [
  ['Platinum', GB_PLATINUM_OFFER],
  ['Gold', GB_GOLD_OFFER],
  ['Silver', GB_SILVER_OFFER],
];

for (const [name, config] of plan) {
  const tier = byName(name);
  if (!tier) { console.error(`SKIP ${name}: tier not found`); continue; }
  const normalized = normalizeOfferExperience(config, name);
  if (!normalized) { console.error(`REFUSED ${name}: config fails the write contract`); process.exit(1); }
  const { error } = await db.from('tier_offer_experiences').upsert(
    { artist_id: gb.id, tier_id: tier.id, config, is_active: true, updated_at: new Date().toISOString() },
    { onConflict: 'tier_id' },
  );
  if (error) { console.error(`${name}: write failed: ${error.message}`); process.exit(1); }
  // Verify by re-reading through the same path the drop page uses.
  const { data: row } = await db.from('tier_offer_experiences')
    .select('config, is_active').eq('tier_id', tier.id).single();
  const back = normalizeOfferExperience(row.config, name);
  console.log(`${name}: stored, active=${row.is_active}, cta="${back?.cta}", previews=${back?.previews.length}`);
}
