import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { getDealForUser, recordAudit, recordVersion } from '@/lib/teamSplits/server';
import { notifyArtistResponse } from '@/lib/teamSplits/notify';
import { TEAM_SPLIT_AGREEMENT_VERSION } from '@/lib/teamSplits/disclaimer';
import type { TeamSplitDeal } from '@/lib/teamSplits/types';
import { acceptDealEnforced, artistFeePercentFor } from '@/lib/teamSplits/acceptance';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// POST /api/team-splits/:id/respond  { action: accept|reject|request_changes, note?, agreementAccepted? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const ctx = await getDealForUser(supabaseAdmin, id, user.id);
  if (!ctx || !ctx.isCollaborator) return NextResponse.json({ error: 'Only the collaborator can respond' }, { status: 403 });
  const deal = ctx.deal;

  if (!['sent', 'viewed', 'changes_requested'].includes(deal.status)) {
    return NextResponse.json({ error: 'This deal can no longer be responded to.' }, { status: 400 });
  }

  const body = await req.json();
  const action: string = body.action;
  const now = new Date().toISOString();

  // artist user id for notifications
  const { data: artistProfile } = await supabaseAdmin
    .from('artist_profiles').select('user_id').eq('id', deal.artist_id).maybeSingle();
  const artistUserId = artistProfile?.user_id;
  const { data: me } = await supabaseAdmin.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  const myName = deal.collaborator_name || me?.display_name || 'Your collaborator';

  if (action === 'accept') {
    if (!body.agreementAccepted) {
      return NextResponse.json({ error: 'You must accept the terms to accept this deal.' }, { status: 400 });
    }
    // Set the activation window. On-accept deals go active now; others wait.
    const goActive = deal.start_trigger === 'on_accept';
    const startsAt = deal.starts_at || (goActive ? now : null);
    let endsAt = deal.ends_at;
    if (!endsAt && deal.duration_days && startsAt) {
      endsAt = new Date(new Date(startsAt).getTime() + deal.duration_days * 86400000).toISOString();
    }
    // -----------------------------------------------------------------------
    // D4. OVER-COMMITMENT IS REFUSED HERE, ATOMICALLY.
    // -----------------------------------------------------------------------
    // Acceptance is the earliest moment at which the terms are known AND the deal becomes
    // economically binding, so it is the load-bearing enforcement point. A deal must not become
    // binding if CRWN cannot honour its literal percentage.
    //
    // The check runs INSIDE the database, under an advisory lock on the artist, in the same
    // transaction that flips the status. An application-side read-then-write cannot close the race
    // where two collaborators accept 60% and 50% of the same source in the same instant: both
    // would read the old world and both would commit, leaving 110% owed and one of two real people
    // silently short-changed.
    //
    // The RPC returns a null status when it refuses, and changes nothing. No partial state, and
    // never a silently reduced percentage.
    const feePercent = await artistFeePercentFor(supabaseAdmin, deal.artist_id);
    const enforced = await acceptDealEnforced(supabaseAdmin, {
      dealId: id,
      collaboratorId: user.id,
      goActive,
      platformFeePercent: feePercent,
    });

    if (enforced.kind === 'over_committed') {
      await recordAudit(supabaseAdmin, id, user.id, 'accept_refused_over_committed', {
        committed_percent: enforced.committedPercent,
      });
      return NextResponse.json(
        { error: enforced.message, code: 'over_committed', committedPercent: enforced.committedPercent },
        { status: 409 },
      );
    }
    if (enforced.kind === 'not_acceptable') {
      return NextResponse.json({ error: 'This deal can no longer be responded to.' }, { status: 409 });
    }
    if (enforced.kind === 'unavailable') {
      // The migration has not run yet. Refuse rather than accept an unenforceable commitment:
      // the rail is disabled anyway, so nobody is blocked from being paid.
      return NextResponse.json(
        { error: 'Team Splits are being upgraded and cannot be accepted right now. Try again shortly.' },
        { status: 503 },
      );
    }

    const update: Partial<TeamSplitDeal> = {
      status: enforced.status as TeamSplitDeal['status'],
      collaborator_accepted_at: now,
      accepted_at: now,
      agreement_version: TEAM_SPLIT_AGREEMENT_VERSION,
      starts_at: startsAt,
      ends_at: endsAt,
    };
    // The RPC already set status/accepted_at/starts_at atomically. This writes only the fields it
    // does not own (the agreement version and the computed end date).
    await supabaseAdmin
      .from('team_split_deals')
      .update({ agreement_version: TEAM_SPLIT_AGREEMENT_VERSION, ends_at: endsAt, starts_at: startsAt })
      .eq('id', id);
    await recordVersion(supabaseAdmin, { ...deal, ...update } as TeamSplitDeal, user.id, 'accepted', 'Collaborator accepted');
    await recordAudit(supabaseAdmin, id, user.id, 'accepted', { agreement_version: TEAM_SPLIT_AGREEMENT_VERSION });
    if (artistUserId) await notifyArtistResponse(supabaseAdmin, { artistUserId, collaboratorName: myName, dealTitle: deal.title, action: 'accepted', dealId: id });
    return NextResponse.json({ ok: true, status: update.status });
  }

  if (action === 'reject') {
    await supabaseAdmin.from('team_split_deals').update({ status: 'cancelled', rejected_at: now }).eq('id', id);
    await recordAudit(supabaseAdmin, id, user.id, 'rejected', { note: body.note || null });
    if (artistUserId) await notifyArtistResponse(supabaseAdmin, { artistUserId, collaboratorName: myName, dealTitle: deal.title, action: 'rejected', dealId: id });
    return NextResponse.json({ ok: true, status: 'cancelled' });
  }

  if (action === 'request_changes') {
    await supabaseAdmin.from('team_split_deals').update({ status: 'changes_requested', changes_requested_at: now }).eq('id', id);
    await recordAudit(supabaseAdmin, id, user.id, 'change_request', { note: body.note || null });
    if (artistUserId) await notifyArtistResponse(supabaseAdmin, { artistUserId, collaboratorName: myName, dealTitle: deal.title, action: 'requested changes', dealId: id });
    return NextResponse.json({ ok: true, status: 'changes_requested' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
