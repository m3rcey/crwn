import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check artist profile first, then fan profile for Connect account
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let accountId = artist?.stripe_connect_id;

    if (!accountId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('stripe_connect_id')
        .eq('id', user.id)
        .single();

      accountId = profile?.stripe_connect_id;
    }

    if (!accountId) {
      return NextResponse.json({ error: 'No Stripe account found' }, { status: 400 });
    }

    const loginLink = await stripe.accounts.createLoginLink(accountId);

    return NextResponse.json({ url: loginLink.url });
  } catch (error) {
    console.error('Create login link error:', error);
    return NextResponse.json(
      { error: 'Failed to create login link' },
      { status: 500 }
    );
  }
}
