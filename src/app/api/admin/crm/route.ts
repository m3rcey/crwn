import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
);

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const listId = req.nextUrl.searchParams.get('listId');

  // Get all CRM contacts
  let query = supabaseAdmin
    .from('crm_contacts')
    .select('*')
    .order('created_at', { ascending: false });

  if (listId) {
    query = query.eq('list_id', listId);
  }

  const { data: contacts } = await query;

  // Get lists
  const { data: lists } = await supabaseAdmin
    .from('crm_lists')
    .select('*')
    .order('created_at', { ascending: false });

  // Get linked artist data for contacts that have artist_profile_id
  const linkedIds = (contacts || []).filter(c => c.artist_profile_id).map(c => c.artist_profile_id);
  let artistMap: Record<string, { revenue: number; subscribers: number; pipeline_stage: string; platform_tier: string }> = {};

  if (linkedIds.length > 0) {
    const { data: artists } = await supabaseAdmin
      .from('artist_profiles')
      .select('id, pipeline_stage, platform_tier')
      .in('id', linkedIds);

    const { data: earnings } = await supabaseAdmin
      .from('earnings')
      .select('artist_id, net_amount')
      .in('artist_id', linkedIds);

    const { data: subs } = await supabaseAdmin
      .from('subscriptions')
      .select('artist_id')
      .eq('status', 'active')
      .in('artist_id', linkedIds);

    const revenueMap: Record<string, number> = {};
    (earnings || []).forEach(e => { revenueMap[e.artist_id] = (revenueMap[e.artist_id] || 0) + (e.net_amount || 0); });

    const subMap: Record<string, number> = {};
    (subs || []).forEach(s => { subMap[s.artist_id] = (subMap[s.artist_id] || 0) + 1; });

    (artists || []).forEach(a => {
      artistMap[a.id] = {
        revenue: revenueMap[a.id] || 0,
        subscribers: subMap[a.id] || 0,
        pipeline_stage: a.pipeline_stage || 'onboarding',
        platform_tier: a.platform_tier || 'starter',
      };
    });
  }

  // Enrich contacts
  const enriched = (contacts || []).map(c => ({
    ...c,
    artist_data: c.artist_profile_id ? artistMap[c.artist_profile_id] || null : null,
  }));

  // Status counts
  const statusCounts: Record<string, number> = { lead: 0, contacted: 0, onboarding: 0, active: 0, churned: 0 };
  (contacts || []).forEach(c => {
    statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
  });

  return NextResponse.json({
    contacts: enriched,
    lists: lists || [],
    statusCounts,
    totalContacts: (contacts || []).length,
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json();
  const { action } = body;

  if (action === 'update_status') {
    const { contactId, status } = body;
    if (!contactId || !status) return NextResponse.json({ error: 'Missing contactId or status' }, { status: 400 });

    const validStatuses = ['lead', 'contacted', 'onboarding', 'active', 'churned'];
    if (!validStatuses.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('crm_contacts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', contactId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'update_tags') {
    const { contactId, tags } = body;
    if (!contactId) return NextResponse.json({ error: 'Missing contactId' }, { status: 400 });

    const { error } = await supabaseAdmin
      .from('crm_contacts')
      .update({ tags: tags || [], updated_at: new Date().toISOString() })
      .eq('id', contactId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'add_note') {
    const { contactId, note } = body;
    if (!contactId || !note?.trim()) return NextResponse.json({ error: 'Missing contactId or note' }, { status: 400 });

    const { data: contact } = await supabaseAdmin
      .from('crm_contacts')
      .select('notes')
      .eq('id', contactId)
      .single();

    const existingNotes = contact?.notes || '';
    const timestamp = new Date().toISOString().split('T')[0];
    const updatedNotes = `[${timestamp}] ${note.trim()}\n${existingNotes}`;

    const { error } = await supabaseAdmin
      .from('crm_contacts')
      .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
      .eq('id', contactId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (action === 'create_list') {
    const { name, description } = body;
    if (!name?.trim()) return NextResponse.json({ error: 'Missing list name' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('crm_lists')
      .insert({ name: name.trim(), description: description?.trim() || null })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, listId: data.id });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
