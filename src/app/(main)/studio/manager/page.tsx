'use client';

import { HubPage } from '@/components/layout/HubPage';
import { AiManagerCard } from '@/components/artist/AiManagerCard';

// The subtitle is deliberately NOT "what to do next". That question belongs to the Constraint
// Engine and is answered on Rise Mode. Manager coaches and executes around that answer, and the
// chrome should not imply it owns the priority: the artist must never have to decide which
// subsystem to believe.
export default function StudioManagerPage() {
  return (
    <HubPage
      title="Manager"
      subtitle="Help working the priority CRWN already set for you."
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
