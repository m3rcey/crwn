import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { notifyNewSubscriber, notifyNewPurchase, notifySubscriptionCanceled } from '@/lib/notifications';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { recruiterArtistSignupEmail } from '@/lib/emails/recruiterArtistSignup';
import { subscriptionEmail } from '@/lib/emails/subscription';
import { artistTierEmail } from '@/lib/emails/artistTier';
import { purchaseEmail } from '@/lib/emails/purchase';
import { bookingTokenEmail } from '@/lib/emails/bookingToken';
import { artistNewSubscriberEmail } from '@/lib/emails/artistNewSubscriber';
import { artistNewPurchaseEmail } from '@/lib/emails/artistNewPurchase';
import { receiptEmail } from '@/lib/emails/receipt';
import { checkAndAwardMilestones } from '@/lib/milestones';
import { processReferral } from '@/lib/referrals';
import { recordDiscountCodeUse } from '@/lib/discountCodes';
import { recordActivationMilestone } from '@/lib/activationMilestones';
import type { SupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, any, any>;

// ─── Shared helpers ──────────────────────────────────────────────────────────

const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States', CA: 'Canada', GB: 'United Kingdom',
  AU: 'Australia', DE: 'Germany', FR: 'France', JP: 'Japan',
  BR: 'Brazil', MX: 'Mexico', NG: 'Nigeria', GH: 'Ghana',
  KE: 'Kenya', ZA: 'South Africa', IN: 'India', KR: 'South Korea',
};

function extractGeo(session: Stripe.Checkout.Session) {
  const address = (session as unknown as { customer_details?: { address?: { city?: string; state?: string; country?: string } } }).customer_details?.address;
  const fanCity = address?.city || null;
  const fanState = address?.state || null;
  const fanCountryCode = address?.country || null;
  const fanCountry = COUNTRY_NAMES[fanCountryCode || ''] || fanCountryCode || null;
  return { fanCity, fanState, fanCountry, fanCountryCode };
}

function extractShippingAddress(session: Stripe.Checkout.Session) {
  const shippingDetails = (session as unknown as { shipping_details?: { name?: string; address?: { line1?: string; line2?: string; city?: string; state?: string; postal_code?: string; country?: string } } }).shipping_details;
  if (!shippingDetails) return null;
  return {
    name: shippingDetails.name || '',
    line1: shippingDetails.address?.line1 || '',
    line2: shippingDetails.address?.line2 || '',
    city: shippingDetails.address?.city || '',
    state: shippingDetails.address?.state || '',
    postal_code: shippingDetails.address?.postal_code || '',
    country: shippingDetails.address?.country || '',
  };
}

// ─── Fan subscription checkout ───────────────────────────────────────────────

