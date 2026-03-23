import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ResendWebhookPayload {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
    to?: string[];
    from?: string;
    subject?: string;
    headers?: { name: string; value: string }[];
    bounce?: {
      type: string;
      message: string;
    };
  };
}

export async function POST(req: NextRequest) {
  try {
    const payload: ResendWebhookPayload = await req.json();
    const { type, data } = payload;

    const recipientEmail = data.to?.[0]?.toLowerCase();
    if (!recipientEmail) {
      return NextResponse.json({ status: 'ignored' });
    }

    // Extract campaign send ID from custom header if present
    const sendIdHeader = data.headers?.find(h => h.name === 'X-Campaign-Send-Id');
    const campaignSendId = sendIdHeader?.value;

    if (type === 'email.bounced') {
      const isHard = data.bounce?.type === 'hard';
      const bounceMessage = data.bounce?.message || 'unknown';

      // Update campaign_sends if we can match it
      if (campaignSendId) {
        await supabaseAdmin
          .from('campaign_sends')
          .update({
            status: 'bounced',
            bounce_reason: bounceMessage,
          })
          .eq('id', campaignSendId);
      } else if (data.email_id) {
        // Try matching by resend_message_id
        await supabaseAdmin
          .from('campaign_sends')
          .update({
            status: 'bounced',
            bounce_reason: bounceMessage,
          })
          .eq('resend_message_id', data.email_id);
      }

      // Hard bounce → global suppression
      if (isHard) {
        await supabaseAdmin
          .from('email_suppressions')
          .upsert({
            email: recipientEmail,
            reason: 'hard_bounce',
            bounce_message: bounceMessage,
            source: campaignSendId ? 'campaign' : 'sequence',
          }, { onConflict: 'email' });

        console.log(`Hard bounce — suppressed ${recipientEmail}: ${bounceMessage}`);
      } else {
        console.log(`Soft bounce for ${recipientEmail}: ${bounceMessage}`);
      }
    }

    if (type === 'email.complained') {
      // Spam complaint → global suppression immediately
      await supabaseAdmin
        .from('email_suppressions')
        .upsert({
          email: recipientEmail,
          reason: 'spam_complaint',
          source: campaignSendId ? 'campaign' : 'sequence',
        }, { onConflict: 'email' });

      // Also update campaign_sends if we can match
      if (campaignSendId) {
        await supabaseAdmin
          .from('campaign_sends')
          .update({ status: 'bounced', bounce_reason: 'spam_complaint' })
          .eq('id', campaignSendId);
      }

      // Opt the fan out of all email marketing globally
      // Find the user by email
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers();
      const user = authData?.users?.find(u => u.email?.toLowerCase() === recipientEmail);
      if (user) {
        // Get all artist relationships and opt out
        const { data: subs } = await supabaseAdmin
          .from('subscriptions')
          .select('artist_id')
          .eq('fan_id', user.id);

        if (subs) {
          for (const sub of subs) {
            await supabaseAdmin
              .from('fan_communication_prefs')
              .upsert({
                fan_id: user.id,
                artist_id: sub.artist_id,
                email_marketing: false,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'fan_id,artist_id' });
          }
        }
      }

      console.log(`Spam complaint — suppressed ${recipientEmail}`);
    }

    if (type === 'email.delivered') {
      // Update campaign_sends status if still 'sent'
      if (campaignSendId) {
        await supabaseAdmin
          .from('campaign_sends')
          .update({ status: 'sent' })
          .eq('id', campaignSendId)
          .eq('status', 'pending');
      }
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('Resend webhook error:', err);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
