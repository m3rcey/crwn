import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordActivationMilestone, ActivationMilestone } from '@/lib/activationMilestones';

const VALID_MILESTONES: ActivationMilestone[] = [
  'onboarding_completed',
  'first_track_uploaded',
  'tiers_created',
  'stripe_connected',
  'first_subscriber',
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
  } catch {
    return NextResponse.json({ ok: true }); // Silent fail — tracking should never break the app
  }
}
