'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuth } from '@/hooks/useAuth';

export default function LoginPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (user && !isLoading) {
      router.replace('/home');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-crwn-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-crwn-gold mb-2">CRWN</h1>
          <p className="text-crwn-text-secondary">Welcome back</p>
        </div>

        <div className="bg-crwn-surface p-8 rounded-xl border border-crwn-elevated">
          <h2 className="text-xl font-semibold text-crwn-text mb-6 text-center">Sign In</h2>
          <AuthForm mode="login" onSuccess={() => {
            // Small delay to allow auth state to update
            setTimeout(() => router.replace('/home'), 100);
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
  );
}
