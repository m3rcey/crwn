import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  CRWN_PLATFORM,
  UNSUBSCRIBE_TOKEN_PARAM,
  emailRecipient,
  verifyUnsubscribeScope,
} from '@/lib/emails/unsubscribeToken';

// Public one-click unsubscribe for CRWN's own lifecycle and activation emails to artists.
//
// WHY THIS EXISTS: those 27 emails shipped with no unsubscribe link and, worse, the sending crons
// consulted `email_suppressions` not at all, so an artist who unsubscribed anywhere else on the
// platform kept receiving them. Four of the nine sequences (starter_upgrade_nudge,
// upgrade_abandoned, paid_at_risk, paid_churned) exist purely to sell a plan upgrade, which is
// commercial email, and the other five are unsolicited recurring follow-ups. The recipient cannot
// be expected to sort "service" from "marketing", so all nine carry the link.
//
// Mirrors /api/prospect-nurture/unsubscribe: handles the link click (GET) and RFC 8058 one-click
// (POST via List-Unsubscribe-Post), and an unsubscribe becomes a GLOBAL suppression so it stops
// every marketing send platform-wide through the one isEmailSuppressed() gate.
//
// Authorization is the SIGNATURE, not the row id. The enrollment id alone is not a capability here:
// it is a uuid that appears in admin surfaces, so a bare id would let anyone unsubscribe an artist
// they could name. This route is new, so there is no legacy unsigned link to honor and it can be
// strict from day one.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function unsubscribe(enrollmentId: string, token: string | null, ip: string): Promise<void> {
  const allowed = await checkRateLimit(`ip:${ip}`, 'platform-seq-unsub', 3600, 60);
  if (!allowed) return;

  const { data: enrollment } = await supabaseAdmin
    .from('platform_sequence_enrollments')
    .select('id, artist_user_id')
    .eq('id', enrollmentId)
    .maybeSingle();
  if (!enrollment?.artist_user_id) return; // unknown row: say nothing, do nothing.

  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(enrollment.artist_user_id);
  const email = authUser.user?.email;
  if (!email) return;

  // The signature covers the recipient, so a valid token for one artist cannot unsubscribe another.
  const ok = verifyUnsubscribeScope(
    { kind: 'platform-sequence', id: enrollmentId, artistId: CRWN_PLATFORM, recipient: emailRecipient(email) },
    token,
  );
  if (!ok) return;

  await supabaseAdmin
    .from('email_suppressions')
    .upsert({ email, reason: 'unsubscribe', source: 'platform_sequence' }, { onConflict: 'email' });

  // Stop every active platform sequence for this artist, not just the one they clicked from.
  await supabaseAdmin
    .from('platform_sequence_enrollments')
    .update({ status: 'canceled' })
    .eq('artist_user_id', enrollment.artist_user_id)
    .eq('status', 'active');
}

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

const CONFIRM_HTML = `<!doctype html><html><body style="margin:0;background:#0f0f0f;font-family:Inter,Arial,sans-serif;color:#e8e8ea;">
  <div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
    <div style="color:#D4AF37;font-size:14px;font-weight:700;letter-spacing:2px;">CRWN</div>
    <h1 style="font-size:22px;margin:24px 0 12px;">You are unsubscribed</h1>
    <p style="color:#8a8a9a;font-size:15px;line-height:1.6;">You will not get any more onboarding or upgrade emails from the CRWN app. Emails about your account, your payouts and your fans still send, because those are not marketing.</p>
    <p style="color:#5a5a6a;font-size:13px;line-height:1.6;margin-top:20px;">Changed your mind? Reply to any CRWN email and we will turn them back on.</p>
  </div>
</body></html>`;

export async function GET(req: NextRequest, ctx: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await ctx.params;
  await unsubscribe(enrollmentId, req.nextUrl.searchParams.get(UNSUBSCRIBE_TOKEN_PARAM), clientIp(req));
  return new NextResponse(CONFIRM_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ enrollmentId: string }> }) {
  const { enrollmentId } = await ctx.params;
  await unsubscribe(enrollmentId, req.nextUrl.searchParams.get(UNSUBSCRIBE_TOKEN_PARAM), clientIp(req));
  return NextResponse.json({ ok: true });
}