export async function handleCheckoutCompleted(supabaseAdmin: AdminClient, session: Stripe.Checkout.Session) {
  const { fan_id, artist_id, tier_id } = session.metadata || {};

  console.log('handleCheckoutCompleted - fan_id:', fan_id, 'artist_id:', artist_id, 'tier_id:', tier_id);

  if (!fan_id || !artist_id || !tier_id) {
    console.error('Missing metadata in checkout session');
    return;
  }

  const { fanCity, fanState, fanCountry, fanCountryCode } = extractGeo(session);

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

    // Resolve campaign attribution from UTM params
    const utmSource = session.metadata?.utm_source || '';
    const utmMedium = session.metadata?.utm_medium || '';
    const utmCampaign = session.metadata?.utm_campaign || '';
    const sourceCampaignId = utmSource === 'crwn_campaign' && utmCampaign ? utmCampaign : null;
    const sourceSequenceId = utmSource === 'crwn_sequence' && utmCampaign ? utmCampaign : null;

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
        ...(sourceCampaignId && { source_campaign_id: sourceCampaignId }),
        ...(sourceSequenceId && { source_sequence_id: sourceSequenceId }),
        ...(utmSource && { utm_source: utmSource }),
        ...(utmMedium && { utm_medium: utmMedium }),
        ...(utmCampaign && { utm_campaign: utmCampaign }),
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

      // Check for milestone unlocks
      try {
        await checkAndAwardMilestones(artist_id, artistProfile.user_id);
      } catch (err) {
        console.error('Milestone check failed:', err);
      }

      // Record first subscriber activation milestone (idempotent)
      try {
        await recordActivationMilestone(artist_id, 'first_subscriber');
      } catch (err) {
        console.error('Activation milestone failed:', err);
      }

      // Send subscription confirmation + receipt email to fan
      try {
        const { data: artistNameData } = await supabaseAdmin
          .from('profiles')
          .select('display_name')
          .eq('id', artistProfile.user_id)
          .single();
        const artistDisplayName = artistNameData?.display_name || 'an artist';
        const fanEmail = session.customer_email || session.customer_details?.email;
        if (fanEmail) {
          await resend.emails.send({
            from: FROM_EMAIL,
            to: fanEmail,
            subject: `You're subscribed to ${artistDisplayName} 🎉`,
            html: subscriptionEmail(fanName, artistDisplayName, tierName),
          });
          // Send receipt with support contact info
          await resend.emails.send({
            from: FROM_EMAIL,
            to: fanEmail,
            subject: `Your CRWN receipt - ${tierName}`,
            html: receiptEmail({
              displayName: fanName,
              artistName: artistDisplayName,
              amount: grossAmount,
              productName: tierName,
              purchaseDate: new Date().toISOString(),
              type: 'subscription',
            }),
          });
        }
      } catch (err) {
        console.error('Subscription email failed:', err);
      }

      // Send new subscriber email to artist
      try {
        const { data: { user: artistAuthUser } } = await supabaseAdmin.auth.admin.getUserById(artistProfile.user_id);
        const artistEmail = artistAuthUser?.email;
        if (artistEmail) {
          const { data: artistNameForEmail } = await supabaseAdmin
            .from('profiles')
            .select('display_name')
            .eq('id', artistProfile.user_id)
            .single();
          const artistDisplayNameForEmail = artistNameForEmail?.display_name || 'there';
          const tierPrice = (grossAmount / 100).toFixed(2);
          await resend.emails.send({
            from: FROM_EMAIL,
            to: artistEmail,
            subject: `New subscriber: ${fanName} joined ${tierName} 🎉`,
            html: artistNewSubscriberEmail(artistDisplayNameForEmail, fanName, tierName, tierPrice),
          });
        }
      } catch (err) {
        console.error('Artist subscriber email failed:', err);
      }

      // Process referral if code provided
      const referralCode = session.metadata?.referral_code;
      if (referralCode && earning) {
        try {
          await processReferral({
            artistId: artist_id,
            referredFanId: fan_id,
            subscriptionId: session.subscription as string,
            referralCode,
            earningId: earning.id,
            grossAmount: grossAmount,
          });
        } catch (err) {
          console.error('Referral processing failed:', err);
        }
      }

      // Mark any abandoned checkouts as recovered
      try {
        await supabaseAdmin
          .from('abandoned_checkouts')
          .update({ recovered: true })
          .eq('fan_id', fan_id)
          .eq('artist_id', artist_id)
          .eq('recovered', false);
      } catch (err) {
        console.error('Abandoned checkout recovery update failed:', err);
      }

      // Enroll fan in active welcome sequence
      try {
        const { data: activeSequence } = await supabaseAdmin
          .from('sequences')
          .select('id')
          .eq('artist_id', artist_id)
          .eq('trigger_type', 'new_subscription')
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();

        if (activeSequence) {
          // Check not already enrolled
          const { data: existing } = await supabaseAdmin
            .from('sequence_enrollments')
            .select('id')
            .eq('sequence_id', activeSequence.id)
            .eq('fan_id', fan_id)
            .maybeSingle();

          if (!existing) {
            // Get first step delay
            const { data: firstStep } = await supabaseAdmin
              .from('sequence_steps')
              .select('delay_days')
              .eq('sequence_id', activeSequence.id)
              .eq('step_number', 1)
              .single();

            if (firstStep) {
              const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
              await supabaseAdmin
                .from('sequence_enrollments')
                .insert({
                  sequence_id: activeSequence.id,
                  fan_id: fan_id,
                  artist_id: artist_id,
                  current_step: 0,
                  status: 'active',
                  next_send_at: nextSendAt,
                });
            }
          }
        }
      } catch (err) {
        console.error('Sequence enrollment failed:', err);
      }

      // Record discount code usage if applicable
      const discountCodeId = session.metadata?.discount_code_id;
      if (discountCodeId) {
        try {
          const amountSaved = session.total_details?.amount_discount || 0;
          await recordDiscountCodeUse(discountCodeId, fan_id, artist_id, session.id, amountSaved);
        } catch (err) {
          console.error('Discount code recording failed:', err);
        }
      }
    }
  }
}

// ─── Invoice paid (period update) ────────────────────────────────────────────

export async function handleInvoicePaid(supabaseAdmin: AdminClient, invoice: Stripe.Invoice) {
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

// ─── Subscription renewal (recurring payment) ───────────────────────────────

export async function handleSubscriptionRenewal(supabaseAdmin: AdminClient, invoice: Stripe.Invoice) {
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

    // Check for milestone unlocks
    try {
      await checkAndAwardMilestones(sub.artist_id, artistProfile.user_id);
    } catch (err) {
      console.error('Milestone check failed:', err);
    }

    // Process recurring referral commission
    const { data: existingReferral } = await supabaseAdmin
      .from('referrals')
      .select('id, referrer_fan_id, commission_rate')
      .eq('artist_id', sub.artist_id)
      .eq('referred_fan_id', sub.fan_id)
      .eq('status', 'active')
      .single();

    if (existingReferral && earning) {
      const commissionAmount = Math.round(grossAmount * (existingReferral.commission_rate / 100));

      await supabaseAdmin.from('referral_earnings').insert({
        referral_id: existingReferral.id,
        artist_id: sub.artist_id,
        referrer_fan_id: existingReferral.referrer_fan_id,
        earning_id: earning.id,
        gross_amount: grossAmount,
        commission_amount: commissionAmount,
      });

      // Notify referrer of recurring commission
      await supabaseAdmin.from('notifications').insert({
        user_id: existingReferral.referrer_fan_id,
        type: 'referral_earning',
        title: `💸 +$${(commissionAmount / 100).toFixed(2)} referral commission`,
        message: `Recurring commission from your referral`,
        link: '/library?tab=referrals',
      });
    }
  }

  console.log('Subscription renewal processed:', { subscriptionId, artistId: sub.artist_id, netAmount });
}

// ─── Invoice payment failed ──────────────────────────────────────────────────

