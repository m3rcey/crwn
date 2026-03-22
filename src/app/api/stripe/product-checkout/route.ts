import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import Stripe from 'stripe';
import { getArtistFeePercent } from '@/lib/platformTier';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const fanId = user.id;
    const body = await request.json();
    const { productId, variantSelections } = body;

    if (!productId) {
      return NextResponse.json(
        { error: 'Missing productId' },
        { status: 400 }
      );
    }

    // Get product and artist info
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('*, artist:artist_profiles(id, user_id, slug, stripe_connect_id, platform_tier, profile:profiles(display_name))')
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (productError || !product) {
      return NextResponse.json(
        { error: 'Product not found' },
        { status: 404 }
      );
    }

    // Check if product has expired
    if (product.expires_at && new Date(product.expires_at) < new Date()) {
      return NextResponse.json(
        { error: 'This product is no longer available' },
        { status: 400 }
      );
    }

    // Check if product is sold out
    if (product.max_quantity && product.quantity_sold >= product.max_quantity) {
      return NextResponse.json(
        { error: 'This product is sold out' },
        { status: 400 }
      );
    }

    const artist = product.artist as any;
    if (!artist?.stripe_connect_id) {
      return NextResponse.json(
        { error: 'Artist has not connected Stripe' },
        { status: 400 }
      );
    }

    const price = product.price;
    let unitAmount = price;
    const artistId = artist?.id || '';
    const platformFeePercent = await getArtistFeePercent(artistId);

    // Get fan's active subscription to check for shop_discount benefit
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('tier_id')
      .eq('fan_id', fanId)
      .eq('artist_id', product.artist_id)
      .eq('status', 'active')
      .maybeSingle();

    if (subscription?.tier_id) {
      // Check if fan's tier has shop_discount benefit
      const { data: benefits } = await supabase
        .from('tier_benefits')
        .select('config')
        .eq('tier_id', subscription.tier_id)
        .eq('benefit_type', 'shop_discount')
        .eq('is_active', true)
        .maybeSingle();

      if (benefits?.config?.discount_percent) {
        const discountPercent = benefits.config.discount_percent;
        unitAmount = Math.round(price * (1 - discountPercent / 100));
        console.log(`Applied ${discountPercent}% shop discount: ${price} -> ${unitAmount}`);
      }
    }

    // Calculate fee as percentage of discounted price (in cents)
    const platformFee = Math.round(unitAmount * (platformFeePercent / 100));

    // Build statement descriptor from artist name
    const artistDisplayName = (artist as any).profile?.display_name || '';
    const statementSuffix = artistDisplayName
      .replace(/[^a-zA-Z0-9 ]/g, '')
      .trim()
      .substring(0, 22)
      .toUpperCase();

    // Create Stripe checkout session for one-time payment
    const isPhysical = product.type === 'physical';
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      ...(isPhysical && {
        shipping_address_collection: {
          allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'JP', 'BR', 'MX', 'NG', 'GH', 'KE', 'ZA', 'IN', 'KR', 'NL', 'SE', 'NO', 'DK', 'IT', 'ES'],
        },
      }),
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: product.title,
              description: product.description || undefined,
              images: product.image_url ? [product.image_url] : [],
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: artist.stripe_connect_id,
        },
        ...(statementSuffix ? { statement_descriptor_suffix: statementSuffix } : {}),
        metadata: {
          fan_id: fanId,
          product_id: productId,
          artist_id: product.artist_id,
          type: 'product',
          ...(variantSelections ? { variant_selections: JSON.stringify(variantSelections) } : {}),
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${artist.slug}?purchase=success&product=${productId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${artist.slug}?purchase=cancelled`,
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
