'use client';

import { HubPage } from '@/components/layout/HubPage';
import { AlbumManager } from '@/components/artist/AlbumManager';

export default function StudioAlbumsPage() {
  return (
    <HubPage
      title="Albums"
      subtitle="Group your tracks into releases fans can collect."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and this becomes where your releases live."
      width="wide"
    >
      <AlbumManager />
    </HubPage>
  );
}
