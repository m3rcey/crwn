import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(req: NextRequest) {
  const { userId } = await req.json();

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

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
