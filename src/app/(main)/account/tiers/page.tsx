'use client';

import { HubPage } from '@/components/layout/HubPage';
import { TierManager } from '@/components/artist/TierManager';

export default function AccountTiersPage() {
  return (
    <HubPage
      title="Fan tiers and pricing"
      subtitle="Without a tier, a fan who wants to pay you has nothing to click."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and this becomes where you set what fans pay."
    >
      <TierManager />
    </HubPage>
  );
}
