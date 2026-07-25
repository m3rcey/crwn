// The seed that makes signup feel like you already started building.
//
// After a claim, the artist's most recent calculator result is theirs, on the server. This reads
// it back into a small, display-ready shape for the always-on Action Plan and the (dark-launched)
// Rise Mode banner, so the first thing they see is the number THEY calculated and the one button
// that turns it into a real CRWN feature.
//
// It reads only columns that exist pre-migration and derives the figure from result_data (jsonb),
// so it never depends on a schema change and never throws for its caller.

import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';
import { buildConversionUrl } from '@/lib/leadMagnets/conversionAdapters';

// Minimal shape of the admin/supabase client we accept (both routes already have one).
export type Db = {
  from: (t: string) => any;
};

export interface LeadMagnetSeed {
  resultId: string;
  toolSlug: string;
  toolName: string;
  headline: string;
  /** Display string the tool led with, e.g. "$1,240". Null for score-only tools. */
  heroValue: string | null;
  heroSuffix: string | null;
  estimatedMonthlyCents: number | null;
  estimatedAnnualCents: number | null;
  /** The tool's suggested config (tier name, price, seats, ...) used to prefill the builder. */
  conversionPayload: Record<string, unknown>;
  /** Deep link to the matching builder (prefilled) or the tool's own route. */
  convertHref: string;
  createdAt: string;
}

function toolName(slug: string): string {
  const cfg = getLeadMagnet(slug);
  if (cfg) return cfg.name;
  const ext = EXTERNAL_TOOLS.find((t) => t.key === slug);
  if (ext) return ext.name;
  return 'your calculator';
}

// A stored lead_magnet_results row, the columns we read.
export interface ResultRow {
  id: string;
  tool_slug: string;
  title?: string | null;
  result_data?: Record<string, unknown> | null;
  created_at: string;
}

/** Shape one stored result row into the display-ready seed. Pure; no I/O. */
export function rowToSeed(row: ResultRow): LeadMagnetSeed {
  const slug = String(row.tool_slug);
  const rd = (row.result_data ?? {}) as Record<string, unknown>;
  const cfg = getLeadMagnet(slug);

  const convertHref =
    (cfg &&
      buildConversionUrl(cfg, (rd.conversionPayload as Record<string, unknown>) ?? {}, {
        resultId: String(row.id),
        returnTo: '/profile/artist',
      })) ||
    cfg?.artistRoute ||
    EXTERNAL_TOOLS.find((t) => t.key === slug)?.href ||
    '/studio';

  return {
    resultId: String(row.id),
    toolSlug: slug,
    toolName: toolName(slug),
    headline: String(row.title ?? rd.headline ?? ''),
    heroValue: typeof rd.heroValue === 'string' ? rd.heroValue : null,
    heroSuffix: typeof rd.heroSuffix === 'string' ? rd.heroSuffix : null,
    estimatedMonthlyCents: typeof rd.estimatedMonthlyCents === 'number' ? rd.estimatedMonthlyCents : null,
    estimatedAnnualCents: typeof rd.estimatedAnnualCents === 'number' ? rd.estimatedAnnualCents : null,
    conversionPayload: (rd.conversionPayload as Record<string, unknown>) ?? {},
    convertHref,
    createdAt: String(row.created_at),
  };
}

/**
 * The most recent lead-magnet result now owned by this artist/user, shaped for display.
 * Prefers the artist scope; falls back to the user scope (claimed pre-/welcome). Null if none.
 */
export async function getLeadMagnetSeed(
  db: Db,
  opts: { userId: string; artistId?: string | null },
): Promise<LeadMagnetSeed | null> {
  try {
    let query = db
      .from('lead_magnet_results')
      .select('id, tool_slug, title, result_data, created_at')
      .order('created_at', { ascending: false })
      .limit(1);
    query = opts.artistId ? query.eq('artist_id', opts.artistId) : query.eq('user_id', opts.userId);

    const { data, error } = await query.maybeSingle();
    if (error || !data) return null;
    return rowToSeed(data as ResultRow);
  } catch {
    return null;
  }
}

/**
 * EVERY lead-magnet result owned by this artist/user, newest first, shaped as seeds. The source
 * for per-calculator missions ("only generate missions relevant to completed calculators").
 */
export async function getClaimedResults(
  db: Db,
  opts: { userId: string; artistId?: string | null },
): Promise<LeadMagnetSeed[]> {
  try {
    let query = db
      .from('lead_magnet_results')
      .select('id, tool_slug, title, result_data, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    query = opts.artistId ? query.eq('artist_id', opts.artistId) : query.eq('user_id', opts.userId);

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return (data as ResultRow[]).map(rowToSeed);
  } catch {
    return [];
  }
}
