// Give GB The G1ft's four tiers their structured benefit identities (Promise to Delivery, Phase 6).
//
// WHY THIS EXISTS
// GB's approved offer lives in `subscription_tiers.access_config.benefits` as prose, and on
// 2026-09-03 every structured `tier_benefits` row was removed because the rows he had were
// generic ladder defaults printing ABOVE that prose. Prose is what fans read, but prose has no
// identity: nothing could answer "is the Vault ready?", pre-fill Gold and above when he goes
// to deliver, or put him one tap from the right screen. This script writes the structured rows
// that carry the IDENTITY of each approved promise, and flips `access_config.card_lines` to
// 'prose_only' so the public card keeps printing exactly the approved prose and nothing else.
//
// WHAT IT NEVER TOUCHES: price, Stripe ids, subscriptions, tier names, descriptions, the
// approved prose lines, any other artist. Read-back after the write asserts all of that.
//
// Idempotent: each tier's rows are replaced with the same set, and the flag is a fixed value.
// No `frequency` is written anywhere: none was approved, so nothing lands on the Promise
// Calendar (that is the 2026-09-03 cadence rule, enforced in tierObligations.ts).
//
// Run:  npx tsx scripts/configure-gb-tier-benefits.mjs           (dry run, default)
//       npx tsx scripts/configure-gb-tier-benefits.mjs --apply   (writes)

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { getBenefitDisplayText } from '../src/lib/benefitCatalog.ts';
import { benefitDelivery } from '../src/lib/benefitRegistry.ts';
import { GB_APPROVED_BENEFITS, GB_TIER_PRICES_CENTS } from '../src/lib/offerExperience/reference/gbBenefits.ts';

const APPLY = process.argv.includes('--apply');
const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

// The approved prose line each identity stands for. One key per DISTINCT capability on the
// LOWEST rung that promises it; higher rungs inherit through cumulative access, and the panel
// shows the promise once, on its owner, naming the rungs it serves. "Platinum only" scope is a
// property of each decision or window the artist opens, not a second benefit identity.
const PLAN = {
  Bronze: [
    { key: 'welcome_unlock', line: 'Go Bad, yours the moment you join' },
    { key: 'drop_alerts', line: 'First word on every new drop' },
    { key: 'member_recognition', line: 'Day One recognition' },
    { key: 'exclusive_posts', line: 'Story continuations and drops as GB releases them' },
  ],
  Silver: [
    { key: 'early_access', line: 'Finished songs before they go public' },
    { key: 'exclusive_tracks', line: 'Alternate versions and members only music' },
    { key: 'stems', line: 'Stems' },
  ],
  Gold: [
    { key: 'creative_voting', line: 'Vote on the songs before anyone hears them' },
    { key: 'vault_collection', line: 'The Vault, unreleased music as GB adds it' },
    { key: 'group_live_qa', line: 'Watch Executive Producer Sessions' },
  ],
  Platinum: [
    { key: 'fan_submissions', line: 'Send beats for consideration' },
  ],
};

for (const [rung, items] of Object.entries(PLAN)) {
  for (const it of items) {
    const def = benefitDelivery(it.key);
    if (!def || (def.support !== 'recommended' && def.support !== 'additional')) {
      console.error(`${rung}: ${it.key} is not a supported registry key`); process.exit(1);
    }
    if (!GB_APPROVED_BENEFITS[rung].includes(it.line)) {
      console.error(`${rung}: "${it.line}" is not an approved line`); process.exit(1);
    }
  }
}

const { data: gb, error: gbErr } = await db.from('artist_profiles').select('id, slug').eq('slug', 'gb').single();
if (gbErr || !gb) { console.error('GB not found:', gbErr?.message); process.exit(1); }
console.log('artist: gb =', gb.id, APPLY ? '\nMODE: APPLY' : '\nMODE: DRY RUN (pass --apply to write)');

