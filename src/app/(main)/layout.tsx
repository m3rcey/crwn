'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Navigation } from '@/components/layout/Navigation';
import { BackgroundImage } from '@/components/ui/BackgroundImage';


export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, isLoading } = useAuth();
  const router = useRouter();

  // A new signup that hasn't completed /welcome yet. Admins are exempt so the
  // founder is never trapped by the onboarding gate.
  const needsOnboarding =
    !!user && !!profile && profile.role !== 'admin' && !profile.onboarding_completed;

  // Second gate: an artist who finished /welcome but hasn't completed the focused
  // setup wizard (/setup) is held there — the rest of the app is unreachable until
  // Profile + Music are done and they reach the share screen. `null` = not yet
  // resolved (block the shell to avoid a flash-then-redirect), true/false = answer.
  //
  // Gate on the artist_profiles ROW, not profile.role. The useAuth context lags —
  // right after /welcome flips fan→artist, profile.role is still 'fan' until the
  // next token refresh — so a role check would wrongly wave a brand-new artist
  // straight into the app, bypassing setup. The row is the fresh source of truth.
  const [needsSetup, setNeedsSetup] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    async function checkSetup() {
      if (isLoading || !user || !profile) return;
      // Admins (the founder) are never gated.
      if (profile.role === 'admin') {
        setNeedsSetup(false);
        return;
      }
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from('artist_profiles')
        .select('setup_completed')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      // No artist_profiles row → a fan, nothing to gate. Row with setup_completed
      // false → an artist mid-setup, hold them in the wizard.
      setNeedsSetup(!!data && data.setup_completed === false);
    }
    checkSetup();
    return () => {
      active = false;
    };
  }, [user, profile, isLoading]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    // Force new signups through onboarding before they can use the app. This is the
    // single enforcement point: email signup, Google OAuth, and direct navigation all
    // land on a (main) page, so gating here catches every bypass path into /welcome.
    if (needsOnboarding) {
      router.push('/welcome');
      return;
    }
    // Then hold artists in the focused setup wizard until it's complete.
    if (needsSetup) {
      router.push('/setup');
    }
  }, [user, needsOnboarding, needsSetup, isLoading, router]);


  if (!isLoading && !user) {
    return null;
  }

  // Avoid flashing the app shell while we redirect an unonboarded user to /welcome.
  if (needsOnboarding) {
    return null;
  }

  // Anti-flash only: hold the shell for a known artist while the setup check is
  // pending (null), and for anyone we're actively redirecting to /setup (true).
  // Uses the context role purely to avoid delaying fans on every page load — the
  // actual redirect decision above is driven by the DB row, not this flag.
  const isArtistByRole = !!profile && profile.role === 'artist';
  if (isArtistByRole && needsSetup === null) {
    return null;
  }
  if (needsSetup) {
    return null;
  }

  return (
    <div className="relative min-h-screen bg-transparent">
      <BackgroundImage src="/backgrounds/bg-home.jpg" />
      <Navigation />
      
      {/* Main Content - with padding for mobile nav and sidebar. The mobile nav
          is 56px tall plus its own safe-area inset, so the clearance has to
          track that inset too or the last row of content sits under it. */}
      <div className="relative z-10 md:pl-64 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        <main className="p-4 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
