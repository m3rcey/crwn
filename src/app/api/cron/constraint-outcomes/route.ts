// Daily cron: read the OUTCOME of constraint recommendations whose measurement window has elapsed.
//
// The other half of Z3. `/api/artist/constraint` records what CRWN recommended; this reads what
// happened afterwards, by RE-RUNNING THE EXISTING ENGINE against fresh evidence and asking the only
// question CRWN can answer honestly: is this still the constraint?
//
// WHAT IT DELIBERATELY DOES NOT DO
//  - It does not compare numbers against a threshold invented here. "Improved" would need a
//    definition of how much movement counts, and CRWN has no measured basis for one. The engine's
//    own founder-adjustable thresholds decide, exactly as they do on the artist's dashboard.
//  - It does not claim causality. `constraint_cleared` means the constraint cleared while the
//    recommendation was open. Anything else the artist did in the window is invisible here.
//  - It does not touch product state: no tier, price, promise, quest, XP or roadmap step. It writes
//    only the observation columns of a bookkeeping row, and never the baseline.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assembleConstraintEvidence } from '@/lib/constraint/assembler';
import { readConstraint } from '@/lib/constraint/engine';
import { markActionCompleted, measureOne, openRecommendations } from '@/lib/constraint/recommendationStore';
import { evaluateCondition } from '@/lib/quests/evaluator';
import type { QuestInstance } from '@/lib/quests/types';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date().toISOString();
  const rows = await openRecommendations(supabaseAdmin);
  if (rows.length === 0) return NextResponse.json({ measured: 0, skipped: 0 });

  // Group by artist: several open recommendations for one artist share ONE evidence assembly, and
  // more importantly share one reading of the world, so two rows measured in the same pass can
  // never disagree about what the constraint is right now.
  const byArtist = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byArtist.get(r.artist_id) ?? [];
    list.push(r);
    byArtist.set(r.artist_id, list);
  }

  let measured = 0;
  let skipped = 0;
  let actionsSeen = 0;

  /**
   * Did the artist take the recommended action? Answered by the QUEST ENGINE'S OWN evaluator via a
   * minimal synthetic instance, the same pattern the roadmap uses, so this can never become a
   * second completion oracle. It only READS the check; it never completes a quest or awards XP.
   *
   * Recorded independently of the outcome, and on every pass (not only when the row is due), so
   * "acted on but still the constraint" is a state CRWN can actually observe.
   */
  const checkActionTaken = async (
    userId: string,
    artistId: string,
    verifiedBy: string | null,
  ): Promise<boolean> => {
    if (!verifiedBy) return false; // advisory: CRWN cannot see whether it was done
    try {
      const instance = {
        id: `constraint-outcome:${artistId}:${verifiedBy}`,
        user_id: userId,
        artist_id: artistId,
        status: 'active',
        progress_percent: 0,
        completion_condition: { kind: 'domain', check: verifiedBy, count: 1 },
      } as unknown as QuestInstance;
      const res = await evaluateCondition(supabaseAdmin, instance);
      return !!res.done;
    } catch {
      return false;
    }
  };

  for (const [artistId, artistRows] of byArtist) {
    try {
      // The artist's user id is needed by both the action check and the assembler's launch checks;
      // resolved from the row's artist, never from anything a caller supplied (this route takes no
      // parameters at all).
      const { data: artist } = await supabaseAdmin
        .from('artist_profiles')
        .select('user_id')
        .eq('id', artistId)
        .maybeSingle();
      if (!artist?.user_id) {
        skipped += artistRows.length;
        continue;
      }
      const userId = artist.user_id as string;

      // ACTION first, and for EVERY open row regardless of whether the window has elapsed. Whether
      // the artist acted is a fact about them, not about the measurement schedule, and recording it
      // early is what makes "acted on, still the constraint" observable rather than inferred.
      for (const row of artistRows) {
        if (row.action_completed_at) continue; // first completion timestamp wins
        if (await checkActionTaken(userId, artistId, row.verified_by)) {
          await markActionCompleted(supabaseAdmin, row.id, now);
          actionsSeen++;
        }
      }

      // Rows with no canonical measurement window (RETENTION, FIRST_PAID, DEPTH) are never due, so
      // skip the evidence assembly when none of this artist's rows is ready. measureOne re-checks,
      // so this is an optimization and not the rule.
      const anyDue = artistRows.some(
        (r) =>
          r.measure_after_days !== null &&
          new Date(r.issued_at).getTime() + r.measure_after_days * 86_400_000 <= new Date(now).getTime(),
      );
      if (!anyDue) {
        skipped += artistRows.length;
        continue;
      }

      const evidence = await assembleConstraintEvidence(supabaseAdmin, { artistId, userId });
      const later = readConstraint(evidence);

      for (const row of artistRows) {
        const done = await measureOne(supabaseAdmin, row, later, now);
        if (done) measured++;
        else skipped++;
      }
    } catch (err) {
      // One artist's unreadable evidence must not stop the sweep. Their rows stay open and are
      // retried tomorrow, which is the correct outcome: no measurement is better than a wrong one.
      console.error('constraint outcome measurement failed for artist', artistId, err);
      skipped += artistRows.length;
    }
  }

  return NextResponse.json({ measured, skipped, actionsSeen, considered: rows.length });
}
