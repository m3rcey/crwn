'use client';

import { HubPage } from '@/components/layout/HubPage';
import { MusicManager } from '@/components/artist/MusicManager';
import { MemberFilesManager } from '@/components/artist/MemberFilesManager';

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
      <div className="mt-10">
        <MemberFilesManager />
      </div>
    </HubPage>
  );
}
