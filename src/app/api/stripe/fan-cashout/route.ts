import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { fanId } = await req.json();
    const supabase = await createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_connect_id')
      .eq('id', fanId)
      .single();

    if (!profile?.stripe_connect_id) {
      return NextResponse.json({ error: 'Stripe not connected. Set up payouts first.' }, { status: 400 });
    }

    const { data: earnings } = await supabase
      .from('referral_earnings')
      .select('commission_amount')
      .eq('referrer_fan_id', fanId);

    const totalEarnings = (earnings || []).reduce((sum, e) => sum + (e.commission_amount || 0), 0);

    const { data: payouts } = await supabase
      .from('fan_payouts')
      .select('amount')
      .eq('fan_id', fanId)
      .eq('status', 'completed');

    const totalPaidOut = (payouts || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const availableBalance = totalEarnings - totalPaidOut;

    if (availableBalance < 2500) {
      return NextResponse.json({
        error: `Minimum cashout is $25.00. Your balance is $${(availableBalance / 100).toFixed(2)}.`
      }, { status: 400 });
    }

    const { data: payout, error: payoutError } = await supabase
      .from('fan_payouts')
      .insert({
        fan_id: fanId,
        amount: availableBalance,
        status: 'pending',
      })
      .select()
      .single();

    if (payoutError) throw payoutError;

    const transfer = await stripe.transfers.create({
      amount: availableBalance,
      currency: 'usd',
      destination: profile.stripe_connect_id,
      metadata: {
        fan_id: fanId,
        payout_id: payout.id,
        type: 'fan_referral_cashout',
      },
    });

    await supabase
      .from('fan_payouts')
      .update({
        stripe_transfer_id: transfer.id,
        status: 'completed',
      })
      .eq('id', payout.id);

    return NextResponse.json({
      success: true,
      amount: availableBalance,
      transferId: transfer.id,
    });
  } catch (error) {
    console.error('Fan cashout error:', error);
    return NextResponse.json({ error: 'Failed to process cashout' }, { status: 500 });
  }
}
