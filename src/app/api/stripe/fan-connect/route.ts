import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_connect_id, display_name')
      .eq('id', user.id)
      .single();

    if (profile?.stripe_connect_id) {
      const loginLink = await stripe.accounts.createLoginLink(profile.stripe_connect_id);
      return NextResponse.json({ url: loginLink.url });
    }

    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email,
      capabilities: {
        transfers: { requested: true },
      },
      metadata: {
        fan_id: user.id,
        type: 'fan',
      },
    });

    // RLS blocks users from writing stripe_connect_id directly, so use admin client
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ stripe_connect_id: account.id })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to save stripe_connect_id:', updateError);
      return NextResponse.json({ error: 'Failed to link Stripe account. Please try again.' }, { status: 500 });
    }

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
