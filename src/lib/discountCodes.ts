import { createClient } from '@supabase/supabase-js';
import { stripe } from '@/lib/stripe/client';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

interface DiscountResult {
  valid: boolean;
  error?: string;
  discountId?: string;
  discountType?: 'percent' | 'fixed';
  discountValue?: number;
  stripeCouponId?: string;
}

/**
 * Validate a discount code and create a Stripe coupon if valid.
 * Returns the Stripe coupon ID to apply at checkout.
 */
export async function validateAndApplyDiscount(
  code: string,
  artistId: string,
  fanId: string,
  type: 'subscription' | 'product',
  targetId?: string, // tierId or productId
): Promise<DiscountResult> {
  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

  const { data: discount } = await supabaseAdmin
    .from('discount_codes')
    .select('*')
    .eq('artist_id', artistId)
    .eq('code', normalizedCode)
    .eq('is_active', true)
    .maybeSingle();

  if (!discount) return { valid: false, error: 'Invalid discount code' };

  const now = new Date();

  if (discount.starts_at && new Date(discount.starts_at) > now) {
    return { valid: false, error: 'This code is not active yet' };
  }
  if (discount.expires_at && new Date(discount.expires_at) < now) {
    return { valid: false, error: 'This code has expired' };
  }
  if (discount.max_uses && discount.uses_count >= discount.max_uses) {
    return { valid: false, error: 'This code has reached its usage limit' };
  }

  // Per-fan usage check
  if (discount.max_uses_per_fan) {
    const { count } = await supabaseAdmin
      .from('discount_code_uses')
      .select('id', { count: 'exact', head: true })
      .eq('discount_code_id', discount.id)
      .eq('fan_id', fanId);

    if ((count || 0) >= discount.max_uses_per_fan) {
      return { valid: false, error: 'You have already used this code' };
    }
  }

  // Check applies_to
  if (discount.applies_to === 'subscription' && type === 'product') {
    return { valid: false, error: 'This code only applies to subscriptions' };
  }
  if (discount.applies_to === 'product' && type === 'subscription') {
    return { valid: false, error: 'This code only applies to products' };
  }

  // Check specificity
  if (discount.tier_id && targetId && discount.tier_id !== targetId) {
    return { valid: false, error: 'This code does not apply to this tier' };
  }
  if (discount.product_id && targetId && discount.product_id !== targetId) {
    return { valid: false, error: 'This code does not apply to this product' };
  }

  // Create a Stripe coupon for this discount
  const couponParams: Record<string, unknown> = {
    duration: 'once' as const,
    name: `${normalizedCode} - ${discount.description || 'Discount'}`,
    metadata: { discount_code_id: discount.id, artist_id: artistId },
  };

  if (discount.discount_type === 'percent') {
    couponParams.percent_off = discount.discount_value;
  } else {
    couponParams.amount_off = discount.discount_value;
    couponParams.currency = 'usd';
  }

  const coupon = await stripe.coupons.create(couponParams as Parameters<typeof stripe.coupons.create>[0]);

  return {
    valid: true,
    discountId: discount.id,
    discountType: discount.discount_type,
    discountValue: discount.discount_value,
    stripeCouponId: coupon.id,
  };
}

/**
 * Record a discount code use after successful checkout.
 * Called from webhook handler.
 */
export async function recordDiscountCodeUse(
  discountCodeId: string,
  fanId: string,
  artistId: string,
  stripeCheckoutSessionId: string,
  amountSaved: number,
) {
  // Insert usage record
  await supabaseAdmin
    .from('discount_code_uses')
    .insert({
      discount_code_id: discountCodeId,
      fan_id: fanId,
      artist_id: artistId,
      stripe_checkout_session_id: stripeCheckoutSessionId,
      amount_saved: amountSaved,
    });

  // Increment uses_count
  const { data: current } = await supabaseAdmin
    .from('discount_codes')
    .select('uses_count')
    .eq('id', discountCodeId)
    .single();

  if (current) {
    await supabaseAdmin
      .from('discount_codes')
      .update({ uses_count: (current.uses_count || 0) + 1 })
      .eq('id', discountCodeId);
  }
}
