import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

// GET: Fetch fan's booking tokens
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const artistId = searchParams.get('artist_id');
  const purchaseId = searchParams.get('purchase_id');

  let query = supabaseAdmin
    .from('booking_tokens')
    .select(`
      *,
      products (title, image_url, duration_minutes),
      artist_profiles (slug, calendar_link, user_id)
    `)
    .eq('fan_id', user.id)
    .order('created_at', { ascending: false });

  if (artistId) query = query.eq('artist_id', artistId);
  if (purchaseId) query = query.eq('purchase_id', purchaseId);

  const { data: tokens, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ tokens });
}

// POST: Consume a booking token (mark as used, reveal calendar link)
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { token_id } = await request.json();
  if (!token_id) return NextResponse.json({ error: 'token_id required' }, { status: 400 });

  // Fetch the token and verify ownership
  const { data: token, error: fetchError } = await supabaseAdmin
    .from('booking_tokens')
    .select('*, artist_profiles (calendar_link)')
    .eq('id', token_id)
    .eq('fan_id', user.id)
    .single();

  if (fetchError || !token) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }

  if (token.status === 'used') {
    // Already used — still return the calendar link so they can reference it
    return NextResponse.json({
      calendar_link: token.artist_profiles?.calendar_link,
      status: 'already_used',
      used_at: token.used_at,
    });
  }

  if (token.status === 'expired' || new Date(token.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Token has expired. Please contact the artist.' }, { status: 410 });
  }

  if (!token.artist_profiles?.calendar_link) {
    return NextResponse.json({ error: 'Artist has not set up their booking calendar yet.' }, { status: 400 });
  }

  // Mark token as used
  const { error: updateError } = await supabaseAdmin
    .from('booking_tokens')
    .update({ status: 'used', used_at: new Date().toISOString() })
    .eq('id', token_id);

  if (updateError) {
    return NextResponse.json({ error: 'Failed to consume token' }, { status: 500 });
  }

  return NextResponse.json({
    calendar_link: token.artist_profiles.calendar_link,
    status: 'used',
    used_at: new Date().toISOString(),
  });
}
