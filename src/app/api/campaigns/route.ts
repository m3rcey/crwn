import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getEmailLimit } from '@/lib/platformTier';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
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
    .select('id, platform_tier')
    .eq('id', artistId)
    .eq('user_id', user.id)
    .single();
  if (!artist) return NextResponse.json({ error: 'Not your profile' }, { status: 403 });

  // Monthly email-blast quota, tier-driven (Free 1/mo, Pro 10/mo; -1 = unlimited).
  // Editing an existing draft (id present) never counts against the quota.
  const emailLimit = getEmailLimit(artist.platform_tier);
  if (emailLimit !== -1 && !id) {
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count: monthlyCount } = await supabaseAdmin
      .from('campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .in('status', ['sent', 'sending', 'scheduled'])
      .gte('created_at', monthAgo);

    if ((monthlyCount || 0) >= emailLimit) {
      return NextResponse.json(
        { error: `You've used all ${emailLimit} email blast${emailLimit === 1 ? '' : 's'} for this month. Upgrade to Pro for 10/month.` },
        { status: 429 }
      );
    }
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
