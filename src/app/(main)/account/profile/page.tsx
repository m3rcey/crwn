'use client';

import { HubPage } from '@/components/layout/HubPage';
import { ArtistProfileForm } from '@/components/artist/ArtistProfileForm';

export default function AccountProfilePage() {
  return (
    <HubPage
      title="Your artist page"
      subtitle="Name, tagline, photos, links, and everything fans see first."
      fallback="/profile"
      requireArtist
      artistOnlyMessage="Publish your artist page and this becomes where you shape what fans see."
    >
      <ArtistProfileForm />
    </HubPage>
  );
}
