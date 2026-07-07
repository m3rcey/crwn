import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { computeNextDue, type Recurrence } from '@/lib/fulfillment';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

const RECURRENCES: Recurrence[] = ['none', 'weekly', 'biweekly', 'monthly', 'quarterly', 'custom'];
const FULFILLMENT_TYPES = [
  'content_drop', 'livestream', 'event', 'message', 'file_delivery', 'shipment',
  'custom_thankyou', 'fan_council', 'access_unlock', 'manual_task',
];
const AUDIENCE_KINDS = ['tier', 'squad', 'all_supporters', 'campaign'];

async function getArtist() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, artistId: null };
  const { data: artist } = await supabase
    .from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { user, artistId: artist?.id ?? null };
}

// GET — list the artist's obligations (active first).
export async function GET() {
  const { artistId } = await getArtist();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  const { data, error } = await supabaseAdmin
    .from('fulfillment_obligations')
    .select('*')
    .eq('artist_id', artistId)
    .order('status', { ascending: true })
    .order('next_due_at', { ascending: true });
  if (error) return NextResponse.json({ error: error.message, obligations: [] }, { status: 200 });
  return NextResponse.json({ obligations: data || [] });
}

// POST — create an obligation and materialize its first fulfillment_event.
export async function POST(req: NextRequest) {
  const { user, artistId } = await getArtist();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const b = await req.json();
  const title = (b.title || '').trim();
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });

  const recurrence: Recurrence = RECURRENCES.includes(b.recurrence) ? b.recurrence : 'none';
  const fulfillmentType = FULFILLMENT_TYPES.includes(b.fulfillmentType) ? b.fulfillmentType : 'manual_task';
  const audienceKind = AUDIENCE_KINDS.includes(b.audienceKind) ? b.audienceKind : 'all_supporters';

  // First due date drives the first event; default to 7 days out if omitted.
  const firstDue = b.firstDueAt ? new Date(b.firstDueAt) : new Date(Date.now() + 7 * 86400000);
  if (Number.isNaN(firstDue.getTime())) {
    return NextResponse.json({ error: 'Invalid due date' }, { status: 400 });
  }
  // next_due_at tracks the cycle AFTER the one we're about to materialize.
  const followingDue = computeNextDue(recurrence, firstDue);

  const { data: obligation, error: oErr } = await supabaseAdmin
    .from('fulfillment_obligations')
    .insert({
      artist_id: artistId,
      source_type: b.sourceType && ['tier', 'product', 'campaign', 'custom'].includes(b.sourceType) ? b.sourceType : 'custom',
      source_tier_id: b.sourceTierId || null,
      source_product_id: b.sourceProductId || null,
      benefit_type: b.benefitType || null,
      title,
      description: b.description || null,
      fulfillment_type: fulfillmentType,
      recurrence,
      next_due_at: followingDue ? followingDue.toISOString() : null,
      audience_kind: audienceKind,
      audience_id: b.audienceId || null,
      requires_completion: b.requiresCompletion !== false,
      created_by: user!.id,
    })
    .select('*')
    .single();

  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });

  // Materialize the first event. Best-effort: an obligation with no first event is
  // still valid (a cron/backfill could create it later), so don't fail the request.
  const { data: event } = await supabaseAdmin
    .from('fulfillment_events')
    .insert({
      obligation_id: obligation.id,
      artist_id: artistId,
      title,
      due_at: firstDue.toISOString(),
      status: 'pending',
    })
    .select('*')
    .single();

  return NextResponse.json({ obligation, event: event ?? null });
}

// PATCH — pause / resume / archive an obligation.
export async function PATCH(req: NextRequest) {
  const { artistId } = await getArtist();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });
  const b = await req.json();
  if (!b.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const status = ['active', 'paused', 'archived'].includes(b.status) ? b.status : null;
  if (!status) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('fulfillment_obligations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', b.id)
    .eq('artist_id', artistId) // ownership guard
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ obligation: data });
}
