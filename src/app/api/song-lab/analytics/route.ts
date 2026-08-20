// Song Lab analytics — GB's experiment results, derived on read from the canonical tables.
// COUNTS ONLY, never rates: the sample is small and a percentage would lie with a
// confident face (same rule as the admin scorecard). Nothing here is stored; delete the
// experiment and this route has nothing to say.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSongLabArtist } from '@/lib/songLab/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET() {
  const auth = await requireSongLabArtist(supabaseAdmin);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const artistId = auth.artistId;

  const [
    { data: offers },
    { data: claims },
    { data: votes },
    { data: decisions },
    { data: subs },
    { data: tiers },
  ] = await Promise.all([
    supabaseAdmin.from('song_lab_offers')
      .select('id, name, slug, is_active, view_count')
      .eq('artist_id', artistId),
    supabaseAdmin.from('song_lab_offer_claims')
      .select('offer_id, fan_id, join_result, fresh_signup, created_at')
      .eq('artist_id', artistId),
    supabaseAdmin.from('song_lab_votes')
      .select('decision_id, fan_id, created_at')
      .eq('artist_id', artistId),
    supabaseAdmin.from('song_lab_decisions')
      .select('id, project_id, stage_label, status')
      .eq('artist_id', artistId),
    supabaseAdmin.from('subscriptions')
      .select('fan_id, tier_id, status')
      .eq('artist_id', artistId)
      .eq('status', 'active'),
    supabaseAdmin.from('subscription_tiers')
      .select('id, name, price')
      .eq('artist_id', artistId),
  ]);

  const tierById = new Map((tiers || []).map((t) => [t.id, t]));
  const paidFanIds = new Set(
    (subs || [])
      .filter((s) => (tierById.get(s.tier_id)?.price ?? 0) > 0)
      .map((s) => s.fan_id),
  );
  const activeTierByFan = new Map((subs || []).map((s) => [s.fan_id, s.tier_id]));

  // Participation
  const votesByFan = new Map<string, number>();
  for (const v of votes || []) votesByFan.set(v.fan_id, (votesByFan.get(v.fan_id) ?? 0) + 1);
  const participants = votesByFan.size;
  const repeatParticipants = [...votesByFan.values()].filter((n) => n >= 2).length;

  const votesByDecision = new Map<string, number>();
  for (const v of votes || []) votesByDecision.set(v.decision_id, (votesByDecision.get(v.decision_id) ?? 0) + 1);

  // Which projects each fan touched
  const projectByDecision = new Map((decisions || []).map((d) => [d.id, d.project_id]));
  const projectsByFan = new Map<string, Set<string>>();
  for (const v of votes || []) {
    const pid = projectByDecision.get(v.decision_id);
    if (!pid) continue;
    if (!projectsByFan.has(v.fan_id)) projectsByFan.set(v.fan_id, new Set());
    projectsByFan.get(v.fan_id)!.add(pid);
  }
  const multiProjectParticipants = [...projectsByFan.values()].filter((s) => s.size >= 2).length;

  // Per-offer comparison: views, claims, fresh joins, participation depth, later paid.
  const claimsByOffer = new Map<string, Array<{ fan_id: string; join_result: string; fresh_signup: boolean }>>();
  for (const c of claims || []) {
    if (!claimsByOffer.has(c.offer_id)) claimsByOffer.set(c.offer_id, []);
    claimsByOffer.get(c.offer_id)!.push(c);
  }
  const offerRows = (offers || []).map((o) => {
    const cs = claimsByOffer.get(o.id) || [];
    const joined = cs.filter((c) => c.join_result === 'joined');
    const claimedFanIds = cs.map((c) => c.fan_id);
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      isActive: o.is_active,
      views: o.view_count ?? 0,
      claims: cs.length,
      freeJoins: joined.length,
      freshSignups: cs.filter((c) => c.fresh_signup).length,
      participated: claimedFanIds.filter((f) => votesByFan.has(f)).length,
      // "Later paid" joins on (artist_id, fan_id) against live paid memberships. It is a
      // COUNT of current paid members among this offer's claimers, not a causal claim.
      nowPaid: claimedFanIds.filter((f) => paidFanIds.has(f)).length,
    };
  });

  // Participant tier breakdown (counts by current tier, unknown = no active membership)
  const tierBreakdown: Record<string, number> = {};
  for (const fanId of votesByFan.keys()) {
    const tid = activeTierByFan.get(fanId);
    const name = tid ? (tierById.get(tid)?.name ?? 'Unknown tier') : 'No membership';
    tierBreakdown[name] = (tierBreakdown[name] ?? 0) + 1;
  }

  return NextResponse.json({
    offers: offerRows,
    decisions: (decisions || []).map((d) => ({
      id: d.id,
      projectId: d.project_id,
      stageLabel: d.stage_label,
      status: d.status,
      votes: votesByDecision.get(d.id) ?? 0,
    })),
    participation: {
      participants,
      repeatParticipants,
      multiProjectParticipants,
      totalVotes: (votes || []).length,
      tierBreakdown,
    },
  });
}
