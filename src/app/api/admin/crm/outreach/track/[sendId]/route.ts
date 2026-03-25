import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// 1x1 transparent PNG
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sendId: string }> }
) {
  const { sendId } = await params;
  const url = req.nextUrl.searchParams.get('url');
  const isPixel = req.nextUrl.searchParams.has('pixel');

  if (isPixel) {
    // Track open
    await supabaseAdmin
      .from('crm_outreach_sends')
      .update({ status: 'opened', opened_at: new Date().toISOString() })
      .eq('id', sendId)
      .in('status', ['sent', 'opened']);

    return new NextResponse(PIXEL, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  }

  if (url) {
    // Track click
    await supabaseAdmin
      .from('crm_outreach_sends')
      .update({ status: 'clicked', clicked_at: new Date().toISOString() })
      .eq('id', sendId);

    return NextResponse.redirect(url);
  }

  return NextResponse.redirect('https://thecrwn.app');
}