export async function handleInvoicePaymentFailed(supabaseAdmin: AdminClient, invoice: Stripe.Invoice) {
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

// ─── Subscription updated ────────────────────────────────────────────────────

export async function handleSubscriptionUpdated(supabaseAdmin: AdminClient, subscription: Stripe.Subscription) {
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

      // Enroll in tier_upgrade sequence
      await enrollInSequence(supabaseAdmin, subData.artist_id, subData.fan_id, 'tier_upgrade');

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

// ─── Subscription deleted ────────────────────────────────────────────────────

export async function handleSubscriptionDeleted(supabaseAdmin: AdminClient, subscription: Stripe.Subscription) {
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

    // Insert real-time churn alert AI insight (no AI call, just templated)
    await supabaseAdmin.from('ai_insights').insert({
      artist_id: subData.artist_id,
      type: 'churn',
      priority: 'urgent',
      title: `${fanProfile?.display_name || 'A fan'} canceled their subscription`,
      body: 'Consider reaching out with a personal message or exclusive content to win them back.',
      data: { fan_id: subData.fan_id, fan_name: fanProfile?.display_name || null },
      action_type: 'link',
      action_url: '/profile/artist?tab=ai-manager',
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    });

    // Enroll in win-back sequence if one exists
    try {
      const { data: winBackSequence } = await supabaseAdmin
        .from('sequences')
        .select('id')
        .eq('artist_id', subData.artist_id)
        .eq('trigger_type', 'win_back')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (winBackSequence) {
        const { data: existing } = await supabaseAdmin
          .from('sequence_enrollments')
          .select('id')
          .eq('sequence_id', winBackSequence.id)
          .eq('fan_id', subData.fan_id)
          .maybeSingle();

        if (!existing) {
          const { data: firstStep } = await supabaseAdmin
            .from('sequence_steps')
            .select('delay_days')
            .eq('sequence_id', winBackSequence.id)
            .eq('step_number', 1)
            .single();

          if (firstStep) {
            const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
            await supabaseAdmin.from('sequence_enrollments').insert({
              sequence_id: winBackSequence.id,
              fan_id: subData.fan_id,
              artist_id: subData.artist_id,
              current_step: 0,
              status: 'active',
              next_send_at: nextSendAt,
            });
          }
        }
      }
    } catch (err) {
      console.error('Win-back sequence enrollment failed:', err);
    }
  }
}

// ─── Product purchase ────────────────────────────────────────────────────────

export async function handleProductPurchase(supabaseAdmin: AdminClient, session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.product_id || !metadata?.fan_id || !metadata?.artist_id) {
    console.log('No product purchase metadata found');
    return;
  }

  const { product_id, fan_id, artist_id } = metadata;
  const variantSelections = metadata.variant_selections ? JSON.parse(metadata.variant_selections) : null;

  const { fanCity, fanState, fanCountry, fanCountryCode } = extractGeo(session);
  const shippingAddress = extractShippingAddress(session);

  // Get product price and quantity_sold
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('price, quantity_sold, title, type')
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

  // Insert purchase record and get the ID
  const { data: purchase } = await supabaseAdmin
    .from('purchases')
    .insert({
      fan_id,
      product_id,
      artist_id,
      stripe_payment_intent_id: session.payment_intent as string,
      amount: product.price,
      status: 'completed',
      purchased_at: new Date().toISOString(),
      ...(shippingAddress && { shipping_address: shippingAddress }),
      ...(variantSelections && { variant_selections: variantSelections }),
    })
    .select()
    .single();

  // Atomic quantity increment (prevents oversell)
  const { data: stockOk } = await supabaseAdmin.rpc('increment_quantity_sold', { p_product_id: product_id });
  if (stockOk === false) {
    console.error('Product sold out during webhook processing:', product_id);
    return;
  }

  // Resolve campaign attribution from UTM params
  // Product checkout stores UTM in both session.metadata and payment_intent_data.metadata
  const prodUtmSource = metadata.utm_source || '';
  const prodUtmMedium = metadata.utm_medium || '';
  const prodUtmCampaign = metadata.utm_campaign || '';
  const prodSourceCampaignId = prodUtmSource === 'crwn_campaign' && prodUtmCampaign ? prodUtmCampaign : null;
  const prodSourceSequenceId = prodUtmSource === 'crwn_sequence' && prodUtmCampaign ? prodUtmCampaign : null;

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
      ...(prodSourceCampaignId && { source_campaign_id: prodSourceCampaignId }),
      ...(prodSourceSequenceId && { source_sequence_id: prodSourceSequenceId }),
      ...(prodUtmSource && { utm_source: prodUtmSource }),
      ...(prodUtmMedium && { utm_medium: prodUtmMedium }),
      ...(prodUtmCampaign && { utm_campaign: prodUtmCampaign }),
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

    // Check for milestone unlocks
    try {
      await checkAndAwardMilestones(artist_id, artistProfile.user_id);
    } catch (err) {
      console.error('Milestone check failed:', err);
    }
  }

  // Send purchase confirmation + receipt email to fan
  try {
    const fanEmail = session.customer_email || session.customer_details?.email;
    const { data: artistNameData } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', artistProfile?.user_id)
      .single();
    const artistDisplayName = artistNameData?.display_name || 'an artist';
    if (fanEmail) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: fanEmail,
        subject: `Purchase confirmed - ${productTitle}`,
        html: purchaseEmail(fanName, artistDisplayName, productTitle, (grossAmount / 100).toFixed(2), product.type || 'product'),
      });
      // Send receipt with support contact info
      await resend.emails.send({
        from: FROM_EMAIL,
        to: fanEmail,
        subject: `Your CRWN receipt - ${productTitle}`,
        html: receiptEmail({
          displayName: fanName,
          artistName: artistDisplayName,
          amount: grossAmount,
          productName: productTitle,
          purchaseDate: new Date().toISOString(),
          type: 'product',
        }),
      });
    }
  } catch (err) {
    console.error('Purchase email failed:', err);
  }

  // Send new purchase email to artist
  try {
    if (artistProfile) {
      const { data: { user: artistAuthUser } } = await supabaseAdmin.auth.admin.getUserById(artistProfile.user_id);
      const artistEmail = artistAuthUser?.email;
      if (artistEmail) {
        const { data: artistNameForEmail } = await supabaseAdmin
          .from('profiles')
          .select('display_name')
          .eq('id', artistProfile.user_id)
          .single();
        const artistDisplayNameForEmail = artistNameForEmail?.display_name || 'there';
        await resend.emails.send({
          from: FROM_EMAIL,
          to: artistEmail,
          subject: `New sale: ${fanName} purchased ${productTitle} 💰`,
          html: artistNewPurchaseEmail(artistDisplayNameForEmail, fanName, productTitle, (grossAmount / 100).toFixed(2), product.type || 'product'),
        });
      }
    }
  } catch (err) {
    console.error('Artist purchase email failed:', err);
  }

  // === BOOKING TOKEN: Auto-create for experience products ===
  if (product.type === 'experience' && purchase) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await supabaseAdmin.from('booking_tokens').insert({
      fan_id,
      artist_id,
      product_id,
      purchase_id: purchase.id,
      status: 'unused',
      expires_at: expiresAt,
    });

    // Send booking token email to fan
    try {
      const fanEmail = session.customer_email || session.customer_details?.email;
      const { data: artistNameData } = await supabaseAdmin
        .from('profiles')
        .select('display_name')
        .eq('id', artistProfile?.user_id)
        .single();
      const artistDisplayName = artistNameData?.display_name || 'an artist';

      if (fanEmail) {
        const { subject, html } = bookingTokenEmail(
          fanName.split(' ')[0] || 'there',
          artistDisplayName,
          productTitle,
          expiresAt
        );
        await resend.emails.send({
          from: FROM_EMAIL,
          to: fanEmail,
          subject,
          html,
        });
      }
    } catch (err) {
      console.error('Booking token email failed:', err);
    }
  }

  // Record discount code usage if applicable
  const discountCodeId = session.metadata?.discount_code_id;
  if (discountCodeId) {
    try {
      const amountSaved = session.total_details?.amount_discount || 0;
      await recordDiscountCodeUse(discountCodeId, fan_id, artist_id, session.id, amountSaved);
    } catch (err) {
      console.error('Discount code recording failed:', err);
    }
  }

  // Mark any abandoned checkouts as recovered
  try {
    await supabaseAdmin
      .from('abandoned_checkouts')
      .update({ recovered: true })
      .eq('fan_id', fan_id)
      .eq('artist_id', artist_id)
      .eq('recovered', false);
  } catch (err) {
    console.error('Abandoned checkout recovery update failed:', err);
  }

  // Enroll fan in post-purchase upsell sequence if one exists
  try {
    const { data: upsellSequence } = await supabaseAdmin
      .from('sequences')
      .select('id')
      .eq('artist_id', artist_id)
      .eq('trigger_type', 'post_purchase_upsell')
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (upsellSequence) {
      const { data: existing } = await supabaseAdmin
        .from('sequence_enrollments')
        .select('id')
        .eq('sequence_id', upsellSequence.id)
        .eq('fan_id', fan_id)
        .maybeSingle();

      if (!existing) {
        const { data: firstStep } = await supabaseAdmin
          .from('sequence_steps')
          .select('delay_days')
          .eq('sequence_id', upsellSequence.id)
          .eq('step_number', 1)
          .single();

        if (firstStep) {
          const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
          await supabaseAdmin.from('sequence_enrollments').insert({
            sequence_id: upsellSequence.id,
            fan_id,
            artist_id,
            current_step: 0,
            status: 'active',
            next_send_at: nextSendAt,
          });
        }
      }
    }
  } catch (err) {
    console.error('Post-purchase sequence enrollment failed:', err);
  }

  // Also enroll in new_purchase sequence
  await enrollInSequence(supabaseAdmin, artist_id, fan_id, 'new_purchase');

  console.log('Product purchase recorded:', { fan_id, product_id, artist_id });
}

