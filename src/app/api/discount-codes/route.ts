import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// GET: List discount codes for an artist
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  const { data: codes } = await supabaseAdmin
    .from('discount_codes')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  return NextResponse.json({ codes: codes || [] });
}

// POST: Create or update a discount code
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, artistId, code, description, discountType, discountValue, appliesTo, tierId, productId, maxUses, maxUsesPerFan, startsAt, expiresAt } = body;

  if (!artistId || !code || !discountType || discountValue == null) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, platform_tier')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  // Pro+ only
  const tier = artist.platform_tier || 'starter';
  if (tier === 'starter') {
    return NextResponse.json({ error: 'Discount codes require Pro tier or higher' }, { status: 403 });
  }

  // Validate
  if (discountType === 'percent' && (discountValue < 1 || discountValue > 100)) {
    return NextResponse.json({ error: 'Percent discount must be 1-100' }, { status: 400 });
  }
  if (discountType === 'fixed' && discountValue < 1) {
    return NextResponse.json({ error: 'Fixed discount must be at least 1 cent' }, { status: 400 });
  }

  const normalizedCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalizedCode.length < 3 || normalizedCode.length > 20) {
    return NextResponse.json({ error: 'Code must be 3-20 alphanumeric characters' }, { status: 400 });
  }

  const record = {
    artist_id: artistId,
    code: normalizedCode,
    description: description || null,
    discount_type: discountType,
    discount_value: discountValue,
    applies_to: appliesTo || 'all',
    tier_id: tierId || null,
    product_id: productId || null,
    max_uses: maxUses || null,
    max_uses_per_fan: maxUsesPerFan ?? 1,
    starts_at: startsAt || null,
    expires_at: expiresAt || null,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    // Update
    const { data, error } = await supabaseAdmin
      .from('discount_codes')
      .update(record)
      .eq('id', id)
      .eq('artist_id', artistId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ code: data });
  } else {
    // Insert
    const { data, error } = await supabaseAdmin
      .from('discount_codes')
      .insert(record)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This code already exists' }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ code: data });
  }
}

// DELETE: Deactivate a discount code
export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, artistId } = await req.json();
  if (!id || !artistId) return NextResponse.json({ error: 'Missing id or artistId' }, { status: 400 });

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  await supabaseAdmin
    .from('discount_codes')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('artist_id', artistId);

  return NextResponse.json({ success: true });
}
