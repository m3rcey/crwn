import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { verifySvixSignature } from '@/lib/webhookSignatures';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
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

/**
 * Resend delivery events for FAN email (campaigns + sequences).
 *
 * SIGNED, and fails closed. This is the most dangerous of the four unsigned webhooks that
 * used to sit here: a forged `email.complained` suppresses ANY address globally in
 * `email_suppressions` AND opts that fan out of email marketing from EVERY artist they
 * subscribe to. One unauthenticated POST per address could have quietly unsubscribed an
 * artist's entire audience, and the artist would only ever see their open rate go to zero.
 */
export async function POST(req: NextRequest) {
  try {
    // Raw text, not req.json(): the digest is over the exact bytes Resend sent.
    const rawBody = await req.text();

    const signed = verifySvixSignature(
      rawBody,
      {
        id: req.headers.get('svix-id'),
        timestamp: req.headers.get('svix-timestamp'),
        signature: req.headers.get('svix-signature'),
      },
      process.env.RESEND_WEBHOOK_SECRET
    );

    if (!signed) {
      console.error('Resend webhook: bad, missing, or unconfigured signature. Rejected.');
      return NextResponse.json({ status: 'error', reason: 'invalid_signature' }, { status: 403 });
    }

    const payload: ResendWebhookPayload = JSON.parse(rawBody);
    const { type, data } = payload;

    const recipientEmail = data.to?.[0]?.toLowerCase();
    if (!recipientEmail) {
      return NextResponse.json({ status: 'ignored' });
    }

    // Extract campaign or sequence send ID from custom headers
    const sendIdHeader = data.headers?.find(h => h.name === 'X-Campaign-Send-Id');
    const campaignSendId = sendIdHeader?.value;
    const seqSendIdHeader = data.headers?.find(h => h.name === 'X-Sequence-Send-Id');
    const sequenceSendId = seqSendIdHeader?.value;
    // Prospect (pre-signup) nurture send id, so opens/clicks/bounces attribute back to the ledger.
    const prospectSendIdHeader = data.headers?.find(h => h.name === 'X-Prospect-Send-Id');
    const prospectSendId = prospectSendIdHeader?.value;

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

      // Update sequence_sends if applicable
      if (sequenceSendId) {
        await supabaseAdmin
          .from('sequence_sends')
          .update({
            status: 'bounced',
          })
          .eq('id', sequenceSendId);
      }

      // Update prospect nurture send if applicable (the enrollment is stopped by the daily runner
      // the next time it checks suppression, which a hard bounce below adds the address to).
      if (prospectSendId) {
        await supabaseAdmin
          .from('prospect_nurture_sends')
          .update({ status: 'bounced' })
          .eq('id', prospectSendId);
      }

      // Hard bounce → global suppression
      if (isHard) {
        await supabaseAdmin
          .from('email_suppressions')
          .upsert({
            email: recipientEmail,
            reason: 'hard_bounce',
            bounce_message: bounceMessage,
            source: prospectSendId ? 'prospect_nurture' : campaignSendId ? 'campaign' : 'sequence',
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
          source: prospectSendId ? 'prospect_nurture' : campaignSendId ? 'campaign' : 'sequence',
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
      // Update sequence_sends status
      if (sequenceSendId) {
        await supabaseAdmin
          .from('sequence_sends')
          .update({ status: 'sent' })
          .eq('id', sequenceSendId);
      }
      if (prospectSendId) {
        await supabaseAdmin
          .from('prospect_nurture_sends')
          .update({ status: 'delivered' })
          .eq('id', prospectSendId)
          .eq('status', 'sent');
      }
    }

    // Behavioral signals for prospect nurture: opens and clicks. Idempotent (first-wins on the
    // timestamp). These are the branches the funnel reads for "result email opened / clicked".
    if (type === 'email.opened' && prospectSendId) {
      await supabaseAdmin
        .from('prospect_nurture_sends')
        .update({ status: 'opened', opened_at: new Date().toISOString() })
        .eq('id', prospectSendId)
        .is('opened_at', null);
    }

    if (type === 'email.clicked' && prospectSendId) {
      await supabaseAdmin
        .from('prospect_nurture_sends')
        .update({ status: 'clicked', clicked_at: new Date().toISOString() })
        .eq('id', prospectSendId)
        .is('clicked_at', null);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (err) {
    console.error('Resend webhook error:', err);
    return NextResponse.json({ status: 'error' }, { status: 500 });
  }
}
