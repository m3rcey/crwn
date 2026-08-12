import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  ALLOW_UNSIGNED_LEGACY_LINKS,
  UNSUBSCRIBE_TOKEN_PARAM,
  contactRecipient,
  fanRecipient,
  signUnsubscribeScope,
  verifyUnsubscribeScope,
  type UnsubscribeScope,
} from '@/lib/emails/unsubscribeToken';

// Unsubscribe from ONE artist's marketing email.
//
// GET RENDERS, POST MUTATES. A GET that changed a preference was silently triggered by mail
// prefetchers, antivirus URL scanners and corporate link-rewriters, which fetch every link in a
// message before a human sees it. The GET now only shows a confirm button, so a machine fetching
// the link changes nothing and a person still opts out in one click.
//
// The POST carries an HMAC (src/lib/emails/unsubscribeToken.ts) bound to this row's recipient and
// list, so a cross-site POST cannot forge it and a signed link cannot be edited onto another
// scope. Still no login, ever: requiring a session to unsubscribe is a compliance failure.

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
  contactId: string | null;
  artistId: string;
  campaignId: string;
}

/**
 * Look the send up and derive the scope FROM THE ROW. The signature is checked against this,
 * never against anything the caller supplied, which is what makes a token unportable.
 */
async function resolve(sendId: string): Promise<Resolved | null> {
  // contact_id exists only after the fan-invites migration; retry without it so pre-migration
  // unsubscribes keep working unchanged.
  let send: { fan_id: string | null; contact_id?: string | null; campaign_id: string } | null = null;
  const withContact = await supabaseAdmin
    .from('campaign_sends')
    .select('fan_id, contact_id, campaign_id')
    .eq('id', sendId)
    .single();
  if (!withContact.error) {
    send = withContact.data;
  } else {
    const legacy = await supabaseAdmin
      .from('campaign_sends')
      .select('fan_id, campaign_id')
      .eq('id', sendId)
      .single();
    send = legacy.data;
  }
  if (!send) return null;

  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('artist_id')
    .eq('id', send.campaign_id)
    .single();
  if (!campaign) return null;

  const fanId = send.fan_id || null;
  const contactId = send.contact_id || null;
  return {
    fanId,
    contactId,
    artistId: campaign.artist_id,
    campaignId: send.campaign_id,
    scope: {
      kind: 'campaign-artist',
      id: sendId,
      artistId: campaign.artist_id,
      recipient: !fanId && contactId ? contactRecipient(contactId) : fanRecipient(fanId),
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
  // A token that is present but wrong means the link was edited. Refuse rather than mint a fresh
  // one, or tampering would be free. A link with NO token is a legacy send: see the flag.
  if (presented && !verifyUnsubscribeScope(resolved.scope, presented)) {
    return new NextResponse(page('This unsubscribe link is not valid.', 'error'), { status: 403, headers: HTML });
  }
  if (!presented && !ALLOW_UNSIGNED_LEGACY_LINKS) {
    return new NextResponse(page('This unsubscribe link is not valid.', 'error'), { status: 403, headers: HTML });
  }

  return new NextResponse(
    page('Stop receiving marketing emails from this artist?', 'confirm', signUnsubscribeScope(resolved.scope)),
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

  // Form body first, query string second (RFC 8058 one-click posts to the URL, not a form).
  const form = await req.formData().catch(() => null);
  const token =
    (form?.get(UNSUBSCRIBE_TOKEN_PARAM) as string | null) ||
    req.nextUrl.searchParams.get(UNSUBSCRIBE_TOKEN_PARAM);
  if (!verifyUnsubscribeScope(resolved.scope, token)) {
    return new NextResponse(page('This unsubscribe link is not valid.', 'error'), { status: 403, headers: HTML });
  }

  // An imported-contact send: the opt-out lives on the contact row itself, and it gates every
  // future contact invite for this artist. No fan_communication_prefs row exists for a lead.
  if (!resolved.fanId && resolved.contactId) {
    const { error: contactErr } = await supabaseAdmin
      .from('fan_contacts')
      .update({ is_subscribed_email: false })
      .eq('id', resolved.contactId)
      .eq('artist_id', resolved.artistId);

    if (contactErr) {
      return new NextResponse(page('Something went wrong. Please try again.', 'error'), { headers: HTML });
    }

    return new NextResponse(page("You've been unsubscribed from this artist's emails.", 'done'), { headers: HTML });
  }

  // Upsert fan_communication_prefs to opt out of email marketing
  const { error } = await supabaseAdmin
    .from('fan_communication_prefs')
    .upsert(
      {
        fan_id: resolved.fanId,
        artist_id: resolved.artistId,
        email_marketing: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'fan_id,artist_id' }
    );

  if (error) {
    return new NextResponse(page('Something went wrong. Please try again.', 'error'), { headers: HTML });
  }

  // Log unsubscribe event for attribution
  await supabaseAdmin
    .from('unsubscribe_events')
    .insert({
      fan_id: resolved.fanId,
      artist_id: resolved.artistId,
      source_type: 'campaign',
      source_id: resolved.campaignId,
      campaign_send_id: sendId,
      scope: 'artist',
    });

  return new NextResponse(page("You've been unsubscribed from marketing emails.", 'done'), { headers: HTML });
}

function page(message: string, kind: 'confirm' | 'done' | 'error', token?: string): string {
  const confirmForm = kind === 'confirm'
    ? `<form method="post" style="margin:20px 0 0;">
        <input type="hidden" name="${UNSUBSCRIBE_TOKEN_PARAM}" value="${token || ''}">
        <button type="submit" style="background-color:#D4AF37;color:#0D0D0D;border:0;border-radius:999px;padding:14px 28px;font-size:16px;font-weight:600;cursor:pointer;width:100%;">Unsubscribe</button>
      </form>`
    : '';
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>Unsubscribe - CRWN</title>
</head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;">
  <div style="text-align:center;padding:40px 20px;max-width:400px;">
    <h1 style="color:#D4AF37;font-size:32px;margin:0 0 24px;">CRWN</h1>
    <div style="background-color:#1A1A1A;border-radius:16px;padding:32px;border:1px solid #333;">
      <p style="color:${kind === 'error' ? '#ef4444' : '#FFFFFF'};font-size:16px;line-height:1.6;margin:0 0 16px;">
        ${message}
      </p>
      ${kind === 'done' ? '<p style="color:#A0A0A0;font-size:14px;margin:0;">You will still receive transactional emails (receipts, subscription confirmations).</p>' : ''}
      ${confirmForm}
    </div>
    <p style="color:#666;font-size:12px;margin:24px 0 0;">
      <a href="https://thecrwn.app" style="color:#D4AF37;text-decoration:none;">Back to CRWN</a>
    </p>
  </div>
</body>
</html>`;
}
