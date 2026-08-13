'use client';

// /quests — the quest board (levels, XP, artist build, daily and weekly moves, the movement map).
//
// This is where the Quest Engine's board moved on 2026-08-13. It used to sit under the roadmap
// and the strategy card on /profile/artist, which meant four systems on one screen each naming a
// different "next move". Rise Mode now answers one question, and progression lives here for the
// artists who want to see it. The engine itself is unchanged: /profile/artist still mounts the
// driver variant, so quests keep assigning and completing whether or not this page is opened.

import { HubPage } from '@/components/layout/HubPage';
import { RiseMode } from '@/components/artist/RiseMode';

export default function QuestBoardPage() {
  return (
    <HubPage
      title="Quest board"
      subtitle="Your levels, XP and the milestones behind them. Rise Mode still names the one move that matters."
      fallback="/profile/artist"
      width="wide"
      requireArtist
      artistOnlyMessage="Publish your artist page and your quest board opens here."
    >
      <RiseMode />
    </HubPage>
  );
}
