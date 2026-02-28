'use client';

import { TierConfig } from '@/types';

interface SubscribeButtonProps {
  tiers: TierConfig[];
  artistSlug: string;
}

export function SubscribeButton({ tiers }: SubscribeButtonProps) {
  const tiersArray = Array.isArray(tiers) ? tiers : [];
  
  if (tiersArray.length === 0) {
    return null;
  }

  const lowestTier = tiersArray.reduce((lowest, tier) => 
    tier.price < lowest.price ? tier : lowest
  , tiersArray[0]);

  return (
    <button className="bg-crwn-gold text-crwn-bg px-6 py-2.5 rounded-full font-semibold hover:bg-crwn-gold-hover transition-colors">
      Subscribe {lowestTier.price > 0 && `$${(lowestTier.price / 100).toFixed(2)}/mo`}
    </button>
  );
}
