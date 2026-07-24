'use client';

import { HubPage } from '@/components/layout/HubPage';
import { LivestreamManager } from '@/components/artist/LivestreamManager';
import { useArtistContext } from '@/hooks/useArtistContext';

export default function StudioLivePage() {
  const { displayName } = useArtistContext();
  return (
    <HubPage
      title="Live"
      subtitle="Schedule sessions, sell seats, and go live."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and this becomes where you run live sessions."
      width="wide"
    >
      {(ctx) => (
        <LivestreamManager
          artistId={ctx.artistId}
          artistSlug={ctx.slug}
          artistName={displayName}
          tiers={ctx.tiers}
        />
      )}
    </HubPage>
  );
}
