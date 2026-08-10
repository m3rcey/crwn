// GET/PUT /api/admin/frl/engagements/[id]/evidence — the case-study evidence
// record for one engagement (one row per engagement, upserted).
//
// PUT with { snapshotMetrics: true } captures the CURRENT system-derived
// outcome numbers (30-day GMV, paid members, days to first paid member,
// guarantee status) into metrics_snapshot, dated. The snapshot is what a case
// study cites; live values always come from the economics layer.
//
// Nothing here publishes anything, anywhere. Consent lives on the engagement
// row and defaults to not_granted; this record is founder evidence storage.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { buildEngagementDetail, type FrlEngagementRow } from '@/lib/frl/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const TEXT_FIELDS = [
  'before_summary', 'previous_stack', 'previous_revenue_evidence',
  'audience_evidence', 'offer_launched', 'tiers_launched', 'artist_quote', 'notes',
] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  const { data, error } = await supabaseAdmin
    .from('frl_evidence')
    .select('*')
    .eq('engagement_id', id)
    .maybeSingle();
  if (error) return NextResponse.json({ evidence: null });
  return NextResponse.json({ evidence: data ?? null });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { data: engagement } = await supabaseAdmin
    .from('frl_engagements')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!engagement) return NextResponse.json({ error: 'Engagement not found' }, { status: 404 });

  const patch: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    if (field in body) {
      const v = body[field];
      if (v === null) patch[field] = null;
      else if (typeof v === 'string') patch[field] = v.slice(0, 8000);
      else return NextResponse.json({ error: `Invalid value for ${field}` }, { status: 400 });
    }
  }
  if ('verified_savings_cents' in body) {
    const v = body.verified_savings_cents;
    if (v === null) patch.verified_savings_cents = null;
    else if (typeof v === 'number' && Number.isInteger(v) && v >= 0) patch.verified_savings_cents = v;
    else return NextResponse.json({ error: 'verified_savings_cents must be integer cents' }, { status: 400 });
  }
  if ('verification_status' in body) {
    const v = body.verification_status;
    if (!['claimed', 'system_verified', 'document_verified', 'admin_reviewed'].includes(v as string)) {
      return NextResponse.json({ error: 'Invalid verification_status' }, { status: 400 });
    }
    patch.verification_status = v;
  }
  if ('file_refs' in body) {
    const v = body.file_refs;
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length <= 100) {
      patch.file_refs = v;
    } else {
      return NextResponse.json({ error: 'file_refs must be an array of storage paths' }, { status: 400 });
    }
  }

  if (body.snapshotMetrics === true) {
    const detail = await buildEngagementDetail(supabaseAdmin, engagement as FrlEngagementRow);
    if (detail) {
      patch.metrics_snapshot = {
        gmv30: detail.economics.artist.gmv30,
        gmvLifetime: detail.economics.artist.gmvLifetime,
        paidMemberCount: detail.economics.artist.paidMemberCount,
        firstPaidAt: detail.economics.artist.firstPaidAt,
        daysToFirstPaid: detail.economics.artist.daysToFirstPaid,
        guaranteeStatus: detail.guarantee.status,
        crwnRevenue30: detail.economics.crwn.revenue30,
        contribution30: detail.economics.margin.contribution30,
      };
      patch.metrics_snapshot_at = new Date().toISOString();
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();
  patch.updated_by = admin.id;

  const { data: existing } = await supabaseAdmin
    .from('frl_evidence')
    .select('id')
    .eq('engagement_id', id)
    .maybeSingle();

  const query = existing
    ? supabaseAdmin.from('frl_evidence').update(patch).eq('engagement_id', id).select('*').single()
    : supabaseAdmin.from('frl_evidence').insert({ ...patch, engagement_id: id, created_by: admin.id }).select('*').single();

  const { data, error } = await query;
  if (error) {
    console.error('[frl] evidence write failed:', error);
    return NextResponse.json({ error: 'Could not save evidence' }, { status: 500 });
  }
  return NextResponse.json({ evidence: data });
}
