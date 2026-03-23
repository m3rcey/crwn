import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST: Validate a discount code at checkout
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { code, artistId, type, tierId, productId } = await req.json();

  if (!code || !artistId) {
    return NextResponse.json({ error: 'Missing code or artistId' }, { status: 400 });
  }

  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // Look up the code
  const { data: discount } = await supabaseAdmin
    .from('discount_codes')
    .select('*')
    .eq('artist_id', artistId)
    .eq('code', normalizedCode)
    .eq('is_active', true)
    .maybeSingle();

  if (!discount) {
    return NextResponse.json({ valid: false, error: 'Invalid discount code' });
  }

  const now = new Date();

  // Check date range
  if (discount.starts_at && new Date(discount.starts_at) > now) {
    return NextResponse.json({ valid: false, error: 'This code is not active yet' });
  }
  if (discount.expires_at && new Date(discount.expires_at) < now) {
    return NextResponse.json({ valid: false, error: 'This code has expired' });
  }

  // Check max uses
  if (discount.max_uses && discount.uses_count >= discount.max_uses) {
    return NextResponse.json({ valid: false, error: 'This code has reached its usage limit' });
  }

  // Check per-fan usage
  if (discount.max_uses_per_fan) {
    const { count } = await supabaseAdmin
      .from('discount_code_uses')
      .select('id', { count: 'exact', head: true })
      .eq('discount_code_id', discount.id)
      .eq('fan_id', user.id);

    if ((count || 0) >= discount.max_uses_per_fan) {
      return NextResponse.json({ valid: false, error: 'You have already used this code' });
    }
  }

  // Check applies_to filter
  if (discount.applies_to === 'subscription' && type === 'product') {
    return NextResponse.json({ valid: false, error: 'This code only applies to subscriptions' });
  }
  if (discount.applies_to === 'product' && type === 'subscription') {
    return NextResponse.json({ valid: false, error: 'This code only applies to products' });
  }

  // Check tier/product specificity
  if (discount.tier_id && tierId && discount.tier_id !== tierId) {
    return NextResponse.json({ valid: false, error: 'This code does not apply to this tier' });
  }
  if (discount.product_id && productId && discount.product_id !== productId) {
    return NextResponse.json({ valid: false, error: 'This code does not apply to this product' });
  }

  return NextResponse.json({
    valid: true,
    discount: {
      id: discount.id,
      code: discount.code,
      discountType: discount.discount_type,
      discountValue: discount.discount_value,
      description: discount.description,
    },
  });
}
