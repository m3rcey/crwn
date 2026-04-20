'use client';

import { ShareButtons } from '@/components/shared/ShareButtons';
import { useReferralCode } from '@/hooks/useReferralCode';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { useSubscription } from '@/hooks/useSubscription';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Product, ProductType } from '@/types';
import Image from 'next/image';
import { Check, Download, Lock } from 'lucide-react';
import { EmptyState } from '@/components/ui/EmptyState';
import { hapticMedium } from '@/lib/haptics';

interface ShopSectionProps {
  products: Product[];
  artistId: string;
  artistSlug: string;
  merchStoreUrl?: string | null;
}

export function ShopSection({ products, artistId, artistSlug, merchStoreUrl }: ShopSectionProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const utmSource = searchParams.get('utm_source') || '';
  const utmMedium = searchParams.get('utm_medium') || '';
  const utmCampaign = searchParams.get('utm_campaign') || '';
  const supabase = createBrowserSupabaseClient();
  const { tierId, isSubscribed } = useSubscription(artistId);
  const referralCode = useReferralCode();
  const [purchasedIds, setPurchasedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [successProduct, setSuccessProduct] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [variantSelections, setVariantSelections] = useState<Record<string, Record<string, string>>>({});

  // Check tier access
  const canAccessProduct = (product: Product) => {
    return product.is_free !== false || (tierId && product.allowed_tier_ids?.includes(tierId));
  };

  // Check for purchase success in URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get('purchase');
    const productId = params.get('product');
    
    if (purchase === 'success' && productId) {
      setSuccessProduct(productId);
      setShowSuccess(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  // Check if user has purchased any products
  useEffect(() => {
    async function checkPurchases() {
      if (!user) return;
      
      const { data } = await supabase
        .from('purchases')
        .select('product_id')
        .eq('fan_id', user.id)
        .eq('artist_id', artistId)
        .eq('status', 'completed')
        .not('product_id', 'is', null);

      if (data) {
        setPurchasedIds(new Set(data.map(p => p.product_id).filter((id): id is string => !!id)));
      }
    }
    
    checkPurchases();
  }, [user, artistId, supabase]);

  const handleBuy = async (product: Product) => {
    hapticMedium();
    if (!user) {
      showToast('Please sign in to purchase', 'warning');
      return;
    }
    // Validate variant selections for physical products
    if (product.type === 'physical' && product.variants && product.variants.length > 0) {
      const selections = variantSelections[product.id] || {};
      const missing = product.variants.filter((v: { label: string }) => !selections[v.label]);
      if (missing.length > 0) {
        showToast(`Please select ${missing.map((v: { label: string }) => v.label).join(', ')}`, 'warning');
        return;
      }
    }

    setIsLoading(true);
    
    try {
      const response = await fetch('/api/stripe/product-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          variantSelections: variantSelections[product.id] || undefined,
          utmSource,
          utmMedium,
          utmCampaign,
        }),
      });
      
      const data = await response.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        showToast(data.error, 'error');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      showToast('Failed to start checkout', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const merchButton = merchStoreUrl ? (
    <a
      href={merchStoreUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400 font-medium text-sm hover:bg-green-500/20 transition-colors mb-6"
    >
      <span>🛍️</span>
      Visit Merch Store
      <span className="text-xs opacity-60">↗</span>
    </a>
  ) : null;

  const getTypeBadge = (type: ProductType) => {
    const colors: Record<ProductType, string> = {
      digital: 'bg-blue-500/20 text-blue-400',
      experience: 'bg-purple-500/20 text-purple-400',
      bundle: 'bg-crwn-gold/20 text-crwn-gold',
      physical: 'bg-green-500/20 text-green-400',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[type]}`}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  if (products.length === 0) {
    if (merchStoreUrl) {
      return <section className="mb-8"><h2 className="text-xl font-semibold text-crwn-text mb-4">Shop</h2>{merchButton}</section>;
    }
    return <EmptyState icon="🛍️" title="Shop Coming Soon" description="This artist hasn't added any products yet." />;
  }

  return (
    <section className="mb-8">
      {showSuccess && successProduct && (
        <div className="mb-4 p-4 bg-crwn-gold/20 border border-crwn-gold/30 rounded-lg">
          <div className="flex items-center gap-2 text-crwn-gold mb-2">
            <Check className="w-5 h-5" />
            <span className="font-semibold">Purchase successful!</span>
          </div>
          {(() => {
            const product = products.find(p => p.id === successProduct);
            if (!product) return null;
            
            if (product.type === 'digital' && product.file_url) {
              return (
                <a
                  href={product.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-crwn-text hover:text-crwn-gold"
                >
                  <Download className="w-4 h-4" />
                  Download your file
                </a>
              );
            } else if (product.type === 'experience') {
              return (
                <p className="text-sm text-crwn-text-secondary">
                  Check your email for booking details, or visit your Library to book your session.
                </p>
              );
            }
            return (
              <p className="text-sm text-crwn-text-secondary">
                Thank you for your purchase!
              </p>
            );
          })()}
          <button
            onClick={() => setShowSuccess(false)}
            className="text-xs text-crwn-text-secondary hover:text-crwn-text mt-2"
          >
            Dismiss
          </button>
        </div>
      )}

      <h2 className="text-xl font-semibold text-crwn-text mb-4">Shop</h2>
      {merchButton}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((product) => {
          const hasPurchased = purchasedIds.has(product.id);
          const canAccess = canAccessProduct(product);
          const isSoldOut = product.max_quantity && product.quantity_sold >= product.max_quantity;
          const isExpired = product.expires_at && new Date(product.expires_at) < new Date();
          const isUnavailable = isSoldOut || isExpired;
          return (
            <div
              key={product.id}
              className={`bg-crwn-surface rounded-xl overflow-hidden border border-crwn-elevated card-hover ${!canAccess ? 'opacity-75' : ''}`}
            >
              <div className="aspect-square relative bg-crwn-elevated">
                {product.image_url ? (
                  <Image src={product.image_url} alt={product.title} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">
                    {product.type === 'digital' ? '💾' : product.type === 'experience' ? '🎫' : product.type === 'physical' ? '📦' : '🎁'}
                  </div>
                )}
                
                {/* Lock overlay for gated products */}
                {!canAccess && !isUnavailable && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-center px-4">
                      <Lock className="w-8 h-8 text-crwn-gold" />
                      <p className="text-sm text-crwn-gold font-medium">Subscribe to unlock</p>
                    </div>
                  </div>
                )}
                {/* Sold out / expired overlay */}
                {isUnavailable && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <p className="text-sm text-crwn-text-secondary font-medium">
                      {isSoldOut ? 'Sold Out' : 'Expired'}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  {getTypeBadge(product.type)}
                </div>
                
                <h3 className="font-medium text-crwn-text">{product.title}</h3>
                
                {product.description && (
                  <p className="text-xs text-crwn-text-secondary line-clamp-3 mt-1">
                    {product.description}
                  </p>
                )}
                
                {product.type === 'bundle' && (
                  <p className="text-xs text-crwn-text-secondary mt-1">
                    Bundle item
                  </p>
                )}
                
                {product.max_quantity && !isSoldOut && (
                  <p className="text-xs text-crwn-gold mt-1">
                    {product.max_quantity - (product.quantity_sold || 0)} spots left
                  </p>
                )}
                {product.expires_at && !isExpired && (
                  <p className="text-xs text-crwn-text-secondary mt-1">
                    Available until {new Date(product.expires_at).toLocaleDateString()}
                  </p>
                )}
                <div className="flex items-center justify-between mt-3">
                  <span className="font-semibold text-crwn-text">
                    ${(product.price / 100).toFixed(2)}
                  </span>
                  
                  {hasPurchased ? (
                    <span className="flex items-center gap-1 text-crwn-gold text-sm">
                      <Check className="w-4 h-4" />
                      Purchased
                    </span>
                  ) : !canAccess ? (
                    <span className="text-crwn-text-secondary text-sm">Locked</span>
                  ) : (
                    <button
                      onClick={() => handleBuy(product)}
                      disabled={isLoading || !!isUnavailable}
                      className="px-3 py-1.5 bg-crwn-gold text-crwn-bg text-sm font-medium rounded-lg hover:bg-crwn-gold-hover disabled:opacity-50"
                    >
                      Buy
                    </button>
                  )}
                </div>
                <div className="mt-2 pt-2 border-t border-crwn-elevated">
                  <ShareButtons
                    size="xs"
                    url={isSubscribed && referralCode
                      ? `https://thecrwn.app/${artistSlug}?ref=${referralCode}`
                      : `https://thecrwn.app/${artistSlug}`}
                    title={product.title}
                    description={product.description || `Check out ${product.title}`}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-crwn-text-secondary mt-3">
        By purchasing, you agree to our{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-crwn-gold hover:underline">
          Terms of Service
        </a>
      </p>
    </section>
  );
}
