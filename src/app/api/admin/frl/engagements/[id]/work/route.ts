// POST /api/admin/frl/engagements/[id]/work — record a labor / direct-cost
//   entry (category, date, minutes, optional external cost in integer cents).
// PATCH — update an entry by entryId. DELETE ?entryId= removes one.
//
// This is a fulfillment-cost log, not payroll: no rates are stored here. Labor
// COST is derived on read from minutes x the dated hourly assumption in
// admin_settings.frl_cost_assumptions, so cost math stays transparent and
// auditable (entries carry created_by/updated_by + timestamps).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { FRL_WORK_CATEGORIES } from '@/lib/frl/economics';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface WorkBody {
  entryId?: unknown;
  category?: unknown;
  workOn?: unknown;
  minutes?: unknown;
  note?: unknown;
  externalCostCents?: unknown;
}

function parseFields(body: WorkBody, partial: boolean): Record<string, unknown> | { error: string } {
  const out: Record<string, unknown> = {};

  if (body.category !== undefined || !partial) {
    if (!FRL_WORK_CATEGORIES.includes(body.category as never)) return { error: 'Invalid category' };
    out.category = body.category;
  }
  if (body.workOn !== undefined || !partial) {
    if (typeof body.workOn !== 'string' || !DATE_RE.test(body.workOn)) return { error: 'Invalid workOn date' };
    out.work_on = body.workOn;
  }
  if (body.minutes !== undefined || !partial) {
    if (typeof body.minutes !== 'number' || !Number.isInteger(body.minutes) || body.minutes < 0) {
      return { error: 'minutes must be a non-negative integer' };
    }
    out.minutes = body.minutes;
  }
  if (body.note !== undefined) {
    out.note = body.note === null ? null : typeof body.note === 'string' ? body.note.slice(0, 4000) : undefined;
    if (out.note === undefined) return { error: 'Invalid note' };
  }
  if (body.externalCostCents !== undefined) {
    if (body.externalCostCents === null) out.external_cost_cents = null;
    else if (typeof body.externalCostCents === 'number' && Number.isInteger(body.externalCostCents) && body.externalCostCents >= 0) {
      out.external_cost_cents = body.externalCostCents;
    } else return { error: 'externalCostCents must be a non-negative integer (cents)' };
  }
  return out;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  let body: WorkBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const fields = parseFields(body, false);
  if ('error' in fields) return NextResponse.json({ error: fields.error }, { status: 400 });

  const { data: exists } = await supabaseAdmin
    .from('frl_engagements')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (!exists) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('frl_work_entries')
    .insert({
      ...fields,
      engagement_id: id,
      person_user_id: admin.id,
      created_by: admin.id,
      updated_by: admin.id,
    })
    .select('*')
    .single();
  if (error) {
    console.error('[frl] work entry create failed:', error);
    return NextResponse.json({ error: 'Could not record the entry' }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  let body: WorkBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const entryId = typeof body.entryId === 'string' ? body.entryId : null;
  if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 });

  const fields = parseFields(body, true);
  if ('error' in fields) return NextResponse.json({ error: fields.error }, { status: 400 });
  if (Object.keys(fields).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('frl_work_entries')
    .update({ ...fields, updated_at: new Date().toISOString(), updated_by: admin.id })
    .eq('id', entryId)
    .eq('engagement_id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[frl] work entry update failed:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
  return NextResponse.json({ entry: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  const entryId = req.nextUrl.searchParams.get('entryId');
  if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('frl_work_entries')
    .delete()
    .eq('id', entryId)
    .eq('engagement_id', id);
  if (error) {
    console.error('[frl] work entry delete failed:', error);
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
