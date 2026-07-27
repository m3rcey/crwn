import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkRateLimit } from '@/lib/rateLimit';
import { recordLmEvent } from '@/lib/leadMagnets/server';

// Public one-click unsubscribe for prospect-nurture emails. The opaque per-enrollment token IS the
// authorization (no session). Handles both the link click (GET) and RFC 8058 one-click (POST via
// the List-Unsubscribe-Post header). An unsubscribe becomes a GLOBAL suppression, so it overrides
// every marketing send platform-wide through the one isEmailSuppressed() gate.
//
// No enumeration: an unknown or already-used token returns the same friendly confirmation as a
// valid one. Middleware excludes /api/, so this route stands alone.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function unsubscribe(token: string, ip: string): Promise<void> {
  // Rate-limit by IP so the token space cannot be swept.
  const allowed = await checkRateLimit(`ip:${ip}`, 'prospect-unsub', 3600, 60);
  if (!allowed) return;

  const { data: enrollment } = await supabaseAdmin
    .from('prospect_nurture_enrollments')
    .select('id, email, status')
    .eq('unsub_token', token)
    .maybeSingle();

  if (!enrollment?.email) return; // unknown token: say nothing, do nothing.

  // Global suppression: every future marketing send to this address stops.
  await supabaseAdmin
    .from('email_suppressions')
    .upsert({ email: enrollment.email, reason: 'unsubscribe', source: 'prospect_nurture' }, { onConflict: 'email' });

  // Cancel this enrollment (and any other active one for the same email).
  await supabaseAdmin
    .from('prospect_nurture_enrollments')
    .update({ status: 'canceled', exit_reason: 'unsubscribed', next_send_at: null, updated_at: new Date().toISOString() })
    .eq('email', enrollment.email)
    .eq('status', 'active');

  await recordLmEvent(supabaseAdmin, 'prospect_nurture_unsubscribed', {});
}

function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
}

const CONFIRM_HTML = `<!doctype html><html><body style="margin:0;background:#0f0f0f;font-family:Inter,Arial,sans-serif;color:#e8e8ea;">
  <div style="max-width:520px;margin:0 auto;padding:64px 24px;text-align:center;">
    <div style="color:#D4AF37;font-size:14px;font-weight:700;letter-spacing:2px;">CRWN</div>
    <h1 style="font-size:22px;margin:24px 0 12px;">You are unsubscribed</h1>
    <p style="color:#8a8a9a;font-size:15px;line-height:1.6;">You will not get any more marketing emails from the CRWN app. If you change your mind, you can run any CRWN calculator again and ask for your result by email.</p>
  </div>
</body></html>`;

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  await unsubscribe(token, clientIp(req));
  return new NextResponse(CONFIRM_HTML, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  await unsubscribe(token, clientIp(req));
  return NextResponse.json({ ok: true });
}
