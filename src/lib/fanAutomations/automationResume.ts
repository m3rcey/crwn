// automationResume.ts: where a guided flow reopens a funnel row (Rise Mode Guided Setup, 2026-09-03).
//
// PURE. The funnel's draft IS the fan_automations row (status 'draft', 'paused' or 'active'), so
// resume position is derived from the row rather than from any wizard memory: the first
// decision the row does not already answer. An artist who left halfway lands on that decision
// and is never asked a completed question again; a row whose asset was deleted elsewhere reopens
// at the asset screen because the row no longer answers it.

export interface ResumableAutomation {
  magnet_kind: string | null;
  magnet_file_key: string | null;
  magnet_track_id: string | null;
  magnet_title: string;
  gold_tier_id: string | null;
  gold_item_title: string;
  silver_tier_id: string | null;
}

export type MagnetScreen = 'magnet-kind' | 'magnet-detail' | 'magnet-title' | 'magnet-review';
export type FunnelScreen = 'gold-tier' | 'gold-item' | 'silver-tier' | 'funnel-review';

/** The magnet flow's first open decision. `trackExists` says whether a track magnet's track is still the artist's. */
export function magnetResumeScreen(row: ResumableAutomation | null, trackExists: (id: string) => boolean): MagnetScreen {
  if (!row || !row.magnet_kind) return 'magnet-kind';
  if (row.magnet_kind === 'upload' && !row.magnet_file_key) return 'magnet-detail';
  if (row.magnet_kind === 'track' && (!row.magnet_track_id || !trackExists(row.magnet_track_id))) return 'magnet-detail';
  if (!row.magnet_title.trim()) return 'magnet-title';
  return 'magnet-review';
}

/** The funnel flow's first open decision. A stored pointer at a tier that is gone reopens the tier question. */
export function funnelResumeScreen(
  row: ResumableAutomation,
  paidTierIds: string[],
  askTier: boolean,
): FunnelScreen {
  const goldOk = !!row.gold_tier_id && paidTierIds.includes(row.gold_tier_id);
  if (!goldOk) return askTier ? 'gold-tier' : 'gold-item';
  if (!row.gold_item_title.trim()) return 'gold-item';
  return 'funnel-review';
}
