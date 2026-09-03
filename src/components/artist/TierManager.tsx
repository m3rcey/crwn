'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Edit2, Trash2, X } from 'lucide-react';
import { usePlatformLimits } from '@/hooks/usePlatformLimits';
import { getPlatformFeePercent } from '@/lib/platformTier';
import { TierBenefitsSelector, type InheritedBenefit } from './TierBenefitsSelector';
import { PromiseDeliveryPanel } from './PromiseDeliveryPanel';
import { TierBenefit } from '@/types';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { TierLadderTemplate } from './TierLadderTemplate';

interface Tier {
  id: string;
  name: string;
  price: number;
  description: string;
  access_config: {
    benefits?: string[];
    /** 'prose_only': the card prints the artist's own lines; structured rows stay for delivery. */
    card_lines?: string;
  };
  stripe_price_id?: string;
  stripe_annual_price_id?: string;
  offers_annual?: boolean;
  annual_discount_percent?: number;
  is_active: boolean;
  tierBenefits?: TierBenefit[];
}

/**
 * Best-effort push of a tier's saved name and description onto its Stripe product.
 * The route re-reads both from the database and checks ownership on the session, so this
 * call carries a POINTER and no copy. Failure is logged and swallowed: the tier row is
 * already saved and Stripe being briefly unreachable is not the artist's problem.
 */
async function syncTierProduct(tierId: string) {
  try {
    const res = await fetch('/api/stripe/sync-tier-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tierId }),
    });
    if (!res.ok) console.warn('tier product sync failed:', res.status);
  } catch (err) {
    console.warn('tier product sync failed:', err);
  }
}

