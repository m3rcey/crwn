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
  parseCampaignAttribution,
  sanitizeStoredAttribution,
  type CampaignAttribution,
  type FunnelAttributionDims,
} from './campaignAttribution';
import { resolveSessionKeyword } from '@/lib/acquisition/sessionKeyword';

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

/** The lead_sessions columns a DM-generated result's attribution is read from. */
export interface SessionAttributionSource {
  keyword?: string | null;
  lead_magnet_id?: string | null;
  source_platform?: string | null;
  source_post_id?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
}

/**
 * Attribution for a result generated INSIDE a ManyChat DM. Those rows never carry
 * `input_data._attribution` (the DM path writes only the answers), so without this a DM lead who
 * signs up arrives with no source at all. Read from the session the row already points at, through
 * the same normalizer, with the keyword resolved by the one attribution rule for mislabeled clones.
 * Nothing is invented: a field the session did not record stays null. Pure and exported for tests.
 */
export function attributionFromSession(s: SessionAttributionSource | null | undefined): CampaignAttribution | null {
  if (!s) return null;
  const attr = parseCampaignAttribution({
    utm_source: s.utm_source ?? s.source_platform,
    utm_medium: s.utm_medium,
    utm_campaign: s.utm_campaign,
    utm_content: s.utm_content ?? s.source_post_id,
    keyword: resolveSessionKeyword(s.keyword, s.lead_magnet_id).keyword,
  });
  return hasAttribution(attr) ? attr : null;
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
        .select('input_data, created_at, lead_session_id')
        .eq(col, value)
        .order('created_at', { ascending: true })
        .limit(MAX_ROWS);

    let rows: { input_data?: Record<string, unknown> | null; lead_session_id?: string | null }[] = [];
    if (opts.artistId) {
      const { data } = await select('artist_id', opts.artistId);
      rows = data ?? [];
    }
    if (!rows.length && opts.userId) {
      const { data } = await select('user_id', opts.userId);
      rows = data ?? [];
    }

    // A DM result has no stored _attribution but does point at its session: fill ONLY those rows
    // from the session, in place, so the oldest-first first-touch merge below is unchanged.
    const needSession = rows.filter(
      (r) => r.lead_session_id && !(r.input_data ?? {})[ATTRIBUTION_INPUT_KEY],
    );
    if (needSession.length) {
      const { data: sessions } = await db
        .from('lead_sessions')
        .select('id, keyword, lead_magnet_id, source_platform, source_post_id, utm_source, utm_medium, utm_campaign, utm_content')
        .in('id', needSession.map((r) => r.lead_session_id));
      const byId = new Map(((sessions ?? []) as (SessionAttributionSource & { id: string })[]).map((s) => [s.id, s]));
      rows = rows.map((r) => {
        if (!needSession.includes(r)) return r;
        const attr = attributionFromSession(byId.get(String(r.lead_session_id)));
        return attr ? { ...r, input_data: { ...(r.input_data ?? {}), [ATTRIBUTION_INPUT_KEY]: attr } } : r;
      });
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
