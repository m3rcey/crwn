import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getArtistFeePercent } from '@/lib/platformTier';
import { analyzeDeal, isHighRisk } from '@/lib/teamSplits/warnings';
import { dealTypeMeta, roleLabel, DEFAULTS } from '@/lib/teamSplits/constants';
import { TEAM_SPLIT_AGREEMENT_VERSION } from '@/lib/teamSplits/disclaimer';
import { termsSnapshot, recordAudit, recordVersion, newInviteToken, artistIdForUser } from '@/lib/teamSplits/server';
import { notifyDealInvite, alertAdmin } from '@/lib/teamSplits/notify';
import type { TeamSplitDeal } from '@/lib/teamSplits/types';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// GET /api/team-splits?role=artist|collaborator  -> list deals for the caller
export async function GET(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const role = req.nextUrl.searchParams.get('role') || 'artist';

  if (role === 'collaborator') {
    const { data } = await supabaseAdmin
      .from('team_split_deals')
      .select('*')
      .eq('collaborator_user_id', user.id)
      .order('created_at', { ascending: false });
    return NextResponse.json({ deals: data || [] });
  }

  const artistId = await artistIdForUser(supabaseAdmin, user.id);
  if (!artistId) return NextResponse.json({ deals: [] });
  const { data } = await supabaseAdmin
    .from('team_split_deals')
    .select('*')
    .eq('artist_id', artistId)
    .order('created_at', { ascending: false });
  return NextResponse.json({ deals: data || [] });
}

