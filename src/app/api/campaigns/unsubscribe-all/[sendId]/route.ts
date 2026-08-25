import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  ALL_ARTISTS,
  ALLOW_UNSIGNED_LEGACY_LINKS,
  UNSUBSCRIBE_TOKEN_PARAM,
  contactRecipient,
  fanRecipient,
  signUnsubscribeScope,
  verifyUnsubscribeScope,
  type UnsubscribeScope,
} from '@/lib/emails/unsubscribeToken';

// Unsubscribe from EVERY artist's marketing on CRWN. The widest blast radius on the platform,
// and it used to fire from a bare GET on a row id.
//
// GET RENDERS, POST MUTATES, and the POST carries an HMAC bound to this recipient and to the
// 'campaign-all' scope. A token minted for the per-artist link cannot be replayed here, and a
// prefetching mail client or URL scanner that fetches the link changes nothing.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const HTML = { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' };

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

interface Resolved {
  scope: UnsubscribeScope;
  fanId: string | null;
  email: string | null;
  campaignId: string | null;
}

/**
 * Resolve the send. campaignEmail renders this link into artist SEQUENCE mail too, using a
 * sequence_sends id, so a campaign_sends miss falls back to sequence_sends. Without that fallback
 * every "Unsubscribe from all" in a sequence email answered "Invalid link", which is the exact
 * compliance failure the signing work is meant to protect.
 */
