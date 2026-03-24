import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
      .from('campaign_sends')
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
      .from('campaign_sends')
      .update({ status: 'clicked', clicked_at: new Date().toISOString() })
      .eq('id', sendId)
      .is('clicked_at', null); // Only update first click

    // Also mark as opened if not already
    await supabaseAdmin
      .from('campaign_sends')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', sendId)
      .is('opened_at', null);

    return NextResponse.redirect(url, 302);
  }

  return NextResponse.json({ error: 'Bad request' }, { status: 400 });
}
