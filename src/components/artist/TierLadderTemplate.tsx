'use client';

// Level 3 (Build Your Membership Ladder): the recommended four-tier template.
// Four-tier summary first, then one-tier-at-a-time editing (never four long forms
// on mobile). Actions: Use this tier / Edit / Skip for now / Preview as fan.
//
// Reuses the EXISTING tier-creation path (subscription_tiers insert + tier_benefits
// + /api/stripe/create-price when connected, else null price ids that the Stripe
// connect backfill fills later). Never bypasses plan limits: the free Bronze
// tier is always allowed (Option 2), paid tiers only up to the artist's paid cap.

import { useState, useEffect, useMemo } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useToast } from '@/components/shared/Toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Check, ChevronDown, ChevronUp, X, ExternalLink } from 'lucide-react';
import {
  RECOMMENDED_LADDER,
  benefitLabels,
  highTouchBenefits,
  needsFulfillmentConfirm,
  disclaimersFor,
  tierNameAliases,
  type TierTemplateDef,
} from '@/lib/tierTemplate';
import { applyTemplateTier } from '@/lib/applyTierTemplate';

interface LadderProps {
  artistId: string;
  stripeConnected: boolean;
  /** TIER_LIMITS maxFanTiers (paid cap). -1 = unlimited. */
  paidTierCap: number;
  existingTiers: { name: string; price: number }[];
  onApplied: () => void;
}

type TileStatus = 'pending' | 'applied' | 'skipped' | 'creating';

interface Tile {
  def: TierTemplateDef;
  name: string;
  priceDollars: string;
  description: string;
  benefits: string[];
  status: TileStatus;
}

function buildTile(def: TierTemplateDef): Tile {
  return {
    def,
    name: def.name,
    priceDollars: (def.priceCents / 100).toString(),
    description: def.description,
    benefits: benefitLabels(def),
    status: 'pending',
  };
}

