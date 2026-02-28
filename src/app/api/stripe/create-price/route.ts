import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { name, price, description, artistId } = await req.json();

    const supabase = await createServerSupabaseClient();

    // Get artist's Stripe Connect ID
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('id', artistId)
      .single();

    if (!artist?.stripe_connect_id) {
      return NextResponse.json(
        { error: 'Artist Stripe account not connected' },
        { status: 400 }
      );
    }

    // Create Stripe Product
    const product = await stripe.products.create(
      {
        name,
        description,
        metadata: {
          artist_id: artistId,
        },
      },
      {
        stripeAccount: artist.stripe_connect_id,
      }
    );

    // Create Stripe Price (recurring subscription)
    const stripePrice = await stripe.prices.create(
      {
        product: product.id,
        unit_amount: price,
        currency: 'usd',
        recurring: {
          interval: 'month',
        },
      },
      {
        stripeAccount: artist.stripe_connect_id,
      }
    );

    return NextResponse.json({
      stripePriceId: stripePrice.id,
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
