// stepDown.ts: PURE. Which cheaper tier a cancelling fan is offered instead of leaving.
//
// Founder decision 2026-10-02: "a fan who cancels should be offered a cheaper tier instead."
// The offer is the NEXT rung down that is still PAID and can bill (it has a Stripe price), so it is
// a real downgrade through /api/stripe/subscription-update, scheduled in Stripe at the paid
// boundary (downgradeSchedule.ts). Never the free tier: stepping a paying member down to free is a
// cancel plus a free join, a different flow, and offering it here would promise a path that does
// not exist. Nothing is offered when there is no cheaper paid rung; the pause offer still shows.

export interface StepDownTier {
  id: string;
  name: string;
  price: number | null;
  stripe_price_id?: string | null;
  is_active?: boolean | null;
}

export interface StepDownOffer {
  tierId: string;
  name: string;
  priceCents: number;
}

export function stepDownOffer(tiers: StepDownTier[], currentTierId: string | null | undefined): StepDownOffer | null {
  const current = tiers.find((t) => t.id === currentTierId);
  const currentPrice = Number(current?.price) || 0;
  if (!current || currentPrice <= 0) return null;
  const candidates = tiers
    .filter((t) => t.is_active !== false && t.id !== current.id && !!t.stripe_price_id)
    .map((t) => ({ t, price: Number(t.price) || 0 }))
    .filter(({ price }) => price > 0 && price < currentPrice)
    .sort((a, b) => b.price - a.price);
  const best = candidates[0];
  return best ? { tierId: best.t.id, name: best.t.name, priceCents: best.price } : null;
}
