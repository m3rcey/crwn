'use client';

import { HubPage } from '@/components/layout/HubPage';
import { AiManagerCard } from '@/components/artist/AiManagerCard';

export default function StudioManagerPage() {
  return (
    <HubPage
      title="Manager"
      subtitle="What to do next, and what it costs you to skip it."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and your manager starts reading your numbers."
      width="wide"
    >
      {(ctx) => (
        <AiManagerCard artistId={ctx.artistId} platformTier={ctx.platformTier} />
      )}
    </HubPage>
  );
}
