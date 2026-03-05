import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { getPlatformFeePercent } from '@/lib/platformTier';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const body = await request.json();
    const { productId, fanId } = body;

    if (!productId || !fanId) {
      return NextResponse.json(
        { error: 'Missing productId or fanId' },
        { status: 400 }
      );
    }

    // Get product and artist info
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*, artist:artist_profiles(id, user_id, stripe_connect_id, platform_tier, profile:profiles(display_name))')
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    if (!product.stripe_connect_id) {
      return NextResponse.json(
        { error: 'Artist has not connected Stripe' },
        { status: 400 }
      );
    }

    const price = product.price;
    const artistPlatformTier = (product.artist as unknown as { platform_tier?: string })?.platform_tier || 'starter';
    const platformFeePercent = getPlatformFeePercent(artistPlatformTier);

    // Calculate fee as percentage of price (in cents)
    const platformFee = Math.round(price * (platformFeePercent / 100));

    // Create Stripe checkout session for one-time payment
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.title,
              description: product.description || undefined,
              images: product.image_url ? [product.image_url] : [],
            },
            unit_amount: price,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: product.stripe_connect_id,
        },
        metadata: {
          fan_id: fanId,
          product_id: productId,
          artist_id: product.artist_id,
        },
      },
      success_url: `${request.headers.get('origin')}/artist/${product.artist.slug}?purchase=success&product=${productId}`,
      cancel_url: `${request.headers.get('origin')}/artist/${product.artist.slug}?purchase=cancelled`,
      metadata: {
        fan_id: fanId,
        product_id: productId,
        artist_id: product.artist_id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Product checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
