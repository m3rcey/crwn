import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: NextRequest) {
  try {
    const { accountId } = await req.json();
    if (!accountId) {
      return NextResponse.json({ error: 'Missing accountId' }, { status: 400 });
    }

    const balance = await stripe.balance.retrieve({
      stripeAccount: accountId,
    });

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
    const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0);

    return NextResponse.json({ available, pending });
  } catch (err: unknown) {
    console.error('Balance fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch balance' }, { status: 500 });
  }
}
