// GET /api/admin/frl/engagements/[id] — full engagement detail: terms, scope,
//   consent, economics, guarantee checklist, operator checklist, labor entries,
//   attribution path. Everything derived is computed on read.
// PATCH — update allowlisted fields (terms, scope, consent, status, dates).
//   Writes stamp updated_by; money fields must be integer cents.
//
// Guarantee eligibility stamping: the guarantee DEADLINE derives from the date
// all required conditions first verified. That date cannot be recovered
// retroactively (conditions are computed live), so the first admin load that
// OBSERVES status eligible/achieved stamps guarantee_eligible_on once. It is
// never overwritten and never cleared automatically.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { buildEngagementDetail, type FrlEngagementRow } from '@/lib/frl/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONSENT_VALUES = ['not_granted', 'private', 'anonymized', 'public'];

async function loadEngagement(id: string): Promise<FrlEngagementRow | null> {
  const { data, error } = await supabaseAdmin
    .from('frl_engagements')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as FrlEngagementRow;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  let engagement = await loadEngagement(id);
  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  let detail = await buildEngagementDetail(supabaseAdmin, engagement);
  if (!detail) return NextResponse.json({ error: 'Artist not found for engagement' }, { status: 404 });

  // Stamp guarantee eligibility the first time it is observed met (see header).
  if (
    engagement.guarantee_eligible_on === null &&
    (detail.guarantee.status === 'eligible' || detail.guarantee.status === 'achieved')
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabaseAdmin
      .from('frl_engagements')
      .update({
        guarantee_eligible_on: today,
        updated_at: new Date().toISOString(),
        updated_by: admin.id,
      })
      .eq('id', engagement.id)
      .is('guarantee_eligible_on', null); // never overwrite a stamped date
    if (!error) {
      engagement = { ...engagement, guarantee_eligible_on: today };
      detail = (await buildEngagementDetail(supabaseAdmin, engagement)) ?? detail;
    }
  }

  return NextResponse.json({ detail });
}

/** Field allowlist: name -> validate + normalize. Returning undefined rejects. */
const FIELD_VALIDATORS: Record<string, (v: unknown) => unknown | undefined> = {
  status: (v) => (['agreed', 'active', 'completed', 'cancelled'].includes(v as string) ? v : undefined),
  started_on: date, target_launch_on: date, actual_launch_on: date,
  completed_on: date, consent_on: date, guarantee_eligible_on: date,
  notes: text(8000),
  fee_agreed_cents: cents, fee_collected_cents: cents, discount_cents: cents,
  acquisition_cost_cents: cents,
  discount_reason: text(2000), acquisition_cost_note: text(2000),
  required_plan: (v) => (v === null || v === 'pro' || v === 'scale' ? v : undefined),
  invoice_ref: text(500),
  payment_status: (v) => (['unpaid', 'partial', 'paid', 'waived'].includes(v as string) ? v : undefined),
  deliverables: text(8000), exclusions: text(8000), migration_scope: text(8000),
  additional_work_notes: text(8000), consent_notes: text(4000),
  revision_allowance: intField, revisions_used: intField, support_period_days: intField,
  case_study_consent: consent, testimonial_consent: consent, performance_data_consent: consent,
  owner_user_id: (v) => (v === null || typeof v === 'string' ? v : undefined),
};

function date(v: unknown): unknown | undefined {
  if (v === null) return null;
  return typeof v === 'string' && DATE_RE.test(v) ? v : undefined;
}
function cents(v: unknown): unknown | undefined {
  if (v === null) return null;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
}
function intField(v: unknown): unknown | undefined {
  if (v === null) return null;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : undefined;
}
function text(max: number) {
  return (v: unknown): unknown | undefined => {
    if (v === null) return null;
    return typeof v === 'string' ? v.slice(0, max) : undefined;
  };
}
function consent(v: unknown): unknown | undefined {
  return CONSENT_VALUES.includes(v as string) ? v : undefined;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  const engagement = await loadEngagement(id);
  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  const rejected: string[] = [];
  for (const [key, raw] of Object.entries(body)) {
    const validator = FIELD_VALIDATORS[key];
    if (!validator) {
      rejected.push(key);
      continue;
    }
    const value = validator(raw);
    if (value === undefined) {
      return NextResponse.json({ error: `Invalid value for ${key}` }, { status: 400 });
    }
    patch[key] = value;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: rejected.length ? `Unknown fields: ${rejected.join(', ')}` : 'Nothing to update' },
      { status: 400 },
    );
  }

  patch.updated_at = new Date().toISOString();
  patch.updated_by = admin.id;

  const { data, error } = await supabaseAdmin
    .from('frl_engagements')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    console.error('[frl] engagement update failed:', error);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }

  return NextResponse.json({ engagement: data, ignoredFields: rejected });
}
