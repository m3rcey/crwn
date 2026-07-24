import { NextRequest, NextResponse } from 'next/server';
import { getConnectAccountByUserId, getProfileConnectAccount } from '@/lib/stripe/connectAccount';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check artist profile first, then fan profile for Connect account. Both reads
    // are service-role: SELECT on stripe_connect_id is revoked from
    // `authenticated`, and the session above is what proves the caller owns it.
    const accountId =
      (await getConnectAccountByUserId(user.id)) || (await getProfileConnectAccount(user.id));

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
