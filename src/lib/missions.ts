import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type Supa = ReturnType<typeof createBrowserSupabaseClient>;

/**
 * Shared mission types, labels, and the v1 PROGRESS RULE used by the missions
 * list + detail pages:
 *  - target_kind === 'demand_test' → current count is the linked
 *    proof_of_demand.response_count (fetched live; accurate).
 *  - everything else → current count is missions.manual_count (the artist
 *    updates it by hand from the detail page).
 * Nothing else is counted in v1 — no fabricated counters.
 */

export type MissionType =
  | 'share'
  | 'clip'
  | 'referral'
  | 'subscribe'
  | 'rsvp'
  | 'vote'
  | 'live'
  | 'city'
  | 'comment'
  | 'presave'
  | 'custom';

export type MissionTargetKind =
  | 'none'
  | 'offer'
  | 'tier'
  | 'product'
  | 'track'
  | 'album'
  | 'live'
  | 'campaign'
  | 'demand_test'
  | 'smart_link';

export type MissionRewardType = 'points' | 'badge' | 'credits' | 'access' | 'commission' | 'custom';
export type MissionAudience = 'all' | 'subscribers' | 'free';
export type MissionStatus = 'active' | 'completed' | 'archived';

export const MISSION_TYPE_LABELS: Record<MissionType, string> = {
  share: 'Share-to-Earn',
  clip: 'Clip-to-Earn',
  referral: 'Refer fans',
  subscribe: 'Get subscribers',
  rsvp: 'RSVP',
  vote: 'Vote',
  live: 'Live attendance',
  city: 'City push',
  comment: 'Comment / Post',
  presave: 'Pre-save',
  custom: 'Custom',
};

export const MISSION_REWARD_LABELS: Record<MissionRewardType, string> = {
  points: 'Points',
  badge: 'Badge',
  credits: 'Credits',
  access: 'Access / perk',
  commission: 'Commission',
  custom: 'Custom',
};

export const MISSION_AUDIENCE_LABELS: Record<MissionAudience, string> = {
  all: 'All fans',
  subscribers: 'Subscribers',
  free: 'Free fans',
};

/** The fields the progress rule needs — any mission row shape satisfies this. */
export interface MissionProgressFields {
  target_kind: MissionTargetKind;
  target_id: string | null;
  manual_count: number;
}

/**
 * Batch-fetch live response counts for every demand_test-targeted mission.
 * Returns a map of proof_of_demand.id → response_count.
 */
export async function fetchDemandTestCounts(
  supabase: Supa,
  missions: MissionProgressFields[]
): Promise<Record<string, number>> {
  const ids = [
    ...new Set(
      missions
        .filter((m) => m.target_kind === 'demand_test' && m.target_id)
        .map((m) => m.target_id as string)
    ),
  ];
  if (ids.length === 0) return {};
  const { data } = await supabase.from('proof_of_demand').select('id, response_count').in('id', ids);
  const map: Record<string, number> = {};
  for (const row of (data as { id: string; response_count: number | null }[]) || []) {
    map[row.id] = row.response_count ?? 0;
  }
  return map;
}

/** The v1 progress rule: live demand-test count, else the manual count. */
export function missionCurrentCount(
  m: MissionProgressFields,
  demandCounts: Record<string, number>
): number {
  if (m.target_kind === 'demand_test' && m.target_id) return demandCounts[m.target_id] ?? 0;
  return m.manual_count;
}

/** The fields the action-link builder needs — any mission row shape satisfies this. */
export interface MissionActionFields {
  type: MissionType;
  target_kind: MissionTargetKind;
  target_id: string | null;
}

/**
 * Where "doing" a mission actually happens. Conservative on purpose: only the
 * demand-test page has a dedicated route; everything else lands on the artist
 * page (where tiers, shop, music, and live all live). Never builds a link to a
 * route that doesn't exist.
 */
export function missionActionHref(m: MissionActionFields, artistSlug: string): string {
  if (m.target_kind === 'demand_test' && m.target_id) {
    return `/${artistSlug}/demand/${m.target_id}`;
  }
  return `/${artistSlug}`;
}
