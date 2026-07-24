'use client';

import { HubPage } from '@/components/layout/HubPage';
import { SyncDashboard } from '@/components/artist/SyncDashboard';

export default function StudioSyncPage() {
  return (
    <HubPage
      title="Sync"
      subtitle="Placements you never pitched are placements someone else got."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page to see sync briefs and events matched to your catalog."
      width="wide"
    >
      {(ctx) => <SyncDashboard artistId={ctx.artistId} platformTier={ctx.platformTier} />}
    </HubPage>
  );
}
