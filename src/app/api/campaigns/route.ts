import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  const { data: campaigns, error } = await supabaseAdmin
    .from('campaigns')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ campaigns: campaigns || [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, artistId, name, subject, body: campaignBody, filters, scheduledAt } = body;

  if (!artistId || !name || !campaignBody) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Verify ownership
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  // Check weekly campaign limit (max 2 per week)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count: weeklyCount } = await supabaseAdmin
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .in('status', ['sent', 'sending', 'scheduled'])
    .gte('created_at', weekAgo);

  if ((weeklyCount || 0) >= 2 && !id) {
    return NextResponse.json({ error: 'Maximum 2 campaigns per week. Try again later.' }, { status: 429 });
  }

  if (id) {
    // Update existing draft
    const { data: campaign, error } = await supabaseAdmin
      .from('campaigns')
      .update({
        name,
        subject,
        body: campaignBody,
        filters: filters || {},
        scheduled_at: scheduledAt || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('artist_id', artistId)
      .eq('status', 'draft')
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ campaign });
  } else {
    // Create new
    const { data: campaign, error } = await supabaseAdmin
      .from('campaigns')
      .insert({
        artist_id: artistId,
        name,
        subject,
        body: campaignBody,
        filters: filters || {},
        scheduled_at: scheduledAt || null,
        status: 'draft',
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ campaign });
  }
}
