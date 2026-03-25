import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

const VALID_CATEGORIES = [
  'instagram_ads', 'facebook_ads', 'tiktok_ads', 'google_ads',
  'playlist_pitching', 'pr_campaign', 'music_video',
  'influencer', 'merch_promo', 'other',
];

async function getArtistIdForUser(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('artist_profiles')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  return data?.id || null;
}

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const artistId = req.nextUrl.searchParams.get('artistId');
  if (!artistId) return NextResponse.json({ error: 'Missing artistId' }, { status: 400 });

  // Verify ownership
  const ownedArtistId = await getArtistIdForUser(user.id);
  if (ownedArtistId !== artistId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const startDate = req.nextUrl.searchParams.get('startDate');
  const endDate = req.nextUrl.searchParams.get('endDate');

  let query = supabaseAdmin
    .from('artist_marketing_costs')
    .select('*')
    .eq('artist_id', artistId)
    .order('spend_date', { ascending: false });

  if (startDate) query = query.gte('spend_date', startDate);
  if (endDate) query = query.lte('spend_date', endDate);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ costs: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { artistId, category, customLabel, amount, spendDate, notes } = body;

  if (!artistId || !category || !amount || !spendDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be a positive number (in cents)' }, { status: 400 });
  }

  // Verify ownership
  const ownedArtistId = await getArtistIdForUser(user.id);
  if (ownedArtistId !== artistId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from('artist_marketing_costs')
    .insert({
      artist_id: artistId,
      category,
      custom_label: category === 'other' ? customLabel : null,
      amount,
      spend_date: spendDate,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cost: data });
}

export async function PUT(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, category, customLabel, amount, spendDate, notes } = body;

  if (!id) return NextResponse.json({ error: 'Missing cost id' }, { status: 400 });

  // Verify ownership via the cost's artist_id
  const { data: existing } = await supabaseAdmin
    .from('artist_marketing_costs')
    .select('artist_id')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ownedArtistId = await getArtistIdForUser(user.id);
  if (ownedArtistId !== existing.artist_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (category && !VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (category) updates.category = category;
  if (category === 'other' && customLabel !== undefined) updates.custom_label = customLabel;
  if (category && category !== 'other') updates.custom_label = null;
  if (amount !== undefined) updates.amount = amount;
  if (spendDate) updates.spend_date = spendDate;
  if (notes !== undefined) updates.notes = notes;

  const { data, error } = await supabaseAdmin
    .from('artist_marketing_costs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cost: data });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id } = body;

  if (!id) return NextResponse.json({ error: 'Missing cost id' }, { status: 400 });

  // Verify ownership
  const { data: existing } = await supabaseAdmin
    .from('artist_marketing_costs')
    .select('artist_id')
    .eq('id', id)
    .single();

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const ownedArtistId = await getArtistIdForUser(user.id);
  if (ownedArtistId !== existing.artist_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabaseAdmin
    .from('artist_marketing_costs')
    .delete()
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
