// Artist Build catalog — the identity an artist picks in Rise Mode. A build
// prioritizes quests and default setup; it never locks anyone out of features.
// Stored on the artist's GLOBAL user_progression row (artist_build_primary/secondary).

export interface ArtistBuild {
  id: string;
  title: string;
  tagline: string;
  forWho: string;
  recommendedFor: string;
  emoji: string;
  /** Quest categories this build pushes to the top of the board. */
  priorityCategories: string[];
}

export const ARTIST_BUILDS: ArtistBuild[] = [
  {
    id: 'come_up',
    title: 'Come-Up Artist',
    tagline: 'Get your first real supporters and prove momentum.',
    forWho: 'Artists starting from zero who need early believers.',
    recommendedFor: 'New and early-stage artists.',
    emoji: '🚀',
    priorityCategories: ['setup', 'offer', 'support', 'campaign'],
  },
  {
    id: 'vault',
    title: 'Vault Artist',
    tagline: 'Turn unreleased music and access into recurring support.',
    forWho: 'Artists with demos, BTS, and close fans.',
    recommendedFor: 'Artists with lots of content and a tight core.',
    emoji: '🔐',
    priorityCategories: ['offer', 'content', 'calendar'],
  },
  {
    id: 'live',
    title: 'Live Artist',
    tagline: 'Grow through livestreams, rooms, and live-to-clip.',
    forWho: 'Artists comfortable on camera or with live presence.',
    recommendedFor: 'Strong live personalities.',
    emoji: '🎥',
    priorityCategories: ['live', 'promotion', 'content'],
  },
  {
    id: 'movement',
    title: 'Movement Artist',
    tagline: 'Rally fans around campaigns, missions, and public goals.',
    forWho: 'Artists with a story, city identity, or mission.',
    recommendedFor: 'Artists with a cause or strong narrative.',
    emoji: '🔥',
    priorityCategories: ['campaign', 'fan_activation', 'city', 'legacy'],
  },
  {
    id: 'creator_ceo',
    title: 'Creator CEO',
    tagline: 'Run your career like a business.',
    forWho: 'Business-minded artists.',
    recommendedFor: 'Artists who want dashboards, splits, and receipts.',
    emoji: '📊',
    priorityCategories: ['offer', 'revenue', 'team', 'calendar'],
  },
  {
    id: 'storyteller',
    title: 'Storyteller',
    tagline: 'Make the journey feel like a reality series.',
    forWho: 'Artists with personality, drama, and BTS appeal.',
    recommendedFor: 'Artists whose story is the product.',
    emoji: '🎬',
    priorityCategories: ['content', 'fan_activation', 'legacy'],
  },
  {
    id: 'community',
    title: 'Community Builder',
    tagline: 'Grow through councils, polls, votes, and private rooms.',
    forWho: 'Artists with active fans who want influence.',
    recommendedFor: 'Artists with engaged inner circles.',
    emoji: '💬',
    priorityCategories: ['fan_activation', 'content', 'retention'],
  },
  {
    id: 'local_hero',
    title: 'Local Hero',
    tagline: 'Win a city, campus, or local scene.',
    forWho: 'Artists with strong local roots.',
    recommendedFor: 'Artists building market by market.',
    emoji: '📍',
    priorityCategories: ['city', 'fan_activation', 'promotion'],
  },
  {
    id: 'collaborator',
    title: 'Collaborator Builder',
    tagline: 'Build a team without upfront cash.',
    forWho: 'Artists who need creatives but lack budget.',
    recommendedFor: 'Artists who need producers, editors, or operators.',
    emoji: '🤝',
    priorityCategories: ['team', 'content', 'promotion'],
  },
  {
    id: 'promotion_engine',
    title: 'Promotion Engine Artist',
    tagline: 'Grow through clippers, referrals, and fan-powered reach.',
    forWho: 'Artists with content who need distribution.',
    recommendedFor: 'Artists who already have content and need reach.',
    emoji: '📣',
    priorityCategories: ['promotion', 'live', 'campaign'],
  },
];

export const ARTIST_BUILD_MAP: Record<string, ArtistBuild> = Object.fromEntries(
  ARTIST_BUILDS.map((b) => [b.id, b]),
);

export function getArtistBuild(id: string | null | undefined): ArtistBuild | undefined {
  return id ? ARTIST_BUILD_MAP[id] : undefined;
}
