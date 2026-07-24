'use client';

import { HubPage } from '@/components/layout/HubPage';
import { PayoutDashboard } from '@/components/artist/PayoutDashboard';

export default function AccountPayoutsPage() {
  return (
    <HubPage
      title="Payouts and tax"
      subtitle="What you earned, what is on the way, and where it lands."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page, connect Stripe, and your earnings show up here."
      width="wide"
    >
      <PayoutDashboard />
    </HubPage>
  );
}
