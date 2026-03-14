import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CASHOUT_FEE_CENTS = 200;

export async function POST(req: NextRequest) {
  try {
    const { artistId, userId } = await req.json();

    if (!artistId || !userId) {
      return NextResponse.json({ error: 'Missing artistId or userId' }, { status: 400 });
    }

    const { data: artist } = await supabaseAdmin
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('id', artistId)
      .eq('user_id', userId)
      .single();

    if (!artist?.stripe_connect_id) {
      return NextResponse.json({ error: 'No Stripe account connected' }, { status: 400 });
    }

    const balance = await stripe.balance.retrieve({
      stripeAccount: artist.stripe_connect_id,
    });

    const availableBalance = balance.available.reduce((sum, b) => sum + b.amount, 0);

    if (availableBalance <= CASHOUT_FEE_CENTS) {
      return NextResponse.json({
        error: `Insufficient balance. You need more than $2.00 to cash out. Current balance: $${(availableBalance / 100).toFixed(2)}`,
      }, { status: 400 });
    }

    const payoutAmount = availableBalance - CASHOUT_FEE_CENTS;

    const payout = await stripe.payouts.create(
      {
        amount: payoutAmount,
        currency: 'usd',
      },
      {
        stripeAccount: artist.stripe_connect_id,
      }
    );

    return NextResponse.json({
      success: true,
      payoutId: payout.id,
      amount: payoutAmount,
      fee: CASHOUT_FEE_CENTS,
      total: availableBalance,
    });
  } catch (err: unknown) {
    console.error('Cashout error:', err);
    const message = err instanceof Error ? err.message : 'Cashout failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
