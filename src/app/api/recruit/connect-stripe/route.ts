import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'dummy-stripe-key-for-build');
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST() {
  // Identity from the session, never a client-supplied userId — this mints a
  // Stripe Express login link, so trusting the body let anyone open another
  // recruiter's payout dashboard.
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = user.id;

  const { data: recruiter } = await supabaseAdmin
    .from('recruiters')
    .select('id, stripe_connect_id')
    .eq('user_id', userId)
    .single();

  if (!recruiter) {
    return NextResponse.json({ error: 'Not a recruiter' }, { status: 400 });
  }

  if (recruiter.stripe_connect_id) {
    try {
      const loginLink = await stripe.accounts.createLoginLink(recruiter.stripe_connect_id);
      return NextResponse.json({ url: loginLink.url });
    } catch {
      // Account may need re-onboarding
    }
  }

  const account = await stripe.accounts.create({
    type: 'express',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  });

  await supabaseAdmin
    .from('recruiters')
    .update({ stripe_connect_id: account.id })
    .eq('id', recruiter.id);

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${process.env.NEXT_PUBLIC_BASE_URL}/recruit/dashboard`,
    return_url: `${process.env.NEXT_PUBLIC_BASE_URL}/recruit/dashboard`,
    type: 'account_onboarding',
  });

  return NextResponse.json({ url: accountLink.url });
}
