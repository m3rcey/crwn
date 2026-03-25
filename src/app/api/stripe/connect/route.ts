import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { recordActivationMilestone } from '@/lib/activationMilestones';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get artist profile owned by this user
    const { data: artist, error } = await supabase
      .from('artist_profiles')
      .select('id, slug, stripe_connect_id')
      .eq('user_id', user.id)
      .single();

    if (error || !artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    // If already has a Connect account, just create a new onboarding link
    let accountId = artist.stripe_connect_id;

    if (!accountId) {
      // Create Stripe Connect account
      const account = await stripe.accounts.create({
        type: 'express',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: 'individual',
        metadata: {
          artist_id: artist.id,
        },
      });

      accountId = account.id;

      // Save Stripe account ID
      await supabase
        .from('artist_profiles')
        .update({ stripe_connect_id: account.id })
        .eq('id', artist.id);

      // Record activation milestone
      recordActivationMilestone(artist.id, 'stripe_connected').catch(() => {});
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${process.env.NEXT_PUBLIC_BASE_URL}/profile/artist?stripe=refresh`,
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/profile/artist?stripe=success`,
      type: 'account_onboarding',
    });

    return NextResponse.redirect(accountLink.url);
  } catch (error) {
    console.error('Stripe Connect error:', error);
    return NextResponse.json(
      { error: 'Failed to create Stripe Connect account' },
      { status: 500 }
    );
  }
}
