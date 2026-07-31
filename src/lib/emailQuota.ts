// The monthly email-blast quota, in ONE place.
//
// It was previously inline in the campaign-CREATE route only, which left two
// defects: the message hardcoded "Pro for 10/month" while EMAIL_LIMITS.pro is
// 20, and creation was the only gate, so an artist could create N drafts (none
// of which count, because only sent/sending/scheduled do) and then send all N.
// A draft costs nothing; a send is what consumes the resource, so the send path
// is the authoritative gate and the create path is advisory.
//
// Both callers use these helpers so the rule cannot drift between them.

import type { SupabaseClient } from '@supabase/supabase-js';
import { EMAIL_LIMITS, getEmailLimit } from './platformTier';

/** Statuses that represent an email blast the artist actually spent. */
const SPENT_STATUSES = ['sent', 'sending', 'scheduled'];

const WINDOW_DAYS = 30;

export interface EmailQuotaUsage {
  used: number;
  since: string;
}

/**
 * Blasts this artist has spent in the trailing 30 days. Excludes a campaign id
 * when given, so re-sending the row currently being processed cannot count
 * itself.
 */
export async function countMonthlyEmailUsage(
  admin: SupabaseClient,
  artistId: string,
  excludeCampaignId?: string,
): Promise<EmailQuotaUsage> {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  let query = admin
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('artist_id', artistId)
    .in('status', SPENT_STATUSES)
    .gte('created_at', since);

  if (excludeCampaignId) query = query.neq('id', excludeCampaignId);

  const { count } = await query;
  return { used: count || 0, since };
}

/**
 * The over-quota message. The upgrade line names the REAL next-plan allowance
 * from EMAIL_LIMITS, so repricing a plan cannot leave this copy lying.
 */
export function emailQuotaMessage(limit: number): string {
  const blasts = `${limit} email blast${limit === 1 ? '' : 's'}`;
  const proLimit = EMAIL_LIMITS.pro;
  const scaleLimit = EMAIL_LIMITS.scale;
  const upgrade =
    limit >= proLimit
      ? `Scale includes ${scaleLimit} a month.`
      : `Pro includes ${proLimit} a month.`;
  return `You have used all ${blasts} on your plan this month, so this one cannot go out. ${upgrade}`;
}

/** Convenience: the artist's limit for their plan (-1 = unlimited). */
export function emailLimitForTier(tier: string | null | undefined): number {
  return getEmailLimit(tier);
}
