'use client';

import { HubPage } from '@/components/layout/HubPage';
import { TeamManager } from '@/components/artist/TeamManager';
import { HubPageTour } from '@/components/shared/HubPageTour';
import { teamSplitsTourSteps } from '@/lib/teamSplitsTourSteps';

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
      {(ctx) => (
        <div data-tour="team-root">
          <HubPageTour tourId="studio-team" steps={teamSplitsTourSteps} />
          <TeamManager artistId={ctx.artistId} platformTier={ctx.platformTier} />
        </div>
      )}
    </HubPage>
  );
}
