import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getArtistFeePercent } from '@/lib/platformTier';
import { reserveForSaleAtomic, reserveToStripeMetadata } from '@/lib/teamSplits/reserve';
import { teamSplitMoneyKey } from '@/lib/teamSplits/moneyKey';
import { checkRateLimit } from '@/lib/rateLimit';
import { validateAndApplyDiscount } from '@/lib/discountCodes';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_dummy_key_for_build');

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'product-checkout', 60, 5);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const fanId = user.id;
    const body = await request.json();
    const { productId, variantSelections, discountCode, utmSource, utmMedium, utmCampaign } = body;

    // Referral attribution (capture only, no payout for one-time purchases yet).
    // Body param takes priority; fall back to the first-party crwn_ref cookie.
    const referralCode = body.referralCode || request.cookies.get('crwn_ref')?.value || '';
    const attributionSource = body.attributionSource || request.cookies.get('crwn_ref_src')?.value || '';

    if (!productId) {
      return NextResponse.json(
        { error: 'Missing productId' },
        { status: 400 }
      );
    }

    // Get product and artist info
    const { data: product, error: productError } = await supabase
      .from('products')
      // Must NOT name stripe_connect_id: SELECT on it is revoked from
      // anon/authenticated, PostgREST applies column privileges to embedded joins,
      // and one revoked name fails the WHOLE statement with 42501. That turned
      // every product purchase into "Product not found". Read it with admin below.
      .select('*, artist:artist_profiles(id, user_id, slug, platform_tier, profile:profiles(display_name))')
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

    // Transfer destination, service-role only: the caller is a fan and holds no
    // grant on this column.
    const svcConnect = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
    );
    const { data: connectRow } = await svcConnect
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('id', artist?.id || product.artist_id)
      .maybeSingle();
    const artistStripeAccountId = connectRow?.stripe_connect_id as string | undefined;

    if (!artistStripeAccountId) {
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

    // Apply discount code if provided (stacks with tier shop discount)
    let discountCodeId = '';
    if (discountCode) {
      const result = await validateAndApplyDiscount(
        discountCode, product.artist_id, fanId, 'product', productId
      );
      if (!result.valid) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      discountCodeId = result.discountId || '';
      if (result.discountType === 'percent') {
        unitAmount = Math.round(unitAmount * (1 - (result.discountValue || 0) / 100));
      } else if (result.discountType === 'fixed') {
        unitAmount = Math.max(50, unitAmount - (result.discountValue || 0)); // min $0.50
      }
    }

    // Calculate fee as percentage of discounted price (in cents)
    const platformFee = Math.round(unitAmount * (platformFeePercent / 100));

    // TEAM SPLIT FUNDED RESERVE. Withhold the collaborator's share HERE, before Stripe settles the
    // artist's proceeds. Destination charges send everything but the application fee to the
    // artist's Connect account, which Stripe then sweeps automatically, so a reserve taken any
    // later would be CRWN's own money. ONE canonical calculation: this route does no split math.
    // Never throws, and returns 0 on any failure, so a checkout cannot fail because a split could
    // not be computed. Reserving nothing simply means nobody can accrue.
    // The reservation is bound to a canonical money identity so a retry or a redelivered
    // webhook resolves to the SAME grant instead of consuming the cap twice. The Checkout
    // Session id does not exist yet, so the key is server-minted here and written into the
    // session metadata, which settlement reads back.
    const tsMoneyKey = teamSplitMoneyKey();

    const reserve = await reserveForSaleAtomic(svcConnect, {
      artistId: product.artist_id,
      sourceType: 'product',
      sourceId: productId,
      grossCents: unitAmount,
      platformFeePercent,
      attributedCutPercent: 0,
    }, { kind: 'checkout_session', id: tsMoneyKey });
    const applicationFeeAmount = platformFee + reserve.reserveCents;

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
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
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
        application_fee_amount: applicationFeeAmount,
        transfer_data: {
          destination: artistStripeAccountId,
        },
        ...(statementSuffix ? { statement_descriptor_suffix: statementSuffix } : {}),
        metadata: {
          // The per-deal reserve rides WITH the charge so settlement records PROVEN funding on
          // the earnings row rather than recomputing what checkout merely intended.
          ...reserveToStripeMetadata(reserve.reservedByDeal),
          ...(reserve.reserveCents > 0 ? { team_split_money_key: tsMoneyKey } : {}),
          fan_id: fanId,
          product_id: productId,
          artist_id: product.artist_id,
          type: 'product',
          ...(variantSelections ? { variant_selections: JSON.stringify(variantSelections) } : {}),
          referral_code: referralCode,
          attribution_source: attributionSource,
          utm_source: utmSource || '',
          utm_medium: utmMedium || '',
          utm_campaign: utmCampaign || '',
        },
      },
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${artist.slug}?purchase=success&product=${productId}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}/${artist.slug}?purchase=cancelled`,
      metadata: {
        fan_id: fanId,
        product_id: productId,
        artist_id: product.artist_id,
        discount_code_id: discountCodeId,
        referral_code: referralCode,
        attribution_source: attributionSource,
        utm_source: utmSource || '',
        utm_medium: utmMedium || '',
        utm_campaign: utmCampaign || '',
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
