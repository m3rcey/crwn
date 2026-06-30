import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

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

      // RLS blocks users from writing stripe_connect_id directly, so use admin client
      const { error: updateError } = await supabaseAdmin
        .from('artist_profiles')
        .update({ stripe_connect_id: account.id })
        .eq('id', artist.id);

      if (updateError) {
        console.error('Failed to save stripe_connect_id:', updateError);
        return NextResponse.json(
          { error: 'Failed to link Stripe account. Please try again.' },
          { status: 500 }
        );
      }

      // NOTE: do NOT record the `stripe_connected` milestone here. The account object
      // exists but the artist has not completed Stripe's onboarding yet (no charges_enabled).
      // The milestone is recorded by /api/stripe/connect/status once charges_enabled is true.
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
