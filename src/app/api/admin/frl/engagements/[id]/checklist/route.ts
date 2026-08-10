// POST /api/admin/frl/engagements/[id]/checklist — set a MANUAL operator
// checklist item. item_key is allowlisted against the registry: derived items
// (Stripe connected, campaign sent, first paid member, ...) are computed from
// live data and CANNOT be set here, so an admin can never override a
// product-verified outcome by hand.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { FRL_MANUAL_KEYS } from '@/lib/frl/checklist';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  let body: {
    itemKey?: unknown;
    status?: unknown;
    completedOn?: unknown;
    note?: unknown;
    minutesSpent?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const itemKey = typeof body.itemKey === 'string' ? body.itemKey : '';
  if (!FRL_MANUAL_KEYS.has(itemKey)) {
    return NextResponse.json(
      { error: 'Unknown or derived checklist item. Derived items verify themselves from live data.' },
      { status: 400 },
    );
  }
  const status = ['pending', 'done', 'not_applicable'].includes(body.status as string)
    ? (body.status as string)
    : undefined;
  if (!status) return NextResponse.json({ error: 'Invalid status' }, { status: 400 });

  const completedOn =
    typeof body.completedOn === 'string' && DATE_RE.test(body.completedOn) ? body.completedOn : null;
  const note = typeof body.note === 'string' ? body.note.slice(0, 4000) : null;
  const minutesSpent =
    typeof body.minutesSpent === 'number' && Number.isInteger(body.minutesSpent) && body.minutesSpent >= 0
      ? body.minutesSpent
      : null;

  // Engagement must exist (FK would also catch it, but 404 beats a 500).
  const { data: exists } = await supabaseAdmin
    .from('frl_engagements')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!exists) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('frl_checklist_state')
    .upsert(
      {
        engagement_id: id,
        item_key: itemKey,
        status,
        completed_on: status === 'done' ? completedOn ?? new Date().toISOString().slice(0, 10) : completedOn,
        note,
        minutes_spent: minutesSpent,
        updated_at: new Date().toISOString(),
        updated_by: admin.id,
      },
      { onConflict: 'engagement_id,item_key' },
    )
    .select('*')
    .single();
  if (error) {
    console.error('[frl] checklist write failed:', error);
    return NextResponse.json({ error: 'Could not save the checklist item' }, { status: 500 });
  }

  return NextResponse.json({ item: data });
}
