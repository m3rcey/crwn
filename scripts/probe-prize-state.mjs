// READ-ONLY. Has anything about the prize, GB's memberships or the campaign changed?
//
// Run before and after any prize work. It writes nothing, and it exists because "I did not
// mutate production" is a claim that should be checkable rather than asserted.
//
// Usage: node scripts/probe-prize-state.mjs

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: gb } = await db.from('artist_profiles').select('id, slug').eq('slug', 'gb').single();

const { data: tiers } = await db.from('subscription_tiers')
  .select('id, name, price, is_active').eq('artist_id', gb.id).order('price');
const tierOf = (id) => tiers.find((t) => t.id === id);

const { data: subs } = await db.from('subscriptions')
  .select('id, tier_id, status').eq('artist_id', gb.id);

const active = (subs || []).filter((s) => s.status === 'active');
const paying = active.filter((s) => (tierOf(s.tier_id)?.price ?? 0) > 0);
const mrr = paying.reduce((sum, s) => sum + (tierOf(s.tier_id)?.price ?? 0), 0);

console.log('GB tiers:', tiers.map((t) => t.name + ' $' + (t.price / 100)).join(', '));
console.log('subscriptions total:', subs?.length ?? 0);
const byTier = {};
for (const s of active) {
  const k = (tierOf(s.tier_id)?.name ?? 'unknown') + '/' + s.status;
  byTier[k] = (byTier[k] || 0) + 1;
}
console.log('active memberships:', JSON.stringify(byTier));
console.log('paying members:', paying.length);
console.log('MRR: $' + (mrr / 100).toFixed(2));

// Does the prize column exist yet? Asked rather than assumed, because a select naming a
// missing column fails the WHOLE statement and supabase-js returns {data: null} instead of
// throwing, which reads exactly like "no prize rows".
const { error: colErr, data: prizeRows } = await db.from('subscriptions')
  .select('id').not('prize_campaign_id', 'is', null).limit(5);
console.log('prize_campaign_id column:', colErr ? 'NOT APPLIED (' + colErr.code + ')' : 'applied');
if (!colErr) console.log('prize subscriptions:', prizeRows.length);

const { data: camp } = await db.from('fan_campaigns')
  .select('id, title, status, starts_at, ends_at, toolkit').eq('artist_id', gb.id);
for (const c of camp || []) {
  const t = c.toolkit || {};
  console.log('\ncampaign:', c.title, '| status=' + c.status);
  console.log('  official_rules_url:', t.official_rules_url ? 'set' : 'EMPTY');
  console.log('  eligibility:', t.eligibility ? 'set' : 'EMPTY');
  console.log('  free_entry:', t.free_entry ? 'set' : 'EMPTY');
  console.log('  starts_at:', c.starts_at ?? 'null');
}

// The table is `earnings`, not `artist_earnings`. Naming the wrong one returns {data: null}
// rather than throwing, and `(earn || []).reduce(...)` then prints a confident $0.00 for an
// artist who has earned money. So the error is checked and reported, never coerced away.
const { data: earn, error: earnErr } = await db.from('earnings')
  .select('type, gross_amount, created_at').eq('artist_id', gb.id);
if (earnErr) {
  console.log('\nearnings: UNREADABLE (' + earnErr.code + ' ' + earnErr.message + ')');
} else {
  const gross = earn.reduce((s, e) => s + (e.gross_amount ?? 0), 0);
  console.log('\nearnings rows:', earn.length, '| gross total: $' + (gross / 100).toFixed(2));
  for (const e of earn.slice(-3)) console.log('  ', e.type, '$' + ((e.gross_amount ?? 0) / 100).toFixed(2), e.created_at?.slice(0, 10));
}
