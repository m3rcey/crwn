import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@supabase/supabase-js';
import { notifyNewSubscriber, notifyNewPurchase, notifySubscriptionCanceled } from '@/lib/notifications';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy_key_for_build';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build';

console.log('Webhook init - Supabase URL:', supabaseUrl);
console.log('Webhook init - Service key starts with:', supabaseServiceKey.substring(0, 10));

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const signature = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Webhook signature verification failed:', message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  console.log('Webhook event received:', event.type);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout session metadata:', JSON.stringify(session.metadata));
        console.log('Checkout session subscription:', session.subscription);
        console.log('Checkout session customer:', session.customer);
        
        // Check if this is a platform subscription (CRWN tier)
        if (session.metadata?.tier && session.metadata?.artist_id) {
          await handlePlatformCheckoutCompleted(session);
        }
        // Check if this is a product purchase
        else if (session.metadata?.product_id) {
          await handleProductPurchase(session);
        }
        // Check if this is a booking purchase
        else if (session.metadata?.booking_session_id) {
          await handleBookingPurchase(session);
        }
        // Otherwise it's an artist Connect subscription
        else {
          await handleCheckoutCompleted(session);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        
        // Check if this is a subscription renewal (not initial checkout)
        const billingReason = (invoice as unknown as { billing_reason?: string }).billing_reason;
        const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
        
        if (billingReason === 'subscription_cycle' && subscriptionId) {
          // This is a recurring subscription renewal - write earnings
          await handleSubscriptionRenewal(invoice);
        } else {
          await handleInvoicePaid(invoice);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        
        const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
        if (subscriptionId) {
          // Check if it's a platform subscription
          const { data: platformSub } = await supabaseAdmin
            .from('artist_profiles')
            .select('id')
            .eq('platform_stripe_subscription_id', subscriptionId)
            .maybeSingle();
          
          if (platformSub) {
            await handlePlatformInvoicePaymentFailed(invoice);
          } else {
            await handleInvoicePaymentFailed(invoice);
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        
        // Check if it's a platform subscription (has metadata or no artist associated)
        const { data: platformSub } = await supabaseAdmin
          .from('artist_profiles')
          .select('id')
          .eq('platform_stripe_subscription_id', subscription.id)
          .maybeSingle();
        
        if (platformSub) {
          await handlePlatformSubscriptionUpdated(subscription);
        } else {
          await handleSubscriptionUpdated(subscription);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        
        // Check if it's a platform subscription
        const { data: platformSub } = await supabaseAdmin
          .from('artist_profiles')
          .select('id')
          .eq('platform_stripe_subscription_id', subscription.id)
          .maybeSingle();
        
        if (platformSub) {
          await handlePlatformSubscriptionDeleted(subscription);
        } else {
          await handleSubscriptionDeleted(subscription);
        }
        break;
      }

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { fan_id, artist_id, tier_id } = session.metadata || {};

  console.log('handleCheckoutCompleted - fan_id:', fan_id, 'artist_id:', artist_id, 'tier_id:', tier_id);

  if (!fan_id || !artist_id || !tier_id) {
    console.error('Missing metadata in checkout session');
    return;
  }

  // Extract geo data from Stripe session
  const address = (session as unknown as { customer_details?: { address?: { city?: string; state?: string; country?: string } } }).customer_details?.address;
  const fanCity = address?.city || null;
  const fanState = address?.state || null;
  const fanCountryCode = address?.country || null;
  
  // Map country code to full name
  const countryNames: Record<string, string> = {
    US: 'United States', CA: 'Canada', GB: 'United Kingdom',
    AU: 'Australia', DE: 'Germany', FR: 'France', JP: 'Japan',
    BR: 'Brazil', MX: 'Mexico', NG: 'Nigeria', GH: 'Ghana',
    KE: 'Kenya', ZA: 'South Africa', IN: 'India', KR: 'South Korea',
  };
  const fanCountry = countryNames[fanCountryCode || ''] || fanCountryCode || null;

  const insertData = {
    fan_id,
    artist_id,
    tier_id,
    stripe_subscription_id: session.subscription as string,
    stripe_customer_id: session.customer as string,
    status: 'active',
    started_at: new Date().toISOString(),
  };

  console.log('Upserting subscription:', JSON.stringify(insertData));

  const { data, error } = await supabaseAdmin.from('subscriptions').upsert(insertData, { onConflict: 'fan_id,artist_id' }).select();

  if (error) {
    console.error('Supabase insert error:', JSON.stringify(error));
  } else {
    console.log('Supabase insert success:', JSON.stringify(data));

    // Get fan display name
    const { data: fanProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', fan_id)
      .single();

    const fanName = fanProfile?.display_name || 'A fan';

    // Get tier name and price
    const { data: tierData } = await supabaseAdmin
      .from('subscription_tiers')
      .select('name, price')
      .eq('id', tier_id)
      .single();

    const tierName = tierData?.name || 'Unknown tier';
    const grossAmount = tierData?.price || 0;
    
    // Calculate fee - use application_fee_percent from session or default to 8%
    const sessionWithFee = session as unknown as { subscription?: string; application_fee_percent?: number };
    const feeRate = sessionWithFee.application_fee_percent ? sessionWithFee.application_fee_percent / 100 : 0.08;
    const platformFee = Math.round(grossAmount * feeRate);
    const netAmount = grossAmount - platformFee;

    // Write earnings record
    const { data: earning } = await supabaseAdmin
      .from('earnings')
      .insert({
        artist_id,
        fan_id,
        type: 'subscription',
        description: `${fanName} subscribed to ${tierName}`,
        gross_amount: grossAmount,
        platform_fee: platformFee,
        net_amount: netAmount,
        stripe_payment_id: session.payment_intent || session.id,
        metadata: { tierName, tierPrice: grossAmount, fanDisplayName: fanName },
        fan_city: fanCity,
        fan_state: fanState,
        fan_country: fanCountry,
        fan_country_code: fanCountryCode,
      })
      .select('id')
      .single();

    // Notify artist of new subscriber and earning
    const { data: artistProfile } = await supabaseAdmin
      .from('artist_profiles')
      .select('user_id')
      .eq('id', artist_id)
      .single();

    if (artistProfile) {
      await notifyNewSubscriber(
        supabaseAdmin,
        artistProfile.user_id,
        fanName,
        tierName
      );

      // Send earning notification
      if (earning) {
        await supabaseAdmin.from('notifications').insert({
          user_id: artistProfile.user_id,
          type: 'earning',
          title: `💰 +$${(netAmount / 100).toFixed(2)}`,
          message: `${fanName} subscribed to ${tierName}`,
          link: `/profile/artist?tab=payouts&earning=${earning.id}`,
        });
      }
    }
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subscriptionId) return;

  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: new Date(invoice.period_start * 1000).toISOString(),
      current_period_end: new Date(invoice.period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);
}

// Handle subscription renewals (recurring payments)
async function handleSubscriptionRenewal(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subscriptionId) return;

  console.log('Handling subscription renewal:', subscriptionId);

  // Look up the subscription in our DB
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('artist_id, fan_id, tier_id')
    .eq('stripe_subscription_id', subscriptionId)
    .single();

  if (!sub) {
    console.log('Subscription not found for renewal:', subscriptionId);
    return;
  }

  // Get fan name and tier info
  const { data: fanProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', sub.fan_id)
    .single();

  const { data: tier } = await supabaseAdmin
    .from('subscription_tiers')
    .select('name, price')
    .eq('id', sub.tier_id)
    .single();

  const fanName = fanProfile?.display_name || 'A fan';
  const tierName = tier?.name || 'Unknown tier';
  const grossAmount = tier?.price || 0;

  // Calculate fee (8% default)
  const platformFee = Math.round(grossAmount * 0.08);
  const netAmount = grossAmount - platformFee;

  // Get geo from previous earnings for this artist+fan combo
  const { data: prevEarning } = await supabaseAdmin
    .from('earnings')
    .select('fan_city, fan_state, fan_country, fan_country_code')
    .eq('artist_id', sub.artist_id)
    .eq('fan_id', sub.fan_id)
    .not('fan_city', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const fanCity = prevEarning?.fan_city || null;
  const fanState = prevEarning?.fan_state || null;
  const fanCountry = prevEarning?.fan_country || null;
  const fanCountryCode = prevEarning?.fan_country_code || null;

  // Write earnings record for renewal
  const invoiceWithPayment = invoice as unknown as { payment_intent?: string; id: string };
  const { data: earning } = await supabaseAdmin
    .from('earnings')
    .insert({
      artist_id: sub.artist_id,
      fan_id: sub.fan_id,
      type: 'subscription',
      description: `${fanName} renewed subscription to ${tierName}`,
      gross_amount: grossAmount,
      platform_fee: platformFee,
      net_amount: netAmount,
      stripe_payment_id: invoiceWithPayment.payment_intent || invoiceWithPayment.id,
      metadata: { tierName, tierPrice: grossAmount, fanDisplayName: fanName, renewal: true },
      fan_city: fanCity,
      fan_state: fanState,
      fan_country: fanCountry,
      fan_country_code: fanCountryCode,
    })
    .select('id')
    .single();

  // Update subscription periods
  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_start: new Date(invoice.period_start * 1000).toISOString(),
      current_period_end: new Date(invoice.period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  // Send earning notification to artist
  const { data: artistProfile } = await supabaseAdmin
    .from('artist_profiles')
    .select('user_id')
    .eq('id', sub.artist_id)
    .single();

  if (artistProfile && earning) {
    await supabaseAdmin.from('notifications').insert({
      user_id: artistProfile.user_id,
      type: 'earning',
      title: `💰 +$${(netAmount / 100).toFixed(2)}`,
      message: `${fanName} renewed subscription to ${tierName}`,
      link: `/profile/artist?tab=payouts&earning=${earning.id}`,
    });
  }

  console.log('Subscription renewal processed:', { subscriptionId, artistId: sub.artist_id, netAmount });
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subscriptionId) return;

  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const sub = subscription as unknown as {
    status: string;
    cancel_at_period_end: boolean;
    current_period_start: number;
    current_period_end: number;
    id: string;
    items?: {
      data: Array<{
        price?: {
          id?: string;
        };
      }>;
    };
  };

  // First, check if there's a pending tier change to apply
  const { data: subData } = await supabaseAdmin
    .from('subscriptions')
    .select('*, tier:subscription_tiers(stripe_price_id)')
    .eq('stripe_subscription_id', sub.id)
    .single();

  if (subData && subData.pending_tier_id) {
    // Get the current price from Stripe subscription items
    const currentPriceId = sub.items?.data[0]?.price?.id;
    const pendingTierPriceId = (subData.tier as unknown as { stripe_price_id: string })?.stripe_price_id;

    // If the current price matches the pending tier's price, the change has taken effect
    if (currentPriceId === pendingTierPriceId) {
      console.log('Applying pending tier change:', {
        subscriptionId: subData.id,
        pendingTierId: subData.pending_tier_id,
        pendingChangeDate: subData.pending_change_date
      });

      await supabaseAdmin
        .from('subscriptions')
        .update({
          tier_id: subData.pending_tier_id,
          pending_tier_id: null,
          pending_change_date: null,
          status: sub.status,
          cancel_at_period_end: sub.cancel_at_period_end,
          current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('stripe_subscription_id', sub.id);

      console.log('Pending tier change applied successfully');
      return;
    }
  }

  // Normal subscription update (no pending tier change)
  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: sub.status,
      cancel_at_period_end: sub.cancel_at_period_end,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', sub.id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const sub = subscription as unknown as { id: string };

  // Get subscription details before updating
  const { data: subData } = await supabaseAdmin
    .from('subscriptions')
    .select('artist_id, fan_id')
    .eq('stripe_subscription_id', sub.id)
    .single();

  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', sub.id);

  // Notify artist of canceled subscription
  if (subData) {
    const { data: fanProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', subData.fan_id)
      .single();

    await notifySubscriptionCanceled(
      supabaseAdmin,
      subData.artist_id,
      fanProfile?.display_name || 'A fan'
    );
  }
}

// Handle product purchases (one-time payments)
async function handleProductPurchase(session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.product_id || !metadata?.fan_id || !metadata?.artist_id) {
    console.log('No product purchase metadata found');
    return;
  }

  const { product_id, fan_id, artist_id } = metadata;

  // Extract geo data from Stripe session
  const address = (session as unknown as { customer_details?: { address?: { city?: string; state?: string; country?: string } } }).customer_details?.address;
  const fanCity = address?.city || null;
  const fanState = address?.state || null;
  const fanCountryCode = address?.country || null;
  
  // Map country code to full name
  const countryNames: Record<string, string> = {
    US: 'United States', CA: 'Canada', GB: 'United Kingdom',
    AU: 'Australia', DE: 'Germany', FR: 'France', JP: 'Japan',
    BR: 'Brazil', MX: 'Mexico', NG: 'Nigeria', GH: 'Ghana',
    KE: 'Kenya', ZA: 'South Africa', IN: 'India', KR: 'South Korea',
  };
  const fanCountry = countryNames[fanCountryCode || ''] || fanCountryCode || null;

  // Get product price and quantity_sold
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('price, quantity_sold, title')
    .eq('id', product_id)
    .single();

  if (!product) {
    console.error('Product not found:', product_id);
    return;
  }

  // Get fan and artist info for earnings
  const { data: fanProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', fan_id)
    .single();

  const { data: artistProfile } = await supabaseAdmin
    .from('artist_profiles')
    .select('user_id')
    .eq('id', artist_id)
    .single();

  const fanName = fanProfile?.display_name || 'A fan';
  const productTitle = product.title || 'Unknown product';
  const grossAmount = product.price || 0;

  // Calculate fee (8% default)
  const platformFee = Math.round(grossAmount * 0.08);
  const netAmount = grossAmount - platformFee;

  // Insert purchase record
  await supabaseAdmin
    .from('purchases')
    .insert({
      fan_id,
      product_id,
      artist_id,
      stripe_payment_intent_id: session.payment_intent as string,
      amount: product.price,
      status: 'completed',
      purchased_at: new Date().toISOString(),
    });

  // Increment quantity_sold
  await supabaseAdmin
    .from('products')
    .update({
      quantity_sold: (product.quantity_sold || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', product_id);

  // Write earnings record
  const { data: earning } = await supabaseAdmin
    .from('earnings')
    .insert({
      artist_id,
      fan_id,
      type: 'purchase',
      description: `${fanName} purchased ${productTitle}`,
      gross_amount: grossAmount,
      platform_fee: platformFee,
      net_amount: netAmount,
      stripe_payment_id: session.payment_intent || session.id,
      metadata: { productTitle, fanDisplayName: fanName },
      fan_city: fanCity,
      fan_state: fanState,
      fan_country: fanCountry,
      fan_country_code: fanCountryCode,
    })
    .select('id')
    .single();

  // Notify artist of new purchase and earning
  if (artistProfile) {
    await notifyNewPurchase(
      supabaseAdmin,
      artistProfile.user_id,
      fanName,
      productTitle
    );

    // Send earning notification
    if (earning) {
      await supabaseAdmin.from('notifications').insert({
        user_id: artistProfile.user_id,
        type: 'earning',
        title: `💰 +$${(netAmount / 100).toFixed(2)}`,
        message: `${fanName} purchased ${productTitle}`,
        link: `/profile/artist?tab=payouts&earning=${earning.id}`,
      });
    }
  }

  console.log('Product purchase recorded:', { fan_id, product_id, artist_id });
}

// Handle booking purchases
async function handleBookingPurchase(session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.booking_session_id || !metadata?.buyer_id || !metadata?.artist_id) {
    console.log('No booking purchase metadata found');
    return;
  }

  const { booking_session_id, buyer_id, artist_id } = metadata;

  // Extract geo data from Stripe session
  const address = (session as unknown as { customer_details?: { address?: { city?: string; state?: string; country?: string } } }).customer_details?.address;
  const fanCity = address?.city || null;
  const fanState = address?.state || null;
  const fanCountryCode = address?.country || null;
  
  // Map country code to full name
  const countryNames: Record<string, string> = {
    US: 'United States', CA: 'Canada', GB: 'United Kingdom',
    AU: 'Australia', DE: 'Germany', FR: 'France', JP: 'Japan',
    BR: 'Brazil', MX: 'Mexico', NG: 'Nigeria', GH: 'Ghana',
    KE: 'Kenya', ZA: 'South Africa', IN: 'India', KR: 'South Korea',
  };
  const fanCountry = countryNames[fanCountryCode || ''] || fanCountryCode || null;

  // Get booking session info
  const { data: booking } = await supabaseAdmin
    .from('booking_sessions')
    .select('title, price, duration_minutes')
    .eq('id', booking_session_id)
    .single();

  if (!booking) {
    console.error('Booking session not found:', booking_session_id);
    return;
  }

  // Get fan and artist info for earnings
  const { data: fanProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', buyer_id)
    .single();

  const { data: artistProfile } = await supabaseAdmin
    .from('artist_profiles')
    .select('user_id')
    .eq('id', artist_id)
    .single();

  const fanName = fanProfile?.display_name || 'A fan';
  const bookingTitle = booking.title || 'Booking session';
  const grossAmount = booking.price || 0;

  // Calculate fee (8% default)
  const platformFee = Math.round(grossAmount * 0.08);
  const netAmount = grossAmount - platformFee;

  // Update booking purchase status
  await supabaseAdmin
    .from('booking_purchases')
    .update({
      status: 'completed',
      stripe_payment_intent_id: session.payment_intent,
    })
    .eq('booking_session_id', booking_session_id)
    .eq('buyer_id', buyer_id);

  // Write earnings record
  const { data: earning } = await supabaseAdmin
    .from('earnings')
    .insert({
      artist_id,
      fan_id: buyer_id,
      type: 'booking',
      description: `${fanName} booked: ${bookingTitle} (${booking.duration_minutes} min)`,
      gross_amount: grossAmount,
      platform_fee: platformFee,
      net_amount: netAmount,
      stripe_payment_id: session.payment_intent || session.id,
      metadata: { bookingTitle, durationMinutes: booking.duration_minutes, fanDisplayName: fanName },
      fan_city: fanCity,
      fan_state: fanState,
      fan_country: fanCountry,
      fan_country_code: fanCountryCode,
    })
    .select('id')
    .single();

  // Notify artist of booking and earning
  if (artistProfile) {
    await supabaseAdmin.from('notifications').insert({
      user_id: artistProfile.user_id,
      type: 'new_booking',
      title: '📅 New Booking',
      message: `${fanName} booked: ${bookingTitle}`,
      link: `/profile/artist?tab=bookings`,
    });

    // Send earning notification
    if (earning) {
      await supabaseAdmin.from('notifications').insert({
        user_id: artistProfile.user_id,
        type: 'earning',
        title: `💰 +$${(netAmount / 100).toFixed(2)}`,
        message: `${fanName} booked: ${bookingTitle}`,
        link: `/profile/artist?tab=payouts&earning=${earning.id}`,
      });
    }
  }

  console.log('Booking purchase recorded:', { booking_session_id, buyer_id, artist_id, netAmount });
}

// Handle platform (CRWN) tier subscriptions
async function handlePlatformCheckoutCompleted(session: Stripe.Checkout.Session) {
  const { artist_id, tier, user_id } = session.metadata || {};

  console.log('Platform checkout - artist_id:', artist_id, 'tier:', tier, 'user_id:', user_id);

  if (!artist_id || !tier || !user_id) {
    console.error('Missing platform checkout metadata');
    return;
  }

  // Update artist profile with platform tier and subscription
  await supabaseAdmin
    .from('artist_profiles')
    .update({
      platform_tier: tier,
      platform_stripe_subscription_id: session.subscription as string,
      platform_subscription_status: 'active',
    })
    .eq('id', artist_id);

  // Also update the user's profile
  await supabaseAdmin
    .from('profiles')
    .update({
      platform_tier: tier,
    })
    .eq('id', user_id);

  console.log('Platform tier updated:', { artist_id, tier });
}

// Handle platform subscription updates
async function handlePlatformSubscriptionUpdated(subscription: Stripe.Subscription) {
  const sub = subscription as unknown as {
    id: string;
    status: string;
    cancel_at_period_end: boolean;
  };

  // Find artist by subscription ID
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('platform_stripe_subscription_id', sub.id)
    .single();

  if (!artist) {
    console.log('Platform subscription not found:', sub.id);
    return;
  }

  await supabaseAdmin
    .from('artist_profiles')
    .update({
      platform_subscription_status: sub.status,
    })
    .eq('id', artist.id);

  console.log('Platform subscription updated:', { artist_id: artist.id, status: sub.status });
}

// Handle platform subscription deletions/cancellations
async function handlePlatformSubscriptionDeleted(subscription: Stripe.Subscription) {
  const sub = subscription as unknown as { id: string };

  // Find artist by subscription ID
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id')
    .eq('platform_stripe_subscription_id', sub.id)
    .single();

  if (!artist) {
    console.log('Platform subscription not found for deletion:', sub.id);
    return;
  }

  // Downgrade to starter
  await supabaseAdmin
    .from('artist_profiles')
    .update({
      platform_tier: 'starter',
      platform_subscription_status: 'canceled',
    })
    .eq('id', artist.id);

  // Also update user profile
  if (artist.user_id) {
    await supabaseAdmin
      .from('profiles')
      .update({
        platform_tier: 'starter',
      })
      .eq('id', artist.user_id);
  }

  console.log('Platform subscription cancelled:', { artist_id: artist.id });
}

// Handle platform invoice payment failures
async function handlePlatformInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = (invoice as unknown as { subscription?: string }).subscription;
  if (!subscriptionId) return;

  // Find artist by subscription ID
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('platform_stripe_subscription_id', subscriptionId)
    .single();

  if (!artist) return;

  await supabaseAdmin
    .from('artist_profiles')
    .update({
      platform_subscription_status: 'past_due',
    })
    .eq('id', artist.id);

  console.log('Platform payment failed:', { artist_id: artist.id });
}
