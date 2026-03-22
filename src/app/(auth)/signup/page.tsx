'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuth } from '@/hooks/useAuth';
import { BackgroundImage } from '@/components/ui/BackgroundImage';

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recruiterCode = searchParams.get('recruiter');

  useEffect(() => {
    if (recruiterCode) {
      localStorage.setItem('crwn_recruiter', recruiterCode);
    }
  }, [recruiterCode]);
  const { user, isLoading } = useAuth();
  const [justSignedUp, setJustSignedUp] = useState(false);

  useEffect(() => {
    if (user && !isLoading && !justSignedUp) {
      router.replace('/home');
    }
  }, [user, isLoading, router, justSignedUp]);

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
            <p className="text-crwn-text-secondary">Create your account</p>
          </div>

          <div className="neu-raised p-8">
            <h2 className="text-xl font-semibold text-crwn-text mb-6 text-center">Sign Up</h2>
            <AuthForm mode="signup" onSignupComplete={() => setJustSignedUp(true)} onSuccess={() => {
              setTimeout(() => router.replace('/home'), 100);
            }} />
            
            <p className="mt-6 text-center text-sm text-crwn-text-secondary">
              Already have an account?{' '}
              <a href="/login" className="text-crwn-gold hover:underline">
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
