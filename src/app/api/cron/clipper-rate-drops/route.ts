import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolveClipperRateTimeline, capTimeline } from '@/lib/clipperRate';
import { clipperRateChangeEmail } from '@/lib/emails/clipperRateChange';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// How many days before a drop to warn clippers.
const WARN_WINDOW_DAYS = 3;
const MS_PER_DAY = 86_400_000;

// Daily: warn each artist's clippers ahead of an upcoming cut decrease so nobody
// is caught off guard. Fires once per (artist, drop date) via cron_run_log lock.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();

  // Artists currently running a clipper ramp.
  const { data: artists } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id, platform_tier, clipper_commission_rate, clipper_rate_schedule, clipper_campaign_started_at')
    .not('clipper_campaign_started_at', 'is', null);

  if (!artists || artists.length === 0) {
    return NextResponse.json({ message: 'No active clipper ramps' });
  }

  let warned = 0;
  const results: { artistId: string; status: string; drop?: string }[] = [];

  for (const artist of artists) {
    // Cap to PAID rates so we warn with real numbers and skip drops the cap flattens.
    const timeline = capTimeline(
      resolveClipperRateTimeline({
        schedule: artist.clipper_rate_schedule,
        campaignStartedAt: artist.clipper_campaign_started_at,
        standardRate: artist.clipper_commission_rate || 0,
        now,
      }),
      artist.platform_tier
    );

    // Only warn for an actual DECREASE inside the warning window.
    const drop = timeline.changes.find((c) => {
      if (c.to >= c.from) return false;
      const daysUntil = Math.ceil((new Date(c.date).getTime() - now.getTime()) / MS_PER_DAY);
      return daysUntil >= 0 && daysUntil <= WARN_WINDOW_DAYS;
    });
    if (!drop) continue;

    // Idempotency: one heads-up per artist per drop date.
    const dropKey = drop.date.slice(0, 10);
    const periodKey = `${artist.id}:${dropKey}`;
    const { error: lockError } = await supabaseAdmin
      .from('cron_run_log')
      .insert({ job_name: 'clipper-rate-drops', period_key: periodKey });
    if (lockError) {
      results.push({ artistId: artist.id, status: 'already-warned', drop: dropKey });
      continue;
    }

    // Who to warn: every fan who has clipped for this artist.
    const { data: refs } = await supabaseAdmin
      .from('referrals')
      .select('referrer_fan_id')
      .eq('artist_id', artist.id)
      .eq('source', 'clipper');
    const clipperIds = [...new Set((refs || []).map((r) => r.referrer_fan_id))];
    if (clipperIds.length === 0) {
      results.push({ artistId: artist.id, status: 'no-clippers', drop: dropKey });
      continue;
    }

    // Artist display name (lives on profiles, keyed by artist_profiles.user_id).
    const { data: artistProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', artist.user_id)
      .single();
    const artistName = artistProfile?.display_name || 'an artist';

    const daysUntil = Math.max(0, Math.ceil((new Date(drop.date).getTime() - now.getTime()) / MS_PER_DAY));
    const changeDateLabel = new Date(drop.date).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

    for (const fanId of clipperIds) {
      await supabaseAdmin.from('notifications').insert({
        user_id: fanId,
        type: 'clipper_rate_change',
        title: `Your ${artistName} clipper cut drops soon`,
        message: `${daysUntil <= 0 ? 'Today' : `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`} your cut on new subscribers goes from ${drop.from}% to ${drop.to}%. Subs you already brought in keep their rate.`,
        link: '/library?tab=referrals',
      });

      try {
        const { resend, FROM_EMAIL } = await import('@/lib/resend');
        const email = (await supabaseAdmin.auth.admin.getUserById(fanId)).data?.user?.email;
        if (email) {
          const { data: fanProfile } = await supabaseAdmin
            .from('profiles')
            .select('display_name')
            .eq('id', fanId)
            .single();
          const firstName = (fanProfile?.display_name || '').split(' ')[0] || 'there';
          const content = clipperRateChangeEmail({
            fanName: firstName,
            artistName,
            fromRate: drop.from,
            toRate: drop.to,
            daysUntil,
            changeDateLabel,
          });
          await resend.emails.send({ from: FROM_EMAIL, to: email, subject: content.subject, html: content.html });
        }
      } catch (emailErr) {
        console.error('Clipper rate-change email failed:', emailErr);
      }
      warned++;
    }

    results.push({ artistId: artist.id, status: 'warned', drop: dropKey });
  }

  return NextResponse.json({ message: `Warned ${warned} clipper(s)`, results });
}
