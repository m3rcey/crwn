// Fan Role catalog — the identity a fan holds inside an artist's world. A fan has
// one primary global role, one role per artist, and can earn secondary roles.
// Roles shape which assignments surface; they never gate access.

export interface FanRole {
  id: string;
  title: string;
  tagline: string;
  emoji: string;
  /** True for roles a fan can pick directly; others are earned through actions. */
  selectable: boolean;
}

export const FAN_ROLES: FanRole[] = [
  { id: 'listener', title: 'Listener', tagline: 'Follow and enjoy the music.', emoji: '🎧', selectable: true },
  { id: 'supporter', title: 'Supporter', tagline: 'Back the artist with real support.', emoji: '💎', selectable: true },
  { id: 'day_one', title: 'Day One', tagline: 'Here before the world caught on.', emoji: '🌅', selectable: false },
  { id: 'promoter', title: 'Promoter', tagline: 'Spread the artist and bring people in.', emoji: '📣', selectable: true },
  { id: 'clipper', title: 'Clipper', tagline: 'Turn moments into clips that travel.', emoji: '✂️', selectable: true },
  { id: 'scout', title: 'Scout', tagline: 'Find talent, venues, and opportunities.', emoji: '🔭', selectable: true },
  { id: 'city_rep', title: 'City Rep', tagline: 'Grow the artist in your city.', emoji: '📍', selectable: true },
  { id: 'city_captain', title: 'City Captain', tagline: 'Lead your city’s push.', emoji: '🏙️', selectable: false },
  { id: 'council', title: 'Fan Council', tagline: 'Trusted voice on big decisions.', emoji: '🗳️', selectable: false },
  { id: 'collector', title: 'Collector', tagline: 'Access, proof, drops, and receipts.', emoji: '🏆', selectable: true },
  { id: 'curator', title: 'Curator', tagline: 'Taste that shapes direction.', emoji: '🎨', selectable: true },
  { id: 'community_builder', title: 'Community Builder', tagline: 'Keep the community alive.', emoji: '🤝', selectable: true },
  { id: 'inner_circle', title: 'Inner Circle', tagline: 'Deepest access and influence.', emoji: '👑', selectable: false },
  { id: 'movement_builder', title: 'Movement Builder', tagline: 'Impact across many artists.', emoji: '🔥', selectable: false },
  { id: 'crwn_scout', title: 'CRWN Scout', tagline: 'Help CRWN find artists early.', emoji: '⭐', selectable: true },
];

export const FAN_ROLE_MAP: Record<string, FanRole> = Object.fromEntries(FAN_ROLES.map((r) => [r.id, r]));

export function getFanRole(id: string | null | undefined): FanRole | undefined {
  return id ? FAN_ROLE_MAP[id] : undefined;
}
