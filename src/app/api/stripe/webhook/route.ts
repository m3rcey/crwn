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
        // Otherwise it's an artist Connect subscription
        else {
          await handleCheckoutCompleted(session);
        }
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        await handleInvoicePaid(invoice);
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

    // Notify artist of new subscriber
    const { data: artistProfile } = await supabaseAdmin
      .from('artist_profiles')
      .select('user_id')
      .eq('id', artist_id)
      .single();

    const { data: fanProfile } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', fan_id)
      .single();

    const { data: tierData } = await supabaseAdmin
      .from('subscription_tiers')
      .select('name')
      .eq('id', tier_id)
      .single();

    if (artistProfile) {
      await notifyNewSubscriber(
        supabaseAdmin,
        artistProfile.user_id,
        fanProfile?.display_name || 'A fan',
        tierData?.name || 'a tier'
      );
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

  // Get artist user ID for notification
  const { data: artistProfile } = await supabaseAdmin
    .from('artist_profiles')
    .select('user_id, profile:profiles(display_name)')
    .eq('id', artist_id)
    .single();

  const { data: fanProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name')
    .eq('id', fan_id)
    .single();

  // Notify artist of new purchase
  if (artistProfile) {
    await notifyNewPurchase(
      supabaseAdmin,
      artistProfile.user_id,
      fanProfile?.display_name || 'A fan',
      product.title
    );
  }

  console.log('Product purchase recorded:', { fan_id, product_id, artist_id });
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
