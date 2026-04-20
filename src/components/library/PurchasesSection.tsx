'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Purchase, BookingToken, Product, Track } from '@/types';
import Image from 'next/image';
import { EmptyState } from '@/components/ui/EmptyState';
import BookingTokenButton from '@/components/booking/BookingTokenButton';
import { Loader2, Music } from 'lucide-react';
import { usePlayer } from '@/hooks/usePlayer';

interface PurchaseWithProduct extends Purchase {
  products?: Product;
  tracks?: Track;
  artist_profiles?: {
    slug: string;
    calendar_link: string;
  };
}

export function PurchasesSection() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const { play } = usePlayer();
  const [purchases, setPurchases] = useState<PurchaseWithProduct[]>([]);
  const [tokens, setTokens] = useState<BookingToken[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!user) return;

      // Fetch purchases
      const { data: purchaseData } = await supabase
        .from('purchases')
        .select(`
          *,
          products (
            id,
            title,
            image_url,
            type,
            duration_minutes,
            access_level
          ),
          tracks (
            id,
            title,
            album_art_url,
            duration,
            audio_url_128,
            audio_url_320,
            artist_id
          ),
          artist_profiles (
            slug,
            calendar_link
          )
        `)
        .eq('fan_id', user.id)
        .eq('status', 'completed')
        .order('purchased_at', { ascending: false });

      setPurchases(purchaseData || []);

      // Fetch booking tokens
      try {
        const tokensRes = await fetch('/api/booking-tokens');
        const tokensData = await tokensRes.json();
        if (tokensData.tokens) {
          setTokens(tokensData.tokens);
        }
      } catch (err) {
        console.error('Failed to fetch tokens:', err);
      }

      setIsLoading(false);
    }

    fetchData();
  }, [user, supabase]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!purchases.length) {
    return (
      <EmptyState
        icon="🛍️"
        title="No purchases yet"
        description="When you buy music, merch, or experiences, they'll appear here."
      />
    );
  }

  // Separate experience purchases, track purchases, and other product purchases
  const trackPurchases = purchases.filter(p => p.track_id && p.tracks);
  const experiencePurchases = purchases.filter(p => p.products?.type === 'experience');
  const otherPurchases = purchases.filter(p => p.product_id && p.products?.type !== 'experience');

  return (
    <div className="space-y-8">
      {/* Experience Purchases with Booking Tokens */}
      {experiencePurchases.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-crwn-text mb-4">1-on-1 Sessions</h2>
          <div className="space-y-4">
            {experiencePurchases.map((purchase) => {
              const token = tokens.find(t => t.purchase_id === purchase.id);
              
              return (
                <div
                  key={purchase.id}
                  className="flex items-center gap-4 p-4 bg-crwn-surface rounded-xl"
                >
                  <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-crwn-elevated flex-shrink-0">
                    {purchase.products?.image_url ? (
                      <Image
                        src={purchase.products.image_url}
                        alt={purchase.products?.title || 'Product'}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">
                        🎫
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-crwn-text truncate">
                      {purchase.products?.title}
                    </h3>
                    <p className="text-sm text-crwn-text-secondary">
                      {purchase.products?.duration_minutes} min session
                    </p>
                    {token && (
                      <BookingTokenButton
                        tokenId={token.id}
                        tokenStatus={token.status}
                        calendarLink={token.artist_profiles?.calendar_link}
                        usedAt={token.used_at}
                        expiresAt={token.expires_at}
                        productTitle={purchase.products?.title || 'Session'}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Track Purchases */}
      {trackPurchases.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-crwn-text mb-4">Tracks</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {trackPurchases.map((purchase) => (
              <div
                key={purchase.id}
                className="flex items-center gap-3 p-3 bg-crwn-surface rounded-xl"
              >
                <button
                  onClick={() => purchase.tracks && play(purchase.tracks)}
                  className="relative w-12 h-12 rounded-lg overflow-hidden bg-crwn-elevated flex-shrink-0 group"
                >
                  {purchase.tracks?.album_art_url ? (
                    <Image
                      src={purchase.tracks.album_art_url}
                      alt={purchase.tracks.title}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">
                      <Music size={20} className="text-crwn-text-secondary" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Music size={16} className="text-white" />
                  </div>
                </button>
                <div className="flex-1 min-w-0">
                  {purchase.artist_profiles?.slug && purchase.tracks ? (
                    <Link
                      href={`/${purchase.artist_profiles.slug}/track/${purchase.tracks.id}`}
                      className="text-sm font-medium text-crwn-text truncate hover:text-crwn-gold block"
                    >
                      {purchase.tracks.title}
                    </Link>
                  ) : (
                    <h3 className="text-sm font-medium text-crwn-text truncate">
                      {purchase.tracks?.title}
                    </h3>
                  )}
                  <p className="text-xs text-crwn-text-secondary">
                    ${((purchase.amount || 0) / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Purchases */}
      {otherPurchases.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-crwn-text mb-4">Digital & Merch</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {otherPurchases.map((purchase) => (
              <div
                key={purchase.id}
                className="flex items-center gap-3 p-3 bg-crwn-surface rounded-xl"
              >
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-crwn-elevated flex-shrink-0">
                  {purchase.products?.image_url ? (
                    <Image
                      src={purchase.products.image_url}
                      alt={purchase.products?.title || 'Product'}
                      fill
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">
                      📦
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium text-crwn-text truncate">
                    {purchase.products?.title}
                  </h3>
                  <p className="text-xs text-crwn-text-secondary">
                    ${((purchase.amount || 0) / 100).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
