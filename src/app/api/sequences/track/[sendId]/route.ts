import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveTrackedLink, leavingCrwnPage } from '@/lib/safeRedirect';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// 1x1 transparent PNG pixel
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sendId: string }> }
) {
  const { sendId } = await params;
  const url = req.nextUrl.searchParams.get('url');
  const isPixel = req.nextUrl.searchParams.get('pixel');

  if (isPixel) {
    // Tracking pixel — record open
    await supabaseAdmin
      .from('sequence_sends')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', sendId)
      .is('opened_at', null); // Only update first open

    return new NextResponse(PIXEL, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  if (url) {
    // Click tracking — record click and redirect
    await supabaseAdmin
      .from('sequence_sends')
      .update({ status: 'clicked', clicked_at: new Date().toISOString() })
      .eq('id', sendId)
      .is('clicked_at', null); // Only update first click

    // Also mark as opened if not already
    await supabaseAdmin
      .from('sequence_sends')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', sendId)
      .is('opened_at', null);

    // SEC-016: this redirected to a raw `?url=` value, which made CRWN's own
    // domain an open redirect for phishing. resolveTrackedLink refuses hostile
    // schemes outright, passes CRWN and CRWN-signed destinations straight
    // through, and gives an unsigned external destination an interstitial that
    // names where it leads rather than a silent hop through a trusted host.
    const decision = resolveTrackedLink(url, req.nextUrl.searchParams.get('sig'));
    if (decision.action === 'redirect') {
      return NextResponse.redirect(decision.url, 302);
    }
    return new NextResponse(leavingCrwnPage(decision.url), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  return NextResponse.json({ error: 'Bad request' }, { status: 400 });
}
