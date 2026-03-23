import { resend } from '@/lib/resend';
import { campaignEmail, resolveTokens } from '@/lib/emails/campaignEmail';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

const BASE_URL = 'https://thecrwn.app';
const CONCURRENCY = 10;

interface AudienceFan {
  fan_id: string;
  email: string;
  display_name: string;
  tier_name: string | null;
  tier_id: string | null;
  total_spent: number;
  city: string | null;
  state: string | null;
  subscribed_at: string | null;
  referral_count: number;
}

async function resolveAudience(supabaseAdmin: AdminClient, artistId: string, filters: Record<string, unknown>): Promise<AudienceFan[]> {
  const { data: subscriptions } = await supabaseAdmin
    .from('subscriptions')
    .select('fan_id, tier_id, status, started_at, subscription_tiers(name)')
    .eq('artist_id', artistId);

  const { data: earnings } = await supabaseAdmin
    .from('earnings')
    .select('fan_id, gross_amount, fan_city, fan_state')
    .eq('artist_id', artistId);

  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('referrer_fan_id')
    .eq('artist_id', artistId)
    .eq('status', 'active');

  const fanData: Record<string, {
    tier_name: string | null;
    tier_id: string | null;
    total_spent: number;
    city: string | null;
    state: string | null;
    subscribed_at: string | null;
    referral_count: number;
    is_subscriber: boolean;
  }> = {};
  const allFanIds = new Set<string>();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (subscriptions || []).forEach((s: any) => {
    if (!s.fan_id) return;
    allFanIds.add(s.fan_id);
    fanData[s.fan_id] = {
      tier_name: s.status === 'active' ? (s.subscription_tiers?.name || null) : null,
      tier_id: s.status === 'active' ? s.tier_id : null,
      total_spent: 0,
      city: null,
      state: null,
      subscribed_at: s.started_at,
      referral_count: 0,
      is_subscriber: s.status === 'active',
    };
  });

  (earnings || []).forEach(e => {
    if (!e.fan_id) return;
    allFanIds.add(e.fan_id);
    if (!fanData[e.fan_id]) {
      fanData[e.fan_id] = {
        tier_name: null, tier_id: null, total_spent: 0,
        city: null, state: null, subscribed_at: null, referral_count: 0, is_subscriber: false,
      };
    }
    fanData[e.fan_id].total_spent += e.gross_amount;
    if (e.fan_city) {
      fanData[e.fan_id].city = e.fan_city;
      fanData[e.fan_id].state = e.fan_state;
    }
  });

  const refCounts: Record<string, number> = {};
  (referrals || []).forEach(r => {
    refCounts[r.referrer_fan_id] = (refCounts[r.referrer_fan_id] || 0) + 1;
    allFanIds.add(r.referrer_fan_id);
    if (!fanData[r.referrer_fan_id]) {
      fanData[r.referrer_fan_id] = {
        tier_name: null, tier_id: null, total_spent: 0,
        city: null, state: null, subscribed_at: null, referral_count: 0, is_subscriber: false,
      };
    }
    fanData[r.referrer_fan_id].referral_count = refCounts[r.referrer_fan_id];
  });

  if (allFanIds.size === 0) return [];

  const fanIdArray = Array.from(allFanIds);

  const { data: optOuts } = await supabaseAdmin
    .from('fan_communication_prefs')
    .select('fan_id')
    .eq('artist_id', artistId)
    .eq('email_marketing', false);

  const optedOutIds = new Set((optOuts || []).map(o => o.fan_id));
  const eligibleIds = fanIdArray.filter(id => !optedOutIds.has(id));

  if (eligibleIds.length === 0) return [];

  const { data: profiles } = await supabaseAdmin
    .from('profiles')
    .select('id, display_name, username')
    .in('id', eligibleIds);

  const profileMap: Record<string, string> = {};
  (profiles || []).forEach(p => {
    profileMap[p.id] = p.display_name || p.username || 'Fan';
  });

  const emailMap: Record<string, string> = {};
  const batchSize = 20;
  for (let i = 0; i < eligibleIds.length; i += batchSize) {
    const batch = eligibleIds.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(id =>
        supabaseAdmin.auth.admin.getUserById(id)
          .then(r => ({ id, email: r.data.user?.email || '' }))
          .catch(() => ({ id, email: '' }))
      )
    );
    results.forEach(r => { emailMap[r.id] = r.email; });
  }

  let fans: AudienceFan[] = eligibleIds
    .filter(id => emailMap[id])
    .map(id => ({
      fan_id: id,
      email: emailMap[id],
      display_name: profileMap[id] || 'Fan',
      tier_name: fanData[id]?.tier_name || null,
      tier_id: fanData[id]?.tier_id || null,
      total_spent: fanData[id]?.total_spent || 0,
      city: fanData[id]?.city || null,
      state: fanData[id]?.state || null,
      subscribed_at: fanData[id]?.subscribed_at || null,
      referral_count: fanData[id]?.referral_count || 0,
    }));

  if (filters.tier && typeof filters.tier === 'string') {
    fans = fans.filter(f => f.tier_id === filters.tier);
  }
  if (filters.location && typeof filters.location === 'string') {
    const loc = (filters.location as string).toLowerCase();
    fans = fans.filter(f =>
      (f.city && f.city.toLowerCase().includes(loc)) ||
      (f.state && f.state.toLowerCase().includes(loc))
    );
  }
  if (filters.minSpend && typeof filters.minSpend === 'number') {
    fans = fans.filter(f => f.total_spent >= (filters.minSpend as number));
  }
  if (filters.subscribersOnly) {
    fans = fans.filter(f => f.tier_id != null);
  }

  return fans;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveAudienceAndSend(
  supabaseAdmin: AdminClient,
  campaign: any,
  artistUserId: string,
  artistName: string,
  platformTier: string,
): Promise<{ sent: number; failed: number; total: number }> {
  const fans = await resolveAudience(supabaseAdmin, campaign.artist_id, campaign.filters || {});

  if (fans.length === 0) {
    await supabaseAdmin
      .from('campaigns')
      .update({ status: 'failed', stats: { error: 'No eligible recipients' } })
      .eq('id', campaign.id);
    return { sent: 0, failed: 0, total: 0 };
  }

  const { data: latestTrack } = await supabaseAdmin
    .from('tracks')
    .select('title')
    .eq('artist_id', campaign.artist_id)
    .eq('is_active', true)
    .order('release_date', { ascending: false })
    .limit(1)
    .single();

  const sendRecords = fans.map(fan => ({
    campaign_id: campaign.id,
    fan_id: fan.fan_id,
    email: fan.email,
    status: 'pending',
  }));

  const { data: sends } = await supabaseAdmin
    .from('campaign_sends')
    .insert(sendRecords)
    .select('id, fan_id, email');

  if (!sends || sends.length === 0) {
    await supabaseAdmin
      .from('campaigns')
      .update({ status: 'failed', stats: { error: 'Failed to create send records' } })
      .eq('id', campaign.id);
    return { sent: 0, failed: 0, total: 0 };
  }

  const fanLookup: Record<string, AudienceFan> = {};
  fans.forEach(f => { fanLookup[f.fan_id] = f; });

  let sentCount = 0;
  let failedCount = 0;

  for (let i = 0; i < sends.length; i += CONCURRENCY) {
    const batch = sends.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (send) => {
        const fan = fanLookup[send.fan_id];
        if (!fan) throw new Error('Fan not found');

        const firstName = fan.display_name.split(' ')[0];
        const daysSubscribed = fan.subscribed_at
          ? Math.floor((Date.now() - new Date(fan.subscribed_at).getTime()) / 86400000)
          : 0;

        const personalizedBody = resolveTokens(campaign.body, {
          first_name: firstName,
          full_name: fan.display_name,
          tier_name: fan.tier_name,
          tier_price: fan.tier_name && fan.total_spent > 0 ? `$${(fan.total_spent / 100).toFixed(2)}` : null,
          artist_name: artistName,
          city: fan.city,
          state: fan.state,
          sub_date: fan.subscribed_at ? new Date(fan.subscribed_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null,
          days_subscribed: String(daysSubscribed),
          total_spent: `$${(fan.total_spent / 100).toFixed(2)}`,
          referral_count: String(fan.referral_count),
          latest_release: latestTrack?.title || null,
        });

        const personalizedSubject = resolveTokens(campaign.subject || campaign.name, {
          first_name: firstName,
          full_name: fan.display_name,
          artist_name: artistName,
          tier_name: fan.tier_name,
          latest_release: latestTrack?.title || null,
        });

        const unsubscribeUrl = `${BASE_URL}/api/campaigns/unsubscribe/${send.id}`;
        const trackingPixelUrl = `${BASE_URL}/api/campaigns/track/${send.id}?pixel=1`;

        const html = campaignEmail({
          body: personalizedBody,
          artistName,
          sendId: send.id,
          unsubscribeUrl,
          trackingPixelUrl,
          platformTier,
        });

        const { error } = await resend.emails.send({
          from: `${artistName} via CRWN <hello@thecrwn.app>`,
          to: send.email,
          subject: personalizedSubject,
          html,
          headers: {
            'List-Unsubscribe': `<${unsubscribeUrl}>`,
          },
        });

        if (error) throw error;

        await supabaseAdmin
          .from('campaign_sends')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', send.id);

        return send.id;
      })
    );

    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        sentCount++;
      } else {
        failedCount++;
        supabaseAdmin
          .from('campaign_sends')
          .update({ status: 'failed' })
          .eq('id', batch[idx].id)
          .then(() => {});
      }
    });
  }

  const finalStatus = sentCount > 0 ? 'sent' : 'failed';
  await supabaseAdmin
    .from('campaigns')
    .update({
      status: finalStatus,
      sent_at: new Date().toISOString(),
      stats: { sent_count: sentCount, failed_count: failedCount, total_recipients: sends.length },
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaign.id);

  return { sent: sentCount, failed: failedCount, total: sends.length };
}
