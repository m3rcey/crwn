import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordActivationMilestone, ActivationMilestone } from '@/lib/activationMilestones';

// The CANONICAL activation-milestone self-service endpoint (F-16). This route is artist
// self-service — the session user marks THEIR OWN milestone — and used to live at
// /api/admin/milestone, where any future "lock down everything under /api/admin" sweep would
// have silently broken onboarding tracking. /api/admin/milestone remains as a thin
// compatibility wrapper for deployed clients and cached PWAs; new code calls this path.
//
// These client-fired writes are an OPTIMIZATION SIGNAL, not the only truth path: the daily
// activation-nudges cron reconciles milestone truth from canonical rows (milestoneReconcile,
// F-04), so a lost browser write is now a one-day delay, not a permanent silence.

const VALID_MILESTONES: ActivationMilestone[] = [
  'onboarding_completed',
  'first_track_uploaded',
  'tiers_created',
  'stripe_connected',
  'first_subscriber',
  'first_project_created',
];

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { milestone } = await req.json();
    if (!milestone || !VALID_MILESTONES.includes(milestone)) {
      return NextResponse.json({ error: 'Invalid milestone' }, { status: 400 });
    }

    // Look up artist profile for this user
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    await recordActivationMilestone(artist.id, milestone);

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Fail soft for the artist (tracking must never break onboarding), but OBSERVABLE for
    // CRWN: the old fully-silent catch is how lost milestone writes went unnoticed (F-04).
    console.error('[artist/milestone] milestone write failed:', err);
    return NextResponse.json({ ok: true });
  }
}
