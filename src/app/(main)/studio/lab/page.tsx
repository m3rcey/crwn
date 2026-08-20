'use client';

// Song Lab manager — GB The G1ft's control room for the fan co-creation experiment.
// Hidden-route by design: no Studio tile and no AccountHub entry, because the capability
// is enabled for one artist (artist_profiles.song_lab_enabled) and a default surface for
// everyone else would be clutter. Any artist without the gate gets a quiet explainer.

import { HubPage } from '@/components/layout/HubPage';
import { SongLabManager } from '@/components/songlab/SongLabManager';

export default function SongLabStudioPage() {
  return (
    <HubPage
      title="Song Lab"
      subtitle="Every Instagram vote that ends on Instagram is a fan you never meet."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page first."
      width="wide"
    >
      <SongLabManager />
    </HubPage>
  );
}
