'use client';

import { HubPage } from '@/components/layout/HubPage';
import { ShopManager } from '@/components/artist/ShopManager';

export default function StudioShopPage() {
  return (
    <HubPage
      title="Shop"
      subtitle="An empty shop is a fan reaching for their card and finding nothing to buy."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and this becomes where you sell to fans."
      width="wide"
    >
      <ShopManager />
    </HubPage>
  );
}
