'use client';

import { HubPage } from '@/components/layout/HubPage';
import { MusicManager } from '@/components/artist/MusicManager';

export default function StudioMusicPage() {
  return (
    <HubPage
      title="Music"
      subtitle="Tracks, albums, and playlists."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and this becomes your catalog."
      width="wide"
    >
      <MusicManager />
    </HubPage>
  );
}
