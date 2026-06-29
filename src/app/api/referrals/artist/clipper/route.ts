import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sanitizeClipperSchedule } from '@/lib/clipperRate';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// Persist an artist's clipper rev-share settings: the standard (post-ramp) rate,
// the step-down schedule, and the campaign clock. The clipper cut is funded by the
// artist and capped at checkout (fee + cut <= 100%), so we clamp the standard rate
// to 0-100 here and let checkout apply the platform-fee headroom cap.
export async function POST(req: NextRequest) {
  const { artistId, standardRate, schedule, startCampaign } = await req.json();

  if (!artistId) {
    return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (standardRate !== undefined) {
    update.clipper_commission_rate = Math.min(100, Math.max(0, Math.round(Number(standardRate))));
  }

  if (schedule !== undefined) {
    update.clipper_rate_schedule = sanitizeClipperSchedule(schedule);
  }

  // startCampaign: true  -> (re)start the ramp clock from now
  // startCampaign: false -> stop the ramp (revert to flat standard rate)
  if (startCampaign === true) {
    update.clipper_campaign_started_at = new Date().toISOString();
  } else if (startCampaign === false) {
    update.clipper_campaign_started_at = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('artist_profiles')
    .update(update)
    .eq('id', artistId)
    .select('clipper_commission_rate, clipper_rate_schedule, clipper_campaign_started_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...data });
}
