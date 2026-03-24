import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  sendSms, isInQuietHours, getNext9am,
  MAX_SMS_PER_FAN_PER_MONTH, SMS_CATEGORIES, SmsCategory,
} from '@/lib/twilio';
import { getSmsLimit } from '@/lib/platformTier';
import { resolveTokens } from '@/lib/emails/campaignEmail';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { artistId, category, message, showLocation } = body as {
    artistId: string;
    category: SmsCategory;
    message: string;
    showLocation?: { lat: number; lng: number; city: string; state: string; venue: string; radiusMiles: number };
  };

  if (!artistId || !category || !message) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Validate category
  if (!SMS_CATEGORIES.find(c => c.value === category)) {
    return NextResponse.json({ error: 'Invalid SMS category' }, { status: 400 });
  }

  // show_nearby requires location
  if (category === 'show_nearby' && !showLocation) {
    return NextResponse.json({ error: 'show_nearby requires a location' }, { status: 400 });
  }

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, platform_tier')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  // Check platform tier allows SMS
  const smsLimit = getSmsLimit(artist.platform_tier);
  if (smsLimit === 0) {
    return NextResponse.json({ error: 'SMS is not available on your plan. Upgrade to Pro or higher.' }, { status: 403 });
  }

  // Get artist phone number
  const { data: artistPhone } = await supabaseAdmin
    .from('artist_phone_numbers')
    .select('phone_number, monthly_send_count')
    .eq('artist_id', artistId)
    .eq('is_active', true)
    .single();

  if (!artistPhone) {
    return NextResponse.json({ error: 'No phone number provisioned. Set up SMS first.' }, { status: 400 });
  }

  // Check monthly send limit
  if (artistPhone.monthly_send_count >= smsLimit) {
    return NextResponse.json({
      error: `Monthly SMS limit reached (${smsLimit}). Upgrade your plan for more messages.`,
    }, { status: 429 });
  }

  // Get eligible subscribers
  const { data: subscribers } = await supabaseAdmin
    .from('sms_subscribers')
    .select('id, phone_number, timezone, city, state, fan_id, monthly_receive_count, last_received_at')
    .eq('artist_id', artistId)
    .eq('status', 'active');

  if (!subscribers || subscribers.length === 0) {
    return NextResponse.json({ error: 'No active SMS subscribers' }, { status: 400 });
  }

  // Get artist name for token resolution
  const { data: artistProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .single();
  const artistName = artistProfile?.display_name || 'Artist';

  // Create a campaign record for SMS tracking
  const { data: smsCampaign } = await supabaseAdmin
    .from('campaigns')
    .insert({
      artist_id: artistId,
      name: `SMS — ${SMS_CATEGORIES.find(c => c.value === category)?.label || category} — ${new Date().toLocaleDateString('en-US')}`,
      body: message,
      channel: 'sms',
      status: 'sending',
    })
    .select('id')
    .single();

  let sentCount = 0;
  let deferredCount = 0;
  let skippedCount = 0;
  let remainingQuota = smsLimit - artistPhone.monthly_send_count;

  for (const sub of subscribers) {
    if (remainingQuota <= 0) {
      skippedCount += subscribers.length - sentCount - deferredCount - skippedCount;
      break;
    }

    // Check per-fan monthly limit
    if (sub.monthly_receive_count >= MAX_SMS_PER_FAN_PER_MONTH) {
      skippedCount++;
      continue;
    }

    // Check per-fan daily limit (1 per day)
    if (sub.last_received_at) {
      const lastSent = new Date(sub.last_received_at);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      if (lastSent > oneDayAgo) {
        skippedCount++;
        continue;
      }
    }

    // Check SMS opt-out via fan_communication_prefs
    if (sub.fan_id) {
      const { data: prefs } = await supabaseAdmin
        .from('fan_communication_prefs')
        .select('sms_marketing')
        .eq('fan_id', sub.fan_id)
        .eq('artist_id', artistId)
        .maybeSingle();
      if (prefs?.sms_marketing === false) {
        skippedCount++;
        continue;
      }
    }

    // Check quiet hours
    if (isInQuietHours(sub.timezone)) {
      deferredCount++;
      // TODO: implement deferred send queue. For now, skip with count.
      continue;
    }

    // Resolve personalization tokens
    const personalizedMessage = resolveTokens(message, {
      artist_name: artistName,
      city: sub.city,
      state: sub.state,
      venue: showLocation?.venue || null,
      show_city: showLocation?.city || null,
      show_date: null, // Can be extended
    });

    // Append opt-out footer
    const fullMessage = `${personalizedMessage}\n\nReply STOP to opt out`;

    // Character count check (basic — Twilio handles segmenting)
    const result = await sendSms(sub.phone_number, fullMessage, artistPhone.phone_number);

    if (result.success) {
      sentCount++;
      remainingQuota--;

      // Create campaign_sends record for SMS tracking
      if (smsCampaign) {
        await supabaseAdmin
          .from('campaign_sends')
          .insert({
            campaign_id: smsCampaign.id,
            fan_id: sub.fan_id,
            channel: 'sms',
            phone_number: sub.phone_number,
            twilio_message_sid: result.sid || null,
            status: 'sent',
            sent_at: new Date().toISOString(),
          });
      }

      // Update subscriber counts
      await supabaseAdmin
        .from('sms_subscribers')
        .update({
          monthly_receive_count: sub.monthly_receive_count + 1,
          last_received_at: new Date().toISOString(),
        })
        .eq('id', sub.id);
    } else {
      // Track failed sends too
      if (smsCampaign && sub.fan_id) {
        await supabaseAdmin
          .from('campaign_sends')
          .insert({
            campaign_id: smsCampaign.id,
            fan_id: sub.fan_id,
            channel: 'sms',
            phone_number: sub.phone_number,
            status: 'failed',
          });
      }
      skippedCount++;
    }
  }

  // Update artist monthly send count
  await supabaseAdmin
    .from('artist_phone_numbers')
    .update({ monthly_send_count: artistPhone.monthly_send_count + sentCount })
    .eq('artist_id', artistId);

  // Finalize campaign record
  if (smsCampaign) {
    await supabaseAdmin
      .from('campaigns')
      .update({
        status: sentCount > 0 ? 'sent' : 'failed',
        sent_at: new Date().toISOString(),
        stats: { sent_count: sentCount, failed_count: skippedCount, deferred_count: deferredCount, total_recipients: subscribers.length },
        updated_at: new Date().toISOString(),
      })
      .eq('id', smsCampaign.id);
  }

  return NextResponse.json({
    success: true,
    sent: sentCount,
    deferred: deferredCount,
    skipped: skippedCount,
    total: subscribers.length,
    campaignId: smsCampaign?.id || null,
  });
}
