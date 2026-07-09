// Fan badge award primitive. Squads, City Unlocks, Clip Bounties and the CRM all
// grant status badges through awardFanBadge. Tables: supabase/schema-phase2-fan-badges.sql
// Catalog of global badges mirrors the seed rows in that migration.

import { createNotification } from './notifications';

export interface GlobalBadge {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
}

// Keep in sync with the seed INSERT in schema-phase2-fan-badges.sql
export const GLOBAL_FAN_BADGES: Record<string, GlobalBadge> = {
  superfan: { key: 'superfan', label: 'Superfan', icon: '👑', color: '#D4AF37', description: "One of this artist's most valuable fans" },
  top_clipper: { key: 'top_clipper', label: 'Top Clipper', icon: '✂️', color: '#D4AF37', description: 'A leading clipper by attributed subscribers' },
  city_captain: { key: 'city_captain', label: 'City Captain', icon: '📍', color: '#D4AF37', description: 'Leads the push in their city' },
  first_100: { key: 'first_100', label: 'First 100', icon: '🔥', color: '#D4AF37', description: 'Among the first 100 supporters' },
  promoter: { key: 'promoter', label: 'Promoter', icon: '📣', color: '#D4AF37', description: 'Brings in new subscribers' },
  bounty_winner: { key: 'bounty_winner', label: 'Bounty Winner', icon: '🏆', color: '#D4AF37', description: 'Won a clip bounty' },
};

export interface AwardFanBadgeParams {
  artistId: string | null; // null = platform badge
  fanId: string;
  badgeKey: string;
  label?: string;
  icon?: string;
  color?: string;
  source?: 'squad' | 'city_unlock' | 'bounty' | 'mission' | 'milestone' | 'manual';
  sourceId?: string | null;
  awardedBy?: string | null; // artist user id, null = system
  notify?: boolean; // default true — notify the fan they earned a badge
  artistName?: string;
}

/**
 * Award a badge to a fan (idempotent per fan+artist+badge_key). Best-effort:
 * never throws. Requires the service-role admin client.
 */
export async function awardFanBadge(
  supabaseAdmin: any,
  params: AwardFanBadgeParams,
): Promise<boolean> {
  try {
    if (!params.fanId || !params.badgeKey) return false;
    const global = GLOBAL_FAN_BADGES[params.badgeKey];
    const label = params.label || global?.label || params.badgeKey;
    const icon = params.icon || global?.icon || '🏅';
    const color = params.color || global?.color || '#D4AF37';

    const { data, error } = await supabaseAdmin
      .from('fan_badge_awards')
      .upsert(
        {
          artist_id: params.artistId,
          fan_id: params.fanId,
          badge_key: params.badgeKey,
          label,
          icon,
          color,
          source: params.source ?? 'manual',
          source_id: params.sourceId ?? null,
          awarded_by: params.awardedBy ?? null,
        },
        { onConflict: 'fan_id,artist_id,badge_key', ignoreDuplicates: true },
      )
      .select('id');

    if (error) {
      console.error('[fanBadges] award failed (non-fatal):', error.message);
      return false;
    }

    // Only notify on a genuinely new award (upsert returns rows only on insert)
    const isNew = Array.isArray(data) && data.length > 0;
    if (isNew && params.notify !== false) {
      const who = params.artistName ? `${params.artistName}: ` : '';
      await createNotification(
        supabaseAdmin,
        params.fanId,
        'badge_awarded',
        `${icon} You earned the ${label} badge`,
        `${who}Your status just leveled up.`,
        '/impact',
      ).catch(() => {});

      // Also tell the ARTIST one of their fans just leveled up — a CRM/retention
      // signal (superfan, bounty winner, city captain...) the artist previously
      // never saw. Links to the Fan CRM so they can act on the moment.
      if (params.artistId) {
        try {
          const [{ data: ap }, { data: fp }] = await Promise.all([
            supabaseAdmin.from('artist_profiles').select('user_id').eq('id', params.artistId).single(),
            supabaseAdmin.from('profiles').select('display_name').eq('id', params.fanId).single(),
          ]);
          if (ap?.user_id) {
            const fanName = fp?.display_name || 'A fan';
            await createNotification(
              supabaseAdmin,
              ap.user_id,
              'fan_milestone',
              `${icon} ${fanName} earned ${label}`,
              `${fanName} just hit ${label} status. A great moment to reach out.`,
              '/profile/artist?tab=audience',
            ).catch(() => {});
          }
        } catch {
          // best-effort — never block the award
        }
      }
    }
    return true;
  } catch (err) {
    console.error('[fanBadges] threw (non-fatal):', err);
    return false;
  }
}
