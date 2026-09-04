// Prepare GB's Founding A&R Week campaign as a DRAFT.
//
// It is created with status 'draft' and with every legally-sensitive field EMPTY, on
// purpose. Dates, eligibility, the Official Rules URL, the exact qualifying action and
// the winner method are founder inputs; software may not infer any of them, and the
// readiness gate refuses to render a giveaway that is missing one. So this script sets
// up everything that is genuinely known and stops at the line where approval begins.
//
// It also prints the readiness report, which is the honest status of the campaign: the
// blockers listed are exactly what stands between draft and public.
//
// Idempotent: re-running updates the same row rather than creating a second campaign
// (the spine already enforces one ACTIVE campaign per artist; this keeps drafts single
// too by matching on archetype).
//
// Usage: npx tsx scripts/configure-gb-campaign.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { campaignReadiness } from '../src/lib/campaigns/giveaway.ts';
import { PRIZE_RAIL } from '../src/lib/campaigns/prizeState.ts';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: gb } = await db.from('artist_profiles').select('id').eq('slug', 'gb').single();
if (!gb) { console.error('GB not found'); process.exit(1); }

// KNOWN, founder-approved direction only. Everything absent below is absent deliberately.
const toolkit = {
  promise: 'Help shape what comes next.',
  what_to_do: "Join GB free, unlock Go Bad, and take part in this week's decision.",
  // The prize CONCEPT is approved; the value line is written from the live Platinum price
  // rather than hardcoded, so it cannot drift into a false claim if the price changes.
  prize: '1 year of GB Platinum',
  // Left EMPTY until approved. Each one blocks activation, which is the intent:
  //   official_rules_url  needs GB's own sweepstakes rules, not a terms page
  //   eligibility         age and territory, from those rules
  //   free_entry          the exact no-purchase path, matching the rules
  official_rules_url: '',
  eligibility: '',
  free_entry: '',
};

// The stated value is DERIVED from the live price, so $600 can never outlive $50/month.
// The prize TIER is configured here too: it is the pointer the executor resolves (and
// re-checks belongs to GB) when the prize is finally awarded. Twelve monthly periods is the
// planner's default and is stated explicitly so the campaign row is self-describing.
const { data: platinum } = await db.from('subscription_tiers')
  .select('id, price').eq('artist_id', gb.id).eq('name', 'Platinum').eq('is_active', true).maybeSingle();
if (platinum?.price) {
  toolkit.prize_value = `$${(platinum.price / 100) * 12} value at $${platinum.price / 100}/month`;
  toolkit.prize_tier_id = platinum.id;
  toolkit.prize_months = '12';
}

const { data: existing } = await db.from('fan_campaigns')
  .select('id, status').eq('artist_id', gb.id).eq('archetype', 'founding_ar_week').maybeSingle();

const row = {
  artist_id: gb.id,
  archetype: 'founding_ar_week',
  title: 'Founding A&R Week',
  status: 'draft',
  toolkit,
  incentive_kind: 'non_cash',
  // ends_at is NOT NULL in the schema, so a far-future placeholder holds the row until
  // real dates are approved. The readiness gate still blocks on the missing start date,
  // and status stays draft regardless, so this can never read as a live deadline.
  ends_at: existing ? undefined : '2099-01-01T00:00:00Z',
  starts_at: null,
  updated_at: new Date().toISOString(),
};
Object.keys(row).forEach((k) => row[k] === undefined && delete row[k]);

let id;
if (existing) {
  if (existing.status === 'active') {
    console.error('REFUSED: GB has an ACTIVE founding_ar_week campaign. Not overwriting a live campaign.');
    process.exit(1);
  }
  const { error } = await db.from('fan_campaigns').update(row).eq('id', existing.id);
  if (error) { console.error('update failed:', error.message); process.exit(1); }
  id = existing.id;
  console.log('Updated existing draft', id);
} else {
  const { data, error } = await db.from('fan_campaigns').insert(row).select('id').single();
  if (error) { console.error('insert failed:', error.message); process.exit(1); }
  id = data.id;
  console.log('Created draft', id);
}

const { data: saved } = await db.from('fan_campaigns')
  .select('id, artist_id, archetype, title, status, toolkit, starts_at, ends_at').eq('id', id).single();

console.log('\nStatus:', saved.status, '(never public while draft)');
console.log('Prize value line:', saved.toolkit.prize_value ?? '(no Platinum price found)');

// prizeFulfillable is the product's capability, read from PRIZE_RAIL, never typed here.
const r = campaignReadiness(saved, { prizeFulfillable: PRIZE_RAIL.ready });
console.log('\nReadiness:', r.ready ? 'READY' : 'NOT READY');
console.log('Is a giveaway:', r.isGiveaway);
for (const b of r.blockers) console.log('  BLOCKER:', b);
