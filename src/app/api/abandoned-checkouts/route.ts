import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  // Get abandoned checkouts with fan info
  const { data: checkouts } = await supabaseAdmin
    .from('abandoned_checkouts')
    .select('id, fan_id, checkout_type, product_id, tier_id, recovered, created_at')
    .eq('artist_id', artist.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (!checkouts || checkouts.length === 0) {
    return NextResponse.json({
      checkouts: [],
      stats: { total: 0, recovered: 0, recoveryRate: 0, byType: {} },
    });
  }

  // Get fan profiles
  const fanIds = [...new Set(checkouts.map(c => c.fan_id))];
  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, avatar_url')
    .in('id', fanIds);

  const profileMap: Record<string, { display_name: string; avatar_url: string | null }> = {};
  (profiles || []).forEach(p => {
    profileMap[p.id] = { display_name: p.display_name || 'Fan', avatar_url: p.avatar_url };
  });

  // Get product/tier names for context
  const productIds = checkouts.filter(c => c.product_id).map(c => c.product_id!);
  const tierIds = checkouts.filter(c => c.tier_id).map(c => c.tier_id!);

  const { data: products } = productIds.length > 0
    ? await supabaseAdmin.from('products').select('id, title').in('id', productIds)
    : { data: [] };

  const { data: tiers } = tierIds.length > 0
    ? await supabaseAdmin.from('subscription_tiers').select('id, name').in('id', tierIds)
    : { data: [] };

  const productMap: Record<string, string> = {};
  (products || []).forEach(p => { productMap[p.id] = p.title; });

  const tierMap: Record<string, string> = {};
  (tiers || []).forEach(t => { tierMap[t.id] = t.name; });

  // Calculate stats
  const total = checkouts.length;
  const recovered = checkouts.filter(c => c.recovered).length;
  const byType: Record<string, { total: number; recovered: number }> = {};

  checkouts.forEach(c => {
    if (!byType[c.checkout_type]) byType[c.checkout_type] = { total: 0, recovered: 0 };
    byType[c.checkout_type].total++;
    if (c.recovered) byType[c.checkout_type].recovered++;
  });

  // Last 30 days stats
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const recent = checkouts.filter(c => c.created_at >= thirtyDaysAgo);
  const recentTotal = recent.length;
  const recentRecovered = recent.filter(c => c.recovered).length;

  const enrichedCheckouts = checkouts.map(c => ({
    ...c,
    fan_name: profileMap[c.fan_id]?.display_name || 'Fan',
    fan_avatar: profileMap[c.fan_id]?.avatar_url || null,
    item_name: c.product_id
      ? productMap[c.product_id] || 'Unknown product'
      : c.tier_id
        ? tierMap[c.tier_id] || 'Unknown tier'
        : 'Subscription',
  }));

  return NextResponse.json({
    checkouts: enrichedCheckouts,
    stats: {
      total,
      recovered,
      recoveryRate: total > 0 ? Math.round((recovered / total) * 100) : 0,
      recent: {
        total: recentTotal,
        recovered: recentRecovered,
        recoveryRate: recentTotal > 0 ? Math.round((recentRecovered / recentTotal) * 100) : 0,
      },
      byType,
    },
  });
}