// ─── Booking purchase ────────────────────────────────────────────────────────

export async function handleBookingPurchase(supabaseAdmin: AdminClient, session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.booking_session_id || !metadata?.buyer_id || !metadata?.artist_id) {
    console.log('No booking purchase metadata found');
    return;
  }

  const { booking_session_id, buyer_id, artist_id } = metadata;

  const { fanCity, fanState, fanCountry, fanCountryCode } = extractGeo(session);

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

    // Check for milestone unlocks
    try {
      await checkAndAwardMilestones(artist_id, artistProfile.user_id);
    } catch (err) {
      console.error('Milestone check failed:', err);
    }
  }

  console.log('Booking purchase recorded:', { booking_session_id, buyer_id, artist_id, netAmount });
}

// ─── Platform (CRWN) tier checkout ───────────────────────────────────────────

export async function handlePlatformCheckoutCompleted(supabaseAdmin: AdminClient, session: Stripe.Checkout.Session) {
  const { artist_id, tier, user_id } = session.metadata || {};

  console.log('Platform checkout - artist_id:', artist_id, 'tier:', tier, 'user_id:', user_id);

  if (!artist_id || !tier || !user_id) {
    console.error('Missing platform checkout metadata');
    return;
  }

  // Check if this is a founding artist or partner code checkout
  const isFoundingArtist = session.metadata?.founding_artist === 'true';
  const foundingNumber = session.metadata?.founding_number ? parseInt(session.metadata.founding_number) : null;
  const partnerCode = session.metadata?.partner_code || null;
  const partnerCodeId = session.metadata?.partner_code_id || null;
  const recruiterId = session.metadata?.recruiter_id || null;

  const updateData: Record<string, unknown> = {
    platform_tier: tier,
    platform_stripe_subscription_id: session.subscription as string,
    platform_subscription_status: 'active',
  };

  if (isFoundingArtist && foundingNumber) {
    // Original founding artist program (50 spots)
    const proExpiresAt = new Date();
    proExpiresAt.setMonth(proExpiresAt.getMonth() + 1);
    const feeExpiresAt = new Date();
    feeExpiresAt.setMonth(feeExpiresAt.getMonth() + 6);

    updateData.is_founding_artist = true;
    updateData.founding_artist_number = foundingNumber;
    updateData.founding_artist_expires_at = proExpiresAt.toISOString();
    updateData.founding_fee_expires_at = feeExpiresAt.toISOString();
    updateData.acquisition_source = 'founding';
  } else if (isFoundingArtist && partnerCode) {
    // Partner code: 1 month free trial (handled by Stripe) + 3 months of 5% fee
    const feeExpiresAt = new Date();
    feeExpiresAt.setMonth(feeExpiresAt.getMonth() + 3);
    updateData.is_founding_artist = true;
    updateData.founding_fee_expires_at = feeExpiresAt.toISOString();
    updateData.partner_code_used = partnerCode;
    updateData.acquisition_source = 'partner';

    // Create recruiter referral if partner has a recruiter_id
    if (recruiterId) {
      try {
        await supabaseAdmin
          .from('artist_referrals')
          .insert({
            recruiter_id: recruiterId,
            artist_id: artist_id,
            artist_user_id: user_id,
            status: 'pending',
            flat_fee_amount: 5000,
          });

        // Update recruited_by on artist profile
        await supabaseAdmin
          .from('artist_profiles')
          .update({ recruited_by: recruiterId })
          .eq('id', artist_id);
      } catch (refErr) {
        console.error('Failed to create partner referral:', refErr);
      }
    }
  }

  // Update artist profile with platform tier and subscription
  await supabaseAdmin
    .from('artist_profiles')
    .update(updateData)
    .eq('id', artist_id);

  // Also update the user's profile
  await supabaseAdmin
    .from('profiles')
    .update({
      platform_tier: tier,
    })
    .eq('id', user_id);

  // Track recruiter referral if artist was recruited
  try {
    const { data: artistProfile } = await supabaseAdmin
      .from('artist_profiles')
      .select('recruited_by')
      .eq('id', artist_id)
      .single();

    if (artistProfile?.recruited_by) {
      const { data: recruiter } = await supabaseAdmin
        .from('recruiters')
        .select('id, total_artists_referred, tier')
        .eq('referral_code', artistProfile.recruited_by)
        .eq('is_active', true)
        .maybeSingle();

      if (recruiter) {
        // Check if referral already exists
        const { data: existingRef } = await supabaseAdmin
          .from('artist_referrals')
          .select('id')
          .eq('recruiter_id', recruiter.id)
          .eq('artist_user_id', user_id)
          .maybeSingle();

        if (!existingRef) {
          await supabaseAdmin
            .from('artist_referrals')
            .insert({
              recruiter_id: recruiter.id,
              artist_id: artist_id,
              artist_user_id: user_id,
              status: 'pending',
            });

          // Notify recruiter via email
          try {
            const { data: recruiterProfile } = await supabaseAdmin
              .from('profiles')
              .select('display_name')
              .eq('id', (await supabaseAdmin.from('recruiters').select('user_id').eq('id', recruiter.id).single()).data?.user_id)
              .single();

            const recruiterUserId = (await supabaseAdmin.from('recruiters').select('user_id').eq('id', recruiter.id).single()).data?.user_id;
            const recruiterEmail = recruiterUserId ? (await supabaseAdmin.auth.admin.getUserById(recruiterUserId)).data?.user?.email : null;

            const { data: artistName } = await supabaseAdmin
              .from('profiles')
              .select('display_name')
              .eq('id', user_id)
              .single();

            if (recruiterEmail) {
              const firstName = (recruiterProfile?.display_name || '').split(' ')[0] || 'there';
              const artName = artistName?.display_name || 'An artist';
              const emailContent = recruiterArtistSignupEmail({ recruiterName: firstName, artistName: artName });
              await resend.emails.send({ from: FROM_EMAIL, to: recruiterEmail, subject: emailContent.subject, html: emailContent.html });
            }
          } catch (emailErr) {
            console.error('Recruiter notification email failed:', emailErr);
          }

          // Update recruiter count
          const newCount = (recruiter.total_artists_referred || 0) + 1;
          let newTier = recruiter.tier;
          if (newCount >= 16) newTier = 'ambassador';
          else if (newCount >= 6) newTier = 'connector';

          await supabaseAdmin
            .from('recruiters')
            .update({
              total_artists_referred: newCount,
              tier: newTier,
            })
            .eq('id', recruiter.id);
        }
      }
    }
  } catch (err) {
    console.error('Recruiter tracking error:', err);
  }

  // Send artist tier welcome email
  try {
    const { data: artistUser } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', user_id)
      .single();
    const artistEmail = session.customer_email || session.customer_details?.email;
    const tierLabel = tier === 'pro' ? 'Pro' : tier === 'empire' ? 'Empire' : 'Label';
    if (artistEmail) {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: artistEmail,
        subject: `Welcome to ${tierLabel} on CRWN 👑`,
        html: artistTierEmail(artistUser?.display_name || 'there', tierLabel),
      });
    }
  } catch (err) {
    console.error('Artist tier email failed:', err);
  }

  console.log('Platform tier updated:', { artist_id, tier });
}

