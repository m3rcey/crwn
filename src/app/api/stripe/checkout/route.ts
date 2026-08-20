import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/client';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getArtistFeePercent } from '@/lib/platformTier';
import { reserveForSaleAtomic, reserveToStripeMetadata } from '@/lib/teamSplits/reserve';
import { teamSplitMoneyKey } from '@/lib/teamSplits/moneyKey';
import { firstChargeFeePlan } from '@/lib/teamSplits/feePercent';
import { checkRateLimit } from '@/lib/rateLimit';
import { validateAndApplyDiscount } from '@/lib/discountCodes';
import { resolveClipperRate } from '@/lib/clipperRate';
import { hashVisitor } from '@/lib/analytics/visitorHash';
import { recordTierEvent } from '@/lib/analytics/tierEvents';
import { syntheticFreeSubId } from '@/lib/subscriptions/freeJoin';

export async function POST(req: NextRequest) {
  try {
    const { tierId, referralCode, attributionSource, interval, returnUrl, discountCode, utmSource, utmMedium, utmCampaign } = await req.json();
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const allowed = await checkRateLimit(user.id, 'checkout', 60, 5);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const fanId = user.id;

    // Get tier details — only active tiers
    // NOTE: this embedded join must NOT name stripe_connect_id. SELECT on that
    // column is revoked from anon/authenticated, and PostgREST applies column
    // privileges to embedded joins too, so naming it makes the WHOLE statement
    // fail with 42501. This route then returned "Tier not found" and no fan could
    // subscribe. The account id is read below with the service-role client, which
    // is where it belongs: a fan's session has no business reading it.
    const { data: tier, error: tierError } = await supabase
      .from('subscription_tiers')
      .select('*, artist:artist_profiles(user_id, slug, platform_tier), stripe_annual_price_id')
      .eq('id', tierId)
      .eq('is_active', true)
      .single();

    if (tierError || !tier) {
      return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
    }

    const artistSlugValue = tier.artist?.slug || tier.artist_id;

    // ---- Founder window: a tier can run a limited founding window (spot cap + deadline). ----
    // Enforced BEFORE any subscription is created, on both the free and paid paths. Inert until the
    // migration adds these columns: founder_window_enabled is undefined -> the whole block is skipped
    // and is_founder is never written, so the pre-migration app is safe.
    let isFounder = false;
    if (tier.founder_window_enabled) {
      if (tier.founder_deadline && new Date(tier.founder_deadline).getTime() < Date.now()) {
        return NextResponse.json({ error: 'The founder window for this tier has closed.' }, { status: 409 });
      }
      if (tier.founder_cap != null) {
        const svc = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
          process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
        );
        const { count } = await svc
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('tier_id', tierId)
          .eq('is_founder', true)
          .in('status', ['active', 'trialing']);
        if ((count ?? 0) >= tier.founder_cap) {
          return NextResponse.json({ error: 'All founder spots for this tier are taken.' }, { status: 409 });
        }
      }
      isFounder = true;
    }

    // Free tier — create subscription directly, no Stripe needed
    if (tier.price === 0) {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
      );

      // stripe_subscription_id is NOT NULL in production. Without the synthetic id this
      // upsert failed on every free join, and because the error went unread the route
      // reported success while writing nothing (found 2026-08-20: zero free rows existed).
      // The deterministic free_ id keeps the UNIQUE constraint stable across re-joins and
      // can never be mistaken for a Stripe id; cancel/pause branch on isFreeSubscriptionId.
      const { error: freeJoinError } = await supabaseAdmin.from('subscriptions').upsert({
        fan_id: fanId,
        artist_id: tier.artist_id,
        tier_id: tierId,
        stripe_subscription_id: syntheticFreeSubId(fanId, tier.artist_id),
        status: 'active',
        started_at: new Date().toISOString(),
        // Only written when a founder window is open (which requires the migrated column), so this
        // is safe before the migration runs.
        ...(isFounder ? { is_founder: true } : {}),
      }, { onConflict: 'fan_id,artist_id' });

      if (freeJoinError) {
        console.error('Free join upsert failed:', freeJoinError.message);
        return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
      }

      const successUrl = returnUrl
        ? `${process.env.NEXT_PUBLIC_BASE_URL}${returnUrl}?subscription=success`
        : `${process.env.NEXT_PUBLIC_BASE_URL}/${artistSlugValue}?subscription=success`;

      return NextResponse.json({ url: successUrl });
    }

    // Transfer destination, read server-side only (see the note on the tier query).
    const svcConnect = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
      process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
    );
    const { data: connectRow } = await svcConnect
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('id', tier.artist_id)
      .maybeSingle();
    const artistStripeAccountId = connectRow?.stripe_connect_id as string | undefined;

    if (!artistStripeAccountId) {
      return NextResponse.json(
        { error: 'Artist has not connected payments yet. Try again later.' },
        { status: 400 }
      );
    }

    const platformFeePercent = await getArtistFeePercent(tier.artist_id);

    // Clipper-attributed subs: the clipper's cut is funded by the ARTIST, not the
    // platform. Add the clipper rate on top of the platform fee so the artist's
    // payout is reduced by exactly the cut; the platform holds that portion and pays
    // the clipper via the existing referral_earnings -> fan-cashout rail (platform
    // stays whole). The rate is locked here (and capped so fee+cut <= 100%) then
    // echoed in metadata, so the fee charged equals the commission paid in the webhook.
    // Attributed commission (clipper OR fan referral) is ARTIST-funded: it's added on
    // top of the platform fee so the artist's payout drops by exactly the cut and the
    // platform passes it through, staying whole. This is the ONLY correct funder — a
    // recurring commission can exceed the platform's whole fee (10% > 8% Pro), so
    // platform-funding would be permanent negative margin. Fee cut == the commission
    // the webhook pays, by construction, incl. lifetime-locked rate on resubscribes.
    // Fan referrals are OPT-IN (0% default) — an artist turns on a rate deliberately.
    let clipperRate = 0;   // echoed to the webhook so NEW clipper payouts match the fee
    let attributedCut = 0; // the % actually added to the platform fee
    const safeReferralCode =
      typeof referralCode === 'string' && /^[A-Za-z0-9_-]+$/.test(referralCode) ? referralCode : '';

    if (attributionSource === 'clipper' || safeReferralCode) {
      const svc = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
        process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
      );
      // Resubscribe: an existing referral carries the lifetime-locked rate the webhook
      // will pay (referrals.commission_rate). Charge the fee at exactly that rate.
      const { data: existingRef } = await svc
        .from('referrals')
        .select('commission_rate, source')
        .eq('artist_id', tier.artist_id)
        .eq('referred_fan_id', fanId)
        .maybeSingle();

      if (existingRef?.commission_rate != null) {
        attributedCut = existingRef.commission_rate;
        if (existingRef.source === 'clipper') clipperRate = attributedCut;
      } else if (attributionSource === 'clipper') {
        const { data: artistRate } = await supabase
          .from('artist_profiles')
          .select('clipper_commission_rate, clipper_rate_schedule, clipper_campaign_started_at')
          .eq('id', tier.artist_id)
          .single();
        // Ramp resolves from the calendar (no cron).
        clipperRate = resolveClipperRate({
          schedule: artistRate?.clipper_rate_schedule,
          campaignStartedAt: artistRate?.clipper_campaign_started_at,
          standardRate: artistRate?.clipper_commission_rate || 0,
        });
        attributedCut = clipperRate;
      } else {
        // Fan referral. Only charge the artist if the code resolves to a real,
        // non-self referrer — else the webhook pays no one and the artist would be
        // overcharged. Mirrors processReferral's referrer resolution + opt-in default.
        const { data: referrer } = await svc
          .from('profiles')
          .select('id')
          .or(`username.eq.${safeReferralCode},id.ilike.${safeReferralCode}%`)
          .limit(1)
          .maybeSingle();
        if (referrer && referrer.id !== fanId) {
          const { data: ap } = await supabase
            .from('artist_profiles')
            .select('referral_commission_rate')
            .eq('id', tier.artist_id)
            .single();
          attributedCut = ap?.referral_commission_rate ?? 0;
        }
      }
      // Cap so platform fee + cut never exceeds 100%; floor at 0.
      attributedCut = Math.min(Math.max(attributedCut, 0), 100 - platformFeePercent);
      clipperRate = Math.min(Math.max(clipperRate, 0), 100 - platformFeePercent);
    }
    const effectiveFeePercent = platformFeePercent + attributedCut;

    // -----------------------------------------------------------------------
    // TEAM SPLIT RESERVE ON THE INITIAL SUBSCRIPTION INVOICE (TS-MONEY-011).
    // -----------------------------------------------------------------------
    // The renewal path funds on `invoice.created`, while the invoice is a DRAFT. The FIRST invoice
    // cannot use that path, and this is a Stripe property, not a CRWN one:
    //
    //   "For subscriptions with collection_method set to charge_automatically, Stripe creates an
    //    invoice with the status OPEN when you create the subscription."
    //   "For Stripe Checkout integrations, you can't update the subscription or its invoice if the
    //    session's subscription is incomplete."
    //
    // So there is no draft window and no update window for the first charge. The only lever that
    // exists at creation is `subscription_data.application_fee_percent`, which is why the reserve
    // is expressed as a PERCENT here and as exact cents on every later invoice.
    //
    // Rounding: the percent is carried to two decimals (Stripe's limit), so the withheld cents can
    // differ from the intended reserve by at most a rounding step on the first invoice. That
    // direction is handled by the accrual guard, which clamps the accrual to what was ACTUALLY
    // withheld, so a collaborator can never be credited more than the money that exists.
    //
    // The percent also applies to later invoices until `invoice.created` overrides it with an
    // exact amount. Over-withholding on a renewal is the safe direction (it becomes D3 surplus owed
    // back to the artist), never under-withholding.
    const firstInvoiceGrossCents = interval === 'year'
      ? ((tier as { annual_price?: number }).annual_price ?? tier.price * 12)
      : tier.price;
    const tsMoneyKey = teamSplitMoneyKey();
    const subReserve = await reserveForSaleAtomic(
      svcConnect,
      {
        artistId: tier.artist_id,
        sourceType: 'tier',
        sourceId: tierId,
        grossCents: firstInvoiceGrossCents,
        platformFeePercent,
        attributedCutPercent: attributedCut,
      },
      { kind: 'checkout_session', id: tsMoneyKey },
    );
    // computeFunding already returns platform + attributed + reserve as one percent, clamped to
    // 100. Falls back to the unchanged fee when nothing qualifies, so a subscription with no Team
    // Split is byte-for-byte the economics it had before this existed.
    // TS-MONEY-014 / TS-MONEY-015. Stripe caps application_fee_percent at TWO DECIMALS, so an exact
    // cent target usually cannot be expressed. Nearest-rounding would be subsidy-safe but
    // CONTRACT-unsafe: it can retain fewer cents than the collaborator's accepted split, and the
    // accrual guard would then clamp the collaborator DOWN to the short amount. So the percentage
    // is rounded UP, never to nearest. Any overage is ARTIST-owned surplus and returns through D3.
    //
    // `safe: false` means even 100% cannot retain the target, so we fund NO split rather than
    // underfund one.
    const feePlan = firstChargeFeePlan({
      grossCents: firstInvoiceGrossCents,
      platformFeeCents: subReserve.breakdown.platformFeeCents,
      attributedCutCents: subReserve.breakdown.attributedCutCents,
      grantedReserveCents: subReserve.reserveCents,
    });
    const fundFirstCharge = subReserve.reserveCents > 0 && feePlan.safe;
    const subscriptionFeePercent = fundFirstCharge ? feePlan.percent : effectiveFeePercent;
    if (subReserve.reserveCents > 0 && !feePlan.safe) {
      console.error('[checkout] first-charge fee percent not representable; funding no Team Split', {
        gross: firstInvoiceGrossCents, required: feePlan.requiredCents,
      });
    }

    // Get fan profile
    const { data: fan } = await supabase
      .from('profiles')
      .select('id, display_name')
      .eq('id', fanId)
      .single();

    if (!fan) {
      return NextResponse.json({ error: 'Fan not found' }, { status: 404 });
    }

    // Get fan email from auth
    const fanEmail = user.email || '';

    // Create or retrieve Stripe customer
    const existingCustomers = await stripe.customers.list({
      email: fanEmail,
      limit: 1,
    });

    let customer;
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: fanEmail,
        name: fan.display_name || undefined,
        metadata: {
          fan_id: fanId,
        },
      });
    }

    // Validate discount code if provided
    let discountResult: { stripeCouponId?: string; discountId?: string } = {};
    if (discountCode) {
      const result = await validateAndApplyDiscount(
        discountCode, tier.artist_id, fanId, 'subscription', tierId
      );
      if (!result.valid) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      discountResult = result;
    }

    // Create Stripe Checkout Session (30-min expiry enables abandoned cart recovery)
    const session = await stripe.checkout.sessions.create({
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      mode: 'subscription',
      customer: customer.id,
      payment_method_types: ['card'],
      line_items: [
        {
          price: interval === 'year' ? (tier.stripe_annual_price_id || tier.stripe_price_id) : tier.stripe_price_id,
          quantity: 1,
        },
      ],
      ...(discountResult.stripeCouponId ? {
        discounts: [{ coupon: discountResult.stripeCouponId }],
      } : {}),
      subscription_data: {
        application_fee_percent: subscriptionFeePercent,
        transfer_data: {
          destination: artistStripeAccountId,
        },
      },
      success_url: returnUrl
        ? `${process.env.NEXT_PUBLIC_BASE_URL}${returnUrl}?subscription=success`
        : `${process.env.NEXT_PUBLIC_BASE_URL}/${artistSlugValue}?subscription=success`,
      cancel_url: returnUrl
        ? `${process.env.NEXT_PUBLIC_BASE_URL}${returnUrl}?subscription=canceled`
        : `${process.env.NEXT_PUBLIC_BASE_URL}/${artistSlugValue}?subscription=canceled`,
      metadata: {
        // Proof of what the FIRST invoice withheld. The initial earnings writer reads this from the
        // session, because the first invoice was never a draft we could tag.
        ...(fundFirstCharge ? reserveToStripeMetadata(subReserve.reservedByDeal) : {}),
        ...(fundFirstCharge ? { team_split_money_key: tsMoneyKey } : {}),
        ...(fundFirstCharge && feePlan.overageCents > 0
          ? { team_split_rounding_surplus: String(feePlan.overageCents) }
          : {}),
        fan_id: fanId,
        artist_id: tier.artist_id,
        tier_id: tierId,
        type: 'subscription',
        referral_code: referralCode || '',
        attribution_source: attributionSource || '',
        clipper_rate: String(clipperRate),
        // The TOTAL cut (referral OR clipper) added to application_fee_percent above.
        // The webhook subtracts exactly this from the earning's net, so the ledger
        // reflects what Stripe actually left the artist (F-01). clipper_rate stays for
        // processReferral compatibility; this key is the one the net calculation reads.
        attributed_cut: String(attributedCut),
        discount_code_id: discountResult.discountId || '',
        utm_source: utmSource || '',
        utm_medium: utmMedium || '',
        utm_campaign: utmCampaign || '',
        is_founder: isFounder ? 'true' : '',
      },
    });

    // Tier evidence: the authoritative checkout-start boundary. It sits AFTER
    // sessions.create resolved, so a session that fails to be created is never counted, and
    // it is server-side, so a client cannot forge a start for a tier nobody opened. The free
    // path returned above and never reaches here, which is what keeps the free rung out of a
    // metric it has no checkout for. Deduped per visitor per day at the DB; best-effort, and
    // deliberately not awaited into the response path's failure modes.
    try {
      const visitorHash = await hashVisitor(req.headers);
      await recordTierEvent(svcConnect, {
        tierId,
        eventType: 'tier_checkout_started',
        visitorHash,
        fanId,
        expectArtistId: tier.artist_id,
        source: attributionSource === 'clipper' ? 'clipper' : safeReferralCode ? 'referral' : null,
        metadata: { interval: interval === 'year' ? 'year' : 'month' },
      });
    } catch {
      // Analytics never breaks a checkout.
    }

    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
