// Progressive profiling.
//
// Two jobs:
//   1. NEVER ask for something CRWN already knows. Every redundant question is a chance for
//      the artist to close the DM.
//   2. NEVER let a low-trust value overwrite a high-trust one.
//
// Job 2 is the one with teeth. Without it, an artist who has a real CRWN profile saying
// 40,000 monthly listeners can have that number replaced by Claude's reading of "idk like a
// few thousand?" from a half-remembered DM. Then CRWN prints the wrong number back at them
// as fact. The TRUST_RANK check below is what stops it.

import { supabaseAdmin } from './db';
import { getField } from './fieldRegistry';
import { TRUST_RANK, type AttributedValue, type FieldProvenance, type LeadIdentity } from './types';
import type { LeadProfileValues } from './toolAdapters';

export interface LoadedProfile {
  values: LeadProfileValues;
  provenance: Record<string, FieldProvenance>;
}

/**
 * Build the profile by reading every source CRWN has, weakest first, so stronger sources
 * overwrite weaker ones as we go.
 *
 * Order matters and is the inverse of TRUST_RANK: we layer the lead's DM answers first, then
 * let their real verified CRWN profile paint over the top.
 */
export async function loadProfile(identity: LeadIdentity): Promise<LoadedProfile> {
  const values: LeadProfileValues = {};
  const provenance: Record<string, FieldProvenance> = {};

  // Layer 1: the persistent lead profile (accumulated DM answers + Claude extractions).
  const { data: lp } = await supabaseAdmin
    .from('lead_profiles')
    .select('*')
    .eq('lead_identity_id', identity.id)
    .maybeSingle();

  if (lp) {
    const stored = (lp.field_provenance as Record<string, FieldProvenance>) ?? {};
    for (const [key, def] of Object.entries(FIELD_TO_COLUMN)) {
      const v = lp[def];
      if (v !== null && v !== undefined) {
        (values as Record<string, unknown>)[key] = v;
        provenance[key] = stored[key] ?? {
          source: 'direct_answer',
          confidence: 1,
          verifiedAt: String(lp.updated_at ?? new Date().toISOString()),
        };
      }
    }
  }

  // Layer 2: the REAL CRWN account, if this lead has been claimed. Highest trust, so it goes
  // last and wins every conflict. An artist's actual display name beats whatever they typed
  // into Instagram at 2am.
  if (identity.userId) {
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('display_name')
      .eq('id', identity.userId)
      .maybeSingle();

    if (prof?.display_name) {
      values.artist_name = prof.display_name;
      provenance.artist_name = { source: 'verified_crwn', confidence: 1, verifiedAt: new Date().toISOString() };
    }
  }

  if (identity.artistId) {
    // genre lives on artist_profiles. (display_name does NOT: it is on profiles. CLAUDE.md.)
    const { data: ap } = await supabaseAdmin
      .from('artist_profiles')
      .select('genres')
      .eq('id', identity.artistId)
      .maybeSingle();

    const genres = ap?.genres;
    if (Array.isArray(genres) && genres.length > 0) {
      values.genre = String(genres[0]);
      provenance.genre = { source: 'verified_crwn', confidence: 1, verifiedAt: new Date().toISOString() };
    }
  }

  return { values, provenance };
}

/**
 * Apply new values, respecting trust. Returns only what actually changed.
 *
 * This is the enforcement point for the trust ordering. A rejected write is not an error and
 * is not surfaced to the artist: we simply keep the better value we already had.
 */
export async function applyValues(
  identityId: string,
  current: LoadedProfile,
  incoming: Record<string, AttributedValue>,
  sessionId: string,
): Promise<{ applied: string[]; rejected: string[] }> {
  const applied: string[] = [];
  const rejected: string[] = [];
  const patch: Record<string, unknown> = {};
  const nextProvenance: Record<string, FieldProvenance> = { ...current.provenance };

  for (const [key, incomingValue] of Object.entries(incoming)) {
    const def = getField(key);
    const column = FIELD_TO_COLUMN[key];
    if (!def || !column) {
      rejected.push(key);
      continue;
    }

    // Money is never written from an AI extraction. The field registry already forbids it,
    // but a second check here means a future bug in ONE of the two places cannot open the
    // hole on its own.
    if (!def.aiExtractable && incomingValue.source === 'claude_extraction') {
      rejected.push(key);
      continue;
    }

    const existing = current.provenance[key];
    const existingRank = existing ? TRUST_RANK[existing.source] : -1;
    const incomingRank = TRUST_RANK[incomingValue.source];

    // STRICTLY greater. A tie keeps the value we already had, because the incumbent has
    // survived longer and re-writing it buys nothing.
    if (existingRank >= incomingRank) {
      rejected.push(key);
      continue;
    }

    patch[column] = incomingValue.value;
    nextProvenance[key] = {
      source: incomingValue.source,
      confidence: incomingValue.confidence,
      verifiedAt: new Date().toISOString(),
      sessionId,
    };
    applied.push(key);
  }

  if (applied.length > 0) {
    await supabaseAdmin.from('lead_profiles').upsert(
      {
        lead_identity_id: identityId,
        ...patch,
        field_provenance: nextProvenance,
      },
      { onConflict: 'lead_identity_id' },
    );
  }

  return { applied, rejected };
}

/** Canonical field key -> lead_profiles column. */
const FIELD_TO_COLUMN: Record<string, string> = {
  artist_name: 'artist_name',
  genre: 'genre',
  monthly_listeners: 'monthly_listeners',
  social_followers: 'social_followers',
  email_list_size: 'email_list_size',
  phone_list_size: 'phone_list_size',
  catalog_size: 'catalog_size',
  album_count: 'album_count',
  song_count: 'song_count',
  direct_fan_revenue_cents: 'direct_fan_revenue_cents',
  streaming_revenue_cents: 'streaming_revenue_cents',
  release_frequency: 'release_frequency',
  team_status: 'team_status',
  monetization_status: 'monetization_status',
  primary_goal: 'primary_goal',
  primary_blocker: 'primary_blocker',
  career_stage: 'career_stage',
  artist_segment: 'artist_segment',
  purchase_intent: 'purchase_intent',
  fan_ownership_maturity: 'fan_ownership_maturity',
};
