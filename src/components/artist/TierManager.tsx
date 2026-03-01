'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

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
}

export function TierManager() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [artistProfileId, setArtistProfileId] = useState<string | null>(null);
  const [isConnectingStripe, setIsConnectingStripe] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    price: '',
    description: '',
    benefits: [''],
  });

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
      alert('Artist profile not found');
      return;
    }
    
    setIsConnectingStripe(true);
    try {
      // This will redirect to Stripe onboarding
      window.location.href = `/api/stripe/connect?artist_id=${artistProfileId}`;
    } catch (error) {
      console.error('Stripe connect error:', error);
      alert('Failed to connect Stripe');
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
        alert('Artist profile not found');
        return;
      }

      // Create Stripe price
      const response = await fetch('/api/stripe/create-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          price: parseInt(formData.price) * 100, // Convert to cents
          description: formData.description,
          artistId: artistProfile.id,
        }),
      });

      const { stripePriceId, stripeProductId } = await response.json();

      // Save tier to database
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

      setTiers(prev => [...prev, tier as Tier]);
      setFormData({ name: '', price: '', description: '', benefits: [''] });
      setIsCreating(false);
      alert('Tier created successfully!');
    } catch (error) {
      console.error('Error creating tier:', error);
      alert('Failed to create tier');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (tierId: string) => {
    if (!confirm('Are you sure you want to delete this tier?')) return;

    await supabase
      .from('subscription_tiers')
      .update({ is_active: false })
      .eq('id', tierId);

    setTiers(prev => prev.filter(t => t.id !== tierId));
  };

  const addBenefit = () => {
    setFormData(prev => ({ ...prev, benefits: [...prev.benefits, ''] }));
  };

  const updateBenefit = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      benefits: prev.benefits.map((b, i) => i === index ? value : b),
    }));
  };

  const removeBenefit = (index: number) => {
    setFormData(prev => ({
      ...prev,
      benefits: prev.benefits.filter((_, i) => i !== index),
    }));
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
          <button
            onClick={handleStripeConnect}
            disabled={isConnectingStripe}
            className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg px-6 py-3 rounded-lg font-semibold hover:bg-crwn-gold-hover transition-colors disabled:opacity-50"
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
                  <button
                    onClick={() => handleDelete(tier.id)}
                    className="text-crwn-text-secondary hover:text-crwn-error transition-colors"
                  >
                    Delete
                  </button>
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
        <form onSubmit={handleSubmit} className="bg-crwn-surface border border-crwn-elevated rounded-xl p-6">
          <h3 className="text-lg font-semibold text-crwn-text mb-4">Create New Tier</h3>
          
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
              {formData.benefits.map((benefit, index) => (
                <div key={index} className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={benefit}
                    onChange={(e) => updateBenefit(index, e.target.value)}
                    placeholder="e.g., Exclusive tracks"
                    className="flex-1 bg-crwn-bg border border-crwn-elevated rounded-lg px-4 py-2 text-crwn-text"
                  />
                  {formData.benefits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeBenefit(index)}
                      className="px-3 text-crwn-text-secondary hover:text-crwn-error"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addBenefit}
                className="text-sm text-crwn-gold hover:underline"
              >
                + Add benefit
              </button>
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-lg hover:bg-crwn-gold-hover transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Create Tier'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
