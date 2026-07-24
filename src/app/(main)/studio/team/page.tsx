'use client';

import { HubPage } from '@/components/layout/HubPage';
import { TeamManager } from '@/components/artist/TeamManager';

export default function StudioTeamPage() {
  return (
    <HubPage
      title="Team Splits"
      subtitle="A handshake split is the argument you have later, in public."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page to put your splits in writing and pay them automatically."
      width="wide"
    >
      {(ctx) => <TeamManager artistId={ctx.artistId} platformTier={ctx.platformTier} />}
    </HubPage>
  );
}
