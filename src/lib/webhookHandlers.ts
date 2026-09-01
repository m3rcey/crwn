import Stripe from 'stripe';
import { stripe } from '@/lib/stripe/client';
import { createPurchaseObligation } from '@/lib/purchaseObligations';
import { reserveFromStripeMetadata } from '@/lib/teamSplits/reserve';
import { fundReserves, freezeReservesForEarning } from '@/lib/teamSplits/reservations';
import { moneyKeyFromMetadata } from '@/lib/teamSplits/moneyKey';
import { recoverArtistShareOnRefund } from '@/lib/stripe/refundRecovery';
import { createNotification, notifyNewSubscriber, notifyNewPurchase, notifySubscriptionCanceled } from '@/lib/notifications';
import { resend, FROM_EMAIL } from '@/lib/resend';
import { recruiterArtistSignupEmail } from '@/lib/emails/recruiterArtistSignup';
import { subscriptionEmail } from '@/lib/emails/subscription';
import { artistTierEmail } from '@/lib/emails/artistTier';
import { purchaseEmail } from '@/lib/emails/purchase';
import { bookingTokenEmail } from '@/lib/emails/bookingToken';
import { artistNewSubscriberEmail } from '@/lib/emails/artistNewSubscriber';
import { artistNewPurchaseEmail } from '@/lib/emails/artistNewPurchase';
// Z8: membership depth history. Read-only helper + the single centralized writer.
import { currentTierId, recordTierTransition } from '@/lib/tierTransitionStore';
import { receiptEmail } from '@/lib/emails/receipt';
import { checkAndAwardMilestones } from '@/lib/milestones';
import { processReferral } from '@/lib/referrals';
import { insertHeldReferralEarning } from '@/lib/attribution';
import { recordDiscountCodeUse } from '@/lib/discountCodes';
import { recordActivationMilestone } from '@/lib/activationMilestones';
import { getArtistFeePercent } from '@/lib/platformTier';
import { subscriptionEarningNet } from '@/lib/earningsNet';
import { maybeCreateVipWelcomeTask } from '@/lib/promiseTasks';
import { recordFirstPaidConversion } from '@/lib/analytics/paidConversion';
import type { SupabaseClient } from '@supabase/supabase-js';
import { enrollInSequence } from '@/lib/sequences/enroll';
import { exitConvertedEnrollments } from '@/lib/sequences/goalExit';

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


/**
 * TEAM SPLIT SETTLEMENT PROOF (TS-MONEY-009).
 *
 * Returns the `earnings.metadata` fragment recording how many cents of collaborator reserve were
 * ACTUALLY withheld by this settled charge, per deal. The accrual cron reads it through
 * `fundedReserveFor()` and refuses to create a payable without it, so this function is the only
 * thing that makes a Team Split payable at all.
 *
 * It reads the map that checkout attached to the Stripe object, NOT a recomputation: what checkout
 * intended and what Stripe settled can differ (a coupon, a partial capture, a Stripe-side cap on
 * the application fee), and the money that exists is the money Stripe moved.
 *
 * IDEMPOTENT BY CONSTRUCTION. It derives a value rather than performing a write, and the earnings
 * row it lands on is already deduped by `stripe_payment_id`, so a redelivered webhook produces the
 * same fragment on the same row instead of a second reserve.
 *
 * Returns {} when nothing was reserved, which is the overwhelmingly common case and the safe one:
 * no proof, no accrual.
 */
/**
 * TS-MONEY-009 + TS-MONEY-012. Promote this payment's PROVISIONAL cap reservation to FUNDED, now
 * that Stripe has actually settled it, and bind it to the canonical earnings row.
 *
 * Until this runs the reservation holds cap headroom but has ZERO collaborator value: it is an
 * intention, not money. Never fatal, and idempotent, because the RPC only moves rows that are
 * still provisional.
 */
async function fundSettledReservation(
  supabaseAdmin: AdminClient,
  stripeMetadata: unknown,
  invoiceId: string | null,
  earningId: string | null,
): Promise<void> {
  if (!earningId) return;
  try {
    const key = moneyKeyFromMetadata(stripeMetadata);
    if (key) {
      await fundReserves(supabaseAdmin, { kind: 'checkout_session', id: key }, earningId);
    }
    if (invoiceId) {
      await fundReserves(supabaseAdmin, { kind: 'invoice', id: invoiceId }, earningId);
    }
  } catch (err) {
    console.error('Funding the Team Split reservation failed (cap stays reserved):', err);
  }
}

