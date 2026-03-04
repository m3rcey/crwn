import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Must be logged in' }, { status: 401 });
    }

    // Get artist's profile
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('platform_stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    if (!artist?.platform_stripe_customer_id) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
    }

    // Create portal session
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://crwn-mauve.vercel.app';
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: artist.platform_stripe_customer_id,
      return_url: `${baseUrl}/profile/artist`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error) {
    console.error('Platform portal error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to open portal' },
      { status: 500 }
    );
  }
}
