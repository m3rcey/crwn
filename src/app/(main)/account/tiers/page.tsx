'use client';

import { HubPage } from '@/components/layout/HubPage';
import { TierManager } from '@/components/artist/TierManager';
import { StrategyCard } from '@/components/artist/StrategyCard';

export default function AccountTiersPage() {
  return (
    <HubPage
      title="Fan tiers and pricing"
      subtitle="Without a tier, a fan who wants to pay you has nothing to click."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and this becomes where you set what fans pay."
    >
      {/* The membership strategy (Release Club / Vault Membership) explains what each rung on
          this ladder is FOR. It sat on Rise Mode until 2026-08-13, where an artist re-read the
          strategy every time they wanted to know what to do next; it belongs on the screen where
          the ladder it describes is actually edited. The engine behind it is unchanged, still
          derived on read by /api/artist/strategy. */}
      <StrategyCard />
      <TierManager />
    </HubPage>
  );
}
