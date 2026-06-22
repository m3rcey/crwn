import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'create-price', 60, 3);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const { name, price, description, artistId, offersAnnual = true, annualDiscountPercent = 25 } = await req.json();

    // Clamp discount to the allowed 0–50% range (protects artist margins)
    const discountPct = Math.min(50, Math.max(0, Math.round(Number(annualDiscountPercent) || 0)));

    // Verify the caller owns this artist profile
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('id', artistId)
      .eq('user_id', user.id)
      .single();

    if (!artist?.stripe_connect_id) {
      return NextResponse.json(
        { error: 'Artist Stripe account not connected' },
        { status: 400 }
      );
    }

    // Create Stripe Product on PLATFORM account
    const product = await stripe.products.create({
      name,
      description,
      metadata: {
        artist_id: artistId,
      },
    });

    // Create monthly Stripe Price on PLATFORM account
    const monthlyPrice = await stripe.prices.create({
      product: product.id,
      unit_amount: price,
      currency: 'usd',
      recurring: {
        interval: 'month',
      },
    });

    // Create annual Stripe Price only if the artist offers annual billing.
    // Annual total = monthly * 12 * (1 - discount%).
    let stripeAnnualPriceId: string | null = null;
    if (offersAnnual) {
      const annualAmount = Math.round(price * 12 * (1 - discountPct / 100));
      const annualPrice = await stripe.prices.create({
        product: product.id,
        unit_amount: annualAmount,
        currency: 'usd',
        recurring: {
          interval: 'year',
        },
      });
      stripeAnnualPriceId = annualPrice.id;
    }

    return NextResponse.json({
      stripePriceId: monthlyPrice.id,
      stripeAnnualPriceId,
      stripeProductId: product.id,
    });
  } catch (error) {
    console.error('Create price error:', error);
    return NextResponse.json(
      { error: 'Failed to create Stripe price' },
      { status: 500 }
    );
  }
}
