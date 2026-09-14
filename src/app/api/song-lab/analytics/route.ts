// Song Lab analytics, derived on read from the canonical tables. Nothing here is stored.
//
// TWO KINDS OF NUMBER, AND ONLY ONE MAY BE A PERCENTAGE:
//   * ATTRIBUTION and PARTICIPATION (which magnet produced which fan, who is now paid) stay
//     COUNTS ONLY. A conversion rate over a small sample lies with a confident face
//     (07-BUSINESS-RULES section 16, rule 6).
//   * A SHOW'S VOTE SHARE is not a rate of anything: it is how one room split between songs,
//     and every vote in it is counted. The artist sees counts AND percentages there
//     (founder decision 2026-09-13), computed by the same merge the fan's success screen uses.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireSongLabArtist } from '@/lib/songLab/server';
import { perShowResults } from '@/lib/songLab/publicParticipant';

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
    // select('*') so `source` is included once schema-phase2-song-lab-live-shows.sql is
    // applied, and simply absent before it, instead of failing the whole query.
    supabaseAdmin.from('song_lab_offer_claims')
      .select('*')
      .eq('artist_id', artistId),
    supabaseAdmin.from('song_lab_votes')
      .select('decision_id, fan_id, option_id, created_at')
      .eq('artist_id', artistId),
    supabaseAdmin.from('song_lab_decisions')
      .select('id, project_id, stage_label, status, options, opens_at, closes_at, winning_option_id')
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

  // Votes from people whose email already belonged to an account. No fan attached, so they
  // feed the per-show song tallies and nothing fan-keyed. Fail soft: an unreadable table
  // shows account votes rather than breaking the artist's whole Results tab.
  const publicVotes: Array<{ decision_id: string; option_id: string }> = await supabaseAdmin
    .from('song_lab_public_votes')
    .select('decision_id, option_id')
    .eq('artist_id', artistId)
    .then((r) => (r.error ? [] : r.data ?? []), () => []);

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
      // Which door they came through. Absent before the source column exists, and null
      // for every claim recorded before it did: reported as "not recorded", never as 0.
      sources: cs.reduce<Record<string, number>>((acc, c) => {
        const key = (c as { source?: string | null }).source || 'unknown';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {}),
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
    // One row per SHOW, with its own tally. Never summed across shows: two sets on one
    // night are two separate questions, and merging them would invent a result nobody
    // voted for.
    // Built by the SAME merge the fan's success screen uses, so the artist and the room
    // can never read two different results. Includes public votes (an email that already
    // had an account), which this route silently dropped before 2026-09-13.
    decisions: perShowResults(decisions || [], votes || [], publicVotes),
    participation: {
      participants,
      repeatParticipants,
      multiProjectParticipants,
      // Account-linked votes only: everything in this block is keyed by fan, and a public
      // vote has no fan. The per-show totals above are the complete count.
      totalVotes: (votes || []).length,
      publicVotes: publicVotes.length,
      tierBreakdown,
    },
  });
}
