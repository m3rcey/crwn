import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const artistId = searchParams.get('artist_id');

    if (!artistId) {
      return NextResponse.json({ error: 'Artist ID required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();

    // Get artist profile
    const { data: artist, error } = await supabase
      .from('artist_profiles')
      .select('id, slug')
      .eq('id', artistId)
      .single();

    if (error || !artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

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

    // Save Stripe account ID
    await supabase
      .from('artist_profiles')
      .update({ stripe_connect_id: account.id })
      .eq('id', artist.id);

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
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
