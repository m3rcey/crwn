'use client';

// Fan CRM — its own destination, lifted out of the artist dashboard tab strip so
// it reads as the first-class "manage my fans" surface it is (reached from the
// Studio card and the AccountHub). The whole CRM shell (Fans, Campaigns,
// Sequences, Links, Promos, Recovery) is AudienceTab, which self-resolves the
// artist and calls the ownership-guarded /api/audience.
//
// The gate, the close control and the artist context now come from HubPage, the
// shared shell every ex-dashboard-tab wears.

import { HubPage } from '@/components/layout/HubPage';
import { AudienceTab } from '@/components/artist/AudienceTab';

export default function FanCrmPage() {
  return (
    <HubPage
      title="Fan CRM"
      subtitle="A fan you never follow up with is a fan someone else signs."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and this becomes the place you turn listeners into supporters and keep them from drifting."
      width="wide"
    >
      <AudienceTab />
    </HubPage>
  );
}
