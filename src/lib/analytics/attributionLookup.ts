// Resolve the campaign attribution an artist arrived through, server-side.
//
// The whole point of tagging a video link is being able to ask "which video produced an artist who
// actually got paid". That question only works if the tag survives the boundary where the visitor
// stops being anonymous. It does, because the tag is persisted on the artist's own calculator
// result row (`input_data._attribution`), which is exactly the row the existing claim path binds to
// their account at signup. Nothing here depends on a cookie, a localStorage value, or the browser
// still being the same one.
//
// FIRST-TOUCH: rows are read OLDEST FIRST and merged with mergeAttribution, so the earliest tagged
// visit owns every dimension it filled and a later, less-tagged result can only ADD detail. That
// matches the persisted-attribution policy in campaignAttribution.ts.
//
// Fail-safe throughout: an unattributed artist is the normal case, not an error, and analytics must
// never break a signup, a Stripe reconcile, or a payment webhook.

import {
  ATTRIBUTION_INPUT_KEY,
  attributionToFunnelDims,
  hasAttribution,
  mergeAttribution,
  sanitizeStoredAttribution,
  type CampaignAttribution,
  type FunnelAttributionDims,
} from './campaignAttribution';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (t: string) => any };

/** How many of the artist's result rows to consider. First touch is almost always row one. */
const MAX_ROWS = 20;

/**
 * Merge the attribution off a list of stored result rows, oldest first.
 * Pure and exported so the first-touch rule is testable without a database.
 */
export function attributionFromRows(
  rows: { input_data?: Record<string, unknown> | null }[] | null | undefined,
): CampaignAttribution | null {
  let merged: CampaignAttribution | null = null;
  for (const row of rows ?? []) {
    const raw = (row?.input_data ?? {}) as Record<string, unknown>;
    const stored = raw[ATTRIBUTION_INPUT_KEY];
    if (!stored) continue;
    const attr = sanitizeStoredAttribution(stored);
    if (!hasAttribution(attr)) continue;
    merged = merged ? mergeAttribution(merged, attr) : attr;
  }
  return merged;
}

/**
 * The campaign attribution owned by this user/artist, or null. Prefers the artist scope and falls
 * back to the user scope, mirroring getLeadMagnetSeed so both read the same rows.
 */
export async function resolveAttribution(
  db: Db,
  opts: { userId?: string | null; artistId?: string | null },
): Promise<CampaignAttribution | null> {
  if (!opts.artistId && !opts.userId) return null;
  try {
    const select = (col: 'artist_id' | 'user_id', value: string) =>
      db
        .from('lead_magnet_results')
        .select('input_data, created_at')
        .eq(col, value)
        .order('created_at', { ascending: true })
        .limit(MAX_ROWS);

    let rows: { input_data?: Record<string, unknown> | null }[] = [];
    if (opts.artistId) {
      const { data } = await select('artist_id', opts.artistId);
      rows = data ?? [];
    }
    if (!rows.length && opts.userId) {
      const { data } = await select('user_id', opts.userId);
      rows = data ?? [];
    }
    return attributionFromRows(rows);
  } catch {
    return null;
  }
}

/**
 * The funnel dimensions this user/artist's acquisition fills, ready to spread onto a funnel event.
 * Returns {} when nothing is attributed, so a caller can always spread it unconditionally.
 */
export async function attributionDimsFor(
  db: Db,
  opts: { userId?: string | null; artistId?: string | null },
): Promise<FunnelAttributionDims> {
  const attr = await resolveAttribution(db, opts);
  return attributionToFunnelDims(attr);
}

/**
 * Merge attribution dims into an event's existing dims WITHOUT overwriting anything already set.
 * The rule the spec asks for, in one place: stronger persisted attribution is never replaced by a
 * weaker or empty value, and metadata is combined rather than clobbered.
 */
export function withAttribution<T extends { campaign?: string | null; referrer?: string | null; video?: string | null; metadata?: Record<string, unknown> }>(
  event: T,
  dims: FunnelAttributionDims,
): T {
  return {
    ...event,
    campaign: event.campaign ?? dims.campaign ?? null,
    referrer: event.referrer ?? dims.referrer ?? null,
    video: event.video ?? dims.video ?? null,
    ...(dims.metadata || event.metadata
      ? { metadata: { ...(dims.metadata ?? {}), ...(event.metadata ?? {}) } }
      : {}),
  };
}
