'use client';

// Song Lab manager — the control room for the fan co-creation experiment.
//
// REACHABLE SINCE 2026-09-30, for enabled artists only. It was a hidden route with no Studio
// tile and no AccountHub entry, on the reasoning that one artist's experiment should not become
// a default surface for everyone. That held until the artist it was built for asked where it
// lived: he had three projects, an open vote and a shared link with thirty views, and no way in
// without being handed the URL. Both entry points are now CONDITIONAL on
// artist_profiles.song_lab_enabled (read through /api/song-lab/artist, because that column is
// revoked from the browser), so an artist without the gate still sees exactly what they saw
// before. Any artist who reaches this route without it still gets the quiet explainer.

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
