import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { checkRateLimit } from '@/lib/rateLimit';
import { STRIPE_PRICE_IDS, TIER_PRICING } from '@/lib/platformTier';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build');

// platform_stripe_customer_id is withheld from anon/authenticated by column grant,
// and the RLS UPDATE policy on artist_profiles forbids the owner from writing it.
// Both the read and the write therefore belong to the service-role client.
const supabaseService = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function POST(request: NextRequest) {
  try {
    const { tierId, billingCycle = 'monthly', partnerCode } = await request.json();

    // Sellable plans: Pro ($49/mo) and Scale ($199/mo). Launch is free and never checks out.
    if (!tierId || !['pro', 'scale'].includes(tierId)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }
    if (!['monthly', 'annual'].includes(billingCycle)) {
      return NextResponse.json({ error: 'Invalid billing cycle' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Must be logged in' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'platform-checkout', 60, 5);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Look up partner code if provided. Runs AFTER auth + rate-limit so an
    // unauthenticated caller can't inflate a code's use counter.
    let validPartnerCode: { id: string; code: string; recruiter_id: string | null } | null = null;
    if (partnerCode) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
      );
      const { data: codeData } = await supabaseAdmin
        .from('partner_codes')
        .select('id, code, recruiter_id')
        .eq('code', partnerCode.toUpperCase().trim())
        .eq('is_active', true)
        .single();
      if (codeData) {
        validPartnerCode = codeData;
        // Increment uses
        await supabaseAdmin.rpc('increment_partner_code_uses', { code_id: codeData.id });
      }
    }

    // Get the user's artist profile. RLS still scopes this to the caller.
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id, platform_tier, platform_subscription_status, profile:profiles(display_name)')
      .eq('user_id', user.id)
      .single();

    if (!artist) {
      return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });
    }

    // ALREADY ON THIS PLAN? Refuse. Nothing used to check this at any layer, so an
    // artist already on Pro could open checkout and be charged a SECOND $49/mo.
    // Worse, the webhook stores one subscription id per artist, so the second
    // subscription would overwrite the first and the app could no longer cancel
    // the original. Plan changes go through the billing portal, not a new session.
    if (artist.platform_tier === tierId) {
      return NextResponse.json(
        {
          error: `You are already on ${tierId === 'pro' ? 'Pro' : 'Scale'}. Use Manage Subscription to change your billing cycle or cancel.`,
          alreadySubscribed: true,
        },
        { status: 409 },
      );
    }

    const profile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;

    // Get or create Stripe customer. The id is read and written with the service
    // client: the caller cannot select the column, and the artist_profiles UPDATE
    // policy pins platform_stripe_customer_id, so an anon-key write is rejected —
    // which meant this previously created a NEW Stripe customer on every checkout.
    const { data: billing } = await supabaseService
      .from('artist_profiles')
      .select('platform_stripe_customer_id')
      .eq('id', artist.id)
      .maybeSingle();

    let customerId = billing?.platform_stripe_customer_id;

    // Stripe is the authority on whether they are already paying. The DB check
    // above misses the case where a webhook never landed, leaving platform_tier
    // 'starter' while a real subscription bills every month. Reusing the customer
    // id does NOT dedupe: Stripe happily runs two subscriptions to the same price
    // on one customer, so this lookup is the only thing standing between a
    // double-charge and the artist.
    if (customerId) {
      try {
        const existing = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 10,
        });
        const live = existing.data.filter((s) => !s.cancel_at_period_end || s.status === 'active');
        if (live.length > 0) {
          return NextResponse.json(
            {
              error:
                'You already have an active CRWN plan. Use Manage Subscription to change or cancel it, so you are never billed twice.',
              alreadySubscribed: true,
            },
            { status: 409 },
          );
        }
      } catch (err) {
        // Never block a legitimate upgrade because Stripe was briefly unreachable.
        // The DB guard above still applies.
        console.error('platform-checkout: could not list existing subscriptions', err);
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: profile?.display_name || user.email,
        metadata: {
          artist_id: artist.id,
          user_id: user.id,
        },
      });
      customerId = customer.id;

      const { error: persistErr } = await supabaseService
        .from('artist_profiles')
        .update({ platform_stripe_customer_id: customerId })
        .eq('id', artist.id);
      if (persistErr) {
        console.error('platform-checkout: failed to persist stripe customer id', persistErr);
      }
    }

    // Price id by tier and billing cycle, read from the one map that defines them. This was
    // a third private copy of the same env vars, including two for the dead 'empire' tier.
    const priceId = STRIPE_PRICE_IDS[`${tierId}_${billingCycle}` as keyof typeof STRIPE_PRICE_IDS];

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID not configured' }, { status: 500 });
    }

    // Verify the live Stripe price matches TIER_PRICING before selling it. The env var can
    // lag a pricing change (the old $9.99 Pro price id would otherwise silently undercharge
    // while every surface advertises $49), so a mismatch fails loudly instead of checking out.
    const expectedAmount = TIER_PRICING[tierId as keyof typeof TIER_PRICING][billingCycle as 'monthly' | 'annual'];
    const stripePrice = await stripe.prices.retrieve(priceId);
    if (stripePrice.unit_amount !== expectedAmount) {
      console.error(
        `platform-checkout: Stripe price ${priceId} is ${stripePrice.unit_amount} but TIER_PRICING says ${expectedAmount} for ${tierId}/${billingCycle}`
      );
      return NextResponse.json({ error: 'Plan pricing is being updated. Please try again shortly.' }, { status: 500 });
    }

    // Build metadata
    const metadata: Record<string, string> = {
      artist_id: artist.id,
      user_id: user.id,
      tier: tierId,
    };

    // Build subscription data (trial if partner code)
    const subscriptionData: Stripe.Checkout.SessionCreateParams['subscription_data'] = {};
    if (validPartnerCode) {
      const trialEnd = new Date();
      trialEnd.setMonth(trialEnd.getMonth() + 1);
      subscriptionData.trial_end = Math.floor(trialEnd.getTime() / 1000);
      metadata.partner_code = validPartnerCode.code;
      metadata.partner_code_id = validPartnerCode.id;
      if (validPartnerCode.recruiter_id) {
        metadata.recruiter_id = validPartnerCode.recruiter_id;
      }
      // A partner code is attribution + a 1-month Stripe trial only. It does NOT reduce the
      // platform fee: the founding-artist program that granted 5% here is retired (founder
      // call 2026-07-15), so nothing sets the founding flag anymore.
    }

    // Create checkout session
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://thecrwn.app';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${baseUrl}/account/billing?upgrade=success`,
      cancel_url: `${baseUrl}/account/billing?upgrade=cancelled`,
      metadata,
    };

    // Only add subscription_data if we have trial
    if (subscriptionData.trial_end) {
      sessionParams.subscription_data = subscriptionData;
    }

    const checkoutSession = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error) {
    console.error('Platform checkout error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Checkout failed' },
      { status: 500 }
    );
  }
}
