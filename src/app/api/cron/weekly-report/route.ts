import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { weeklyArtistReportEmail } from '@/lib/emails/weeklyArtistReport';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all active artists with their profiles
    const { data: artists } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, slug, user_id, profile:profiles(display_name)')
      .eq('is_active', true);

    if (!artists || artists.length === 0) {
      return NextResponse.json({ message: 'No active artists' });
    }

    const now = new Date();
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - weekEnd.getDay()); // Last Sunday
    weekEnd.setHours(23, 59, 59, 999);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6); // Previous Monday
    weekStart.setHours(0, 0, 0, 0);
    const prevWeekEnd = new Date(weekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    prevWeekEnd.setHours(23, 59, 59, 999);
    const prevWeekStart = new Date(prevWeekEnd);
    prevWeekStart.setDate(prevWeekStart.getDate() - 6);
    prevWeekStart.setHours(0, 0, 0, 0);

    const results = [];

    for (const artist of artists) {
      try {
        // Get artist email
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(artist.user_id);
        if (!authUser?.user?.email) continue;

        // Revenue this week (subscriptions + purchases)
        const { data: thisWeekEarnings } = await supabaseAdmin
          .from('earnings')
          .select('amount')
          .eq('artist_id', artist.id)
          .gte('created_at', weekStart.toISOString())
          .lte('created_at', weekEnd.toISOString());

        const revenueThisWeek = (thisWeekEarnings || []).reduce((sum, e) => sum + (e.amount || 0), 0);

        // Revenue last week
        const { data: lastWeekEarnings } = await supabaseAdmin
          .from('earnings')
          .select('amount')
          .eq('artist_id', artist.id)
          .gte('created_at', prevWeekStart.toISOString())
          .lte('created_at', prevWeekEnd.toISOString());

        const revenueLastWeek = (lastWeekEarnings || []).reduce((sum, e) => sum + (e.amount || 0), 0);

        // New subscribers this week
        const { count: newSubs } = await supabaseAdmin
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artist.id)
          .eq('status', 'active')
          .gte('created_at', weekStart.toISOString());

        // Total active subscribers
        const { count: totalSubs } = await supabaseAdmin
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artist.id)
          .eq('status', 'active');

        // Plays this week
        const { data: playsData } = await supabaseAdmin
          .from('play_history')
          .select('track_id')
          .eq('artist_id', artist.id)
          .gte('created_at', weekStart.toISOString())
          .lte('created_at', weekEnd.toISOString());

        const playsThisWeek = playsData?.length || 0;

        // Top track this week
        const trackCounts: Record<string, number> = {};
        (playsData || []).forEach(p => {
          trackCounts[p.track_id] = (trackCounts[p.track_id] || 0) + 1;
        });

        let topTrack: string | null = null;
        let topTrackPlays = 0;
        const topTrackId = Object.entries(trackCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

        if (topTrackId) {
          const { data: track } = await supabaseAdmin
            .from('tracks')
            .select('title')
            .eq('id', topTrackId)
            .single();
          topTrack = track?.title || null;
          topTrackPlays = trackCounts[topTrackId];
        }

        const displayName = (artist.profile as any)?.display_name || 'Artist';
        const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        // Send email
        await resend.emails.send({
          from: process.env.FROM_EMAIL || 'CRWN <hello@thecrwn.app>',
          to: authUser.user.email,
          subject: `Your CRWN Weekly Report: ${formatDate(weekStart)} - ${formatDate(weekEnd)}`,
          html: weeklyArtistReportEmail({
            displayName,
            weekStart: formatDate(weekStart),
            weekEnd: formatDate(weekEnd),
            revenueThisWeek,
            revenueLastWeek,
            newSubscribers: newSubs || 0,
            totalSubscribers: totalSubs || 0,
            playsThisWeek,
            topTrack,
            topTrackPlays,
            slug: artist.slug || '',
          }),
        });

        results.push({ artist: displayName, status: 'sent' });
      } catch (err) {
        console.error(`Failed to send report for artist ${artist.id}:`, err);
        results.push({ artist: artist.id, status: 'failed', error: String(err) });
      }
    }

    return NextResponse.json({ sent: results.length, results });
  } catch (error) {
    console.error('Weekly report cron error:', error);
    return NextResponse.json({ error: 'Failed to send weekly reports' }, { status: 500 });
  }
}