// ─── Platform subscription updated ──────────────────────────────────────────

export async function handlePlatformSubscriptionUpdated(supabaseAdmin: AdminClient, subscription: Stripe.Subscription) {
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

// ─── Platform subscription deleted ──────────────────────────────────────────

export async function handlePlatformSubscriptionDeleted(supabaseAdmin: AdminClient, subscription: Stripe.Subscription) {
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

  // Enroll in platform win-back sequence
  await enrollInPlatformSequence(supabaseAdmin, artist.user_id, 'paid_churned');
}

// ─── Platform invoice payment failed ─────────────────────────────────────────

export async function handlePlatformInvoicePaymentFailed(supabaseAdmin: AdminClient, invoice: Stripe.Invoice) {
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

// ─── Charge refunded ─────────────────────────────────────────────────────────

export async function handleChargeRefunded(supabaseAdmin: AdminClient, charge: Stripe.Charge) {
  const paymentIntentId = charge.payment_intent as string;
  if (!paymentIntentId) return;

  const amountRefunded = charge.amount_refunded;
  console.log('Charge refunded:', paymentIntentId, 'amount:', amountRefunded);

  // Find the original earning by stripe_payment_id
  const { data: originalEarning } = await supabaseAdmin
    .from('earnings')
    .select('id, artist_id, fan_id, net_amount, gross_amount, platform_fee, type, description')
    .eq('stripe_payment_id', paymentIntentId)
    .maybeSingle();

  if (!originalEarning) {
    console.log('No earning found for refunded payment:', paymentIntentId);
    return;
  }

  // Calculate refund proportions
  const refundRatio = amountRefunded / originalEarning.gross_amount;
  const refundedNet = Math.round(originalEarning.net_amount * refundRatio);
  const refundedFee = Math.round(originalEarning.platform_fee * refundRatio);

  // Write negative earnings record
  await supabaseAdmin
    .from('earnings')
    .insert({
      artist_id: originalEarning.artist_id,
      fan_id: originalEarning.fan_id,
      type: 'refund',
      description: `Refund: ${originalEarning.description}`,
      gross_amount: -amountRefunded,
      platform_fee: -refundedFee,
      net_amount: -refundedNet,
      stripe_payment_id: paymentIntentId + '_refund',
      metadata: {
        original_earning_id: originalEarning.id,
        refund_amount: amountRefunded,
      },
    });

  // Update purchase status if it was a product purchase
  if (originalEarning.type === 'purchase') {
    await supabaseAdmin
      .from('purchases')
      .update({ status: 'refunded', updated_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', paymentIntentId);
  }

  // Notify artist
  const { data: artistProfile } = await supabaseAdmin
    .from('artist_profiles')
    .select('user_id')
    .eq('id', originalEarning.artist_id)
    .single();

  if (artistProfile) {
    await supabaseAdmin.from('notifications').insert({
      user_id: artistProfile.user_id,
      type: 'refund',
      title: '⚠️ Refund processed',
      message: `$${(amountRefunded / 100).toFixed(2)} refunded — ${originalEarning.description}`,
      link: '/profile/artist?tab=payouts',
    });
  }

  console.log('Refund recorded:', { artistId: originalEarning.artist_id, amount: amountRefunded });
}

// ─── Dispute created ─────────────────────────────────────────────────────────

export async function handleDisputeCreated(supabaseAdmin: AdminClient, dispute: Stripe.Dispute) {
  const paymentIntentId = dispute.payment_intent as string;
  const chargeId = dispute.charge as string;
  const disputeAmount = dispute.amount;
  const disputeReason = dispute.reason || 'unknown';
  console.log('Dispute created:', paymentIntentId, 'amount:', disputeAmount, 'reason:', disputeReason);

  // Find the original earning with full details
  const { data: originalEarning } = await supabaseAdmin
    .from('earnings')
    .select('id, artist_id, fan_id, type, description, created_at, metadata')
    .eq('stripe_payment_id', paymentIntentId)
    .maybeSingle();

  if (!originalEarning) {
    console.log('No earning found for disputed payment:', paymentIntentId);
    return;
  }

  // Get fan profile
  const { data: fanProfile } = await supabaseAdmin
    .from('profiles')
    .select('display_name, email')
    .eq('id', originalEarning.fan_id)
    .single();

  const fanName = fanProfile?.display_name || 'Unknown';
  const fanEmail = fanProfile?.email || '';

  // Get artist info
  const { data: artistProfile } = await supabaseAdmin
    .from('artist_profiles')
    .select('user_id')
    .eq('id', originalEarning.artist_id)
    .single();

  let artistDisplayName = 'Unknown Artist';
  if (artistProfile) {
    const { data: artistNameData } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', artistProfile.user_id)
      .single();
    artistDisplayName = artistNameData?.display_name || 'Unknown Artist';
  }

  // Build evidence based on earning type
  let productDescription = 'Digital music service purchase on CRWN';
  let accessActivityLog = '';

  if (originalEarning.type === 'subscription' || originalEarning.type === 'renewal') {
    productDescription = `Music subscription on CRWN (thecrwn.app) - recurring access to exclusive content from ${artistDisplayName}`;

    // Get subscription details
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('started_at, current_period_start')
      .eq('fan_id', originalEarning.fan_id)
      .eq('artist_id', originalEarning.artist_id)
      .maybeSingle();

    // Get listening history for activity proof
    const { count: playCount } = await supabaseAdmin
      .from('listening_history')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', originalEarning.fan_id);

    const { data: lastPlay } = await supabaseAdmin
      .from('listening_history')
      .select('played_at')
      .eq('user_id', originalEarning.fan_id)
      .order('played_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const signupDate = sub?.started_at ? new Date(sub.started_at).toLocaleDateString() : 'unknown';
    const lastActive = lastPlay?.played_at ? new Date(lastPlay.played_at).toLocaleDateString() : 'unknown';
    accessActivityLog = `User signed up ${signupDate}. Has ${playCount || 0} total plays on platform. Last active ${lastActive}.`;
  } else if (originalEarning.type === 'purchase') {
    productDescription = `Digital product purchase on CRWN (thecrwn.app) from ${artistDisplayName}`;

    // Get purchase details
    const { data: purchase } = await supabaseAdmin
      .from('purchases')
      .select('purchased_at')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();

    const purchaseDate = purchase?.purchased_at ? new Date(purchase.purchased_at).toLocaleDateString() : 'unknown';
    accessActivityLog = `User purchased digital product on ${purchaseDate}. Product was delivered immediately via digital download/access.`;
  }

  const serviceDate = new Date(originalEarning.created_at).toISOString().split('T')[0];
  const customerPurchaseIp = (originalEarning.metadata as Record<string, string>)?.customer_ip || undefined;

  // Auto-submit evidence to Stripe
  try {
    await stripe.disputes.update(dispute.id, {
      evidence: {
        customer_email_address: fanEmail,
        customer_name: fanName,
        product_description: productDescription,
        service_date: serviceDate,
        access_activity_log: accessActivityLog || undefined,
        customer_purchase_ip: customerPurchaseIp,
        uncategorized_text: 'This is a legitimate charge for a digital music service. The customer created an account, selected a subscription tier or product, and entered payment details through Stripe Checkout. They have been actively using the service.',
      },
      submit: true,
    });
    console.log('Dispute evidence auto-submitted for:', dispute.id);
  } catch (err) {
    console.error('Failed to submit dispute evidence:', err);
  }

  // Notify artist of dispute
  if (artistProfile) {
    await supabaseAdmin.from('notifications').insert({
      user_id: artistProfile.user_id,
      type: 'dispute',
      title: '🚨 Payment dispute opened',
      message: `$${(disputeAmount / 100).toFixed(2)} disputed - ${originalEarning.description}. Evidence has been auto-submitted.`,
      link: '/profile/artist?tab=payouts',
    });
  }

  // Send platform alert email
  const chargeDate = new Date(originalEarning.created_at).toLocaleDateString();
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: 'support@thecrwn.app',
      subject: `DISPUTE ALERT - $${(disputeAmount / 100).toFixed(2)} from ${fanName}`,
      html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#1A1A1A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#D4AF37;font-size:32px;margin:0;">CRWN</h1>
    </div>
    <div style="background-color:#242424;border-radius:16px;padding:32px;border:1px solid #ff4444;">
      <h2 style="color:#ff4444;font-size:24px;margin:0 0 16px;">Dispute Alert</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="color:#A0A0A0;padding:8px 0;">Amount</td><td style="color:#FFFFFF;padding:8px 0;text-align:right;font-weight:600;">$${(disputeAmount / 100).toFixed(2)}</td></tr>
        <tr><td style="color:#A0A0A0;padding:8px 0;">Fan</td><td style="color:#FFFFFF;padding:8px 0;text-align:right;">${fanName}</td></tr>
        <tr><td style="color:#A0A0A0;padding:8px 0;">Fan Email</td><td style="color:#FFFFFF;padding:8px 0;text-align:right;">${fanEmail}</td></tr>
        <tr><td style="color:#A0A0A0;padding:8px 0;">Artist</td><td style="color:#D4AF37;padding:8px 0;text-align:right;">${artistDisplayName}</td></tr>
        <tr><td style="color:#A0A0A0;padding:8px 0;">Charge Date</td><td style="color:#FFFFFF;padding:8px 0;text-align:right;">${chargeDate}</td></tr>
        <tr><td style="color:#A0A0A0;padding:8px 0;">Reason</td><td style="color:#FFFFFF;padding:8px 0;text-align:right;">${disputeReason}</td></tr>
        <tr><td style="color:#A0A0A0;padding:8px 0;">Dispute ID</td><td style="color:#FFFFFF;padding:8px 0;text-align:right;font-size:12px;">${dispute.id}</td></tr>
      </table>
      <p style="color:#A0A0A0;font-size:14px;margin:16px 0 0;">Evidence has been auto-submitted to Stripe.</p>
    </div>
  </div>
</body>
</html>`,
    });
  } catch (err) {
    console.error('Dispute alert email failed:', err);
  }

  console.log('Dispute handled:', { disputeId: dispute.id, artistId: originalEarning.artist_id, amount: disputeAmount });
}

// ─── Abandoned cart (checkout.session.expired) ────────────────────────────────

export async function handleCheckoutExpired(supabaseAdmin: AdminClient, session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata) return;

  // Check if this is a platform tier upgrade checkout (CRWN SaaS)
  if (metadata.tier && metadata.artist_id && !metadata.fan_id) {
    console.log('Abandoned platform upgrade detected:', { artist_id: metadata.artist_id, tier: metadata.tier });

    // Enroll artist in platform upgrade_abandoned sequence
    try {
      const { data: artist } = await supabaseAdmin
        .from('artist_profiles')
        .select('user_id')
        .eq('id', metadata.artist_id)
        .single();

      if (artist) {
        await enrollInPlatformSequence(supabaseAdmin, artist.user_id, 'upgrade_abandoned');
      }
    } catch (err) {
      console.error('Platform abandoned upgrade enrollment failed:', err);
    }
    return;
  }

  // Fan checkout abandoned
  const fan_id = metadata.fan_id;
  const artist_id = metadata.artist_id;
  if (!fan_id || !artist_id) return;

  const checkoutType = metadata.product_id ? 'product' : metadata.booking_session_id ? 'booking' : 'subscription';

  console.log('Abandoned checkout detected:', { fan_id, artist_id, checkoutType });

  // Record the abandoned checkout
  await supabaseAdmin.from('abandoned_checkouts').insert({
    fan_id,
    artist_id,
    checkout_type: checkoutType,
    product_id: metadata.product_id || null,
    tier_id: metadata.tier_id || null,
    stripe_session_id: session.id,
  });

  // Enroll in abandoned_cart sequence if one exists
  await enrollInSequence(supabaseAdmin, artist_id, fan_id, 'abandoned_cart');
}

// ─── Shared: enroll fan in a sequence by trigger type ─────────────────────────

async function enrollInSequence(
  supabaseAdmin: AdminClient,
  artistId: string,
  fanId: string,
  triggerType: string,
) {
  try {
    const { data: sequence } = await supabaseAdmin
      .from('sequences')
      .select('id')
      .eq('artist_id', artistId)
      .eq('trigger_type', triggerType)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!sequence) return;

    // Check not already enrolled (active or completed)
    const { data: existing } = await supabaseAdmin
      .from('sequence_enrollments')
      .select('id')
      .eq('sequence_id', sequence.id)
      .eq('fan_id', fanId)
      .in('status', ['active', 'completed'])
      .maybeSingle();

    if (existing) return;

    const { data: firstStep } = await supabaseAdmin
      .from('sequence_steps')
      .select('delay_days')
      .eq('sequence_id', sequence.id)
      .eq('step_number', 1)
      .single();

    if (firstStep) {
      const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from('sequence_enrollments').insert({
        sequence_id: sequence.id,
        fan_id: fanId,
        artist_id: artistId,
        current_step: 0,
        status: 'active',
        next_send_at: nextSendAt,
      });
      console.log(`Enrolled fan ${fanId} in ${triggerType} sequence ${sequence.id}`);
    }
  } catch (err) {
    console.error(`Sequence enrollment (${triggerType}) failed:`, err);
  }
}

// ─── Platform sequence enrollment (CRWN → artist) ────────────────────────────

async function enrollInPlatformSequence(
  supabaseAdmin: AdminClient,
  artistUserId: string,
  triggerType: string,
) {
  try {
    const { data: sequence } = await supabaseAdmin
      .from('platform_sequences')
      .select('id')
      .eq('trigger_type', triggerType)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();

    if (!sequence) return;

    const { data: existing } = await supabaseAdmin
      .from('platform_sequence_enrollments')
      .select('id')
      .eq('sequence_id', sequence.id)
      .eq('artist_user_id', artistUserId)
      .in('status', ['active', 'completed'])
      .maybeSingle();

    if (existing) return;

    const { data: firstStep } = await supabaseAdmin
      .from('platform_sequence_steps')
      .select('delay_days')
      .eq('sequence_id', sequence.id)
      .eq('step_number', 1)
      .single();

    if (firstStep) {
      const nextSendAt = new Date(Date.now() + firstStep.delay_days * 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin.from('platform_sequence_enrollments').insert({
        sequence_id: sequence.id,
        artist_user_id: artistUserId,
        current_step: 0,
        status: 'active',
        next_send_at: nextSendAt,
      });
      console.log(`Enrolled artist ${artistUserId} in platform ${triggerType} sequence`);
    }
  } catch (err) {
    console.error(`Platform sequence enrollment (${triggerType}) failed:`, err);
  }
}
