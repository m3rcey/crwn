import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const { artistId, artistSlug } = await req.json();

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get fan's subscription to find their Stripe customer ID
    const { data: subscription } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('fan_id', user.id)
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .single();

    if (!subscription?.stripe_customer_id) {
      return NextResponse.json({ error: 'No active subscription found' }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://thecrwn.app';

    // Create a billing portal session
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: `${baseUrl}/artist/${artistSlug}`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (error: any) {
    console.error('Fan portal error:', error);
    return NextResponse.json({ error: error.message || 'Failed to open portal' }, { status: 500 });
  }
}
