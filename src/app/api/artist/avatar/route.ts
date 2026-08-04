// The artist's sub-avatar, derived on read (docs/SUB_AVATARS.md).
//
// GET  -> { acquisition, observed, override, taxonomyVersion }
//   - acquisition: the avatar of the FIRST claimed calculator (permanent; never overwritten).
//   - observed: the current deterministic assignment over declared + behavioral evidence.
//   - override: the stored manual override, when the migration has run.
// POST -> { override: SubAvatarId | null } sets the owner's manual override + audit row.
//
// Ownership is the SESSION: this route takes no artist parameter, so a request cannot name
// another artist. All DB access uses the service-role client with explicit ownership filters
// (the override column deliberately has no client grants; see schema-phase2-sub-avatar.sql).
// Everything is fail-soft pre-migration: reads return override: null, writes report pending.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  assignSubAvatar,
  deriveAcquisitionAvatar,
  evidenceFromInputs,
  mergeEvidence,
} from '@/lib/avatars/assignment';
import { SUB_AVATAR_TAXONOMY_VERSION, getSubAvatar, isSubAvatarId } from '@/lib/avatars/taxonomy';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function requireArtist() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, artist: null };
  const { data: artist } = await supabaseAdmin
    .from('artist_profiles')
    .select('id, user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  return { user, artist: artist ?? null };
}

function summarize(id: string | null) {
  const def = getSubAvatar(id);
  return def ? { id: def.id, label: def.label, promise: def.promise, firstOffer: def.firstOffer } : null;
}

export async function GET() {
  const { user, artist } = await requireArtist();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Evidence assembly, all best-effort. A missing table is silence, never a failure. All four
  // avatars share one calculator, so the evidence is the ANSWERS plus the `?from=` funnel stored
  // beside them, read oldest first so the acquisition avatar is the first link they ever clicked.
  let entryContexts: string[] = [];
  let inputEvidence: ReturnType<typeof evidenceFromInputs>[] = [];
  try {
    const { data: inputRows } = await supabaseAdmin
      .from('lead_magnet_results')
      .select('input_data, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(10);
    inputEvidence = (inputRows ?? []).map((r) => evidenceFromInputs(r.input_data as Record<string, unknown>));
    entryContexts = inputEvidence.flatMap((f) => (f.entryContexts ?? []).filter((c): c is string => !!c));
  } catch {
    /* silence */
  }

  // Behavioral evidence, only when an artist row exists.
  let patreonImported: boolean | null = null;
  let liveSessionsHosted: number | null = null;
  let gatedTracks: number | null = null;
  if (artist) {
    try {
      const [{ count: liveCount }, { count: gatedCount }, { data: patreonRow }] = await Promise.all([
        supabaseAdmin.from('live_sessions').select('id', { count: 'exact', head: true }).eq('artist_id', artist.id),
        supabaseAdmin
          .from('tracks')
          .select('id', { count: 'exact', head: true })
          .eq('artist_id', artist.id)
          .eq('is_free', false),
        supabaseAdmin
          .from('fan_contacts')
          .select('id')
          .eq('artist_id', artist.id)
          .contains('tags', ['patreon'])
          .limit(1)
          .maybeSingle(),
      ]);
      liveSessionsHosted = typeof liveCount === 'number' ? liveCount : null;
      gatedTracks = typeof gatedCount === 'number' ? gatedCount : null;
      patreonImported = patreonRow ? true : null;
    } catch {
      /* silence */
    }
  }

  // The stored override (pre-migration this select fails; treat as absent).
  let override: string | null = null;
  if (artist) {
    try {
      const { data } = await supabaseAdmin
        .from('artist_profiles')
        .select('sub_avatar_override')
        .eq('id', artist.id)
        .maybeSingle();
      override = typeof data?.sub_avatar_override === 'string' ? data.sub_avatar_override : null;
    } catch {
      override = null;
    }
  }

  const evidence = mergeEvidence(
    { entryContexts, patreonImported, liveSessionsHosted, gatedTracks, manualOverride: override },
    ...inputEvidence,
  );

  const observed = assignSubAvatar(evidence);
  const acquisition = deriveAcquisitionAvatar(entryContexts);

  return NextResponse.json({
    taxonomyVersion: SUB_AVATAR_TAXONOMY_VERSION,
    acquisition: summarize(acquisition),
    observed: observed
      ? {
          ...summarize(observed.primarySubAvatar),
          secondary: summarize(observed.secondarySubAvatar ?? null),
          confidence: observed.confidence,
          source: observed.source,
          evidence: observed.evidence,
        }
      : null,
    override: summarize(override),
  });
}

export async function POST(req: NextRequest) {
  const { user, artist } = await requireArtist();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!artist) return NextResponse.json({ error: 'No artist profile' }, { status: 404 });

  const allowed = await checkRateLimit(user.id, 'avatar-override', 3600, 20);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  let body: { override?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const next = body.override === null ? null : typeof body.override === 'string' ? body.override : undefined;
  if (next !== null && !isSubAvatarId(next)) {
    return NextResponse.json({ error: 'Unknown sub-avatar id' }, { status: 400 });
  }

  try {
    const { data: current } = await supabaseAdmin
      .from('artist_profiles')
      .select('sub_avatar_override')
      .eq('id', artist.id)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from('artist_profiles')
      .update({ sub_avatar_override: next })
      .eq('id', artist.id);
    if (error) throw error;

    // Audit history. Best-effort: the table may predate the migration on a fresh environment.
    try {
      await supabaseAdmin.from('sub_avatar_audit').insert({
        artist_id: artist.id,
        previous_avatar: current?.sub_avatar_override ?? null,
        next_avatar: next,
        source: 'manual',
        actor_user_id: user.id,
      });
    } catch {
      /* audit is additive */
    }

    return NextResponse.json({ ok: true, override: summarize(next) });
  } catch {
    // Pre-migration: the column does not exist yet. Honest pending answer, not a 500.
    return NextResponse.json({ ok: false, pending: true, error: 'Sub-avatar migration not applied yet' }, { status: 409 });
  }
}