function settledReserveFor(stripeMetadata: unknown): Record<string, unknown> {
  const map = reserveFromStripeMetadata(stripeMetadata);
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  if (total <= 0) return {};
  return { team_split_reserved: map, team_split_reserved_total: total };
}

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
    // Founder window: the checkout route sets this only when a founding window was open, so the
    // key is present in metadata only post-migration. Written conditionally to stay pre-migration safe.
    ...(session.metadata?.is_founder === 'true' ? { is_founder: true } : {}),
  };

  console.log('Upserting subscription:', JSON.stringify(insertData));

  // Z8: read the tier they are LEAVING before the upsert overwrites it. This upsert conflicts on
  // (fan_id, artist_id), so it replaces tier_id in place and also resets started_at: after it runs
  // there is no way to learn what they were on a moment ago. Read-only, and never blocks checkout.
  const prior = await currentTierId(supabaseAdmin, artist_id, fan_id);

  const { data, error } = await supabaseAdmin.from('subscriptions').upsert(insertData, { onConflict: 'fan_id,artist_id' }).select();

  if (error) {
    console.error('Supabase insert error:', JSON.stringify(error));
  } else {
    console.log('Supabase insert success:', JSON.stringify(data));

    // Z8: the movement, recorded only once the subscription state is actually committed. A fan
    // clicking checkout is not a transition; a paid subscription that exists is. Same-tier renewals
    // are dropped by the writer, so a resubscribe to the tier they already had records nothing.
    await recordTierTransition(supabaseAdmin, {
      artistId: artist_id,
      fanId: fan_id,
      subscriptionId: prior.subscriptionId ?? (data?.[0]?.id as string | undefined) ?? null,
      fromTierId: prior.tierId,
      toTierId: tier_id,
      source: 'stripe_checkout',
      evidence: 'observed',
    });

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
    const tierPriceCents = tierData?.price || 0;

    // SEC-006: record the amount ACTUALLY charged, not the sticker price. A promo code or a
    // discount reduces what Stripe collected, and `session.amount_total` is the authoritative
    // charged total in cents. Booking the tier's catalog price instead minted a full-price
    // earning (and full net) behind a $0 charge, and that phantom net funds REAL platform-funded
    // transfers (recruiter commission, Team Split payouts) plus GMV, milestones and break-even
    // pop-ups. `??` not `||`: a 100%-off checkout has amount_total 0, and a $0 charge is a real
    // $0 that must book as 0. Only a null/undefined amount_total falls back to the tier price.
    const grossAmount = session.amount_total ?? tierPriceCents;

    // Fee is tier-driven (read from the artist's platform tier), not a flat 8%.
    // session.application_fee_percent does NOT exist on a Checkout Session, so the old
    // code always fell back to 8% and under-reported the fee for Free-tier (12%)
    // artists. Match the renewal/purchase handlers, which use getArtistFeePercent.
    const subStripeId = (session as unknown as { subscription?: string }).subscription;

    // TS-MONEY-009. The FIRST subscription invoice is funded at CHECKOUT, not on invoice.created,
    // because Stripe creates it already `open` and Checkout forbids updating it while the
    // subscription is `incomplete`. So the reserve proof lives on the SESSION, which is where
    // checkout wrote it. The invoice is consulted only as a fallback for sessions created before
    // this path existed.
    let initialInvoiceMetadata: unknown = session.metadata ?? null;
    if (Object.keys(reserveFromStripeMetadata(initialInvoiceMetadata)).length === 0) {
      try {
        const invId = (session as unknown as { invoice?: string | null }).invoice;
        if (invId) {
          const inv = await stripe.invoices.retrieve(invId);
          initialInvoiceMetadata = inv.metadata ?? null;
        }
      } catch (err) {
        console.error('Initial subscription invoice lookup failed (no reserve proof):', err);
      }
    }

    const feePercent = await getArtistFeePercent(artist_id);
    const platformFee = Math.round(grossAmount * (feePercent / 100));

    // F-01: checkout charged `base fee + attributed_cut` (the referral/clipper commission is
    // ARTIST-funded, added to application_fee_percent), so the artist's true take is gross
    // minus BOTH. Sessions created before the attributed_cut metadata key existed carry no
    // key, read as cut 0, and keep their historical behavior — never guess a commission.
    const attributedCutPercent = Number(session.metadata?.attributed_cut ?? 0) || 0;
    const { commissionCents: attributedCommission, netCents: netAmount } = subscriptionEarningNet({
      grossCents: grossAmount,
      platformFeeCents: platformFee,
      attributedCutPercent,
    });

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
        // subscription_id is groundwork so a future refund resolver can match an
        // initial-subscription earning (keyed by session id) back from a refund's
        // charge.invoice -> invoice.subscription.
        metadata: {
          tierName,
          // The tier's catalog price. gross_amount above is what was actually charged, so a
          // discounted signup is reconcilable: the two differ by the discount.
          tierPrice: tierPriceCents,
          fanDisplayName: fanName,
          ...(subStripeId ? { subscription_id: subStripeId } : {}),
          // F-01 audit trail: the pass-through commission subtracted from net, so a
          // reconciliation can always recompute gross - platform_fee - this = net.
          ...(attributedCommission > 0 ? { attributed_commission: attributedCommission } : {}),
          // TS-MONEY-009. The FIRST subscription invoice is funded by the same invoice.created
          // path as every renewal, so its proof lives on the invoice, not on the checkout session.
          ...settledReserveFor(initialInvoiceMetadata),
        },
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

  // TS-MONEY-012: the provisional cap reservation becomes FUNDED now that Stripe settled.
  await fundSettledReservation(supabaseAdmin, initialInvoiceMetadata, (session as unknown as { invoice?: string | null }).invoice ?? null, earning?.id ?? null);

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
        await createNotification(supabaseAdmin, artistProfile.user_id, 'earning', `💰 +$${(netAmount / 100).toFixed(2)}`, `${fanName} subscribed to ${tierName}`, `/account/payouts?earning=${earning.id}`);
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

      // Funnel: First Paid Conversion. Deduped per artist at the DB, so only the first paid
      // event across ALL rails ever lands; renewals and later sales collapse. The shared
      // recorder also stamps the artist's calculator, which is what lets an acquisition
      // channel be traced to a real dollar.
      await recordFirstPaidConversion(supabaseAdmin, {
        artistId: artist_id,
        kind: 'subscription',
        userId: artistProfile?.user_id,
      });

      // Promise Calendar: high-ticket (VIP) supporters get a 48h personal-welcome
      // task on the artist's Promise Calendar. Best-effort — never blocks checkout.
      try {
        await maybeCreateVipWelcomeTask(supabaseAdmin, {
          artistId: artist_id,
          artistUserId: artistProfile.user_id,
          tierId: tier_id,
          tierName,
          fanId: fan_id,
          fanName,
          // The VIP welcome is owed because of the RUNG the fan joined, so this stays the tier's
          // standing price. A first month discounted to $0 does not make a Platinum member less VIP.
          tierPriceCents,
        });
      } catch (err) {
        console.error('VIP welcome task creation failed:', err);
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
      const attributionSource = session.metadata?.attribution_source;
      const clipperRate = session.metadata?.clipper_rate ? Number(session.metadata.clipper_rate) : undefined;
      if (referralCode && earning) {
        try {
          await processReferral({
            artistId: artist_id,
            referredFanId: fan_id,
            subscriptionId: session.subscription as string,
            referralCode,
            earningId: earning.id,
            grossAmount: grossAmount,
            attributionSource,
            clipperRate,
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

      // The conversion exit: any goal sequence this purchase satisfies closes NOW, so a
      // fan never receives another email selling the tier they just bought. The daily
      // cron re-runs the same check as the self-heal. Never throws.
      await exitConvertedEnrollments(supabaseAdmin, artist_id, fan_id);

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
  const tierPriceCents = tier?.price || 0;

  // SEC-006 (renewal side, same bug): a repeating coupon or a mid-cycle proration means the
  // invoice collected something other than the tier's catalog price. `invoice.amount_paid` is the
  // authoritative collected total in cents for this invoice. `??` not `||`: a fully discounted
  // renewal pays 0, and that real 0 must book as 0 rather than silently re-inflating to sticker.
  const invoiceAmountPaid = (invoice as unknown as { amount_paid?: number | null }).amount_paid;
  const grossAmount = invoiceAmountPaid ?? tierPriceCents;

  // Fee is tier-driven (read from the artist's platform tier), not a flat 8%.
  const feePercent = await getArtistFeePercent(sub.artist_id);
  const platformFee = Math.round(grossAmount * (feePercent / 100));

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

  // Look up any active referral BEFORE writing the earning so net_amount reflects the
  // artist's TRUE take. A recurring referral commission is funded from the artist's
  // payout (it's part of the application_fee Stripe deducted), so it must come out of
  // net. platform_fee stays = the platform's BASE cut — its real revenue; the
  // commission is pass-through to the referrer — so admin revenue metrics stay correct.
  // Cap the commission at what the fee could cover so the platform never funds a gap.
  const { data: existingReferral } = await supabaseAdmin
    .from('referrals')
    .select('id, referrer_fan_id, commission_rate')
    .eq('artist_id', sub.artist_id)
    .eq('referred_fan_id', sub.fan_id)
    .eq('status', 'active')
    .maybeSingle();
  // Same shared formula as the initial-checkout handler (F-01): commission capped at what
  // the fee could cover, artist net = gross - base fee - commission.
  const { commissionCents: referralCommission, netCents: artistNet } = subscriptionEarningNet({
    grossCents: grossAmount,
    platformFeeCents: platformFee,
    attributedCutPercent: existingReferral ? existingReferral.commission_rate : 0,
  });

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
      net_amount: artistNet,
      stripe_payment_id: invoiceWithPayment.payment_intent || invoiceWithPayment.id,
      metadata: {
        tierName,
        // Catalog price; gross_amount is what the invoice actually collected.
        tierPrice: tierPriceCents,
        fanDisplayName: fanName,
        renewal: true,
        ...(referralCommission > 0 ? { attributed_commission: referralCommission } : {}),
        // TS-MONEY-009. Proof of what the DRAFT invoice actually withheld, read off the settled
        // invoice rather than recomputed from deal terms that may have changed since. Without this
        // a funded renewal could never pay its collaborator.
        ...settledReserveFor(invoice.metadata),
      },
      fan_city: fanCity,
      fan_state: fanState,
      fan_country: fanCountry,
      fan_country_code: fanCountryCode,
    })
    .select('id')
    .single();

  // TS-MONEY-012: the provisional cap reservation becomes FUNDED now that Stripe settled.
  await fundSettledReservation(supabaseAdmin, invoice.metadata, invoice.id as string, earning?.id ?? null);

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
    // F-09: the number the artist is told must be the number the ledger recorded.
    // artistNet is what the earnings row stored, commission already subtracted.
    await createNotification(supabaseAdmin, artistProfile.user_id, 'earning', `💰 +$${(artistNet / 100).toFixed(2)}`, `${fanName} renewed subscription to ${tierName}`, `/account/payouts?earning=${earning.id}`);

    // Check for milestone unlocks
    try {
      await checkAndAwardMilestones(sub.artist_id, artistProfile.user_id);
    } catch (err) {
      console.error('Milestone check failed:', err);
    }

    // Pay the recurring referral commission (referral looked up above). Uses the same
    // capped amount that was subtracted from the earning's net, so paid == collected.
    if (existingReferral && earning) {
      const commissionAmount = referralCommission;

      await insertHeldReferralEarning(supabaseAdmin, {
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

  console.log('Subscription renewal processed:', { subscriptionId, artistId: sub.artist_id, artistNet });
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
    // Name the FK: two exist to subscription_tiers, and an ambiguous embed fails the
    // whole statement, which on a money path reads as "subscription not found".
    .select('*, tier:subscription_tiers!subscriptions_tier_id_fkey(stripe_price_id)')
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

      // Z8: a scheduled downgrade becomes a transition HERE, when Stripe confirms the new price is
      // in force, not when the fan requested it. The request only set pending_tier_id; access and
      // billing did not change until this moment, so this is when the state actually moved.
      await recordTierTransition(supabaseAdmin, {
        artistId: subData.artist_id as string,
        fanId: subData.fan_id as string,
        subscriptionId: subData.id as string,
        fromTierId: (subData.tier_id as string) ?? null,
        toTierId: subData.pending_tier_id as string,
        source: 'scheduled_downgrade',
        evidence: 'observed',
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

      // Conversion exit first: an upgrade that reaches a goal ends the sequence selling
      // it (Gold-goal nurture ends when Silver upgrades to Gold; the Platinum-goal
      // ascension ends when Gold upgrades to Platinum).
      await exitConvertedEnrollments(supabaseAdmin, subData.artist_id, subData.fan_id);

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
      action_url: '/studio/manager',
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
    .select('price, quantity_sold, title, type, delivery_type')
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
  // Record the amount ACTUALLY charged, not the sticker price. Tier shop_discount
  // (and discount codes) reduce unit_amount at checkout, so session.amount_total is
  // the truth. Falling back to product.price only when Stripe omits the total.
  const grossAmount = session.amount_total ?? product.price ?? 0;

  // Fee is tier-driven (read from the artist's platform tier), not a flat 8%.
  const feePercent = await getArtistFeePercent(artist_id);
  const platformFee = Math.round(grossAmount * (feePercent / 100));
  const netAmount = grossAmount - platformFee;

  // Insert purchase record and get the ID
  const { data: purchase } = await supabaseAdmin
    .from('purchases')
    .insert({
      fan_id,
      product_id,
      artist_id,
      stripe_payment_intent_id: session.payment_intent as string,
      amount: grossAmount,
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

  // PURCHASE-level fulfillment (spec rule: only a real purchase creates the
  // task): a shipped product gets its shipment on the Promise Calendar, a
  // scheduled experience gets its booking task. Digital creates nothing.
  // Best-effort + idempotent per purchase; never blocks the money path.
  if (purchase?.id) {
    await createPurchaseObligation(supabaseAdmin, {
      artistId: artist_id,
      productId: product_id,
      purchaseId: purchase.id,
      fanId: fan_id,
      fanName,
      productTitle,
      deliveryType: (product as { delivery_type?: string | null }).delivery_type,
    });
  }

  // Resolve campaign attribution from UTM params
  // Product checkout stores UTM in both session.metadata and payment_intent_data.metadata
  const prodUtmSource = metadata.utm_source || '';
  const prodUtmMedium = metadata.utm_medium || '';
  const prodUtmCampaign = metadata.utm_campaign || '';
  const prodSourceCampaignId = prodUtmSource === 'crwn_campaign' && prodUtmCampaign ? prodUtmCampaign : null;
  const prodSourceSequenceId = prodUtmSource === 'crwn_sequence' && prodUtmCampaign ? prodUtmCampaign : null;

  // Referral attribution capture only (NO referral_earnings row for one-time purchases; pay later)
  const prodReferralCode = metadata.referral_code || '';
  const prodAttributionSource = metadata.attribution_source || '';

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
      metadata: {
        // Proof that collaborator money was actually withheld by THIS charge (TS-MONEY-009).
        ...settledReserveFor(session.metadata),
        productTitle,
        fanDisplayName: fanName,
        ...(prodReferralCode && { referral_code: prodReferralCode }),
        ...(prodAttributionSource && { attribution_source: prodAttributionSource }),
      },
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

  // TS-MONEY-012: the provisional cap reservation becomes FUNDED now that Stripe settled.
  await fundSettledReservation(supabaseAdmin, session.metadata, null, earning?.id ?? null);

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
      await createNotification(supabaseAdmin, artistProfile.user_id, 'earning', `💰 +$${(netAmount / 100).toFixed(2)}`, `${fanName} purchased ${productTitle}`, `/account/payouts?earning=${earning.id}`);
    }

    // Check for milestone unlocks
    try {
      await checkAndAwardMilestones(artist_id, artistProfile.user_id);
    } catch (err) {
      console.error('Milestone check failed:', err);
    }

    // Funnel: First Paid Conversion (product path). Same per-artist dedupe as every other
    // rail; whichever paid event lands first wins, the rest collapse.
    await recordFirstPaidConversion(supabaseAdmin, {
      artistId: artist_id,
      kind: 'product',
      userId: artistProfile?.user_id,
    });
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

// ─── Track purchase (one-time per-track sale) ────────────────────────────────

export async function handleTrackPurchase(supabaseAdmin: AdminClient, session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.track_id || !metadata?.fan_id || !metadata?.artist_id) {
    console.log('No track purchase metadata found');
    return;
  }

  const { track_id, fan_id, artist_id } = metadata;

  const { fanCity, fanState, fanCountry, fanCountryCode } = extractGeo(session);

  const { data: track } = await supabaseAdmin
    .from('tracks')
    .select('price, title')
    .eq('id', track_id)
    .single();

  if (!track) {
    console.error('Track not found:', track_id);
    return;
  }

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
  const trackTitle = track.title || 'Unknown track';
  const grossAmount = track.price || 0;

  // Fee is tier-driven (read from the artist's platform tier), not a flat 8%.
  const feePercent = await getArtistFeePercent(artist_id);
  const platformFee = Math.round(grossAmount * (feePercent / 100));
  const netAmount = grossAmount - platformFee;

  // Insert purchase record (idempotent: webhook route already dedupes by event id,
  // and Stripe's payment_intent is unique per charge)
  await supabaseAdmin
    .from('purchases')
    .insert({
      fan_id,
      track_id,
      artist_id,
      stripe_payment_intent_id: session.payment_intent as string,
      amount: grossAmount,
      status: 'completed',
      purchased_at: new Date().toISOString(),
    });

  const utmSource = metadata.utm_source || '';
  const utmMedium = metadata.utm_medium || '';
  const utmCampaign = metadata.utm_campaign || '';
  const sourceCampaignId = utmSource === 'crwn_campaign' && utmCampaign ? utmCampaign : null;
  const sourceSequenceId = utmSource === 'crwn_sequence' && utmCampaign ? utmCampaign : null;

  // Referral attribution capture only (NO referral_earnings row for one-time purchases; pay later)
  const trackReferralCode = metadata.referral_code || '';
  const trackAttributionSource = metadata.attribution_source || '';

  const { data: earning } = await supabaseAdmin
    .from('earnings')
    .insert({
      artist_id,
      fan_id,
      type: 'purchase',
      description: `${fanName} purchased ${trackTitle}`,
      gross_amount: grossAmount,
      platform_fee: platformFee,
      net_amount: netAmount,
      stripe_payment_id: session.payment_intent || session.id,
      metadata: {
        // Proof that collaborator money was actually withheld by THIS charge (TS-MONEY-009).
        ...settledReserveFor(session.metadata),
        trackTitle,
        fanDisplayName: fanName,
        track_id,
        ...(trackReferralCode && { referral_code: trackReferralCode }),
        ...(trackAttributionSource && { attribution_source: trackAttributionSource }),
      },
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

  // TS-MONEY-012: the provisional cap reservation becomes FUNDED now that Stripe settled.
  await fundSettledReservation(supabaseAdmin, session.metadata, null, earning?.id ?? null);

  if (artistProfile) {
    await notifyNewPurchase(supabaseAdmin, artistProfile.user_id, fanName, trackTitle);

    if (earning) {
      await createNotification(supabaseAdmin, artistProfile.user_id, 'earning', `💰 +$${(netAmount / 100).toFixed(2)}`, `${fanName} purchased ${trackTitle}`, `/account/payouts?earning=${earning.id}`);
    }

    try {
      await checkAndAwardMilestones(artist_id, artistProfile.user_id);
    } catch (err) {
      console.error('Milestone check failed:', err);
    }
  }

  // Funnel: First Paid Conversion (track path). A track sale is real money from a fan, so an
  // artist whose first dollar arrived this way must not read as "never converted".
  await recordFirstPaidConversion(supabaseAdmin, {
    artistId: artist_id,
    kind: 'track',
    userId: artistProfile?.user_id,
  });

  // Send receipts
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
        subject: `Purchase confirmed - ${trackTitle}`,
        html: purchaseEmail(fanName, artistDisplayName, trackTitle, (grossAmount / 100).toFixed(2), 'track'),
      });
      await resend.emails.send({
        from: FROM_EMAIL,
        to: fanEmail,
        subject: `Your CRWN receipt - ${trackTitle}`,
        html: receiptEmail({
          displayName: fanName,
          artistName: artistDisplayName,
          amount: grossAmount,
          productName: trackTitle,
          purchaseDate: new Date().toISOString(),
          type: 'product',
        }),
      });
    }
  } catch (err) {
    console.error('Track purchase email failed:', err);
  }

  // Artist sale notification email
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
          subject: `New sale: ${fanName} purchased ${trackTitle} 💰`,
          html: artistNewPurchaseEmail(artistDisplayNameForEmail, fanName, trackTitle, (grossAmount / 100).toFixed(2), 'track'),
        });
      }
    }
  } catch (err) {
    console.error('Artist track sale email failed:', err);
  }

  // Mark abandoned checkouts as recovered
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

  await enrollInSequence(supabaseAdmin, artist_id, fan_id, 'new_purchase');

  console.log('Track purchase recorded:', { fan_id, track_id, artist_id });
}

// ─── Booking purchase ────────────────────────────────────────────────────────

export async function handleBookingPurchase(supabaseAdmin: AdminClient, session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.booking_session_id || !metadata?.buyer_id) {
    console.log('No booking purchase metadata found');
    return;
  }

  const { booking_session_id, buyer_id } = metadata;

  const { fanCity, fanState, fanCountry, fanCountryCode } = extractGeo(session);

  // Get booking session info
  const { data: booking } = await supabaseAdmin
    .from('booking_sessions')
    .select('artist_id, title, price, duration_minutes')
    .eq('id', booking_session_id)
    .single();

  if (!booking) {
    console.error('Booking session not found:', booking_session_id);
    return;
  }

  // SEC-005: the artist credited is the OWNER of the booking session, read here, NOT
  // `metadata.artist_id`. The checkout route used to copy a request-body artist id into that
  // metadata key, so a fan could pay artist A while this handler wrote the earning, the milestone
  // and the first_paid_conversion for artist B. The route is fixed; deriving it again here means a
  // checkout session created before that fix (or any future writer that gets the metadata wrong)
  // still settles against the real owner.
  const artist_id = booking.artist_id as string | undefined;
  if (!artist_id) {
    console.error('Booking session has no artist:', booking_session_id);
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

  // Fee is tier-driven (read from the artist's platform tier), not a flat 8%.
  const feePercent = await getArtistFeePercent(artist_id);
  const platformFee = Math.round(grossAmount * (feePercent / 100));
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
      metadata: {
        // Proof that collaborator money was actually withheld by THIS charge (TS-MONEY-009).
        ...settledReserveFor(session.metadata),
        bookingTitle,
        durationMinutes: booking.duration_minutes,
        fanDisplayName: fanName,
        // Referral attribution capture only (NO referral_earnings row for one-time purchases; pay later)
        ...(metadata.referral_code && { referral_code: metadata.referral_code }),
        ...(metadata.attribution_source && { attribution_source: metadata.attribution_source }),
      },
      fan_city: fanCity,
      fan_state: fanState,
      fan_country: fanCountry,
      fan_country_code: fanCountryCode,
    })
    .select('id')
    .single();

  // TS-MONEY-012: the provisional cap reservation becomes FUNDED now that Stripe settled.
  await fundSettledReservation(supabaseAdmin, session.metadata, null, earning?.id ?? null);

  // Notify artist of booking and earning
  if (artistProfile) {
    await createNotification(supabaseAdmin, artistProfile.user_id, 'new_booking', '📅 New Booking', `${fanName} booked: ${bookingTitle}`, `/studio`);

    // Send earning notification
    if (earning) {
      await createNotification(supabaseAdmin, artistProfile.user_id, 'earning', `💰 +$${(netAmount / 100).toFixed(2)}`, `${fanName} booked: ${bookingTitle}`, `/account/payouts?earning=${earning.id}`);
    }

    // Check for milestone unlocks
    try {
      await checkAndAwardMilestones(artist_id, artistProfile.user_id);
    } catch (err) {
      console.error('Milestone check failed:', err);
    }
  }

  // Funnel: First Paid Conversion (booking path).
  await recordFirstPaidConversion(supabaseAdmin, {
    artistId: artist_id,
    kind: 'booking',
    userId: artistProfile?.user_id,
  });

  console.log('Booking purchase recorded:', { booking_session_id, buyer_id, artist_id, netAmount });
}

