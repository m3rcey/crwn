'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { InlineWidget } from 'react-calendly';
import { BookingSession } from '@/types';
import { Loader2 } from 'lucide-react';

interface ArtistInfo {
  slug: string;
  profile: {
    display_name: string | null;
  } | null;
  calendly_url: string | null;
}

export default function BookingSuccessPage() {
  const searchParams = useSearchParams();
  const params = useParams();
  const supabase = createBrowserSupabaseClient();

  const sessionId = searchParams.get('session_id');
  const bookingId = searchParams.get('booking_id');
  const slug = params.slug as string;

  const [artist, setArtist] = useState<ArtistInfo | null>(null);
  const [session, setSession] = useState<BookingSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verifyAndLoad() {
      if (!sessionId || !bookingId) {
        setError('Missing parameters');
        setIsLoading(false);
        return;
      }

      try {
        // Verify the Stripe checkout session
        const { data: purchase, error: purchaseError } = await supabase
          .from('booking_purchases')
          .select('*')
          .eq('stripe_checkout_session_id', sessionId)
          .eq('booking_session_id', bookingId)
          .single();

        if (purchaseError || !purchase) {
          setError('Purchase not found');
          setIsLoading(false);
          return;
        }

        // Get artist info
        const { data: artistData } = await supabase
          .from('artist_profiles')
          .select('slug, profile:profiles(display_name), calendly_url')
          .eq('id', purchase.artist_id)
          .single();

        if (artistData) {
          setArtist(artistData as unknown as ArtistInfo);
        }

        // Get session info
        const { data: sessionData } = await supabase
          .from('booking_sessions')
          .select('*')
          .eq('id', bookingId)
          .single();

        if (sessionData) {
          setSession(sessionData);
        }

        // Update purchase status
        await supabase
          .from('booking_purchases')
          .update({ status: 'completed' })
          .eq('id', purchase.id);
      } catch (err) {
        console.error('Error verifying purchase:', err);
        setError('Failed to verify purchase');
      } finally {
        setIsLoading(false);
      }
    }

    verifyAndLoad();
  }, [sessionId, bookingId, supabase]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-crwn-bg">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (error || !artist || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-crwn-bg">
        <div className="neu-raised rounded-2xl p-8 text-center">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-xl font-bold text-crwn-text mb-2">Something went wrong</h2>
          <p className="text-crwn-text-secondary">{error || 'Could not load booking'}</p>
        </div>
      </div>
    );
  }

  const calendlyUrl = session.calendly_event_url || artist.calendly_url;

  if (!calendlyUrl) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-crwn-bg p-4">
        <div className="neu-raised rounded-2xl p-8 text-center max-w-md">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold text-crwn-gold mb-2">Payment Confirmed!</h2>
          <p className="text-crwn-text-secondary mb-4">
            Your payment for {session.title} ({session.duration_minutes} min) was successful.
          </p>
          <p className="text-crwn-text-dim">
            The artist hasn't set up scheduling yet. Please contact them directly to book your session.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-crwn-bg p-4">
      <div className="max-w-2xl mx-auto">
        <div className="neu-raised rounded-2xl p-6 mb-6">
          <div className="text-center mb-6">
            <div className="text-5xl mb-3">✅</div>
            <h2 className="text-2xl font-bold text-crwn-gold">Payment Confirmed!</h2>
            <p className="text-crwn-text-secondary mt-2">
              Now pick a time for your {session.duration_minutes}-minute session with {artist.profile?.display_name || 'the artist'}
            </p>
          </div>
          <InlineWidget
            url={calendlyUrl}
            styles={{ height: '700px', borderRadius: '16px' }}
            pageSettings={{
              backgroundColor: '0f0f0f',
              textColor: 'f0f0f0',
              primaryColor: 'D4AF37',
              hideEventTypeDetails: false,
              hideLandingPageDetails: false,
            }}
          />
        </div>
      </div>
    </div>
  );
}
