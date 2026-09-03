// READ-ONLY. GB The G1ft's exact live tier + benefit configuration, rendered through the
// SAME display function the public cards use.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { getBenefitDisplayText } from '../src/lib/benefitCatalog.ts';

const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: gb } = await db.from('artist_profiles').select('id, slug').eq('slug', 'gb').single();
console.log('GB artist_id:', gb.id);

const { data: tiers } = await db.from('subscription_tiers')
  .select('*').eq('artist_id', gb.id).order('price');

for (const t of tiers) {
  console.log('\n======== ' + t.name + ' ($' + (t.price / 100) + ') ========');
  console.log('tier_id:', t.id, '| stripe_price_id:', t.stripe_price_id);
  const { count } = await db.from('subscriptions')
    .select('id', { count: 'exact', head: true }).eq('tier_id', t.id).eq('status', 'active');
  console.log('active subscribers:', count);
  console.log('access_config.benefits:');
  for (const b of t.access_config?.benefits || []) console.log('   •', b);
  const { data: rows, error } = await db.from('tier_benefits')
    .select('*').eq('tier_id', t.id).order('sort_order');
  if (error) { console.log('  tier_benefits READ ERROR:', error.message); continue; }
  console.log('tier_benefits rows (' + rows.length + '):');
  for (const r of rows) {
    console.log('   [' + r.sort_order + '] ' + r.benefit_type + ' active=' + r.is_active +
      ' config=' + JSON.stringify(r.config) + '  ->  "' + getBenefitDisplayText(r.benefit_type, r.config) + '"');
  }
}
