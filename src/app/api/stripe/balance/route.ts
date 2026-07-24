import { NextRequest, NextResponse } from 'next/server';
import { getConnectAccountByUserId } from '@/lib/stripe/connectAccount';
import Stripe from 'stripe';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'dummy-stripe-key-for-build');

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up the caller's own Connect account. Service-role, because SELECT on
    // stripe_connect_id is revoked from `authenticated`; the ownership check is
    // the user id, which the session above already proved.
    const connectAccountId = await getConnectAccountByUserId(user.id);

    if (!connectAccountId) {
      return NextResponse.json({ error: 'No Stripe account connected' }, { status: 400 });
    }

    const balance = await stripe.balance.retrieve({
      stripeAccount: connectAccountId,
    });

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
    const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0);

    return NextResponse.json({ available, pending });
  } catch (err: unknown) {
    console.error('Balance fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }
}
