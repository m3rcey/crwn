import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@supabase/supabase-js';
import {
  handleCheckoutCompleted,
  handleCheckoutExpired,
  handleInvoicePaid,
  handleSubscriptionRenewal,
  handleInvoicePaymentFailed,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleProductPurchase,
  handleTrackPurchase,
  handleBookingPurchase,
  handlePlatformCheckoutCompleted,
  handlePlatformSubscriptionUpdated,
  handlePlatformSubscriptionDeleted,
  handlePlatformInvoicePaymentFailed,
  handleChargeRefunded,
  handleDisputeCreated,
} from '@/lib/webhookHandlers';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy_key_for_build';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build';

console.log('Webhook init - Supabase URL:', supabaseUrl);

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

  // Idempotency check — skip if already processed
  const { data: existing } = await supabaseAdmin
    .from('processed_webhook_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle();

  if (existing) {
    console.log('Duplicate webhook event, skipping:', event.id);
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Mark as processing
  await supabaseAdmin.from('processed_webhook_events').insert({
    event_id: event.id,
    event_type: event.type,
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Checkout session metadata:', JSON.stringify(session.metadata));
        console.log('Checkout session subscription:', session.subscription);
        console.log('Checkout session customer:', session.customer);

        // Check if this is a platform subscription (CRWN tier)
        if (session.metadata?.tier && session.metadata?.artist_id) {
          await handlePlatformCheckoutCompleted(supabaseAdmin, session);
        }
        // Check if this is a product purchase
        else if (session.metadata?.product_id) {
          await handleProductPurchase(supabaseAdmin, session);
        }
        // Check if this is a track purchase
        else if (session.metadata?.track_id) {
          await handleTrackPurchase(supabaseAdmin, session);
        }
        // Check if this is a booking purchase
        else if (session.metadata?.booking_session_id) {
          await handleBookingPurchase(supabaseAdmin, session);
        }
        // Otherwise it's an artist Connect subscription
        else {
          await handleCheckoutCompleted(supabaseAdmin, session);
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
          await handleSubscriptionRenewal(supabaseAdmin, invoice);
        } else {
          await handleInvoicePaid(supabaseAdmin, invoice);
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
            await handlePlatformInvoicePaymentFailed(supabaseAdmin, invoice);
          } else {
            await handleInvoicePaymentFailed(supabaseAdmin, invoice);
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
          await handlePlatformSubscriptionUpdated(supabaseAdmin, subscription);
        } else {
          await handleSubscriptionUpdated(supabaseAdmin, subscription);
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
          await handlePlatformSubscriptionDeleted(supabaseAdmin, subscription);
        } else {
          await handleSubscriptionDeleted(supabaseAdmin, subscription);
        }
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge;
        await handleChargeRefunded(supabaseAdmin, charge);
        break;
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutExpired(supabaseAdmin, session);
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        await handleDisputeCreated(supabaseAdmin, dispute);
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
