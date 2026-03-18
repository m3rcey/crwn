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

  useEffect(() => {
    if (user && !isLoading) {
      // Check if user has completed onboarding (has phone number)
      const checkOnboarding = async () => {
        const { createBrowserSupabaseClient } = await import('@/lib/supabase/client');
        const supabase = createBrowserSupabaseClient();
        const { data } = await supabase
          .from('profiles')
          .select('phone, is_active')
          .eq('id', user.id)
          .single();
        // Reactivate if deactivated
        if (data && data.is_active === false) {
          await supabase
            .from('profiles')
            .update({ is_active: true })
            .eq('id', user.id);
          // Also reactivate artist profile if exists
          await supabase
            .from('artist_profiles')
            .update({ is_active: true })
            .eq('user_id', user.id);
        }
        if (data?.phone) {
          router.replace('/home');
        } else {
          router.replace('/welcome');
        }
      };
      checkOnboarding();
    }
  }, [user, isLoading, router]);

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
