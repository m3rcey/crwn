import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { fanId } = await req.json();
    const supabase = await createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_connect_id, display_name')
      .eq('id', fanId)
      .single();

    if (profile?.stripe_connect_id) {
      const loginLink = await stripe.accounts.createLoginLink(profile.stripe_connect_id);
      return NextResponse.json({ url: loginLink.url });
    }

    const { data: { user } } = await supabase.auth.admin.getUserById(fanId);
    if (!user?.email) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        fan_id: fanId,
        type: 'fan',
      },
    });

    await supabase
      .from('profiles')
      .update({ stripe_connect_id: account.id })
      .eq('id', fanId);

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.NEXT_PUBLIC_BASE_URL}/library?tab=referrals&stripe=refresh`,
      return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/library?tab=referrals&stripe=success`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ url: accountLink.url });
  } catch (error) {
    console.error('Fan connect error:', error);
    return NextResponse.json({ error: 'Failed to set up payouts' }, { status: 500 });
  }
}