async function resolve(sendId: string): Promise<Resolved | null> {
  // contact_id exists only after the fan-invites migration, so a miss retries without it and
  // pre-migration rows keep resolving. Same graceful shape as the per-artist route.
  let send: { fan_id: string | null; contact_id?: string | null; email: string | null; campaign_id: string | null } | null = null;
  const withContact = await supabaseAdmin
    .from('campaign_sends')
    .select('fan_id, contact_id, email, campaign_id')
    .eq('id', sendId)
    .maybeSingle();
  if (!withContact.error) {
    send = withContact.data;
  } else {
    const legacy = await supabaseAdmin
      .from('campaign_sends')
      .select('fan_id, email, campaign_id')
      .eq('id', sendId)
      .maybeSingle();
    send = legacy.data;
  }

  let fanId: string | null = null;
  let contactId: string | null = null;
  let email: string | null = null;
  let campaignId: string | null = null;

  if (send) {
    fanId = send.fan_id || null;
    contactId = send.contact_id || null;
    email = send.email || null;
    campaignId = send.campaign_id || null;
  } else {
    const { data: seq } = await supabaseAdmin
      .from('sequence_sends')
      .select('fan_id, email, sequence_id')
      .eq('id', sendId)
      .maybeSingle();
    if (!seq) return null;
    fanId = seq.fan_id || null;
    email = seq.email || null;
    campaignId = seq.sequence_id || null;
  }

  return {
    fanId,
    email,
    campaignId,
    scope: {
      kind: 'campaign-all',
      id: sendId,
      artistId: ALL_ARTISTS,
      // An imported contact is identified by contact_id, exactly as the per-artist route derives
      // it. The two routes MUST agree: campaignEmail signs both links from one recipient, so a
      // route that derived the address here while the other derived the id would refuse every
      // signed "unsubscribe from all" a contact ever clicked. Falls back to the address for a
      // sequence_sends row (which carries no contact_id) and for pre-migration rows.
      recipient: fanId ? fanRecipient(fanId) : contactRecipient(contactId || email),
    },
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ sendId: string }> }) {
  const { sendId } = await params;

  if (!(await checkRateLimit(`ip:${clientIp(req)}`, 'unsubscribe-view', 60, 30))) {
    return new NextResponse(page('Too many requests. Please try again in a minute.', 'error'), { status: 429, headers: HTML });
  }

  const resolved = await resolve(sendId);
  if (!resolved) return new NextResponse(page('Invalid link', 'error'), { headers: HTML });

  const presented = req.nextUrl.searchParams.get(UNSUBSCRIBE_TOKEN_PARAM);
  if (presented && !verifyUnsubscribeScope(resolved.scope, presented)) {
    return new NextResponse(page('This unsubscribe link is not valid.', 'error'), { status: 403, headers: HTML });
  }
  if (!presented && !ALLOW_UNSIGNED_LEGACY_LINKS) {
    return new NextResponse(page('This unsubscribe link is not valid.', 'error'), { status: 403, headers: HTML });
  }

  return new NextResponse(
    page('Stop receiving marketing emails from every artist on CRWN?', 'confirm', signUnsubscribeScope(resolved.scope)),
    { headers: HTML }
  );
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ sendId: string }> }) {
  const { sendId } = await params;

  if (!(await checkRateLimit(`ip:${clientIp(req)}`, 'unsubscribe-confirm', 60, 15))) {
    return new NextResponse(page('Too many requests. Please try again in a minute.', 'error'), { status: 429, headers: HTML });
  }

  const resolved = await resolve(sendId);
  if (!resolved) return new NextResponse(page('Invalid link', 'error'), { headers: HTML });

  const form = await req.formData().catch(() => null);
  const token =
    (form?.get(UNSUBSCRIBE_TOKEN_PARAM) as string | null) ||
    req.nextUrl.searchParams.get(UNSUBSCRIBE_TOKEN_PARAM);
  if (!verifyUnsubscribeScope(resolved.scope, token)) {
    return new NextResponse(page('This unsubscribe link is not valid.', 'error'), { status: 403, headers: HTML });
  }

  const fanId = resolved.fanId;

  // A lead with no account: their consent lives on fan_contacts, one row per artist. Clearing
  // every row that carries this address IS "all artists" for them, and it is the same column the
  // contact audience filters on, so it really suppresses.
  if (!fanId) {
    if (!resolved.email) {
      return new NextResponse(page('Invalid link', 'error'), { headers: HTML });
    }
    const { error: contactErr } = await supabaseAdmin
      .from('fan_contacts')
      .update({ is_subscribed_email: false })
      .eq('email', resolved.email.toLowerCase());
    if (contactErr) {
      return new NextResponse(page('Something went wrong. Please try again.', 'error'), { headers: HTML });
    }
    return new NextResponse(page("You've been unsubscribed from all marketing on CRWN.", 'done'), { headers: HTML });
  }

  // Gather all artist relationships for this fan
  const [{ data: subs }, { data: earnings }, { data: smsSubs }] = await Promise.all([
    supabaseAdmin.from('subscriptions').select('artist_id').eq('fan_id', fanId),
    supabaseAdmin.from('earnings').select('artist_id').eq('fan_id', fanId),
    supabaseAdmin.from('sms_subscribers').select('artist_id').eq('fan_id', fanId).eq('status', 'active'),
  ]);

  const artistIds = new Set<string>();
  (subs || []).forEach(s => artistIds.add(s.artist_id));
  (earnings || []).forEach(e => artistIds.add(e.artist_id));
  (smsSubs || []).forEach(s => artistIds.add(s.artist_id));

  if (artistIds.size === 0) {
    return new NextResponse(page("You've been unsubscribed from all marketing.", 'done'), { headers: HTML });
  }

  // Opt out of email + SMS marketing for every artist
  const upserts = Array.from(artistIds).map(artist_id => ({
    fan_id: fanId,
    artist_id,
    email_marketing: false,
    sms_marketing: false,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabaseAdmin
    .from('fan_communication_prefs')
    .upsert(upserts, { onConflict: 'fan_id,artist_id' });

  if (error) {
    return new NextResponse(page('Something went wrong. Please try again.', 'error'), { headers: HTML });
  }

  await supabaseAdmin
    .from('unsubscribe_events')
    .insert({
      fan_id: fanId,
      artist_id: null, // global unsubscribe, not artist-specific
      source_type: 'campaign',
      source_id: resolved.campaignId,
      campaign_send_id: sendId,
      scope: 'global',
    });

  // Unsubscribe all active SMS subscriptions
  await supabaseAdmin
    .from('sms_subscribers')
    .update({ status: 'unsubscribed', opted_out_at: new Date().toISOString() })
    .eq('fan_id', fanId)
    .eq('status', 'active');

  return new NextResponse(page("You've been unsubscribed from all marketing on CRWN.", 'done'), { headers: HTML });
}

function page(message: string, kind: 'confirm' | 'done' | 'error', token?: string): string {
  const confirmForm = kind === 'confirm'
    ? `<form method="post" style="margin:20px 0 0;">
        <input type="hidden" name="${UNSUBSCRIBE_TOKEN_PARAM}" value="${token || ''}">
        <button type="submit" style="background-color:#D4AF37;color:#0D0D0D;border:0;border-radius:999px;padding:14px 28px;font-size:16px;font-weight:600;cursor:pointer;width:100%;">Unsubscribe from all</button>
      </form>`
    : '';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Unsubscribe All - CRWN</title>
</head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px 20px;max-width:400px;">
    <h1 style="color:#D4AF37;font-size:32px;margin:0 0 24px;">CRWN</h1>
    <div style="background-color:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #333;">
      <p style="color:${kind === 'error' ? '#ef4444' : '#FFFFFF'};font-size:16px;line-height:1.6;margin:0 0 16px;">
        ${message}
      </p>
      ${kind === 'done' ? '<p style="color:#A0A0A0;font-size:14px;margin:0;">You will still receive transactional emails (receipts, subscription confirmations). You can re-enable marketing from your profile settings.</p>' : ''}
      ${confirmForm}
    </div>
    <p style="color:#666;font-size:12px;margin:24px 0 0;">
      <a href="https://thecrwn.app" style="color:#D4AF37;text-decoration:none;">Back to CRWN</a>
    </p>
  </div>
</body>
</html>`;
}
