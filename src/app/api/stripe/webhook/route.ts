import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createClient } from '@supabase/supabase-js';
import { fundSubscriptionInvoice } from '@/lib/teamSplits/invoiceFunding';
import { releaseReserves } from '@/lib/teamSplits/reservations';
import { moneyKeyFromMetadata } from '@/lib/teamSplits/moneyKey';
import { handleTeamSplitDispute } from '@/lib/teamSplits/disputes';
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
  handleLiveTicketPurchase,
  handleLiveTip,
  handlePlatformCheckoutCompleted,
  handlePlatformSubscriptionUpdated,
  handlePlatformSubscriptionDeleted,
  handlePlatformInvoicePaymentFailed,
  handleChargeRefunded,
  handleDisputeCreated,
} from '@/lib/webhookHandlers';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy_key_for_build';

// The production Supabase project ref (CLAUDE.md: ecpqtuidtsncjfwtkvwc). Used only
// to refuse test-mode Stripe events that would otherwise write real rows; see the
// guard in POST. A dev/staging project ref simply will not match, so local test
// traffic against a local database keeps working normally.
const PRODUCTION_SUPABASE_REF = 'ecpqtuidtsncjfwtkvwc';

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

  // TEST-MODE EVENTS MUST NEVER WRITE TO THE PRODUCTION DATABASE.
  //
  // This is not hypothetical: an artist's platform_tier was set to 'pro' with a
  // TEST-mode subscription id (Josh, confirmed 2026-08-01), which the live Stripe
  // api answers with resource_missing forever. The row then claimed a plan nobody
  // was paying for, the billing portal errored, cancel 404'd, and the plan picker
  // greyed out a plan they were not on. It took three rounds to diagnose.
  //
  // The realistic route in is local development: `stripe listen` forwarding test
  // events to a dev server whose .env.local points at the PRODUCTION Supabase
  // project. Signature verification passes (it is a real test event, correctly
  // signed), the key is a test key, everything looks consistent, and the write
  // lands in production. Checking livemode against the DATABASE is what catches
  // that, because the keys alone are perfectly self-consistent.
  //
  // Returns 200 so Stripe treats it as handled and does not retry forever.
  const usingLiveKey = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_live');
  const usingProductionDb = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').includes(PRODUCTION_SUPABASE_REF);
  if (!event.livemode && (usingLiveKey || usingProductionDb)) {
    console.error(
      `[stripe-webhook] REFUSED a test-mode ${event.type} against production (liveKey=${usingLiveKey}, prodDb=${usingProductionDb}). ` +
        'Point test-mode Stripe at a dev database, not this one.',
    );
    return NextResponse.json({ received: true, ignored: 'test-mode event refused against production' });
  }

  // Idempotency — claim the event atomically via the UNIQUE(event_id)
  // constraint instead of check-then-insert. Two concurrent redeliveries of the
  // same event id could both pass a prior SELECT and double-process (earnings
  // inserts are not idempotent); letting the insert be the claim closes that
  // race. Requires UNIQUE(event_id) on processed_webhook_events.
  const { error: claimError } = await supabaseAdmin
    .from('processed_webhook_events')
    .insert({ event_id: event.id, event_type: event.type });

  if (claimError) {
    // 23505 = unique_violation → this event was already claimed, skip.
    if (claimError.code === '23505') {
      console.log('Duplicate webhook event, skipping:', event.id);
      return NextResponse.json({ received: true, duplicate: true });
    }
    // Any other error (e.g. missing table): log and continue so a real event
    // is not silently dropped.
    console.error('Idempotency claim insert error (continuing):', claimError.message);
  }

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
        // Live tip. MUST be checked before the ticket branch below: a tip also
        // carries live_session_id, so the ticket handler would swallow it and
        // mark the fan as holding a ticket they never bought.
        else if (session.metadata?.type === 'live_tip') {
          await handleLiveTip(supabaseAdmin, session);
        }
        // Check if this is a live-session pre-sale ticket
        else if (session.metadata?.live_session_id) {
          await handleLiveTicketPurchase(supabaseAdmin, session);
        }
        // Otherwise it's an artist Connect subscription
        else {
          await handleCheckoutCompleted(supabaseAdmin, session);
        }
        break;
      }

      // TS-MONEY-011. Establish the collaborator reserve while the invoice is still a DRAFT.
      //
      // This is the ONLY window: Stripe makes monetary fields immutable at finalization, and waits
      // one hour after a successful response here before attempting payment. Keyed on the invoice
      // rather than on billing_reason, so the initial charge, renewals, prorations, coupon'd and
      // retried invoices are all funded by the same path and a new billing reason cannot silently
      // skip funding.
      //
      // Always returns success. A split that cannot be computed must never stop a fan being
      // charged; it must only stop a collaborator being owed.
      case 'invoice.created': {
        const invoice = event.data.object as Stripe.Invoice;
        const funding = await fundSubscriptionInvoice(supabaseAdmin, stripe, invoice);
        if (funding.funded) {
          console.log('Team Split reserve funded on invoice:', invoice.id, funding.reserveCents);
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

      // TS-MONEY-013. A payment that will never settle must not hold cap headroom forever. Release
      // is provisional-only: the RPC refuses to release a FUNDED reservation, because real money
      // moved and its disposition is a D3 return or a clawback, never a headroom give-back.
      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session;
        // TS-MONEY-013. A payment that will never settle must not hold cap headroom forever.
        // Release is PROVISIONAL-ONLY: the RPC refuses to release a funded reservation, because
        // real money moved and its disposition is a D3 return or a clawback, never a give-back.
        const expiredKey = moneyKeyFromMetadata(session.metadata);
        if (expiredKey) {
          await releaseReserves(supabaseAdmin, { kind: 'checkout_session', id: expiredKey }, 'checkout_expired');
        }
        await handleCheckoutExpired(supabaseAdmin, session);
        break;
      }

      // TS-MONEY-017/018. A disputed source has ZERO collaborator availability, and resolution
      // must never apply twice. Separate from an artist/collaborator BUSINESS dispute, which is a
      // contract disagreement and has nothing to do with a chargeback.
      case 'charge.dispute.closed':
      case 'charge.dispute.updated': {
        const dispute = event.data.object as Stripe.Dispute;
        await handleTeamSplitDispute(supabaseAdmin, stripe, dispute);
        break;
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute;
        await handleTeamSplitDispute(supabaseAdmin, stripe, dispute);
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
