// GET /api/admin/frl/engagements — list First Revenue Launch engagements
//   ?view=cohort adds full per-engagement economics + cohort aggregates for the
//   founding cohort comparison (n is small by design: three launch partners).
// POST — create an engagement (records terms; NEVER charges anyone: the
//   implementation fee is a manual Stripe invoice by explicit founder decision).
//
// Admin-only, server-side (requireAdmin). The client /admin check is cosmetic;
// this is the real gate. All money is integer cents.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import {
  buildEngagementDetail,
  fetchArtistMeta,
  type FrlEngagementRow,
} from '@/lib/frl/server';
import { cohortAggregates, type CohortRowInput } from '@/lib/frl/economics';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ENGAGEMENT_TYPES = ['founding_cohort', 'standard', 'self_serve'] as const;

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const view = req.nextUrl.searchParams.get('view');

  let rows: FrlEngagementRow[] = [];
  try {
    const { data, error } = await supabaseAdmin
      .from('frl_engagements')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) throw error;
    rows = (data ?? []) as FrlEngagementRow[];
  } catch {
    // Pre-migration: render an empty system, never a 500.
    return NextResponse.json({ engagements: [], migrationPending: true });
  }

  // Light list annotation: artist name/slug per row.
  const engagements = await Promise.all(
    rows.map(async (row) => {
      const meta = await fetchArtistMeta(supabaseAdmin, row.artist_id);
      return {
        ...row,
        artistSlug: meta?.slug ?? null,
        artistName: meta?.displayName ?? null,
        platformTier: meta?.platformTier ?? null,
      };
    }),
  );

  if (view !== 'cohort') {
    return NextResponse.json({ engagements });
  }

  // Cohort view: full economics per founding-cohort engagement. n=3 by design,
  // so per-engagement assembly is affordable. Aggregates exclude unknown values
  // and carry per-metric sample sizes; they are never averaged over blanks.
  const cohortRows = rows.filter((r) => r.engagement_type === 'founding_cohort');
  const details = (
    await Promise.all(cohortRows.map((row) => buildEngagementDetail(supabaseAdmin, row)))
  ).filter((d): d is NonNullable<typeof d> => d !== null);

  const cohort = await Promise.all(details.map(async (d) => {
    // Both contact numbers, not just the closer guarantee path.
    let contactsImported: number | null = null;
    let provenBuyers: number | null = null;
    try {
      const [{ count: total }, { count: proven }] = await Promise.all([
        supabaseAdmin.from('fan_contacts').select('id', { count: 'exact', head: true }).eq('artist_id', d.engagement.artist_id),
        supabaseAdmin.from('fan_contacts').select('id', { count: 'exact', head: true }).eq('artist_id', d.engagement.artist_id).contains('tags', ['patreon']),
      ]);
      contactsImported = total ?? 0;
      provenBuyers = proven ?? 0;
    } catch {
      contactsImported = null;
      provenBuyers = null;
    }

    const deliveryDays =
      d.engagement.started_on && d.engagement.actual_launch_on
        ? Math.round(
            (Date.parse(`${d.engagement.actual_launch_on}T00:00:00Z`) -
              Date.parse(`${d.engagement.started_on}T00:00:00Z`)) / 86_400_000,
          )
        : null;

    return {
      engagementId: d.engagement.id,
      artistName: d.artist.displayName,
      artistSlug: d.artist.slug,
      status: d.engagement.status,
      feeAgreedCents: d.engagement.fee_agreed_cents,
      feeCollectedCents: d.engagement.fee_collected_cents,
      discountCents: d.engagement.discount_cents,
      laborMinutes: d.economics.costs.laborMinutesLifetime,
      deliveryDays,
      contactsImported,
      provenBuyers,
      firstPaidAt: d.economics.artist.firstPaidAt,
      daysToFirstPaid: d.economics.artist.daysToFirstPaid,
      gmv30: d.economics.artist.gmv30,
      implementation30: d.economics.crwn.implementationCollected,
      planSubscription30: d.economics.crwn.planSubscription30,
      platformFees30: d.economics.crwn.platformFees30,
      directCost30: d.economics.costs.directCost30,
      contribution30: d.economics.margin.contribution30,
      guaranteeStatus: d.guarantee.status,
      platformTier: d.artist.platformTier,
      consent: {
        caseStudy: d.engagement.case_study_consent,
        testimonial: d.engagement.testimonial_consent,
        performanceData: d.engagement.performance_data_consent,
      },
      diagnostic: d.economics.diagnostic,
    };
  }));

  const aggInput: CohortRowInput[] = cohort.map((c) => ({
    daysToFirstPaid: c.daysToFirstPaid,
    laborMinutes: c.laborMinutes > 0 ? c.laborMinutes : null,
    implementationCollectedCents: c.feeCollectedCents,
    contribution30Cents: c.contribution30.cents,
    guaranteeStatus: c.guaranteeStatus ?? null,
    onPaidPlan: c.platformTier ? c.platformTier !== 'starter' : null,
    inputsComplete: c.contribution30.cents !== null,
  }));

  return NextResponse.json({
    engagements,
    cohort,
    aggregates: cohortAggregates(aggInput),
  });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  let body: {
    artistId?: unknown;
    artistSlug?: unknown;
    engagementType?: unknown;
    startedOn?: unknown;
    feeAgreedCents?: unknown;
    requiredPlan?: unknown;
    notes?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  let artistId = typeof body.artistId === 'string' ? body.artistId : null;
  if (!artistId && typeof body.artistSlug === 'string' && body.artistSlug.trim()) {
    const { data: bySlug } = await supabaseAdmin
      .from('artist_profiles')
      .select('id')
      .eq('slug', body.artistSlug.trim().toLowerCase())
      .maybeSingle();
    artistId = (bySlug?.id as string | undefined) ?? null;
    if (!artistId) return NextResponse.json({ error: `No artist with slug "${body.artistSlug}"` }, { status: 404 });
  }
  if (!artistId) return NextResponse.json({ error: 'artistId or artistSlug required' }, { status: 400 });

  const meta = await fetchArtistMeta(supabaseAdmin, artistId);
  if (!meta) return NextResponse.json({ error: 'Artist not found' }, { status: 404 });

  const engagementType = ENGAGEMENT_TYPES.includes(body.engagementType as never)
    ? (body.engagementType as (typeof ENGAGEMENT_TYPES)[number])
    : 'founding_cohort';

  // One open engagement per artist: a rebuild/relaunch under the guarantee is
  // the SAME engagement, not a second row.
  const { data: open } = await supabaseAdmin
    .from('frl_engagements')
    .select('id')
    .eq('artist_id', artistId)
    .in('status', ['agreed', 'active'])
    .limit(1);
  if (open && open.length > 0) {
    return NextResponse.json(
      { error: 'This artist already has an open engagement. Complete or cancel it first.' },
      { status: 409 },
    );
  }

  const insert: Record<string, unknown> = {
    artist_id: artistId,
    engagement_type: engagementType,
    created_by: admin.id,
    updated_by: admin.id,
  };
  if (typeof body.startedOn === 'string' && DATE_RE.test(body.startedOn)) insert.started_on = body.startedOn;
  if (typeof body.feeAgreedCents === 'number' && Number.isInteger(body.feeAgreedCents) && body.feeAgreedCents >= 0) {
    insert.fee_agreed_cents = body.feeAgreedCents;
  }
  if (body.requiredPlan === 'pro' || body.requiredPlan === 'scale') insert.required_plan = body.requiredPlan;
  if (typeof body.notes === 'string') insert.notes = body.notes.slice(0, 4000);

  const { data, error } = await supabaseAdmin
    .from('frl_engagements')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    console.error('[frl] engagement create failed:', error);
    return NextResponse.json({ error: 'Could not create the engagement (is the migration applied?)' }, { status: 500 });
  }

  return NextResponse.json({ engagement: data });
}