// POST /api/team-splits  -> create a deal (draft or send)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const artistId = await artistIdForUser(supabaseAdmin, user.id);
    if (!artistId) return NextResponse.json({ error: 'Only artists can create Team Splits' }, { status: 403 });

    const body = await req.json();
    const action = body.action === 'send' ? 'send' : 'draft';

    // ---- validate core terms ----
    const meta = dealTypeMeta(body.dealType);
    const percentage = body.percentage != null ? Number(body.percentage) : null;
    if (meta.requiresPercentage && (percentage == null || percentage <= 0 || percentage > 100)) {
      return NextResponse.json({ error: 'Enter a percentage between 0 and 100.' }, { status: 400 });
    }
    if (!body.title || typeof body.title !== 'string') {
      return NextResponse.json({ error: 'A deal title is required.' }, { status: 400 });
    }

    // ---- revenue fence ----
    // A percentage deal must attach to revenue the accrual cron can actually
    // attribute. getQualifyingEarnings() fails closed (accrues $0) on anything
    // unfenceable, so reject it here rather than create a deal that looks active
    // and silently never pays.
    const sourceType = body.revenueSourceType || 'none';
    if (meta.requiresPercentage) {
      if (sourceType === 'custom' || sourceType === 'none') {
        return NextResponse.json(
          { error: 'Pick a revenue source. A percentage deal needs revenue it can be measured against.' },
          { status: 400 },
        );
      }
      if (sourceType !== 'all_earnings' && !body.revenueSourceId) {
        return NextResponse.json({ error: 'Choose which specific source this split pays from.' }, { status: 400 });
      }
      // A road campaign only earns through the tier/product it sells. Goal types
      // like supporters/rsvps/votes drive no revenue — nothing to split.
      if (sourceType === 'road_campaign') {
        const { data: campaign } = await supabaseAdmin
          .from('road_campaigns')
          .select('artist_id, linked_tier_id, linked_product_id')
          .eq('id', body.revenueSourceId)
          .maybeSingle();
        if (!campaign || campaign.artist_id !== artistId) {
          return NextResponse.json({ error: 'That campaign was not found on your profile.' }, { status: 400 });
        }
        if (!campaign.linked_tier_id && !campaign.linked_product_id) {
          return NextResponse.json(
            {
              error:
                'This campaign has no tier or product attached, so it generates no revenue to split. Link a checkout target to the campaign first, or split a tier or product directly.',
            },
            { status: 400 },
          );
        }
      }
    }

    // ---- resolve collaborator (email auto-binds to an existing account) ----
    let collaboratorUserId: string | null = body.collaboratorUserId || null;
    const collaboratorEmail: string | null = body.collaboratorEmail?.trim() || null;
    const collaboratorName: string | null = body.collaboratorName?.trim() || null;

    if (!collaboratorUserId && collaboratorEmail) {
      const { data: match } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('email', collaboratorEmail)
        .maybeSingle();
      if (match) collaboratorUserId = match.id;
    }
    if (collaboratorUserId === user.id) {
      return NextResponse.json({ error: 'You cannot make a Team Split with yourself.' }, { status: 400 });
    }
    if (action === 'send' && !collaboratorUserId && !collaboratorEmail) {
      return NextResponse.json({ error: 'Add a collaborator email to send this deal.' }, { status: 400 });
    }
    if (action === 'send' && !body.agreementAccepted) {
      return NextResponse.json({ error: 'You must accept the Team Split terms to send.' }, { status: 400 });
    }

    // ---- risk analysis ----
    const artistFeePct = await getArtistFeePercent(artistId);
    let existingSourceSplitPct = 0;
    if (body.revenueSourceId) {
      const { data: others } = await supabaseAdmin
        .from('team_split_deals')
        .select('percentage')
        .eq('artist_id', artistId)
        .eq('revenue_source_id', body.revenueSourceId)
        .in('status', ['sent', 'viewed', 'accepted', 'active']);
      existingSourceSplitPct = (others || []).reduce((s, r) => s + (r.percentage || 0), 0);
    }
    const warnings = analyzeDeal({
      dealType: body.dealType,
      role: body.role,
      sourceType: body.revenueSourceType || 'none',
      percentage,
      payoutBasis: body.payoutBasis || DEFAULTS.payoutBasis,
      capAmount: body.capAmount ?? null,
      durationDays: body.durationDays ?? null,
      hasDeliverables: Array.isArray(body.deliverables) && body.deliverables.length > 0,
      existingSourceSplitPct,
      artistFeePct,
    });
    const highRisk = isHighRisk(warnings);

    const inviteToken = newInviteToken();
    const nowIso = new Date().toISOString();

    const insertRow = {
      artist_id: artistId,
      collaborator_user_id: collaboratorUserId,
      collaborator_email: collaboratorEmail,
      collaborator_name: collaboratorName,
      invite_token: inviteToken,
      role: body.role || 'other',
      custom_role: body.customRole || null,
      title: body.title,
      description: body.description || null,
      deal_type: body.dealType || DEFAULTS.dealType,
      revenue_source_type: body.revenueSourceType || 'none',
      revenue_source_id: body.revenueSourceId || null,
      revenue_source_label: body.revenueSourceLabel || null,
      payout_basis: body.payoutBasis || DEFAULTS.payoutBasis,
      percentage,
      milestone_amount: body.milestoneAmount ?? null,
      milestone_description: body.milestoneDescription || null,
      upfront_amount: body.upfrontAmount ?? null,
      cap_amount: body.capAmount ?? null,
      minimum_payout_threshold: body.minimumPayoutThreshold ?? null,
      start_trigger: body.startTrigger || DEFAULTS.startTrigger,
      starts_at: body.startsAt || null,
      ends_at: body.endsAt || null,
      duration_days: body.durationDays ?? null,
      payout_starts_after_deliverable_approval:
        body.payoutStartsAfterDeliverableApproval ?? DEFAULTS.payoutStartsAfterDeliverableApproval,
      hold_period_days: body.holdPeriodDays ?? DEFAULTS.holdPeriodDays,
      auto_approve_deliverable_days: body.autoApproveDeliverableDays ?? null,
      refund_policy: body.refundPolicy || 'clawback',
      cancellation_policy: body.cancellationPolicy || null,
      rights_notes: body.rightsNotes || null,
      external_agreement_url: body.externalAgreementUrl || null,
      status: action === 'send' ? 'sent' : 'draft',
      current_version: 1,
      risk_flags: warnings,
      is_high_risk: highRisk,
      agreement_version: action === 'send' ? TEAM_SPLIT_AGREEMENT_VERSION : null,
      artist_accepted_at: action === 'send' ? nowIso : null,
      created_by: user.id,
    };

    const { data: deal, error } = await supabaseAdmin
      .from('team_split_deals')
      .insert(insertRow)
      .select('*')
      .single();
    if (error || !deal) {
      console.error('create deal failed:', error);
      return NextResponse.json({ error: 'Could not create the deal.' }, { status: 500 });
    }
    const typedDeal = deal as TeamSplitDeal;

    // terms_snapshot
    await supabaseAdmin
      .from('team_split_deals')
      .update({ terms_snapshot: termsSnapshot(typedDeal) })
      .eq('id', typedDeal.id);

    // deliverables
    if (Array.isArray(body.deliverables) && body.deliverables.length) {
      const rows = body.deliverables
        .filter((d: { title?: string }) => d.title)
        .map((d: { title: string; description?: string; dueAt?: string; approvalRequired?: boolean }) => ({
          deal_id: typedDeal.id,
          title: d.title,
          description: d.description || null,
          due_at: d.dueAt || null,
          approval_required: d.approvalRequired ?? true,
        }));
      if (rows.length) await supabaseAdmin.from('team_split_deliverables').insert(rows);
    }

    // version + audit
    await recordVersion(supabaseAdmin, typedDeal, user.id, 'created', 'Deal created');
    await recordAudit(supabaseAdmin, typedDeal.id, user.id, action === 'send' ? 'sent' : 'draft_created');

    if (action === 'send') {
      // artist display name for the invite
      const { data: artistProfile } = await supabaseAdmin
        .from('artist_profiles')
        .select('user_id').eq('id', artistId).maybeSingle();
      const { data: artistNameRow } = artistProfile
        ? await supabaseAdmin.from('profiles').select('display_name').eq('id', artistProfile.user_id).maybeSingle()
        : { data: null };
      const artistName = artistNameRow?.display_name || 'An artist';

      await notifyDealInvite(supabaseAdmin, {
        collaboratorUserId,
        collaboratorEmail,
        artistName,
        dealTitle: typedDeal.title,
        roleLabel: roleLabel(typedDeal.role, typedDeal.custom_role),
        summaryLine: dealSummaryLine(typedDeal),
        dealId: typedDeal.id,
        inviteToken,
      });
      if (highRisk) {
        await alertAdmin('High-risk deal created', `Deal "${typedDeal.title}" (${typedDeal.percentage ?? '?'}% ${typedDeal.revenue_source_type}) was flagged high-risk.`);
      }
    }

    return NextResponse.json({ deal: { ...typedDeal, terms_snapshot: termsSnapshot(typedDeal) }, warnings });
  } catch (e) {
    console.error('team-splits POST error:', e);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}

function dealSummaryLine(d: TeamSplitDeal): string {
  const pct = d.percentage != null ? `${d.percentage}% of ` : '';
  const src = d.revenue_source_label || 'the named revenue source';
  const cap = d.cap_amount ? `, capped at $${(d.cap_amount / 100).toFixed(0)}` : '';
  const basis = d.payout_basis === 'gross_revenue' ? 'gross' : 'net';
  return `${pct}${src} (${basis})${cap}.`;
}
