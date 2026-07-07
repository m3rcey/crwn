// Fan Squads shared types + catalog. Squad roles are scoped to the squad, never
// app-level. Tables: supabase/schema-phase2-fan-squads.sql

export type SquadType =
  | 'top_clippers' | 'street_team' | 'city_captains' | 'release_squad'
  | 'first_100' | 'true_regulars' | 'fan_council' | 'live_mods'
  | 'college_reps' | 'playlist_pushers' | 'vault_insiders'
  | 'campaign_ambassadors' | 'custom';

export type SquadStatus = 'draft' | 'active' | 'paused' | 'archived';
export type SquadVisibility = 'private' | 'invite_only' | 'application' | 'public';
export type SquadRole = 'member' | 'captain' | 'mod' | 'manager';
export type SquadMemberStatus = 'invited' | 'applied' | 'active' | 'removed' | 'rejected';

export interface SquadTypeDef {
  value: SquadType;
  label: string;
  icon: string;
  description: string;
  badgeKey?: string; // default fan_badges key to award
  suggestedVisibility: SquadVisibility;
}

export const SQUAD_TYPES: SquadTypeDef[] = [
  { value: 'top_clippers', label: 'Top Clippers', icon: '✂️', description: 'Your best clippers, cutting content that converts.', badgeKey: 'top_clipper', suggestedVisibility: 'invite_only' },
  { value: 'street_team', label: 'Street Team', icon: '📣', description: 'Fans who promote everywhere you drop.', badgeKey: 'promoter', suggestedVisibility: 'application' },
  { value: 'city_captains', label: 'City Captains', icon: '📍', description: 'Fans leading the push in their city.', badgeKey: 'city_captain', suggestedVisibility: 'invite_only' },
  { value: 'release_squad', label: 'Release Squad', icon: '🚀', description: 'The crew that mobilizes on every release.', suggestedVisibility: 'invite_only' },
  { value: 'first_100', label: 'First 100 Supporters', icon: '🔥', description: 'Your earliest paying believers.', badgeKey: 'first_100', suggestedVisibility: 'private' },
  { value: 'true_regulars', label: 'True Regulars', icon: '💎', description: 'Your most engaged, consistent fans.', badgeKey: 'superfan', suggestedVisibility: 'private' },
  { value: 'fan_council', label: 'Fan Council', icon: '🗳️', description: 'Trusted fans who weigh in on decisions.', suggestedVisibility: 'invite_only' },
  { value: 'live_mods', label: 'Live Chat Mods', icon: '🛡️', description: 'Fans who keep your live sessions clean.', suggestedVisibility: 'invite_only' },
  { value: 'college_reps', label: 'College Reps', icon: '🎓', description: 'Fans repping you on their campus.', suggestedVisibility: 'application' },
  { value: 'playlist_pushers', label: 'Playlist Pushers', icon: '🎧', description: 'Fans getting you added to playlists.', suggestedVisibility: 'application' },
  { value: 'vault_insiders', label: 'Vault Insiders', icon: '🔓', description: 'Fans with early/behind-the-scenes access.', suggestedVisibility: 'invite_only' },
  { value: 'campaign_ambassadors', label: 'Campaign Ambassadors', icon: '🌟', description: 'Fans driving a specific campaign.', suggestedVisibility: 'invite_only' },
  { value: 'custom', label: 'Custom Squad', icon: '➕', description: 'Build your own role-based team.', suggestedVisibility: 'invite_only' },
];

export const SQUAD_TYPE_MAP: Record<SquadType, SquadTypeDef> =
  Object.fromEntries(SQUAD_TYPES.map(t => [t.value, t])) as Record<SquadType, SquadTypeDef>;

export const VISIBILITY_LABELS: Record<SquadVisibility, string> = {
  private: 'Private (you add members)',
  invite_only: 'Invite only',
  application: 'Fans can apply',
  public: 'Open to join',
};

export function slugifySquad(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}
