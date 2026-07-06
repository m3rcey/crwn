'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CreditCard, Megaphone, Package, Plus, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { ProductType } from '@/types';

interface TierRow {
  id: string;
  name: string;
  price: number;
  access_config: { benefits?: string[] } | null;
}

interface ProductRow {
  id: string;
  title: string;
  price: number;
  type: ProductType;
}

const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  digital: 'Digital',
  physical: 'Physical',
  experience: 'Experience',
  bundle: 'Bundle',
};

/**
 * "My Offers" — every packaged thing an artist sells, in one list. An offer is
 * NOT a new entity: a subscription offer IS a subscription_tiers row and a
 * one-time offer IS a products row. This page just reads both.
 */
export default function OffersPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [isArtist, setIsArtist] = useState(false);
  const [tiers, setTiers] = useState<TierRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [promotionActive, setPromotionActive] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: artist } = await supabase
      .from('artist_profiles')
      .select('id, referral_commission_rate, clipper_rate_schedule, clipper_campaign_started_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!artist) {
      setIsArtist(false);
      setLoading(false);
      return;
    }
    setIsArtist(true);

    // Promotion is GLOBAL per artist for now (artist-wide referral + clipper rails).
    const schedule = artist.clipper_rate_schedule;
    setPromotionActive(
      (artist.referral_commission_rate ?? 0) > 0 ||
        (Array.isArray(schedule) && schedule.length > 0) ||
        !!artist.clipper_campaign_started_at
    );

    const [tierRes, productRes] = await Promise.all([
      supabase
        .from('subscription_tiers')
        .select('id, name, price, access_config')
        .eq('artist_id', artist.id)
        .eq('is_active', true)
        .order('price', { ascending: true }),
      supabase
        .from('products')
        .select('id, title, price, type')
        .eq('artist_id', artist.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
    ]);

    setTiers((tierRes.data as TierRow[]) || []);
    setProducts((productRes.data as ProductRow[]) || []);
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    load();
  }, [authLoading, user, router, load]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  if (!isArtist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Offers are for artists. Publish your artist page first.</p>
        <button
          onClick={() => router.push('/home')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to CRWN
        </button>
      </div>
    );
  }

  const empty = tiers.length === 0 && products.length === 0;

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <button
          onClick={() => router.push('/studio')}
          className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Studio
        </button>

        <div className="flex items-start justify-between gap-3 mb-2">
          <h1 className="text-3xl font-bold text-crwn-text">My Offers</h1>
          {promotionActive && (
            <span className="inline-flex items-center gap-1.5 flex-shrink-0 mt-1 px-3 py-1.5 rounded-full text-xs font-semibold bg-crwn-gold/15 text-crwn-gold border border-crwn-gold/40">
              <Megaphone className="w-3.5 h-3.5" />
              Promotion active
            </span>
          )}
        </div>
        <p className="text-crwn-text-secondary text-sm mb-8">
          Everything fans can buy from you — memberships and one-time offers.
        </p>

        <button
          onClick={() => router.push('/offers/new')}
          className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-3 rounded-full hover:bg-crwn-gold/90 transition-colors mb-3"
        >
          <Plus className="w-4 h-4" />
          Build an Offer
        </button>

        <p className="mb-3">
          <button
            onClick={() => router.push('/proof-of-demand/new')}
            className="text-sm text-crwn-text-secondary hover:text-crwn-gold transition-colors"
          >
            Not sure fans want it? Test demand first →
          </button>
        </p>

        <p className="mb-10">
          <button
            onClick={() => router.push('/missions/new')}
            className="text-sm text-crwn-text-secondary hover:text-crwn-gold transition-colors"
          >
            Rally your fans with a mission →
          </button>
        </p>

        {empty ? (
          <div className="border border-dashed border-crwn-elevated rounded-2xl py-14 px-6 text-center">
            <Sparkles className="w-8 h-8 text-crwn-gold mx-auto mb-3" />
            <p className="text-crwn-text font-medium mb-1">No offers yet</p>
            <p className="text-sm text-crwn-text-secondary">
              Build your first offer — a membership tier or a one-time drop — in about a minute.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {tiers.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-crwn-text-secondary mb-3">
                  Memberships
                </h2>
                <div className="space-y-0">
                  {tiers.map((t, i) => (
                    <div
                      key={t.id}
                      className={`flex items-center gap-4 py-4 ${i > 0 ? 'border-t border-crwn-elevated' : ''}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
                        <CreditCard className="w-5 h-5 text-crwn-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-crwn-text truncate">{t.name}</p>
                        <p className="text-sm text-crwn-text-secondary">
                          ${(t.price / 100).toFixed(2)}/mo
                          {t.access_config?.benefits?.length
                            ? ` · ${t.access_config.benefits.length} benefit${t.access_config.benefits.length === 1 ? '' : 's'}`
                            : ''}
                        </p>
                      </div>
                      <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-crwn-elevated text-crwn-text-secondary">
                        Subscription
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {products.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-crwn-text-secondary mb-3">
                  One-time offers
                </h2>
                <div className="space-y-0">
                  {products.map((p, i) => (
                    <div
                      key={p.id}
                      className={`flex items-center gap-4 py-4 ${i > 0 ? 'border-t border-crwn-elevated' : ''}`}
                    >
                      <div className="w-10 h-10 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
                        <Package className="w-5 h-5 text-crwn-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-crwn-text truncate">{p.title}</p>
                        <p className="text-sm text-crwn-text-secondary">${(p.price / 100).toFixed(2)}</p>
                      </div>
                      <span className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-crwn-elevated text-crwn-text-secondary">
                        {PRODUCT_TYPE_LABELS[p.type] || 'Product'}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
