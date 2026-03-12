'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2, Edit2, Trash2, X } from 'lucide-react';
import UpgradePrompt from '@/components/shared/UpgradePrompt';
import { usePlatformLimits } from '@/hooks/usePlatformLimits';
import { TierBenefitsSelector } from './TierBenefitsSelector';
import { TierBenefit } from '@/types';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface Tier {
  id: string;
  name: string;
  price: number;
  description: string;
  access_config: {
    benefits?: string[];
  };
  stripe_price_id?: string;
  is_active: boolean;
  tierBenefits?: TierBenefit[];
}

export function TierManager() {
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
  const [agreedToArtistTerms, setAgreedToArtistTerms] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
    benefits: [''],
  });
  const [selectedBenefits, setSelectedBenefits] = useState<TierBenefit[]>([]);
  const [loadingBenefits, setLoadingBenefits] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingTierId, setDeletingTierId] = useState<string | null>(null);

  // Platform limits
  const { tier, limits, usage, loading: limitsLoading } = usePlatformLimits(artistProfileId);
  const tierLimitReached = limits.fanTiers !== -1 && usage.fanTiers >= limits.fanTiers;

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
      }
    }
    setIsLoading(false);
  }, [user, supabase]);

  const checkStripeConnection = useCallback(async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('artist_profiles')
      .select('stripe_connect_id')
      .eq('user_id', user.id)
      .maybeSingle();

    setStripeConnected(!!data?.stripe_connect_id);
  }, [user, supabase]);

  const handleStripeConnect = async () => {
    if (!artistProfileId) {
      showToast('Artist profile not found', 'error');
      return;
    }
    
    setIsConnectingStripe(true);
    try {
      // This will redirect to Stripe onboarding
      window.location.href = `/api/stripe/connect?artist_id=${artistProfileId}`;
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
        // UPDATE existing tier
        const priceChanged = parseInt(formData.price) * 100 !== editingTier.price;
        let stripePriceId = editingTier.stripe_price_id;

        if (priceChanged) {
          // Create new Stripe price if price changed
          const response = await fetch('/api/stripe/create-price', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: formData.name,
              price: parseInt(formData.price) * 100,
              description: formData.description,
              artistId: artistProfile.id,
            }),
          });
          const data = await response.json();
          stripePriceId = data.stripePriceId;
        }

        const { data: updated, error } = await supabase
          .from('subscription_tiers')
          .update({
            name: formData.name,
            price: parseInt(formData.price) * 100,
            description: formData.description,
            access_config: {
              benefits: formData.benefits.filter(b => b.trim() !== ''),
            },
            stripe_price_id: stripePriceId,
          })
          .eq('id', editingTier.id)
          .select()
          .single();

        if (error) throw error;

        // Save benefits to tier_benefits table
        if (selectedBenefits.length > 0) {
          // Delete existing benefits
          await supabase.from('tier_benefits').delete().eq('tier_id', editingTier.id);
          // Insert new benefits
          const benefitsToInsert = selectedBenefits.map((b, index) => ({
            tier_id: editingTier.id,
            benefit_type: b.benefit_type,
            config: b.config || {},
            is_active: true,
            sort_order: index,
          }));
          await supabase.from('tier_benefits').insert(benefitsToInsert);
        }

        setTiers(prev => prev.map(t => t.id === editingTier.id ? (updated as Tier) : t));
        setEditingTier(null);
        setFormData({ name: '', price: '', description: '', benefits: [''] });
        setSelectedBenefits([]);
        showToast('Tier updated successfully!', 'success');
      } else {
        // CREATE new tier
        const response = await fetch('/api/stripe/create-price', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name,
            price: parseInt(formData.price) * 100,
            description: formData.description,
            artistId: artistProfile.id,
          }),
        });

        const { stripePriceId, stripeProductId } = await response.json();

        const { data: tier, error } = await supabase
          .from('subscription_tiers')
          .insert({
            artist_id: artistProfile.id,
            name: formData.name,
            price: parseInt(formData.price) * 100,
            description: formData.description,
            access_config: {
              benefits: formData.benefits.filter(b => b.trim() !== ''),
            },
            stripe_price_id: stripePriceId,
            stripe_product_id: stripeProductId,
          })
          .select()
          .single();

        if (error) throw error;

        // Save benefits to tier_benefits table
        if (selectedBenefits.length > 0 && tier) {
          const benefitsToInsert = selectedBenefits.map((b, index) => ({
            tier_id: tier.id,
            benefit_type: b.benefit_type,
            config: b.config || {},
            is_active: true,
            sort_order: index,
          }));
          await supabase.from('tier_benefits').insert(benefitsToInsert);
        }

        setTiers(prev => [...prev, tier as Tier]);
        setFormData({ name: '', price: '', description: '', benefits: [''] });
        setSelectedBenefits([]);
        showToast('Tier created successfully!', 'success');
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
    setFormData({
      name: tier.name,
      price: (tier.price / 100).toString(),
      description: tier.description || '',
      benefits: tier.access_config?.benefits || [''],
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
  };

  const handleCancelEdit = () => {
    setEditingTier(null);
    setFormData({ name: '', price: '', description: '', benefits: [''] });
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
      {/* Stripe Connect Status */}
      {!stripeConnected && (
        <div className="bg-crwn-surface border border-crwn-gold/30 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-crwn-text mb-2">
            Connect Stripe Account
          </h3>
          <p className="text-crwn-text-secondary mb-4">
            You need to connect a Stripe account to receive subscription payments.
          </p>
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

      {/* Existing Tiers */}
      <div>
        <h3 className="text-lg font-semibold text-crwn-text mb-4">Your Tiers</h3>
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

      {/* Create New Tier */}
      {stripeConnected && (
        <>
          {tierLimitReached && (
            <UpgradePrompt
              currentTier={tier}
              feature="Fan Tiers"
              current={usage.fanTiers}
              limit={limits.fanTiers}
              message={`You've created ${usage.fanTiers}/${limits.fanTiers} fan tiers. Upgrade to create more.`}
            />
          )}
          <form onSubmit={handleSubmit} className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6" style={{ opacity: tierLimitReached ? 0.5 : 1, pointerEvents: tierLimitReached ? 'none' : 'auto' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-crwn-text">{editingTier ? 'Edit Tier' : 'Create New Tier'}</h3>
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
                  min="1"
                  value={formData.price}
                  onChange={(e) => setFormData(prev => ({ ...prev, price: e.target.value }))}
                  placeholder="9.99"
                  className="w-full bg-crwn-bg border border-crwn-elevated rounded-lg pl-8 pr-4 py-3 text-crwn-text"
                  required
                />
              </div>
              <p className="text-xs text-crwn-text-secondary mt-1">
                Platform fee: 8% (you receive 92%)
              </p>
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
                Benefits
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
                />
              )}
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