const snapshot = async () => {
  const { data: tiers, error } = await db.from('subscription_tiers')
    .select('id, name, price, description, stripe_price_id, stripe_annual_price_id, stripe_product_id, access_config, is_active')
    .eq('artist_id', gb.id).order('price');
  if (error) { console.error('tier read failed:', error.message); process.exit(1); }
  let subs = 0;
  for (const t of tiers) {
    const { count } = await db.from('subscriptions').select('id', { count: 'exact', head: true }).eq('tier_id', t.id).eq('status', 'active');
    subs += count || 0;
  }
  const billing = tiers.map((t) => `${t.name}|${t.price}|${t.stripe_price_id}|${t.stripe_annual_price_id}|${t.stripe_product_id}|${t.description}|${t.is_active}`);
  const prose = Object.fromEntries(tiers.map((t) => [t.name, t.access_config?.benefits ?? []]));
  return { tiers, subs, billing, prose };
};

const before = await snapshot();
console.log('active subscriptions before:', before.subs);
for (const t of before.tiers) {
  if (GB_TIER_PRICES_CENTS[t.name] !== t.price) { console.error(`${t.name}: price ${t.price} is not the approved ${GB_TIER_PRICES_CENTS[t.name]}`); process.exit(1); }
  if (JSON.stringify(before.prose[t.name]) !== JSON.stringify(GB_APPROVED_BENEFITS[t.name])) {
    console.error(`${t.name}: live prose is not the approved offer; refusing to touch it`); process.exit(1);
  }
}

for (const tier of before.tiers) {
  const plan = PLAN[tier.name];
  if (!plan) { console.log(`\n${tier.name}: NOT IN PLAN, skipped`); continue; }
  const rows = plan.map((it, i) => ({ tier_id: tier.id, benefit_type: it.key, config: {}, is_active: true, sort_order: i }));
  console.log(`\n======== ${tier.name} ($${tier.price / 100}) ${tier.id}`);
  for (const [i, it] of plan.entries()) {
    console.log(`  [${i}] ${it.key.padEnd(20)} <- "${it.line}"  (card would say: "${getBenefitDisplayText(it.key, {})}", hidden by prose_only)`);
  }
  console.log(`  access_config.card_lines -> prose_only (benefits prose unchanged, ${before.prose[tier.name].length} lines)`);
  if (!APPLY) continue;

  const { error: delErr } = await db.from('tier_benefits').delete().eq('tier_id', tier.id);
  if (delErr) { console.error(`${tier.name}: delete failed:`, delErr.message); process.exit(1); }
  const { error: insErr } = await db.from('tier_benefits').insert(rows);
  if (insErr) { console.error(`${tier.name}: insert failed:`, insErr.message); process.exit(1); }
  const nextConfig = { ...(tier.access_config ?? {}), benefits: before.prose[tier.name], card_lines: 'prose_only' };
  const { error: cfgErr } = await db.from('subscription_tiers').update({ access_config: nextConfig }).eq('id', tier.id);
  if (cfgErr) { console.error(`${tier.name}: access_config update failed:`, cfgErr.message); process.exit(1); }
}

if (APPLY) {
  const after = await snapshot();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  console.log('\n======== READ-BACK');
  console.log('billing identifiers unchanged:', same(before.billing, after.billing));
  console.log('approved prose unchanged:', same(before.prose, after.prose));
  console.log('active subscriptions:', before.subs, '->', after.subs, same(before.subs, after.subs) ? '(unchanged)' : '(CHANGED)');
  for (const t of after.tiers) {
    const { data: rows } = await db.from('tier_benefits').select('benefit_type, config, sort_order').eq('tier_id', t.id).order('sort_order');
    console.log(`${t.name}: card_lines=${t.access_config?.card_lines} rows=${(rows || []).map((r) => r.benefit_type).join(', ')}`);
    if ((rows || []).some((r) => r.config && r.config.frequency)) { console.error(`${t.name}: a frequency was written; that is a defect`); process.exit(1); }
  }
  const { data: obligations } = await db.from('fulfillment_obligations').select('id').eq('artist_id', gb.id);
  console.log('fulfillment_obligations for GB:', (obligations || []).length, '(expected 0: no cadence was approved)');
  if (!same(before.billing, after.billing) || !same(before.prose, after.prose) || before.subs !== after.subs) process.exit(1);
}
