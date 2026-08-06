// GET /api/artist/launch-partner — the First Paid Member Guarantee checklist
// for the First Revenue Launch cohort (2026-08-06).
//
// Mirrors /api/artist/roadmap: 'check' conditions run through the Quest
// Engine's own evaluateCondition (synthetic instance), the one 'query'
// condition is a direct read, and nothing derived is stored. The ONLY stored
// value is the cohort flag artist_profiles.launch_partner (migration
// schema-phase2-launch-partner.sql), which is SERVER-ONLY: it is read here with
// the service-role client and must never be named in a browser query (a
// revoked column fails the whole statement with 42501).
//
// Fail-soft rules:
//  - not signed in / not an artist -> plain error statuses
//  - flag column missing (migration unrun) or flag false -> { enabled: false }
//    and the card renders nothing. The checklist is invisible until the founder
//    flips the flag for a cohort artist.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { evaluateCondition } from '@/lib/quests/evaluator';
import type { QuestInstance } from '@/lib/quests/types';
import {
  assembleLaunchPartnerChecklist,
  buildLaunchPartnerDefs,
  type LaunchPartnerConditionResult,
  type LaunchPartnerQuery,
} from '@/lib/launchPartner';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function evalQuery(artistId: string, query: LaunchPartnerQuery): Promise<LaunchPartnerConditionResult> {
  try {
    if (query === 'campaign_drafted') {
      const { count } = await supabaseAdmin
        .from('campaigns')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', artistId);
      const n = count || 0;
      return { done: n >= 1, current: n, target: 1 };
    }
  } catch {
    // fall through to fail-safe
  }
  return { done: false, current: 0, target: 1 };
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, slug')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!artist) return NextResponse.json({ error: 'Not an artist' }, { status: 403 });

  // The cohort flag, service-role only. Missing column (42703) or any read
  // error means the feature is simply off; never a 500 for a cosmetic card.
  let enabled = false;
  try {
    const { data: row, error } = await supabaseAdmin
      .from('artist_profiles')
      .select('launch_partner')
      .eq('id', artist.id)
      .maybeSingle();
    if (!error) enabled = row?.launch_partner === true;
  } catch {
    enabled = false;
  }
  if (!enabled) return NextResponse.json({ enabled: false });

  const defs = buildLaunchPartnerDefs({ slug: artist.slug });

  const evaluated = await Promise.all(
    defs.map(async (def): Promise<[string, LaunchPartnerConditionResult]> => {
      if (def.source.kind === 'query') {
        return [def.key, await evalQuery(artist.id, def.source.query)];
      }
      try {
        const instance = {
          id: `launch-partner:${def.key}`,
          user_id: user.id,
          artist_id: artist.id,
          status: 'active',
          progress_percent: 0,
          completion_condition: { kind: 'domain', check: def.source.check, count: def.source.count },
        } as unknown as QuestInstance;
        const res = await evaluateCondition(supabaseAdmin, instance);
        return [def.key, { done: res.done, current: res.current, target: res.target }];
      } catch {
        return [def.key, { done: false, current: 0, target: def.source.count ?? 1 }];
      }
    }),
  );

  const checklist = assembleLaunchPartnerChecklist(defs, Object.fromEntries(evaluated));

  return NextResponse.json({ enabled: true, checklist });
}
