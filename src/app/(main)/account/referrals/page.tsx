'use client';

import { HubPage } from '@/components/layout/HubPage';
import { ArtistReferralStats } from '@/components/artist/ArtistReferralStats';
import { ClipperSettings } from '@/components/artist/ClipperSettings';

export default function AccountReferralsPage() {
  return (
    <HubPage
      title="Referrals and clippers"
      subtitle="Reach you are not paying for is reach someone else is taking."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page to earn on the artists and clippers you bring in."
      width="wide"
    >
      <ArtistReferralStats />
      <ClipperSettings />
    </HubPage>
  );
}
