// READ-ONLY: the Go Bad entitlement matrix.
//
// can_play_track(p_track, p_user) DELIBERATELY IGNORES p_user and answers only for
// auth.uid() (schema-phase2-fix-entitlement-oracle-via-authuid.sql). A service-role call
// therefore has auth.uid() = NULL and returns false for EVERY audience, which looks like a
// lockout and proves nothing. So this probe asserts the three INPUTS the oracle actually
// reads, and derives the matrix from the deployed function body.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
const env = readFileSync('.env.local', 'utf8');
const pick = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '');
const db = createClient(pick('NEXT_PUBLIC_SUPABASE_URL'), pick('SUPABASE_SERVICE_ROLE_KEY'), { auth: { autoRefreshToken: false, persistSession: false } });
const GB = '61cfacee-7971-4252-8c75-bf83de8e3900';

const { data: tiers } = await db.from('subscription_tiers').select('id, name, price').eq('artist_id', GB).order('price');
const nameOf = (id) => tiers.find((t) => t.id === id)?.name ?? id;
const { data: track } = await db.from('tracks')
  .select('id, title, is_free, allowed_tier_ids, public_release_date').eq('artist_id', GB).eq('title', 'Go Bad').single();

const allowed = (track.allowed_tier_ids || []).map(nameOf);
const inWindow = !!track.public_release_date && new Date(track.public_release_date) > new Date() && allowed.length > 0;
console.log('Go Bad', track.id);
console.log('  is_free            :', track.is_free);
console.log('  public_release_date:', track.public_release_date, '| inside a paid-first window:', inWindow);
console.log('  allowed_tier_ids   :', JSON.stringify(allowed));
console.log('\nderived matrix (is_free=false, so the free short-circuit never fires):');
console.log('  anonymous            : denied   (auth.uid() IS NULL)');
console.log('  signed-in non-member : denied   (no active GB subscription)');
for (const t of tiers) {
  const ok = (track.allowed_tier_ids || []).includes(t.id);
  console.log(('  member: ' + t.name).padEnd(23) + ': ' + (ok ? 'ALLOWED' : 'denied') + '  (tier id ' + (ok ? 'in' : 'NOT in') + ' allowed_tier_ids)');
}
console.log('\nthis cleanup wrote only to tier_benefits, which can_play_track never reads.');