// ─── Live pre-sale ticket ────────────────────────────────────────────────────

export async function handleLiveTicketPurchase(supabaseAdmin: AdminClient, session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.live_session_id || !metadata?.buyer_id || !metadata?.artist_id) {
    console.log('No live ticket metadata found');
    return;
  }

  const { live_session_id, buyer_id, artist_id } = metadata;

  const { fanCity, fanState, fanCountry, fanCountryCode } = extractGeo(session);

  const { data: liveSession } = await supabaseAdmin
    .from('live_sessions')
    .select('title')
    .eq('id', live_session_id)
    .single();

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
  const liveTitle = liveSession?.title || 'Live session';
  // Record what was actually charged.
  const grossAmount = session.amount_total ?? 0;

  const feePercent = await getArtistFeePercent(artist_id);
  const platformFee = Math.round(grossAmount * (feePercent / 100));
  const netAmount = grossAmount - platformFee;

  // Flip the pending ticket to paid — THIS is what grants access at the token mint.
  await supabaseAdmin
    .from('live_ticket_purchases')
    .update({
      status: 'paid',
      stripe_payment_intent_id: session.payment_intent as string,
      updated_at: new Date().toISOString(),
    })
    .eq('session_id', live_session_id)
    .eq('buyer_id', buyer_id)
    .eq('status', 'pending');

  // Write earnings record
  const { data: earning } = await supabaseAdmin
    .from('earnings')
    .insert({
      artist_id,
      fan_id: buyer_id,
      type: 'live_ticket',
      description: `${fanName} bought a ticket: ${liveTitle}`,
      gross_amount: grossAmount,
      platform_fee: platformFee,
      net_amount: netAmount,
      stripe_payment_id: session.payment_intent || session.id,
      metadata: {
        // Proof that collaborator money was actually withheld by THIS charge (TS-MONEY-009).
        ...settledReserveFor(session.metadata),
        liveTitle,
        fanDisplayName: fanName,
        ...(metadata.referral_code && { referral_code: metadata.referral_code }),
        ...(metadata.attribution_source && { attribution_source: metadata.attribution_source }),
      },
      fan_city: fanCity,
      fan_state: fanState,
      fan_country: fanCountry,
      fan_country_code: fanCountryCode,
    })
    .select('id')
    .single();

  // TS-MONEY-012: the provisional cap reservation becomes FUNDED now that Stripe settled.
  await fundSettledReservation(supabaseAdmin, session.metadata, null, earning?.id ?? null);

  if (artistProfile) {
    await createNotification(supabaseAdmin, artistProfile.user_id, 'live_ticket', '🎟️ Ticket sold', `${fanName} bought a ticket to ${liveTitle}`, `/studio/live`);

    if (earning) {
      await createNotification(supabaseAdmin, artistProfile.user_id, 'earning', `💰 +$${(netAmount / 100).toFixed(2)}`, `${fanName} bought a ticket to ${liveTitle}`, `/account/payouts?earning=${earning?.id}`);
    }

    try {
      await checkAndAwardMilestones(artist_id, artistProfile.user_id);
    } catch (err) {
      console.error('Milestone check failed:', err);
    }
  }

  // Buyer: in-app confirmation + email receipt (mirrors the product/track flow,
  // which previously left live-ticket buyers with no confirmation at all).
  // F-06: its own type, distinct from the artist's 'live_ticket' sale notice — one type
  // string carries exactly one classification, and this one is the FAN's own truth.
  await supabaseAdmin.from('notifications').insert({
    user_id: buyer_id,
    type: 'live_ticket_confirmed',
    title: "🎟️ You're in",
    message: `Your ticket to ${liveTitle} is confirmed.`,
    link: `/my-calendar`,
  });

  const buyerEmail = session.customer_email || session.customer_details?.email;
  if (buyerEmail && artistProfile?.user_id) {
    try {
      const { data: artistNameRow } = await supabaseAdmin
        .from('profiles')
        .select('display_name')
        .eq('id', artistProfile.user_id)
        .single();
      const artistDisplayName = artistNameRow?.display_name || 'the artist';
      await resend.emails.send({
        from: FROM_EMAIL,
        to: buyerEmail,
        subject: `Your ticket to ${liveTitle} is confirmed 🎟️`,
        html: purchaseEmail(fanName, artistDisplayName, liveTitle, (grossAmount / 100).toFixed(2), 'live ticket'),
      });
    } catch (err) {
      console.error('Live ticket buyer email failed:', err);
    }
  }

  // Funnel: First Paid Conversion (live ticket path).
  await recordFirstPaidConversion(supabaseAdmin, {
    artistId: artist_id,
    kind: 'live_ticket',
    userId: artistProfile?.user_id,
  });

  console.log('Live ticket recorded:', { live_session_id, buyer_id, artist_id, netAmount });
}