export function TierLadderTemplate({ artistId, stripeConnected, paidTierCap, existingTiers, onApplied }: LadderProps) {
  const supabase = createBrowserSupabaseClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState<string | null>(null);
  const [tiles, setTiles] = useState<Tile[]>(() => RECOMMENDED_LADDER.map(buildTile));
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [confirmDef, setConfirmDef] = useState<TierTemplateDef | null>(null);

  // Mark template tiers already created (match by name, case-insensitive) as applied,
  // so returning artists see their real state and never double-create. Legacy names
  // count as a match: an artist who applied this ladder before the Bronze/Silver/
  // Gold/Platinum rename has "The Wave" or "Throne" in the database.
  useEffect(() => {
    const existingNames = new Set(existingTiers.map((t) => t.name.trim().toLowerCase()));
    setTiles((prev) =>
      prev.map((t) =>
        tierNameAliases(t.def).some((n) => existingNames.has(n)) && t.status !== 'creating'
          ? { ...t, status: 'applied' }
          : t,
      ),
    );
  }, [existingTiers]);

  useEffect(() => {
    let active = true;
    supabase
      .from('artist_profiles')
      .select('slug')
      .eq('id', artistId)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setSlug(data?.slug ?? null);
      });
    return () => {
      active = false;
    };
  }, [artistId, supabase]);

  // Live paid-tier usage = already-created paid tiers + paid tiles applied this session.
  const appliedPaidThisSession = tiles.filter((t) => t.status === 'applied' && parseFloat(t.priceDollars) > 0).length;
  const existingPaidCount = existingTiers.filter((t) => t.price > 0).length;
  const paidUsed = Math.max(existingPaidCount, appliedPaidThisSession);
  const paidCapReached = paidTierCap !== -1 && paidUsed >= paidTierCap;

  const updateTile = (key: string, patch: Partial<Tile>) =>
    setTiles((prev) => prev.map((t) => (t.def.key === key ? { ...t, ...patch } : t)));

  async function createTier(tile: Tile) {
    const priceInCents = Math.round((parseFloat(tile.priceDollars) || 0) * 100);
    const isPaid = priceInCents > 0;

    if (isPaid && paidCapReached) {
      showToast(`You have reached your ${paidTierCap} paid-tier limit. Your free tier is always included.`, 'error');
      return;
    }

    updateTile(tile.def.key, { status: 'creating' });
    // Shared apply path (also used by the setup wizard's ladder screen): Stripe
    // price when connected (else backfilled on connect), tier insert, and the
    // /api/tier-benefits call that seeds the Promise Calendar obligations.
    const { error } = await applyTemplateTier(supabase, {
      artistId,
      stripeConnected,
      def: tile.def,
      name: tile.name,
      priceCents: priceInCents,
      description: tile.description,
      benefits: tile.benefits,
    });
    if (error) {
      updateTile(tile.def.key, { status: 'pending' });
      showToast('Could not add that tier. Please try again.', 'error');
      return;
    }
    updateTile(tile.def.key, { status: 'applied' });
    setEditingKey(null);
    showToast(`${tile.name} tier added!`, 'success');
    onApplied();
  }

  function onUseTier(tile: Tile) {
    if (needsFulfillmentConfirm(tile.def)) {
      setConfirmDef(tile.def);
      return;
    }
    createTier(tile);
  }

  const confirmTile = confirmDef ? tiles.find((t) => t.def.key === confirmDef.key) : null;

  const summary = useMemo(
    () =>
      tiles.map((t) => ({
        key: t.def.key,
        name: t.name,
        price: parseFloat(t.priceDollars) || 0,
        count: t.benefits.length,
        status: t.status,
      })),
    [tiles],
  );

  return (
    <div className="bg-crwn-surface border border-crwn-gold/30 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-5 text-left"
      >
        <div>
          <h3 className="text-lg font-semibold text-crwn-text">Recommended membership ladder</h3>
          <p className="text-sm text-crwn-text-secondary mt-0.5">
            Four proven tiers, ready to apply and edit. Free front door plus three paid tiers.
          </p>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-crwn-gold shrink-0" /> : <ChevronDown className="w-5 h-5 text-crwn-gold shrink-0" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          {paidCapReached && (
            <p className="text-xs text-crwn-gold bg-crwn-gold/10 border border-crwn-gold/20 rounded-lg p-3">
              You have used your {paidTierCap} paid tier{paidTierCap === 1 ? '' : 's'} on this plan. Your free Bronze
              tier is always included. Upgrade to add more paid tiers.
            </p>
          )}

          {tiles.map((tile) => {
            const price = parseFloat(tile.priceDollars) || 0;
            const isPaid = price > 0;
            const isEditing = editingKey === tile.def.key;
            const applied = tile.status === 'applied';
            const creating = tile.status === 'creating';
            const skipped = tile.status === 'skipped';
            const blocked = isPaid && paidCapReached && !applied;
            const s = summary.find((x) => x.key === tile.def.key)!;
            const disclaimers = disclaimersFor(tile.def);
            const highTouch = highTouchBenefits(tile.def);

            return (
              <div
                key={tile.def.key}
                className={`border rounded-xl p-4 ${applied ? 'border-crwn-gold/50 bg-crwn-gold/5' : 'border-crwn-elevated'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-crwn-gold">{s.name}</h4>
                      <span className="text-sm text-crwn-text">{price === 0 ? 'Free' : `$${price}/mo`}</span>
                      {applied && (
                        <span className="inline-flex items-center gap-1 text-xs text-crwn-gold">
                          <Check className="w-3.5 h-3.5" /> Added
                        </span>
                      )}
                      {skipped && <span className="text-xs text-crwn-text-secondary">Skipped</span>}
                    </div>
                    <p className="text-xs text-crwn-text-secondary mt-1">{s.count} benefits included</p>
                  </div>
                  {!applied && !isEditing && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => onUseTier(tile)}
                        disabled={creating || blocked}
                        className="bg-crwn-gold text-crwn-bg text-sm font-semibold px-3 py-1.5 rounded-full hover:bg-crwn-gold/90 transition-colors disabled:opacity-40"
                      >
                        {creating ? 'Adding...' : 'Use this tier'}
                      </button>
                      <button
                        onClick={() => setEditingKey(tile.def.key)}
                        className="text-crwn-text-secondary hover:text-crwn-gold text-sm"
                      >
                        Edit
                      </button>
                      {!skipped && (
                        <button
                          onClick={() => updateTile(tile.def.key, { status: 'skipped' })}
                          className="text-crwn-text-secondary hover:text-crwn-text text-sm"
                        >
                          Skip for now
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {blocked && (
                  <p className="text-xs text-crwn-text-secondary mt-2">
                    Reached your paid-tier limit. Upgrade to add this tier, or skip it for now.
                  </p>
                )}

                {isEditing && (
                  <div className="mt-4 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-crwn-text-secondary mb-1">Tier name</label>
                      <input
                        value={tile.name}
                        onChange={(e) => updateTile(tile.def.key, { name: e.target.value })}
                        className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-3 py-2 text-crwn-text text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-crwn-text-secondary mb-1">Price (USD / month)</label>
                      <div className="relative max-w-[160px]">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-crwn-text-secondary text-sm">$</span>
                        <input
                          type="number"
                          min="0"
                          value={tile.priceDollars}
                          onChange={(e) => updateTile(tile.def.key, { priceDollars: e.target.value })}
                          className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg pl-7 pr-3 py-2 text-crwn-text text-sm"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-crwn-text-secondary mb-1">Description</label>
                      <textarea
                        value={tile.description}
                        onChange={(e) => updateTile(tile.def.key, { description: e.target.value })}
                        rows={2}
                        className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-3 py-2 text-crwn-text text-sm resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-crwn-text-secondary mb-1">Benefits</label>
                      <div className="space-y-2">
                        {tile.benefits.map((b, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input
                              value={b}
                              onChange={(e) => {
                                const next = [...tile.benefits];
                                next[i] = e.target.value;
                                updateTile(tile.def.key, { benefits: next });
                              }}
                              className="flex-1 bg-crwn-bg border border-crwn-elevated rounded-lg px-3 py-1.5 text-crwn-text text-sm"
                            />
                            <button
                              onClick={() => updateTile(tile.def.key, { benefits: tile.benefits.filter((_, j) => j !== i) })}
                              className="text-crwn-text-secondary hover:text-crwn-error shrink-0"
                              aria-label="Remove benefit"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          onClick={() => updateTile(tile.def.key, { benefits: [...tile.benefits, ''] })}
                          className="text-xs text-crwn-gold hover:underline"
                        >
                          + Add a benefit
                        </button>
                      </div>
                    </div>

                    {disclaimers.map((d, i) => (
                      <p key={i} className="text-xs text-crwn-text-secondary bg-crwn-bg border border-crwn-elevated rounded-lg p-2">
                        {d}
                      </p>
                    ))}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => onUseTier(tile)}
                        disabled={creating || blocked}
                        className="bg-crwn-gold text-crwn-bg text-sm font-semibold px-4 py-2 rounded-full hover:bg-crwn-gold/90 transition-colors disabled:opacity-40"
                      >
                        {creating ? 'Adding...' : 'Use this tier'}
                      </button>
                      <button onClick={() => setEditingKey(null)} className="text-crwn-text-secondary hover:text-crwn-text text-sm">
                        Cancel
                      </button>
                    </div>
                    {highTouch.length > 0 && (
                      <p className="text-xs text-crwn-gold">
                        Heads up: this tier includes {highTouch.length} hands-on benefit
                        {highTouch.length === 1 ? '' : 's'} you fulfill yourself. You will confirm before it publishes.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {slug && (
            <a
              href={`/${slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-crwn-gold hover:underline"
            >
              <ExternalLink className="w-4 h-4" /> Preview the ladder as a fan
            </a>
          )}
        </div>
      )}

      {confirmDef && confirmTile && (
        <ConfirmModal
          isOpen={true}
          title={`Publish ${confirmTile.name}?`}
          message={
            `This tier includes hands-on benefits you deliver yourself (${highTouchBenefits(confirmDef)
              .map((b) => b.label.toLowerCase())
              .join(', ')}). Only publish what you can realistically keep up with. You can edit or remove benefits anytime.`
          }
          confirmText="I can deliver this"
          onConfirm={() => {
            const tile = tiles.find((t) => t.def.key === confirmDef.key);
            setConfirmDef(null);
            if (tile) createTier(tile);
          }}
          onCancel={() => setConfirmDef(null)}
        />
      )}
    </div>
  );
}
