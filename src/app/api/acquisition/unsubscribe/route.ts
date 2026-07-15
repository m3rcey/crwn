// One-click unsubscribe for acquisition (Instagram funnel) email.
//
// This is the CAN-SPAM opt-out for the nurture emails. It must work with NO session (she clicks
// from her inbox), so middleware excludes /api/ and this route's only authorization is the HMAC
// on the link (see lib/acquisition/unsubscribe.ts). A valid link adds the address to the GLOBAL
// email_suppressions list, which channels.ts already checks before every acquisition send, so
// one write stops all future email to her. Same list the bounce/complaint webhook writes; one
// suppression list honored everywhere is the whole design.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyUnsubscribe } from '@/lib/acquisition/unsubscribe';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function suppress(emailRaw: string, sig: string): Promise<boolean> {
  const email = (emailRaw || '').trim().toLowerCase();
  if (!verifyUnsubscribe(email, sig)) return false;

  // The SAME global list channels.ts checks before every send. onConflict:'email' mirrors the
  // Resend bounce/complaint webhook exactly, so a repeat click is a no-op, not a duplicate row.
  await supabaseAdmin
    .from('email_suppressions')
    .upsert({ email, reason: 'unsubscribe', source: 'acquisition_email' }, { onConflict: 'email' });

  // Belt and braces: also drop email consent on any lead identity with this address, so the
  // per-channel consent gate in channels.ts refuses email even before the suppression lookup.
  await supabaseAdmin.from('lead_identities').update({ consent_email: false }).eq('email', email);

  return true;
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('e') ?? '';
  const sig = req.nextUrl.searchParams.get('t') ?? '';
  const ok = await suppress(email, sig);
  return new NextResponse(page(ok), {
    status: ok ? 200 : 400,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// RFC 8058 one-click. Mail clients POST here directly from the List-Unsubscribe-Post header,
// with no human click, which is what earns the native "Unsubscribe" button in Gmail/Apple Mail.
export async function POST(req: NextRequest) {
  const email = req.nextUrl.searchParams.get('e') ?? '';
  const sig = req.nextUrl.searchParams.get('t') ?? '';
  const ok = await suppress(email, sig);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}

function page(ok: boolean): string {
  const heading = ok ? 'You are unsubscribed' : 'This link is not valid';
  const body = ok
    ? 'You will not get any more emails from the CRWN artist funnel. If this was a mistake, just reply to any earlier email and we will sort it out.'
    : 'This unsubscribe link is malformed or has expired. If you keep getting emails, reply to one and we will remove you by hand.';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${heading}</title></head>
  <body style="margin:0;background:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:460px;margin:0 auto;padding:64px 20px;text-align:center;">
      <h1 style="color:#D4AF37;font-size:28px;font-weight:bold;margin:0 0 24px;">CRWN</h1>
      <div style="background:#1A1A1A;border:1px solid #333;border-radius:12px;padding:32px;">
        <h2 style="color:#FFF;font-size:20px;margin:0 0 16px;">${heading}</h2>
        <p style="color:#B0B0B0;font-size:15px;line-height:1.6;margin:0;">${body}</p>
      </div>
    </div>
  </body></html>`;
}
