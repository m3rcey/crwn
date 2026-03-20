import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up the user's Connect account from their artist profile
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('user_id', user.id)
      .single();

    if (!artist?.stripe_connect_id) {
      return NextResponse.json({ error: 'No Stripe account connected' }, { status: 400 });
    }

    const balance = await stripe.balance.retrieve({
      stripeAccount: artist.stripe_connect_id,
    });

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
    const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0);

    return NextResponse.json({ available, pending });
  } catch (err: unknown) {
    console.error('Balance fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }
}
