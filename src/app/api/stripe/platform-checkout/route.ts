import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { checkRateLimit } from '@/lib/rateLimit';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { tierId, billingCycle = 'annual', partnerCode } = await request.json();

    if (!tierId || !['pro', 'label', 'empire'].includes(tierId)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 });
    }

    // Look up partner code if provided
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

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Must be logged in' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'platform-checkout', 60, 5);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    // Get the user's artist profile
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('*, profile:profiles(*)')
      .eq('user_id', user.id)
      .single();

    if (!artist) {
      return NextResponse.json({ error: 'Artist profile not found' }, { status: 404 });
    }

    // Get or create Stripe customer
    let customerId = artist.platform_stripe_customer_id;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: artist.profile?.display_name || user.email,
        metadata: {
          artist_id: artist.id,
          user_id: user.id,
        },
      });
      customerId = customer.id;

      await supabase
        .from('artist_profiles')
        .update({ platform_stripe_customer_id: customerId })
        .eq('id', artist.id);
    }

    // Get price ID based on tier and billing cycle
    const priceMap: Record<string, string | undefined> = {
      pro_monthly: process.env.STRIPE_CRWN_PRO_PRICE_ID,
      pro_annual: process.env.STRIPE_CRWN_PRO_ANNUAL_PRICE_ID,
      label_monthly: process.env.STRIPE_CRWN_LABEL_PRICE_ID,
      label_annual: process.env.STRIPE_CRWN_LABEL_ANNUAL_PRICE_ID,
      empire_monthly: process.env.STRIPE_CRWN_EMPIRE_PRICE_ID,
      empire_annual: process.env.STRIPE_CRWN_EMPIRE_ANNUAL_PRICE_ID,
    };
    const priceId = priceMap[`${tierId}_${billingCycle}`];

    if (!priceId) {
      return NextResponse.json({ error: 'Price ID not configured' }, { status: 500 });
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
      // Reuse founding artist flag so webhook applies the 5% fee reduction
      metadata.founding_artist = 'true';
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
      success_url: `${baseUrl}/profile/artist?tab=billing&upgrade=success`,
      cancel_url: `${baseUrl}/profile/artist?tab=billing&upgrade=cancelled`,
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
