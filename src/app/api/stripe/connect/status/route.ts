import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordActivationMilestone } from '@/lib/activationMilestones';

// Returns the artist's real Stripe Connect status (charges_enabled), and records the
// `stripe_connected` activation milestone ONLY when the account can actually take money.
// This replaces the old behaviour of marking "connected" the instant the account object
// was created — which falsely activated artists who abandoned Stripe's onboarding and left
// the tier form unlocked on accounts that cannot receive a payment.
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id, stripe_connect_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!artist?.stripe_connect_id) {
      return NextResponse.json({ connected: false, chargesEnabled: false, detailsSubmitted: false });
    }

    // Platform retrieves the Express account it owns by id (no stripeAccount param).
    const account = await stripe.accounts.retrieve(artist.stripe_connect_id);
    const chargesEnabled = !!account.charges_enabled;
    const detailsSubmitted = !!account.details_submitted;

    // Only a charges-enabled account is a real, monetizable connection.
    if (chargesEnabled) {
      recordActivationMilestone(artist.id, 'stripe_connected').catch(() => {});
    }

    return NextResponse.json({
      connected: chargesEnabled,
      chargesEnabled,
      detailsSubmitted,
    });
  } catch (error) {
    console.error('Stripe connect status error:', error);
    return NextResponse.json(
      { connected: false, chargesEnabled: false, detailsSubmitted: false, error: 'status_check_failed' },
      { status: 200 }
    );
  }
}
