import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { computeNextDue, type Recurrence } from '@/lib/fulfillment';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
);

async function getArtistId() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { userId: null, artistId: null };
  const { data: artist } = await supabase
    .from('artist_profiles').select('id').eq('user_id', user.id).single();
  return { userId: user.id, artistId: artist?.id ?? null };
}

// PATCH /api/promise-calendar/events/[id]
// body.action: 'complete' | 'reschedule' | 'cancel'
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { userId, artistId } = await getArtistId();
  if (!artistId) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  const b = await req.json();
  const action = b.action as string;

  // Load + ownership guard.
  const { data: event } = await supabaseAdmin
    .from('fulfillment_events')
    .select('*')
    .eq('id', id)
    .eq('artist_id', artistId)
    .single();
  if (!event) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (action === 'reschedule') {
    const due = b.dueAt ? new Date(b.dueAt) : null;
    if (!due || Number.isNaN(due.getTime())) {
      return NextResponse.json({ error: 'Invalid dueAt' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('fulfillment_events')
      .update({ due_at: due.toISOString(), status: 'rescheduled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // A rescheduled event becomes the new pending instance.
    await supabaseAdmin.from('fulfillment_events')
      .update({ status: 'pending' }).eq('id', id);
    return NextResponse.json({ event: { ...data, status: 'pending' } });
  }

  if (action === 'cancel') {
    const { data, error } = await supabaseAdmin
      .from('fulfillment_events')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ event: data });
  }

  // default: complete
  const { data: completed, error: cErr } = await supabaseAdmin
    .from('fulfillment_events')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      completed_by: userId,
      completion_source_type: b.completionSourceType || 'manual',
      completion_source_id: b.completionSourceId || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // If the parent obligation recurs and is still active, chain the next cycle so
  // the artist always has the next promise on the calendar — no cron required.
  let nextEvent = null;
  const { data: obligation } = await supabaseAdmin
    .from('fulfillment_obligations')
    .select('id, recurrence, status, title')
    .eq('id', event.obligation_id)
    .single();

  if (obligation && obligation.status === 'active') {
    const nextDue = computeNextDue(obligation.recurrence as Recurrence, new Date(event.due_at));
    if (nextDue) {
      const { data: ne } = await supabaseAdmin
        .from('fulfillment_events')
        .insert({
          obligation_id: obligation.id,
          artist_id: artistId,
          title: obligation.title,
          due_at: nextDue.toISOString(),
          status: 'pending',
        })
        .select('*')
        .single();
      nextEvent = ne ?? null;
      await supabaseAdmin
        .from('fulfillment_obligations')
        .update({ next_due_at: computeNextDue(obligation.recurrence as Recurrence, nextDue)?.toISOString() ?? null, updated_at: new Date().toISOString() })
        .eq('id', obligation.id);
    }
  }

  return NextResponse.json({ event: completed, nextEvent });
}
