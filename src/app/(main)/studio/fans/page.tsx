'use client';

// Fan CRM — its own destination, lifted out of the artist dashboard tab strip so
// it reads as the first-class "manage my fans" surface it is (reached from the
// Studio card and the AccountHub). The whole CRM shell (Fans, Campaigns,
// Sequences, SMS, Links, Promos, Recovery) is AudienceTab, which self-resolves the
// artist and calls the ownership-guarded /api/audience, so this page is a gate +
// a Back to Studio control + the component.

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { smartBack } from '@/lib/navigation';
import { AudienceTab } from '@/components/artist/AudienceTab';

export default function FanCrmPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  // Artist-ness from the artist_profiles ROW, not profile.role (the context role
  // lags right after signup, per CLAUDE.md). null = still checking.
  const [isArtist, setIsArtist] = useState<boolean | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    let active = true;
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setIsArtist(!!data);
      });
    return () => {
      active = false;
    };
  }, [user, authLoading, router]);

  if (authLoading || isArtist === null) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (!isArtist) {
    return (
      <div className="max-w-2xl mx-auto page-fade-in">
        <div className="neu-raised rounded-xl p-8 text-center">
          <Sparkles className="w-12 h-12 text-crwn-gold/30 mx-auto mb-3" />
          <p className="text-crwn-text font-medium">The Fan CRM is for artists</p>
          <p className="text-sm text-crwn-text-secondary mt-2 max-w-sm mx-auto">
            Publish your artist page and this becomes the place you turn listeners
            into supporters and keep them from drifting.
          </p>
          <button
            onClick={() => router.push('/home')}
            className="mt-5 px-5 py-2 rounded-full font-semibold text-sm bg-crwn-gold text-crwn-bg hover:bg-crwn-gold/90 transition-colors"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto page-fade-in">
      <button
        onClick={() => smartBack(router, '/studio')}
        className="inline-flex items-center gap-2 text-sm text-crwn-text-secondary hover:text-crwn-text mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Studio
      </button>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
          </div>
        }
      >
        <AudienceTab />
      </Suspense>
    </div>
  );
}