export function TierManager() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [artistProfileId, setArtistProfileId] = useState<string | null>(null);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);
  const [editingTier, setEditingTier] = useState<Tier | null>(null);
  const tierFormRef = useRef<HTMLDivElement>(null);
  const [agreedToArtistTerms, setAgreedToArtistTerms] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
    benefits: [''],
    offersAnnual: true,
    annualDiscountPercent: '25',
    founderWindowEnabled: false,
    founderCap: '',
    founderDeadline: '',
    cardLinesProseOnly: false,
  });
  const [selectedBenefits, setSelectedBenefits] = useState<TierBenefit[]>([]);
  /** Every active tier's structured benefits, so the editor can show what a cheaper rung already carries. */
  const [allBenefits, setAllBenefits] = useState<{ tier_id: string; benefit_type: string }[]>([]);
  /** Bumped after every save so the Promise to Delivery panel re-reads readiness. */
  const [deliveryRefresh, setDeliveryRefresh] = useState(0);
  const [loadingBenefits, setLoadingBenefits] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);

  // Platform limits. usage.fanTiers counts PAID tiers only (Option 2): the free
  // front-door tier is always allowed and never consumes the cap. So the limit
  // only blocks creating a NEW PAID tier past the cap — free tiers and edits of
  // existing tiers are never blocked.
  const { tier, limits, usage, loading: limitsLoading } = usePlatformLimits(artistProfileId);
  const paidTierLimitReached = limits.fanTiers !== -1 && usage.fanTiers >= limits.fanTiers;
  const enteringPaidTier = parseFloat(formData.price) > 0;
  const blockNewPaidTier = !editingTier && paidTierLimitReached && enteringPaidTier;

  const loadTiers = useCallback(async () => {
    if (!user) return;
    
    const { data: artistProfile } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (artistProfile) {
      setArtistProfileId(artistProfile.id);
      const { data } = await supabase
        .from('subscription_tiers')
        .select('*')
        .eq('artist_id', artistProfile.id)
        .eq('is_active', true)
        .order('price', { ascending: true });

      if (data) {
        setTiers(data as Tier[]);
        const ids = (data as Tier[]).map((t) => t.id);
        if (ids.length > 0) {
          const { data: rows } = await supabase
            .from('tier_benefits')
            .select('tier_id, benefit_type')
            .in('tier_id', ids)
            .eq('is_active', true);
          setAllBenefits((rows || []) as { tier_id: string; benefit_type: string }[]);
        } else {
          setAllBenefits([]);
        }
      }
    }
    setIsLoading(false);
  }, [user, supabase]);

  // Benefits carried by tiers priced BELOW the one being edited (or below the price being
  // typed for a new one). Cumulative access means those members already get them, so the
  // editor shows them as inherited rather than offering them again.
  const editingPriceCents = Math.round((parseFloat(formData.price) || 0) * 100);
  const inheritedBenefits: InheritedBenefit[] = (() => {
    const cheaper = tiers.filter((t) => (editingTier ? t.id !== editingTier.id : true) && t.price < editingPriceCents);
    const seen = new Map<string, string>();
    for (const t of [...cheaper].sort((a, b) => a.price - b.price)) {
      for (const b of allBenefits.filter((x) => x.tier_id === t.id)) {
        if (!seen.has(b.benefit_type)) seen.set(b.benefit_type, t.name);
      }
    }
    return [...seen.entries()].map(([benefit_type, fromTierName]) => ({ benefit_type, fromTierName }));
  })();

  const checkStripeConnection = useCallback(async () => {
    if (!user) return;
    // Gate on the account being charges-enabled (can actually take money), not on the
    // account id merely existing. The status endpoint also records the stripe_connected
    // activation milestone once the account is genuinely connected.
    try {
      const res = await fetch('/api/stripe/connect/status');
      if (res.ok) {
        const data = await res.json();
        setStripeConnected(!!data.chargesEnabled);
      } else {
        setStripeConnected(false);
      }
    } catch {
      setStripeConnected(false);
    }
  }, [user]);

  const handleStripeConnect = async () => {
    if (!artistProfileId) {
      showToast('Artist profile not found', 'error');
      return;
    }
    
    setIsConnectingStripe(true);
    try {
      // Carry the caller's returnTo through Stripe's onboarding round trip. Rise Mode's "Connect
      // Stripe" move arrives here as /account/tiers?returnTo=/profile/artist, and without this the
      // artist is returned to the route's default instead of where they started. The route itself
      // is the security boundary: it accepts same-site relative paths only and falls back to
      // /profile/artist, so nothing here can turn into an open redirect.
      const rt = new URLSearchParams(window.location.search).get('returnTo');
      const q = new URLSearchParams({ artist_id: artistProfileId });
      if (rt && rt.startsWith('/') && !rt.startsWith('//')) q.set('returnTo', rt);
      // This will redirect to Stripe onboarding
      window.location.href = `/api/stripe/connect?${q.toString()}`;
    } catch (error) {
      console.error('Stripe connect error:', error);
      showToast('Failed to connect Stripe', 'error');
      setIsConnectingStripe(false);
    }
  };

  useEffect(() => {
    loadTiers();
    checkStripeConnection();
  }, [loadTiers, checkStripeConnection]);

  /**
   * Write a tier's structured benefits through /api/tier-benefits. The route verifies the
   * session owns the tier, replaces the set, and runs syncTierObligations, which since
   * 2026-09-03 creates an obligation ONLY for a benefit carrying an explicit frequency.
   */
  const saveBenefits = async (tierId: string) => {
    const res = await fetch('/api/tier-benefits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tier_id: tierId,
        benefits: selectedBenefits.map((b, index) => ({
          benefit_type: b.benefit_type,
          config: b.config || {},
          sort_order: index,
        })),
      }),
    });
    if (!res.ok) throw new Error('benefits save failed: ' + res.status);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setIsCreating(true);

    try {
      // Get artist profile
      const { data: artistProfile } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!artistProfile) {
        showToast('Artist profile not found', 'error');
        return;
      }

      if (editingTier) {
        // UPDATE existing tier. Math.round(parseFloat(...) * 100), never parseInt * 100:
        // the input's own placeholder allows "9.99" and parseInt would silently turn that
        // into 900 cents.
        const newPriceInCents = Math.round((parseFloat(formData.price) || 0) * 100);
        const priceChanged = newPriceInCents !== editingTier.price;
        const annualDiscountPct = parseInt(formData.annualDiscountPercent) || 0;
        // Annual settings can change without the price changing — regenerate Stripe prices for either.
        const annualChanged =
          formData.offersAnnual !== (editingTier.offers_annual !== false) ||
          annualDiscountPct !== (editingTier.annual_discount_percent ?? 25);
        let stripePriceId = editingTier.stripe_price_id;
        let stripeAnnualPriceId = editingTier.stripe_annual_price_id;

        if (priceChanged || annualChanged) {
          if (newPriceInCents > 0) {
            // Recreate Stripe prices (monthly + annual) to reflect new price/annual settings
            const response = await fetch('/api/stripe/create-price', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: formData.name,
                price: newPriceInCents,
                description: formData.description,
                artistId: artistProfile.id,
                offersAnnual: formData.offersAnnual,
                annualDiscountPercent: annualDiscountPct,
              }),
            });
            const data = await response.json();
            stripePriceId = data.stripePriceId;
            stripeAnnualPriceId = data.stripeAnnualPriceId;
          } else {
            // Free tier — no Stripe prices needed
            stripePriceId = undefined;
            stripeAnnualPriceId = undefined;
          }
        }

        const { data: updated, error } = await supabase
          .from('subscription_tiers')
          .update({
            name: formData.name,
            price: newPriceInCents,
            description: formData.description,
            access_config: {
              benefits: formData.benefits.filter(b => b.trim() !== ''),
              ...(formData.cardLinesProseOnly ? { card_lines: 'prose_only' } : {}),
            },
            stripe_price_id: stripePriceId,
            stripe_annual_price_id: stripeAnnualPriceId,
            offers_annual: formData.offersAnnual,
            annual_discount_percent: annualDiscountPct,
            // Founder window: written only when the window is on now, OR was on before (so it can be
            // turned off). Never written otherwise, so a normal tier save is safe before the migration.
            ...(formData.founderWindowEnabled || (editingTier as unknown as { founder_window_enabled?: boolean }).founder_window_enabled
              ? {
                  founder_window_enabled: formData.founderWindowEnabled,
                  founder_cap: formData.founderCap ? parseInt(formData.founderCap) : null,
                  founder_deadline: formData.founderDeadline || null,
                }
              : {}),
          })
          .eq('id', editingTier.id)
          .select()
          .single();

        if (error) throw error;

        // Save benefits through the ONE route that replaces the set (an empty set included, so
        // unticking the last benefit actually clears it) and reconciles the Promise Calendar.
        await saveBenefits(editingTier.id);

        // Stripe Checkout renders the product name and description in its order summary, and
        // create-price only ever wrote them once. Without this, renaming a tier or rewriting
        // its promise left the OLD words on the page where the fan pays. Deliberately not
        // awaited into the failure path: the tier is already saved, and a Stripe hiccup must
        // not tell the artist their edit failed. Free tiers no-op server-side.
        void syncTierProduct(editingTier.id);

        setTiers(prev => prev.map(t => t.id === editingTier.id ? (updated as Tier) : t));
        setEditingTier(null);
        setFormData({ name: '', price: '', description: '', benefits: [''], offersAnnual: true, annualDiscountPercent: '25', founderWindowEnabled: false, founderCap: '', founderDeadline: '', cardLinesProseOnly: false });
        setSelectedBenefits([]);
        showToast('Tier updated successfully!', 'success');
        setDeliveryRefresh((k) => k + 1);
        void loadTiers();
      } else {
        // CREATE new tier. Same rounding rule as the update path above.
        const priceInCents = Math.round((parseFloat(formData.price) || 0) * 100);
        const annualDiscountPct = parseInt(formData.annualDiscountPercent) || 0;
        let stripePriceId = null;
        let stripeAnnualPriceId = null;
        let stripeProductId = null;

        if (priceInCents > 0) {
          const response = await fetch('/api/stripe/create-price', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: formData.name,
              price: priceInCents,
              description: formData.description,
              artistId: artistProfile.id,
              offersAnnual: formData.offersAnnual,
              annualDiscountPercent: annualDiscountPct,
            }),
          });
          const data = await response.json();
          stripePriceId = data.stripePriceId;
          stripeAnnualPriceId = data.stripeAnnualPriceId;
          stripeProductId = data.stripeProductId;
        }

        const { data: tier, error } = await supabase
          .from('subscription_tiers')
          .insert({
            artist_id: artistProfile.id,
            name: formData.name,
            price: priceInCents,
            description: formData.description,
            access_config: {
              benefits: formData.benefits.filter(b => b.trim() !== ''),
              ...(formData.cardLinesProseOnly ? { card_lines: 'prose_only' } : {}),
            },
            stripe_price_id: stripePriceId,
            stripe_annual_price_id: stripeAnnualPriceId,
            stripe_product_id: stripeProductId,
            offers_annual: formData.offersAnnual,
            annual_discount_percent: annualDiscountPct,
            // Founder window: only written when turned on, so a normal new tier is safe pre-migration.
            ...(formData.founderWindowEnabled
              ? {
                  founder_window_enabled: true,
                  founder_cap: formData.founderCap ? parseInt(formData.founderCap) : null,
                  founder_deadline: formData.founderDeadline || null,
                }
              : {}),
          })
          .select()
          .single();

        if (error) throw error;

        if (selectedBenefits.length > 0 && tier) await saveBenefits(tier.id);

        setTiers(prev => [...prev, tier as Tier]);
        setFormData({ name: '', price: '', description: '', benefits: [''], offersAnnual: true, annualDiscountPercent: '25', founderWindowEnabled: false, founderCap: '', founderDeadline: '', cardLinesProseOnly: false });
        setSelectedBenefits([]);
        showToast('Tier created successfully!', 'success');
        setDeliveryRefresh((k) => k + 1);
        void loadTiers();

        // Record activation milestone (fire-and-forget)
        fetch('/api/artist/milestone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ milestone: 'tiers_created' }),
        }).catch(() => {});
      }
    } catch (error) {
      console.error('Error saving tier:', error);
      showToast('Failed to save tier', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEdit = async (tier: Tier) => {
    setEditingTier(tier);
    const fw = tier as unknown as { founder_window_enabled?: boolean; founder_cap?: number | null; founder_deadline?: string | null };
    setFormData({
      name: tier.name,
      price: (tier.price / 100).toString(),
      description: tier.description || '',
      benefits: tier.access_config?.benefits || [''],
      offersAnnual: tier.offers_annual !== false,
      annualDiscountPercent: (tier.annual_discount_percent ?? 25).toString(),
      founderWindowEnabled: fw.founder_window_enabled ?? false,
      founderCap: fw.founder_cap != null ? String(fw.founder_cap) : '',
      founderDeadline: fw.founder_deadline ? fw.founder_deadline.slice(0, 10) : '',
      cardLinesProseOnly: tier.access_config?.card_lines === 'prose_only',
    });
    
    // Load existing benefits for this tier
    setLoadingBenefits(true);
    const { data: benefits } = await supabase
      .from('tier_benefits')
      .select('*')
      .eq('tier_id', tier.id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    
    if (benefits) {
      setSelectedBenefits(benefits as TierBenefit[]);
    }
    setLoadingBenefits(false);
    setTimeout(() => {
      if (tierFormRef.current) {
        const y = tierFormRef.current.getBoundingClientRect().top + window.scrollY - 80;
        window.scrollTo({ top: y, behavior: 'smooth' });
      }
    }, 200);
  };

  // Deep link from Rise Mode: /account/tiers?tier=<id> opens that tier's editor (it already
  // scrolls itself into view). The Constraint Engine knows exactly which rung is failing, so
  // landing the artist on a list of tiers to re-identify it is a step CRWN can spend for them.
  //
  // NOT an authorization path. `tiers` was loaded with .eq('artist_id', <this artist>), so an id
  // belonging to someone else is simply absent from the list: no row, no editor, no leak, and the
  // normal tiers screen renders. Runs once, so closing the editor does not reopen it.
  const appliedTierParamRef = useRef(false);
  useEffect(() => {
    if (appliedTierParamRef.current || isLoading || tiers.length === 0) return;
    const wanted = new URLSearchParams(window.location.search).get('tier');
    if (!wanted) return;
    const match = tiers.find((t) => t.id === wanted);
    appliedTierParamRef.current = true;
    if (match) handleEdit(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, tiers]);

  const handleCancelEdit = () => {
    setEditingTier(null);
    setFormData({ name: '', price: '', description: '', benefits: [''], offersAnnual: true, annualDiscountPercent: '25', founderWindowEnabled: false, founderCap: '', founderDeadline: '', cardLinesProseOnly: false });
    setSelectedBenefits([]);
  };

  const handleDelete = async () => {
    if (!deletingTierId) return;

    await supabase
      .from('subscription_tiers')
      .update({ is_active: false })
      .eq('id', deletingTierId);

    setTiers(prev => prev.filter(t => t.id !== deletingTierId));
    setShowDeleteModal(false);
    setDeletingTierId(null);
  };

  const confirmDelete = (tierId: string) => {
    setDeletingTierId(tierId);
    setShowDeleteModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Offer Builder entry — guided wizard that packages a tier/product + promotion */}
      <button
        onClick={() => router.push('/offers/new')}
        className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
      >
        ✨ Open Offer Builder
      </button>

      {/* Stripe Connect Status */}
      {!stripeConnected && (
        <div className="bg-crwn-surface border border-crwn-gold/30 rounded-xl p-6" data-tour="tiers-stripe">
          <h3 className="text-lg font-semibold text-crwn-text mb-2">
            Connect Stripe Account
          </h3>
          <p className="text-crwn-text-secondary mb-4">
            You need to connect a Stripe account to receive subscription payments.
          </p>
          <div className="bg-crwn-gold/10 border border-crwn-gold/20 rounded-lg p-3 mb-4">
            <p className="text-sm text-crwn-gold">
              💡 Stripe will ask for a website. Use your CRWN page: <strong>thecrwn.app/yourname</strong>
            </p>
          </div>
          <div className="flex items-start gap-3 mb-4">
            <input
              type="checkbox"
              id="agree-artist-terms"
              checked={agreedToArtistTerms}
              onChange={(e) => setAgreedToArtistTerms(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[#D4AF37] cursor-pointer"
            />
            <label htmlFor="agree-artist-terms" className="text-sm text-crwn-text-secondary">
              I agree to the{' '}
              <a href="/artist-agreement" target="_blank" rel="noopener noreferrer" className="text-crwn-gold hover:underline">
                Artist Agreement
              </a>
              , including content licensing terms, platform fee schedule, and payout terms.
            </label>
          </div>
          <button
            onClick={handleStripeConnect}
            disabled={isConnectingStripe || !agreedToArtistTerms}
            className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg px-6 py-3 rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors disabled:opacity-50 hover-glow"
          >
            {isConnectingStripe ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Connecting...
              </>
            ) : (
              'Connect with Stripe'
            )}
          </button>
        </div>
      )}

      {/* Recommended four-tier ladder (Rise Mode Level 3). Reuses this component's
          creation path; free tier always allowed, paid tiers up to the plan cap. */}
      {artistProfileId && (
        <TierLadderTemplate
          artistId={artistProfileId}
          stripeConnected={stripeConnected}
          paidTierCap={limits.fanTiers}
          existingTiers={tiers.map((t) => ({ name: t.name, price: t.price }))}
          onApplied={loadTiers}
        />
      )}

      {/* Existing Tiers */}
      <div>
        <h3 className="text-lg font-semibold text-crwn-text mb-4" data-tour="tiers-list">Your Tiers</h3>
        {tiers.length === 0 ? (
          <p className="text-crwn-text-secondary">No tiers created yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tiers.map((tier) => (
              <div
                key={tier.id}
                className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-crwn-gold">{tier.name}</h4>
                    <p className="text-2xl font-bold text-crwn-text mt-1">
                      ${(tier.price / 100).toFixed(2)}/mo
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(tier)}
                      className="text-crwn-text-secondary hover:text-crwn-gold transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => confirmDelete(tier.id)}
                      className="text-crwn-text-secondary hover:text-crwn-error transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <p className="text-crwn-text-secondary mt-2">{tier.description}</p>
                {tier.access_config?.benefits && tier.access_config.benefits.length > 0 && (
                  <ul className="mt-3 space-y-1">
                    {tier.access_config.benefits.map((benefit: string, idx: number) => (
                      <li key={idx} className="text-sm text-crwn-text-secondary flex items-center gap-2">
                        <span className="text-crwn-gold">✓</span> {benefit}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Promise to Delivery: what each tier promised, whether it is ready, and the one tap
          that keeps it. Lives here because this is where the promise is made (D4). */}
      {artistProfileId && tiers.length > 0 && <PromiseDeliveryPanel refreshKey={deliveryRefresh} />}

      {/* Create New Tier */}
      {stripeConnected && (
        <>
          {blockNewPaidTier && (
            // The paid-tier cap (3) is the same on every plan, so there is no
            // "upgrade for more tiers" here: 3 paid IS the full recommended
            // ladder. Reframe hitting it as an accomplishment, not a paywall.
            <div className="neu-raised rounded-xl p-4 border border-crwn-gold/30 mb-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-crwn-gold text-lg">👑</span>
                <span className="text-crwn-text font-semibold">You&apos;ve built the full membership ladder</span>
              </div>
              <p className="text-sm text-crwn-text-secondary">
                All {limits.fanTiers} paid tiers are live, plus your free tier. That is the recommended
                ladder and the sweet spot: more tiers usually just makes fans freeze on which to pick.
                To change your lineup, edit or remove a tier above.
              </p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6" style={{ opacity: blockNewPaidTier ? 0.5 : 1, pointerEvents: blockNewPaidTier ? 'none' : 'auto' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 ref={tierFormRef} className="text-lg font-semibold text-crwn-text page-fade-in">{editingTier ? 'Edit Tier' : 'Create New Tier'}</h3>
            {editingTier && (
              <button type="button" onClick={handleCancelEdit} className="text-crwn-text-secondary hover:text-crwn-text text-sm">Cancel Edit</button>
            )}
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
                Tier Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Gold Tier"
                className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-3 text-crwn-text"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
                Price (USD per month)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-crwn-text-secondary">$</span>
                <input
                  type="number"
                  min="0"
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="0 for free, or 9.99"
                  className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg pl-8 pr-4 py-3 text-crwn-text"
                  required
                />
              </div>
              <p className="text-xs text-crwn-text-secondary mt-1">
                {parseFloat(formData.price) > 0
                  ? `Platform fee: ${getPlatformFeePercent(tier)}% (you receive ${100 - getPlatformFeePercent(tier)}%)`
                  : 'Free tier: no platform fee'}
              </p>
            </div>

            {parseFloat(formData.price) > 0 && (
              <div className="bg-crwn-bg border border-crwn-elevated rounded-lg p-4 space-y-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="text-sm font-medium text-crwn-text">
                    Offer annual billing
                    <span className="block text-xs text-crwn-text-secondary font-normal">
                      Let fans pay for a year up front at a discount. You get the cash now.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={formData.offersAnnual}
                    onChange={(e) => setFormData(prev => ({ ...prev, offersAnnual: e.target.checked }))}
                    className="w-5 h-5 accent-[#D4AF37] cursor-pointer flex-shrink-0"
                  />
                </label>
                {formData.offersAnnual && (
                  <div>
                    <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
                      Annual discount (% off)
                    </label>
                    <div className="relative max-w-[140px]">
                      <input
                        type="number"
                        min="0"
                        max="50"
                        value={formData.annualDiscountPercent}
                        onChange={(e) => setFormData(prev => ({ ...prev, annualDiscountPercent: e.target.value }))}
                        className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-crwn-text-secondary">%</span>
                    </div>
                    <p className="text-xs text-crwn-text-secondary mt-1">
                      {(() => {
                        const pct = Math.min(50, Math.max(0, parseInt(formData.annualDiscountPercent) || 0));
                        const monthly = parseFloat(formData.price) || 0;
                        const annual = monthly * 12 * (1 - pct / 100);
                        return `Fans pay $${annual.toFixed(2)}/year ($${(annual / 12).toFixed(2)}/mo). Max 50% off.`;
                      })()}
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Founder window: a limited founding offer with a spot cap and/or a deadline. Early
                joiners are permanently marked founders. Enforced at checkout. */}
            <div className="bg-crwn-bg border border-crwn-elevated rounded-lg p-4 space-y-3">
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <span className="text-sm font-medium text-crwn-text">
                  Run a founder window
                  <span className="block text-xs text-crwn-text-secondary font-normal">
                    A limited founding offer. Set a cap and a deadline; early joiners are marked founders for good.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={formData.founderWindowEnabled}
                  onChange={(e) => setFormData(prev => ({ ...prev, founderWindowEnabled: e.target.checked }))}
                  className="w-5 h-5 accent-[#D4AF37] cursor-pointer flex-shrink-0"
                />
              </label>
              {formData.founderWindowEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-crwn-text-secondary mb-1">Founding spots (optional)</label>
                    <input
                      type="number"
                      min="1"
                      value={formData.founderCap}
                      onChange={(e) => setFormData(prev => ({ ...prev, founderCap: e.target.value }))}
                      placeholder="e.g. 100"
                      className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-crwn-text-secondary mb-1">Closes on (optional)</label>
                    <input
                      type="date"
                      value={formData.founderDeadline}
                      onChange={(e) => setFormData(prev => ({ ...prev, founderDeadline: e.target.value }))}
                      className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                    />
                  </div>
                  <p className="text-xs text-crwn-text-secondary sm:col-span-2">
                    When the cap fills or the date passes, new signups to this tier are turned away. Leave both blank to just mark early joiners as founders.
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="What's included in this tier?"
                rows={3}
                className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-3 text-crwn-text resize-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
                What do fans get?
              </label>
              {loadingBenefits ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-crwn-gold" />
                </div>
              ) : (
                <TierBenefitsSelector
                  tierId={editingTier?.id}
                  initialBenefits={selectedBenefits.map(b => ({
                    benefit_type: b.benefit_type as any,
                    config: b.config || {},
                    sort_order: b.sort_order,
                  }))}
                  onChange={(benefits) => setSelectedBenefits(benefits as TierBenefit[])}
                  inherited={inheritedBenefits}
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-crwn-text-secondary mb-2">
                In your own words
              </label>
              <p className="text-xs text-crwn-text-secondary/70 mb-2">
                One line per thing this tier includes, exactly as your fans should read it. These
                are yours to keep by hand: CRWN prints them and does not check them.
              </p>
              <label className="flex items-start gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.cardLinesProseOnly}
                  onChange={(e) => setFormData(prev => ({ ...prev, cardLinesProseOnly: e.target.checked }))}
                  className="mt-0.5 w-4 h-4 accent-[#D4AF37] cursor-pointer"
                />
                <span className="text-xs text-crwn-text-secondary">
                  Show only my own lines on the tier card. The promises picked above still power
                  delivery and readiness; they just do not print a second time.
                </span>
              </label>
              <div className="space-y-2">
                {formData.benefits.map((benefit, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input
                      type="text"
                      value={benefit}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        benefits: prev.benefits.map((b, i) => (i === idx ? e.target.value : b)),
                      }))}
                      placeholder="Stems for every song we finish"
                      className="flex-1 bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2.5 text-crwn-text text-sm"
                    />
                    {formData.benefits.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          benefits: prev.benefits.filter((_, i) => i !== idx),
                        }))}
                        aria-label={`Remove line ${idx + 1}`}
                        className="px-3 rounded-lg bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, benefits: [...prev.benefits, ''] }))}
                className="mt-2 text-sm text-crwn-gold hover:underline"
              >
                + Add a line
              </button>
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-lg hover:bg-crwn-gold-hover transition-colors disabled:opacity-50 hover-glow"
            >
              {isCreating ? 'Saving...' : editingTier ? 'Update Tier' : 'Create Tier'}
            </button>
          </div>
        </form>
        </>
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Tier"
        message="Are you sure you want to delete this tier? This will remove it from all current subscribers."
        confirmText="Delete"
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setShowDeleteModal(false); setDeletingTierId(null); }}
      />
    </div>
  );
}
