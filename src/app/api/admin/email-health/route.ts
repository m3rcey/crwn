import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  // Verify admin role
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // === Suppression List ===
  const { data: suppressions } = await supabaseAdmin
    .from('email_suppressions')
    .select('id, email, reason, bounce_message, source, created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  const { count: totalSuppressions } = await supabaseAdmin
    .from('email_suppressions')
    .select('id', { count: 'exact', head: true });

  const { count: hardBounces } = await supabaseAdmin
    .from('email_suppressions')
    .select('id', { count: 'exact', head: true })
    .eq('reason', 'hard_bounce');

  const { count: spamComplaints } = await supabaseAdmin
    .from('email_suppressions')
    .select('id', { count: 'exact', head: true })
    .eq('reason', 'spam_complaint');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { count: suppressionsLast30d } = await supabaseAdmin
    .from('email_suppressions')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', thirtyDaysAgo);

  const { count: suppressionsLast7d } = await supabaseAdmin
    .from('email_suppressions')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo);

  // === Campaign Performance (aggregate) ===
  const { data: allCampaignSends } = await supabaseAdmin
    .from('campaign_sends')
    .select('status, opened_at, clicked_at');

  const campaignTotals = {
    total: (allCampaignSends || []).length,
    sent: (allCampaignSends || []).filter(s => s.status !== 'pending' && s.status !== 'failed').length,
    opened: (allCampaignSends || []).filter(s => s.opened_at).length,
    clicked: (allCampaignSends || []).filter(s => s.clicked_at).length,
    bounced: (allCampaignSends || []).filter(s => s.status === 'bounced').length,
    failed: (allCampaignSends || []).filter(s => s.status === 'failed').length,
  };

  // === Sequence Send Performance (aggregate) ===
  const { data: allSeqSends } = await supabaseAdmin
    .from('sequence_sends')
    .select('status, opened_at, clicked_at');

  const sequenceTotals = {
    total: (allSeqSends || []).length,
    sent: (allSeqSends || []).filter(s => s.status !== 'failed').length,
    opened: (allSeqSends || []).filter(s => s.opened_at).length,
    clicked: (allSeqSends || []).filter(s => s.clicked_at).length,
    bounced: (allSeqSends || []).filter(s => s.status === 'bounced').length,
  };

  // === Unsubscribe Events ===
  const { data: recentUnsubs } = await supabaseAdmin
    .from('unsubscribe_events')
    .select('id, fan_id, artist_id, source_type, source_id, scope, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const { count: totalUnsubs } = await supabaseAdmin
    .from('unsubscribe_events')
    .select('id', { count: 'exact', head: true });

  const { count: unsubsLast30d } = await supabaseAdmin
    .from('unsubscribe_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', thirtyDaysAgo);

  const { count: globalUnsubs } = await supabaseAdmin
    .from('unsubscribe_events')
    .select('id', { count: 'exact', head: true })
    .eq('scope', 'global');

  // === Sequence Conversions ===
  const { data: conversionStats } = await supabaseAdmin
    .from('sequence_conversions')
    .select('trigger_type, converted');

  const conversionsByType: Record<string, { total: number; converted: number }> = {};
  (conversionStats || []).forEach(c => {
    if (!conversionsByType[c.trigger_type]) {
      conversionsByType[c.trigger_type] = { total: 0, converted: 0 };
    }
    conversionsByType[c.trigger_type].total++;
    if (c.converted) conversionsByType[c.trigger_type].converted++;
  });

  // Calculate deliverability score (0-100)
  const totalSent = campaignTotals.sent + sequenceTotals.sent;
  const totalBounced = campaignTotals.bounced + sequenceTotals.bounced;
  const deliverabilityRate = totalSent > 0
    ? Math.round(((totalSent - totalBounced) / totalSent) * 100)
    : 100;

  return NextResponse.json({
    suppressions: {
      list: suppressions || [],
      total: totalSuppressions || 0,
      hardBounces: hardBounces || 0,
      spamComplaints: spamComplaints || 0,
      last7d: suppressionsLast7d || 0,
      last30d: suppressionsLast30d || 0,
    },
    campaigns: campaignTotals,
    sequences: sequenceTotals,
    unsubscribes: {
      recent: recentUnsubs || [],
      total: totalUnsubs || 0,
      last30d: unsubsLast30d || 0,
      global: globalUnsubs || 0,
    },
    conversions: conversionsByType,
    deliverabilityRate,
  });
}
