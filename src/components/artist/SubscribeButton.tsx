'use client';

interface SubscribeButtonProps {
  tiers: any[];
  artistSlug: string;
}

export function SubscribeButton({ tiers }: SubscribeButtonProps) {
  if (tiers.length === 0) {
    return null;
  }

  const lowestTier = tiers.reduce((lowest, tier) => 
    tier.price < lowest.price ? tier : lowest
  );

  return (
    <button className="bg-crwn-gold text-crwn-bg px-6 py-2.5 rounded-full font-semibold hover:bg-crwn-gold-hover transition-colors">
      Subscribe {lowestTier.price > 0 && `$${(lowestTier.price / 100).toFixed(2)}/mo`}
    </button>
  );
}
