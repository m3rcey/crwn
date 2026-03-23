import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Monthly reset cron — runs 1st of every month.
 * Resets monthly_receive_count on sms_subscribers and monthly_send_count on artist_phone_numbers.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Reset fan monthly receive counts
  const { data: subsData } = await supabaseAdmin
    .from('sms_subscribers')
    .update({ monthly_receive_count: 0 })
    .gt('monthly_receive_count', 0)
    .select('id');

  // Reset artist monthly send counts
  const { data: artistsData } = await supabaseAdmin
    .from('artist_phone_numbers')
    .update({ monthly_send_count: 0 })
    .gt('monthly_send_count', 0)
    .select('id');

  const subsReset = subsData?.length || 0;
  const artistsReset = artistsData?.length || 0;

  return NextResponse.json({
    success: true,
    subscribersReset: subsReset || 0,
    artistsReset: artistsReset || 0,
  });
}
