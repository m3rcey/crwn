import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { searchParams } = new URL(request.url);
  const tierId = searchParams.get('tier_id');

  if (!tierId) {
    return NextResponse.json({ error: 'tier_id is required' }, { status: 400 });
  }

  const { data: benefits, error } = await supabase
    .from('tier_benefits')
    .select('*')
    .eq('tier_id', tierId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(benefits);
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { tier_id, benefits } = body;

  if (!tier_id || !benefits) {
    return NextResponse.json({ error: 'tier_id and benefits are required' }, { status: 400 });
  }

  // Verify user owns this tier
  const { data: tier, error: tierError } = await supabase
    .from('subscription_tiers')
    .select('id, artist_id')
    .eq('id', tier_id)
    .single();

  if (tierError || !tier) {
    return NextResponse.json({ error: 'Tier not found' }, { status: 404 });
  }

  // Check ownership via artist_profiles
  const { data: artistProfile, error: artistError } = await supabase
    .from('artist_profiles')
    .select('user_id')
    .eq('id', tier.artist_id)
    .single();

  if (artistError || !artistProfile || artistProfile.user_id !== user.id) {
    return NextResponse.json({ error: 'Unauthorized - you do not own this tier' }, { status: 403 });
  }

  // Delete existing benefits
  const { error: deleteError } = await supabase
    .from('tier_benefits')
    .delete()
    .eq('tier_id', tier_id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // Insert new benefits
  if (benefits.length > 0) {
    const benefitsToInsert = benefits.map((b: { benefit_type: string; config: Record<string, any>; sort_order: number }, index: number) => ({
      tier_id,
      benefit_type: b.benefit_type,
      config: b.config || {},
      is_active: true,
      sort_order: b.sort_order ?? index,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('tier_benefits')
      .insert(benefitsToInsert)
      .select();

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json(inserted);
  }

  return NextResponse.json([]);
}
