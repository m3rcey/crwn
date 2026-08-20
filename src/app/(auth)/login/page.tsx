'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuth } from '@/hooks/useAuth';
import { BackgroundImage } from '@/components/ui/BackgroundImage';

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const verified = searchParams.get('verified') === 'true';
  // Optional return path (e.g. a public demand-test page) — internal paths only.
  const nextParam = searchParams.get('next');
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : null;

  useEffect(() => {
    if (user && !isLoading) {
      // Check if user has completed onboarding
      const checkOnboarding = async () => {
        const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
        const supabase = createBrowserSupabaseClient();
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();
        if (!profile?.onboarding_completed) {
          router.replace('/setup');
          return;
        }
        // EVERYONE lands on /home, artists included (founder decision, 2026-08-20).
        //
        // This briefly routed artists to /profile/artist instead, on the reasoning that Rise
        // Mode is their command screen and /home is a fan surface. Reverted after seeing it:
        // Rise Mode answers ONE question and is deliberately sparse, so as a landing it is a
        // mostly empty screen, and /home is where the governed pop-up meets the artist at the
        // start of a session. Rise stays one tap away in the bottom bar.
        //
        // The /home Quick Actions section stays deleted; that was a separate call and every
        // tile in it was a second door to a bottom-nav slot.
        router.replace(next || '/home');
      };
      checkOnboarding();
    }
  }, [user, isLoading, router, next]);

  if (isLoading) {
    return (
      <div className="relative min-h-screen">
        <BackgroundImage src="/backgrounds/bg-auth.jpg" />
        <div className="relative z-10 min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen">
      <BackgroundImage src="/backgrounds/bg-auth.jpg" />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md page-fade-in">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-crwn-gold mb-2">CRWN</h1>
            {verified ? (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-4 py-3 mt-3">
                <p className="text-green-400 text-sm font-medium">Email verified! Log in to get started.</p>
              </div>
            ) : (
              <p className="text-crwn-text-secondary">Welcome back</p>
            )}
          </div>

          <div className="neu-raised p-8">
            <h2 className="text-xl font-semibold text-crwn-text mb-6 text-center">Sign In</h2>
            <AuthForm mode="login" onSuccess={() => {
              // Redirect handled by useEffect above after user state updates
            }} />
            
            <p className="mt-6 text-center text-sm text-crwn-text-secondary">
              Don&apos;t have an account?{' '}
              <a href="/signup" className="text-crwn-gold hover:underline">
                Sign up
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