// ─── Live tip + tip-goal unlock ──────────────────────────────────────────────

export async function handleLiveTip(supabaseAdmin: AdminClient, session: Stripe.Checkout.Session) {
  const metadata = session.metadata;
  if (!metadata?.live_session_id || !metadata?.buyer_id || !metadata?.artist_id) {
    console.log('No live tip metadata found');
    return;
  }

  const { live_session_id, buyer_id, artist_id } = metadata;
  const { fanCity, fanState, fanCountry, fanCountryCode } = extractGeo(session);

  // Flip the pending tip to paid. Scoped by the checkout session id so a fan who
  // tips twice in a row does not have their first tip flipped by the second
  // webhook (the ticket flow can key on the pair; tips are not unique per fan).
  const { data: tip } = await supabaseAdmin
    .from('live_tips')
    .update({
      status: 'paid',
      stripe_payment_intent_id: session.payment_intent as string,
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')
    .select('id, amount, message')
    .maybeSingle();

  if (!tip) {
    // Already processed (Stripe retries) or the pending row never landed.
    console.log('Live tip: no pending row for checkout session', session.id);
    return;
  }

  const { data: liveSession } = await supabaseAdmin
    .from('live_sessions')
    .select('title')
    .eq('id', live_session_id)
    .single();

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
  const liveTitle = liveSession?.title || 'Live session';
  // Charge what Stripe actually took, not what the row claimed.
  const grossAmount = session.amount_total ?? tip.amount;

  const feePercent = await getArtistFeePercent(artist_id);
  const platformFee = Math.round(grossAmount * (feePercent / 100));
  const netAmount = grossAmount - platformFee;

  const { data: earning } = await supabaseAdmin
    .from('earnings')
    .insert({
      artist_id,
      fan_id: buyer_id,
      type: 'live_tip',
      description: `${fanName} tipped during ${liveTitle}`,
      gross_amount: grossAmount,
      platform_fee: platformFee,
      net_amount: netAmount,
      stripe_payment_id: session.payment_intent || session.id,
      metadata: {
        // Proof that collaborator money was actually withheld by THIS charge (TS-MONEY-009).
        ...settledReserveFor(session.metadata),
        liveTitle,
        fanDisplayName: fanName,
        liveSessionId: live_session_id,
        ...(tip.message && { tipMessage: tip.message }),
      },
      fan_city: fanCity,
      fan_state: fanState,
      fan_country: fanCountry,
      fan_country_code: fanCountryCode,
    })
    .select('id')
    .single();

  // TS-MONEY-012: the provisional cap reservation becomes FUNDED now that Stripe settled.
  await fundSettledReservation(supabaseAdmin, session.metadata, null, earning?.id ?? null);

  if (artistProfile) {
    await createNotification(supabaseAdmin, artistProfile.user_id, 'live_tip', `💸 ${fanName} tipped $${(grossAmount / 100).toFixed(2)}!`, tip.message ? `"${tip.message}"` : `During ${liveTitle}`, `/studio/live`);

    if (earning) {
      await createNotification(supabaseAdmin, artistProfile.user_id, 'earning', `💰 +$${(netAmount / 100).toFixed(2)}`, `${fanName} tipped during ${liveTitle}`, `/account/payouts?earning=${earning.id}`);
    }
  }

  // ── Tip goals: did this tip cross a target? ────────────────────────────────
  // Recomputed from the paid total rather than incremented, so a replayed
  // webhook or an out-of-order flip can never double-count toward an unlock.
  try {
    await settleLiveGoals(supabaseAdmin, live_session_id, artist_id, artistProfile?.user_id ?? null);
  } catch (err) {
    console.error('Live goal settle failed:', err);
  }

  // Funnel: First Paid Conversion (tip path). A tip buys no entitlement, so it is tagged
  // `live_tip` in metadata and a stricter "recurring only" reading stays possible later. It
  // still counts: an artist who has been paid by a fan has converted, and pretending
  // otherwise would make the first-dollar funnel disagree with the revenue milestones.
  await recordFirstPaidConversion(supabaseAdmin, {
    artistId: artist_id,
    kind: 'live_tip',
    userId: artistProfile?.user_id,
  });

  console.log('Live tip recorded:', { live_session_id, buyer_id, artist_id, netAmount });
}

/**
 * Stamp every tip goal the session's paid total has now reached, and announce
 * each unlock in the live chat so the payoff happens on stream. Idempotent: a
 * goal with reached_at already set is skipped, so Stripe retries are harmless.
 */
async function settleLiveGoals(
  supabaseAdmin: AdminClient,
  sessionId: string,
  artistId: string,
  artistUserId: string | null
) {
  const { data: paidTips } = await supabaseAdmin
    .from('live_tips')
    .select('amount')
    .eq('session_id', sessionId)
    .eq('status', 'paid');

  const total = (paidTips || []).reduce((sum: number, t: { amount: number }) => sum + (t.amount || 0), 0);

  const { data: goals } = await supabaseAdmin
    .from('live_goals')
    .select('id, title, target_amount')
    .eq('session_id', sessionId)
    .eq('metric', 'tips')
    .eq('is_active', true)
    .is('reached_at', null)
    .lte('target_amount', total);

  if (!goals?.length) return;

  for (const goal of goals as { id: string; title: string; target_amount: number }[]) {
    // Guarded by `reached_at IS NULL` so two concurrent webhooks announce once.
    const { data: stamped } = await supabaseAdmin
      .from('live_goals')
      .update({ reached_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', goal.id)
      .is('reached_at', null)
      .select('id')
      .maybeSingle();

    if (!stamped) continue;

    // The unlock lands in the chat everyone is already watching. Posted as the
    // artist with the artist badge rank so it reads as an announcement.
    if (artistUserId) {
      await supabaseAdmin.from('live_session_messages').insert({
        session_id: sessionId,
        user_id: artistUserId,
        body: `🏆 GOAL REACHED at $${(goal.target_amount / 100).toFixed(0)}: ${goal.title}!`,
        sender_tier_rank: 99,
        sender_tier_name: 'Artist',
      });

      await createNotification(supabaseAdmin, artistUserId, 'live_tip', '🏆 Tip goal reached!', `Your fans unlocked: ${goal.title}`, `/studio/live`);
    }
  }

  console.log('Live goals settled:', { sessionId, artistId, total, unlocked: goals.length });
}

// ─── Platform (CRWN) tier checkout ───────────────────────────────────────────

export async function handlePlatformCheckoutCompleted(supabaseAdmin: AdminClient, session: Stripe.Checkout.Session) {
  const { artist_id, tier, user_id } = session.metadata || {};

  console.log('Platform checkout - artist_id:', artist_id, 'tier:', tier, 'user_id:', user_id);

  if (!artist_id || !tier || !user_id) {
    console.error('Missing platform checkout metadata');
    return;
  }

  // Partner-code checkout. The founding-artist program (both the original 50-spot version
  // and the 5%-fee partner promo that reused its flag) is retired (founder call 2026-07-15),
  // so nothing sets founding_artist anymore and a partner code is pure attribution now: the
  // artist pays their plan's normal platform fee from day one. The 1-month free trial is a
  // separate Stripe-level perk, applied in platform-checkout, and is unaffected.
  const partnerCode = session.metadata?.partner_code || null;
  const recruiterId = session.metadata?.recruiter_id || null;

  const updateData: Record<string, unknown> = {
    platform_tier: tier,
    platform_stripe_subscription_id: session.subscription as string,
    platform_subscription_status: 'active',
  };

  if (partnerCode) {
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

  // NOTE: there is deliberately no mirror write to profiles.platform_tier.
  // That column does not exist in production (schema-platform-tiers.sql was never
  // applied), nothing reads it — every platform_tier reader queries
  // artist_profiles — and the write silently failed on every upgrade because
  // supabase-js returns an error object rather than throwing. artist_profiles is
  // the single source of truth for the plan; do not reintroduce a mirror.

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
    const tierLabel = tier === 'pro' ? 'Pro' : 'Scale';
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

  // No profiles.platform_tier mirror here either: the column does not exist and
  // nothing reads it. See the note in handlePlatformCheckoutCompleted.

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


/**
 * Mirror a refund into the Team Split ledger IMMEDIATELY, in proportion to what was refunded.
 *
 * Writes a negative `team_split_earnings` row per affected deal, released and cleared at once, so
 * it reduces the collaborator's cashable balance the moment the fan's money goes back rather than
 * on the next cron. `atomic_team_split_cashout` counts negative rows unconditionally, so this is
 * what closes the refund/cashout race.
 *
 * Idempotent: one row per (deal_id, earning_id), and the refund earning id is the key, so a
 * redelivered webhook and the repair cron converge on the same single row.
 */
async function clawbackTeamSplitsForRefund(
  supabaseAdmin: AdminClient,
  input: { originalEarningId: string; refundEarningId: string; artistId: string; refundRatio: number },
): Promise<number> {
  const { data: accruals } = await supabaseAdmin
    .from('team_split_earnings')
    .select('id, deal_id, collaborator_user_id, commission_amount, basis, basis_amount, gross_amount, percentage, source_type, source_id')
    .eq('earning_id', input.originalEarningId)
    .gt('commission_amount', 0);
  if (!accruals || accruals.length === 0) return 0;

  let written = 0;
  for (const a of accruals as any[]) {
    const { data: existing } = await supabaseAdmin
      .from('team_split_earnings')
      .select('id')
      .eq('deal_id', a.deal_id)
      .eq('earning_id', input.refundEarningId)
      .maybeSingle();
    if (existing) continue; // already clawed back for this refund

    const clawback = -Math.round(a.commission_amount * Math.min(1, Math.max(0, input.refundRatio)));
    if (clawback >= 0) continue;

    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from('team_split_earnings').insert({
      deal_id: a.deal_id,
      artist_id: input.artistId,
      collaborator_user_id: a.collaborator_user_id,
      earning_id: input.refundEarningId,
      source_type: a.source_type,
      source_id: a.source_id,
      basis: a.basis,
      basis_amount: -Math.round((a.basis_amount || 0) * input.refundRatio),
      percentage: a.percentage,
      gross_amount: a.gross_amount,
      commission_amount: clawback,
      status: 'released',
      cleared_at: now,
      released_at: now,
      reason: 'refund_clawback',
    });
    if (!error) written++;
  }
  return written;
}

export async function handleChargeRefunded(supabaseAdmin: AdminClient, charge: Stripe.Charge) {
  const paymentIntentId = charge.payment_intent as string;
  if (!paymentIntentId) return;

  const amountRefunded = charge.amount_refunded;
  console.log('Charge refunded:', paymentIntentId, 'amount:', amountRefunded);

  // TS-MONEY-007. RECOVER THE ARTIST'S SHARE FIRST.
  //
  // On a destination charge Stripe debits the PLATFORM for a refund and, by default, leaves the
  // artist holding what was transferred to them. CRWN issues no refunds in code, so every refund is
  // made in the Dashboard and that default has been silently making CRWN fund the artist's portion.
  // This runs on the webhook, so it covers refunds created anywhere by anyone, and it is idempotent
  // against a redelivered event because it reverses only what is still owed.
  //
  // Deliberately BEFORE the ledger writes and never fatal: an unrecovered refund must still be
  // recorded, because a ledger that drops a refund is worse than one that records a loss.
  const recovery = await recoverArtistShareOnRefund(stripe, charge);
  if (recovery.shortfall > 0) {
    console.error('[refund] UNRECOVERED artist share', {
      charge: charge.id, shortfall: recovery.shortfall, reason: recovery.reason,
    });
  }

  // Match the original earning. One-time purchases are keyed by the payment intent
  // (pi_). Subscription RENEWALS are keyed by the invoice id (in_) because
  // invoice.payment_intent is absent on the current Stripe API version — and a charge
  // created from an invoice carries charge.invoice, so we fall back to that.
  // (Initial-subscription earnings are keyed by the checkout session id (cs_) and are
  // NOT yet matchable here; subscription_id is now stored in their metadata as
  // groundwork for a resolver, which still needs live-event verification.)
  const invoiceId = (charge as unknown as { invoice?: string | null }).invoice || null;
  const earningCols = 'id, artist_id, fan_id, net_amount, gross_amount, platform_fee, type, description';
  let { data: originalEarning } = await supabaseAdmin
    .from('earnings')
    .select(earningCols)
    .eq('stripe_payment_id', paymentIntentId)
    .maybeSingle();

  if (!originalEarning && invoiceId) {
    ({ data: originalEarning } = await supabaseAdmin
      .from('earnings')
      .select(earningCols)
      .eq('stripe_payment_id', invoiceId)
      .maybeSingle());
  }

  // Third fallback: INITIAL-subscription earnings are keyed by the checkout session id
  // (cs_), which no refund charge references. Resolve via the invoice's subscription id,
  // matched against the subscription_id stored in the initial earning's metadata
  // (groundwork from commit 27d66a0). Renewals never reach here (they match above) and
  // don't carry subscription_id in metadata, so this can only hit the initial payment.
  // The subscription id path moved on newer Stripe API versions, so check both.
  if (!originalEarning && invoiceId) {
    try {
      const inv = await stripe.invoices.retrieve(invoiceId);
      const invAny = inv as unknown as {
        subscription?: string | null;
        parent?: { subscription_details?: { subscription?: string | null } | null } | null;
      };
      const subId = invAny.subscription || invAny.parent?.subscription_details?.subscription || null;
      if (subId) {
        ({ data: originalEarning } = await supabaseAdmin
          .from('earnings')
          .select(earningCols)
          .eq('type', 'subscription')
          .eq('metadata->>subscription_id', subId)
          .not('stripe_payment_id', 'like', '%_refund')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle());
        if (originalEarning) {
          console.log('Refund matched initial sub via subscription_id:', subId, originalEarning.id);
        }
      }
    } catch (err) {
      // Non-fatal: if the invoice retrieve or match fails we simply don't claw back.
      console.error('Initial-sub refund resolver failed (non-fatal):', paymentIntentId, err);
    }
  }

  if (!originalEarning) {
    console.log('No earning found for refunded payment:', paymentIntentId, invoiceId);
    return;
  }

  // Idempotency: Stripe redelivers webhooks and amount_refunded is cumulative, so
  // re-processing the same charge would double-count both the negative earning and the
  // referral clawback. Skip if a refund earning already exists for this payment.
  // (Trade-off: multiple distinct partial refunds on one charge collapse to the first —
  // errs toward under-clawback, which favors the fan over over-charging them.)
  const { data: alreadyRefunded } = await supabaseAdmin
    .from('earnings')
    .select('id')
    .eq('stripe_payment_id', paymentIntentId + '_refund')
    .maybeSingle();
  if (alreadyRefunded) {
    console.log('Refund already processed, skipping:', paymentIntentId);
    return;
  }

  // Calculate refund proportions
  const refundRatio = amountRefunded / originalEarning.gross_amount;
  const refundedNet = Math.round(originalEarning.net_amount * refundRatio);
  const refundedFee = Math.round(originalEarning.platform_fee * refundRatio);

  // Revoke the ENTITLEMENT, not just the money. A live ticket is what admits a
  // fan at the LiveKit token mint (and to the chat + replay), so leaving the row
  // at 'paid' after a refund hands back the cash and keeps the access. Only a
  // FULL refund revokes: a partial refund is not a cancelled seat.
  if (originalEarning.type === 'live_ticket' && amountRefunded >= originalEarning.gross_amount) {
    const { error: revokeError } = await supabaseAdmin
      .from('live_ticket_purchases')
      .update({ status: 'refunded', updated_at: new Date().toISOString() })
      .eq('stripe_payment_intent_id', paymentIntentId)
      .eq('status', 'paid');
    if (revokeError) {
      console.error('Live ticket revoke failed after refund:', paymentIntentId, revokeError);
    }
  }

  // Write negative earnings record
  const { data: refundEarning, error: refundEarningError } = await supabaseAdmin
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
        // TS-MONEY-007 audit trail: what was actually clawed back from the artist, and what was
        // not. `shortfall` is real CRWN exposure and is never rounded away.
        refund_recovery: {
          reason: recovery.reason,
          reversed_cents: recovery.reversedCents,
          shortfall_cents: recovery.shortfall,
          ...(recovery.transferReversalId ? { transfer_reversal: recovery.transferReversalId } : {}),
        },
      },
    })
    .select('id')
    .single();

  // The _refund earning is the idempotency marker for this whole handler. If it
  // didn't land, we must NOT proceed to the referral clawback (Stripe will
  // redeliver the webhook and we'd retry the whole thing then).
  if (refundEarningError || !refundEarning) {
    console.error('Refund earning insert failed, skipping clawback:', paymentIntentId, refundEarningError);
    return;
  }

  // Clawback: if this earning generated a referral commission, mirror it negative so
  // the refunded commission is subtracted from the referrer's cashout balance.
  // cleared_at = now (immediate) so the clawback always nets against held earnings.
  try {
    const { data: origReferralEarning } = await supabaseAdmin
      .from('referral_earnings')
      .select('id, referral_id, artist_id, referrer_fan_id, gross_amount, commission_amount')
      .eq('earning_id', originalEarning.id)
      .maybeSingle();

    if (origReferralEarning) {
      // Scale by the refund ratio so partial refunds only claw back their share.
      const clawbackGross = -Math.round(origReferralEarning.gross_amount * refundRatio);
      const clawbackCommission = -Math.round(origReferralEarning.commission_amount * refundRatio);
      if (clawbackCommission !== 0) {
        await insertHeldReferralEarning(
          supabaseAdmin,
          {
            referral_id: origReferralEarning.referral_id,
            artist_id: origReferralEarning.artist_id,
            referrer_fan_id: origReferralEarning.referrer_fan_id,
            earning_id: refundEarning.id,
            gross_amount: clawbackGross,
            commission_amount: clawbackCommission,
          },
          new Date().toISOString(),
        );
        console.log('Referral clawback recorded:', {
          referrerFanId: origReferralEarning.referrer_fan_id,
          amount: clawbackCommission,
        });
      }
    }
  } catch (err) {
    console.error('Referral clawback failed:', err);
  }

  // TEAM SPLIT CLAWBACK, AT THE REFUND EVENT (TS-MONEY-010).
  //
  // This used to live only in the daily accruals cron, which left up to 24 hours in which a
  // collaborator could cash out against money the fan had already been given back. The refund event
  // is now the AUTHORITATIVE writer; the cron is a repair pass that skips anything already written.
  // Exactly one authoritative writer, and the (deal_id, earning_id) uniqueness makes a double
  // negative row impossible even if both run.
  try {
    await clawbackTeamSplitsForRefund(supabaseAdmin, {
      originalEarningId: originalEarning.id,
      refundEarningId: refundEarning.id,
      artistId: originalEarning.artist_id,
      refundRatio,
    });
  } catch (err) {
    console.error('Team Split refund clawback failed (cron will repair):', err);
  }

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
    await createNotification(supabaseAdmin, artistProfile.user_id, 'refund', '⚠️ Refund processed', `$${(amountRefunded / 100).toFixed(2)} refunded: ${originalEarning.description}`, '/account/payouts');
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
    await createNotification(supabaseAdmin, artistProfile.user_id, 'dispute', '🚨 Payment dispute opened', `$${(disputeAmount / 100).toFixed(2)} disputed - ${originalEarning.description}. Evidence has been auto-submitted.`, '/account/payouts');
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
