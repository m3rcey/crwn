import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getQualifyingEarnings, splitAmountForEarning, applyCap } from '@/lib/teamSplits/allocation';
import type { TeamSplitDeal } from '@/lib/teamSplits/types';

// Post-migration end-to-end verification for Team Splits money flow.
// NOT scheduled in vercel.json — trigger manually after applying the migrations:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://thecrwn.app/api/cron/team-split-selfcheck
// Seeds a throwaway artist + collaborator + synthetic earning, runs the real
// accrual + cashout RPC path, asserts the math, then deletes the users (cascade
// removes every seeded row). Touches NO real artist and calls NO Stripe API.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stamp = Date.now();
  const checks: { name: string; ok: boolean; detail?: string }[] = [];
  const check = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  let artistUserId: string | null = null;
  let collabUserId: string | null = null;

  try {
    // --- seed users ---
    const artistUser = await supabaseAdmin.auth.admin.createUser({
      email: `ts-canary-artist-${stamp}@thecrwn.app`, email_confirm: true,
    });
    artistUserId = artistUser.data.user?.id ?? null;
    const collabUser = await supabaseAdmin.auth.admin.createUser({
      email: `ts-canary-collab-${stamp}@thecrwn.app`, email_confirm: true,
    });
    collabUserId = collabUser.data.user?.id ?? null;
    check('seed users', !!artistUserId && !!collabUserId);
    if (!artistUserId || !collabUserId) throw new Error('user seed failed');

    // --- seed artist profile ---
    const { data: artistProfile, error: apErr } = await supabaseAdmin
      .from('artist_profiles')
      .insert({ user_id: artistUserId, slug: `__ts-canary-${stamp}` })
      .select('id').single();
    check('seed artist_profiles', !apErr && !!artistProfile, apErr?.message);
    if (!artistProfile) throw new Error('artist seed failed');
    const artistId = artistProfile.id;

    // --- seed a synthetic revenue event ($100 gross -> $88 net) ---
    const { data: earning, error: eErr } = await supabaseAdmin.from('earnings').insert({
      artist_id: artistId, fan_id: collabUserId, type: 'subscription',
      description: 'ts-canary', gross_amount: 10000, platform_fee: 1200, net_amount: 8800,
      stripe_payment_id: `pi_tscanary_${stamp}`,
    }).select('id').single();
    check('seed earnings row', !eErr && !!earning, eErr?.message);
    if (!earning) throw new Error('earnings seed failed');

    // --- create an active all-earnings deal (12%, $1500 cap, 7d hold) ---
    const { data: deal, error: dErr } = await supabaseAdmin.from('team_split_deals').insert({
      artist_id: artistId, collaborator_user_id: collabUserId, collaborator_name: 'Canary',
      role: 'producer', title: 'Canary deal', deal_type: 'artist_earnings_share',
      revenue_source_type: 'all_earnings', payout_basis: 'net_artist_revenue',
      percentage: 12, cap_amount: 150000, hold_period_days: 7, status: 'active',
      starts_at: new Date(stamp - 86400000).toISOString(), created_by: artistUserId,
    }).select('*').single();
    check('create active deal', !dErr && !!deal, dErr?.message);
    if (!deal) throw new Error('deal seed failed');

    // --- run the real allocation path ---
    const qualifying = await getQualifyingEarnings(supabaseAdmin, deal as TeamSplitDeal);
    check('earning qualifies', qualifying.some((e) => e.id === earning.id), `found ${qualifying.length}`);
    const amount = applyCap(splitAmountForEarning({ ...qualifying[0] }, deal as TeamSplitDeal), 0, deal.cap_amount);
    check('accrual amount = $10.56', amount === 1056, `got ${amount}`);

    await supabaseAdmin.from('team_split_earnings').insert({
      deal_id: deal.id, artist_id: artistId, collaborator_user_id: collabUserId,
      earning_id: earning.id, source_type: 'all_earnings', basis: 'net_artist_revenue',
      basis_amount: 8800, percentage: 12, gross_amount: 10000, commission_amount: amount,
      status: 'held', cleared_at: new Date().toISOString(),
    });

    // --- cashout RPC must return NULL before release (min $25, and not released) ---
    const before = await supabaseAdmin.rpc('atomic_team_split_cashout', { p_collaborator_id: collabUserId, p_min_amount: 100 });
    check('cashout blocked before release', !before.data, `rpc=${before.data}`);

    // --- release, then cashout RPC should succeed (min lowered for the test) ---
    await supabaseAdmin.from('team_split_earnings')
      .update({ released_at: new Date().toISOString(), status: 'released', cleared_at: new Date().toISOString() })
      .eq('deal_id', deal.id).gt('commission_amount', 0);
    const after = await supabaseAdmin.rpc('atomic_team_split_cashout', { p_collaborator_id: collabUserId, p_min_amount: 100 });
    check('cashout succeeds after release', !!after.data, `rpc=${after.data}`);

    const allOk = checks.every((c) => c.ok);
    return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error', checks }, { status: 500 });
  } finally {
    // Cascade cleanup: deleting the auth users removes artist_profiles, earnings,
    // deals, accruals, and payouts tied to them.
    if (artistUserId) await supabaseAdmin.auth.admin.deleteUser(artistUserId).catch(() => {});
    if (collabUserId) await supabaseAdmin.auth.admin.deleteUser(collabUserId).catch(() => {});
  }
}
