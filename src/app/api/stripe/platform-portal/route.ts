import { NextRequest, NextResponse } from 'next/server';
import { getPlatformCustomerId } from '@/lib/stripe/connectAccount';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Must be logged in' }, { status: 401 });
    }

    // Service-role read: SELECT on platform_stripe_customer_id is revoked from
    // `authenticated`, so naming it in a session query 42501s and this route
    // answered "No billing account found" to every paying artist. The session
    // above is what proves the caller owns this customer.
    const customerId = await getPlatformCustomerId(user.id);

    if (!customerId) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 400 });
    }

    // Create portal session
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://thecrwn.app';
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
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
