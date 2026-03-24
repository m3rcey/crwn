import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendSms, getTimezoneFromPhone } from '@/lib/twilio';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

/**
 * Incoming SMS webhook from Twilio.
 * Handles: keyword opt-in, YES confirmation, STOP opt-out.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const from = formData.get('From') as string;
  const to = formData.get('To') as string;
  const body = (formData.get('Body') as string || '').trim();

  if (!from || !to) {
    return twiml('Invalid request');
  }

  const upperBody = body.toUpperCase();

  // Find which artist owns this phone number
  const { data: artistPhone } = await supabaseAdmin
    .from('artist_phone_numbers')
    .select('artist_id, keyword, auto_reply')
    .eq('phone_number', to)
    .eq('is_active', true)
    .single();

  if (!artistPhone) {
    return twiml('This number is not active.');
  }

  // STOP — unsubscribe (Twilio also handles this automatically)
  if (upperBody === 'STOP' || upperBody === 'UNSUBSCRIBE' || upperBody === 'CANCEL' || upperBody === 'QUIT') {
    await supabaseAdmin
      .from('sms_subscribers')
      .update({ status: 'unsubscribed', opted_out_at: new Date().toISOString() })
      .eq('phone_number', from)
      .eq('artist_id', artistPhone.artist_id);

    await supabaseAdmin.from('sms_consent_log').insert({
      phone_number: from,
      artist_id: artistPhone.artist_id,
      action: 'opted_out',
      message_text: body,
    });

    // Also update fan_communication_prefs if we can find the fan
    const { data: sub } = await supabaseAdmin
      .from('sms_subscribers')
      .select('fan_id')
      .eq('phone_number', from)
      .eq('artist_id', artistPhone.artist_id)
      .maybeSingle();

    if (sub?.fan_id) {
      await supabaseAdmin
        .from('fan_communication_prefs')
        .upsert(
          { fan_id: sub.fan_id, artist_id: artistPhone.artist_id, sms_marketing: false, updated_at: new Date().toISOString() },
          { onConflict: 'fan_id,artist_id' }
        );
    }

    return twiml('You have been unsubscribed. You will no longer receive texts.');
  }

  // YES — double opt-in confirmation
  if (upperBody === 'YES' || upperBody === 'Y') {
    const { data: pending } = await supabaseAdmin
      .from('sms_subscribers')
      .select('id')
      .eq('phone_number', from)
      .eq('artist_id', artistPhone.artist_id)
      .eq('status', 'pending')
      .maybeSingle();

    if (pending) {
      await supabaseAdmin
        .from('sms_subscribers')
        .update({ status: 'active', opted_in_at: new Date().toISOString() })
        .eq('id', pending.id);

      await supabaseAdmin.from('sms_consent_log').insert({
        phone_number: from,
        artist_id: artistPhone.artist_id,
        action: 'double_optin_confirmed',
        message_text: body,
      });

      return twiml("You're in! You'll receive texts about new releases, shows, and exclusive drops. Reply STOP to opt out anytime.");
    }

    return twiml('');
  }

  // Keyword match — new opt-in
  if (upperBody === artistPhone.keyword.toUpperCase()) {
    // Check if already subscribed
    const { data: existing } = await supabaseAdmin
      .from('sms_subscribers')
      .select('id, status')
      .eq('phone_number', from)
      .eq('artist_id', artistPhone.artist_id)
      .maybeSingle();

    if (existing?.status === 'active') {
      return twiml("You're already subscribed! Reply STOP to opt out.");
    }

    const timezone = getTimezoneFromPhone(from);

    if (existing) {
      // Re-subscribe (was pending or unsubscribed)
      await supabaseAdmin
        .from('sms_subscribers')
        .update({ status: 'pending', timezone, opted_out_at: null })
        .eq('id', existing.id);
    } else {
      // New subscriber
      await supabaseAdmin
        .from('sms_subscribers')
        .insert({
          artist_id: artistPhone.artist_id,
          phone_number: from,
          status: 'pending',
          timezone,
          source: 'keyword',
        });
    }

    await supabaseAdmin.from('sms_consent_log').insert({
      phone_number: from,
      artist_id: artistPhone.artist_id,
      action: 'keyword_received',
      message_text: body,
    });

    // Get artist name for auto-reply
    const { data: artistProfile } = await supabaseAdmin
      .from('artist_profiles')
      .select('user_id')
      .eq('id', artistPhone.artist_id)
      .single();

    let artistName = 'this artist';
    if (artistProfile) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('display_name')
        .eq('id', artistProfile.user_id)
        .single();
      artistName = profile?.display_name || 'this artist';
    }

    const reply = (artistPhone.auto_reply || 'Reply YES to confirm. Msg&data rates apply. Reply STOP to cancel.')
      .replace('{artist_name}', artistName);

    return twiml(reply);
  }

  // Unknown message
  return twiml('Reply STOP to unsubscribe. Visit thecrwn.app/help for support.');
}

function twiml(message: string): NextResponse {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>${message ? `<Message>${escapeXml(message)}</Message>` : ''}</Response>`;
  return new NextResponse(xml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
