'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { BookingSession } from '@/types';
import { InlineWidget } from 'react-calendly';
import { Lock, Clock, DollarSign, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/shared/Toast';

interface CalendlyBookingProps {
  artist: {
    id: string;
    slug: string;
    profile: {
      display_name: string | null;
    } | null;
  };
  calendlyUrl: string | null;
  bookingIsFree: boolean;
  bookingAllowedTierIds: string[];
}

export function CalendlyBooking({
  artist,
  calendlyUrl,
  bookingIsFree,
  bookingAllowedTierIds,
}: CalendlyBookingProps) {
  const { user, profile } = useAuth();
  const { tierId, isLoading: subLoading } = useSubscription(artist.id);
  const supabase = createBrowserSupabaseClient();
  const router = useRouter();
  const { showToast } = useToast();

  const [sessions, setSessions] = useState<BookingSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCheckingOut, setIsCheckingOut] = useState<string | null>(null);

  const canBook = bookingIsFree || (tierId && bookingAllowedTierIds.includes(tierId));

  useEffect(() => {
    loadSessions();
  }, [artist.id]);

  const loadSessions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('booking_sessions')
        .select('*')
        .eq('artist_id', artist.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBookSession = async (session: BookingSession) => {
    if (!user) {
      router.push('/login');
      return;
    }

    setIsCheckingOut(session.id);
    try {
      const response = await fetch('/api/stripe/booking-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          artistId: artist.id,
        }),
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || 'Checkout failed');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      showToast('Failed to start checkout. Please try again.', 'error');
    } finally {
      setIsCheckingOut(null);
    }
  };

  const showTierSection = calendlyUrl && (bookingIsFree || bookingAllowedTierIds.length > 0);

  return (
    <div className="space-y-8">
      {/* Section 1: Purchasable Sessions */}
      {sessions.length > 0 && (
        <div>
          <h2 className="text-xl font-bold text-crwn-text mb-4">Book a Session</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sessions.map(session => (
              <div key={session.id} className="neu-raised rounded-2xl p-6">
                <h3 className="text-lg font-bold text-crwn-text">{session.title}</h3>
                <div className="flex items-center gap-3 mt-2 text-crwn-text-secondary">
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    {session.duration_minutes} min
                  </span>
                  <span>•</span>
                  <span className="text-crwn-gold font-semibold flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    {session.price / 100}
                  </span>
                </div>
                {session.description && (
                  <p className="text-crwn-text-secondary mt-3 text-sm">{session.description}</p>
                )}
                <button
                  onClick={() => handleBookSession(session)}
                  disabled={isCheckingOut === session.id}
                  className="neu-button-accent w-full mt-4 py-3 rounded-xl font-semibold disabled:opacity-50"
                >
                  {isCheckingOut === session.id ? (
                    <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                  ) : (
                    'Book Now'
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: Tier Subscriber Booking */}
      {showTierSection && (
        <div className="mt-8">
          {canBook ? (
            <div className="neu-raised rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-crwn-gold">👑</span>
                <h2 className="text-xl font-bold text-crwn-gold">Subscriber Booking</h2>
              </div>
              <p className="text-crwn-text-secondary mb-6">
                As a subscriber, you can book a session with {artist.profile?.display_name || 'the artist'} at no extra cost
              </p>
              <InlineWidget
                url={calendlyUrl!}
                styles={{ height: '700px', borderRadius: '16px' }}
                pageSettings={{
                  backgroundColor: '0f0f0f',
                  textColor: 'f0f0f0',
                  primaryColor: 'D4AF37',
                  hideEventTypeDetails: false,
                  hideLandingPageDetails: false,
                }}
                prefill={{
                  name: profile?.display_name || user?.email?.split('@')[0] || '',
                  email: user?.email || '',
                }}
              />
            </div>
          ) : (
            <div className="neu-raised rounded-2xl p-12 text-center">
              <div className="text-5xl mb-4">🔒</div>
              <h2 className="text-xl font-bold text-crwn-text mb-2">Subscriber-Only Booking</h2>
              <p className="text-crwn-text-secondary mb-6">
                Subscribe to unlock free booking with {artist.profile?.display_name || 'this artist'}
              </p>
              <button
                onClick={() => router.push(`/${artist.slug}?tab=music`)}
                className="neu-button-accent px-6 py-3 rounded-xl font-semibold"
              >
                View Subscription Tiers
              </button>
            </div>
          )}
        </div>
      )}

      {/* No sessions and no tier section */}
      {!isLoading && sessions.length === 0 && !showTierSection && (
        <div className="neu-raised rounded-2xl p-8 text-center">
          <p className="text-crwn-text-dim">No booking sessions available yet.</p>
        </div>
      )}
    </div>
  );
}
