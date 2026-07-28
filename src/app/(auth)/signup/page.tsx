'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { useAuth } from '@/hooks/useAuth';
import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { getDeliverableSpec } from '@/lib/opportunityDrafts/deliverableSpecs';
import { DraftContinuation } from '@/components/opportunity/DraftContinuation';

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const recruiterCode = searchParams.get('recruiter');
  const inviteCode = searchParams.get('invite');
  // A lead-magnet result token from the emailed CTA (?result=) or a /claim redirect (?token=).
  // Carried into the new user record via signUp options.data, NOT localStorage, so it survives
  // email verification server-side and auto-claim can attach the result on first login.
  const pendingResultToken = searchParams.get('result') || searchParams.get('token') || undefined;
  // Arrived from a tool's save boundary: say WHAT they are saving, in that builder's own words, so
  // the account ask reads as "save what you already built". Read-only; changes no auth behavior.
  const signupContext = getDeliverableSpec(searchParams.get('tool') || '')?.signupContext;

  useEffect(() => {
    if (recruiterCode) {
      localStorage.setItem('crwn_recruiter', recruiterCode);
    }
    if (inviteCode) {
      // Redeemed automatically once the user is authenticated (see useAuth).
      localStorage.setItem('crwn_invite', inviteCode);
    }
  }, [recruiterCode, inviteCode]);
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
      <div className={`relative z-10 min-h-screen flex flex-col items-center p-4 ${signupContext ? "justify-start pt-6" : "justify-center"}`}>
        <div className="w-full max-w-md page-fade-in">
          <div className={`text-center ${signupContext ? 'mb-4' : 'mb-8'}`}>
            <h1 className={`font-bold text-crwn-gold ${signupContext ? 'text-2xl mb-0.5' : 'text-4xl mb-2'}`}>CRWN</h1>
            {!signupContext && <p className="text-crwn-text-secondary">Create your account</p>}
          </div>

          {pendingResultToken ? (
            <DraftContinuation token={pendingResultToken} />
          ) : (
            signupContext && (
              <div className="mb-6 rounded-2xl border border-crwn-gold/30 bg-crwn-gold/[0.06] p-4 text-center">
                <p className="text-sm text-crwn-text">{signupContext}</p>
                <p className="text-xs text-crwn-text-secondary mt-1">Your draft is already saved and waiting.</p>
              </div>
            )
          )}

          <div className={`neu-raised ${signupContext ? 'p-5' : 'p-8'}`}>
            <h2 className={`text-xl font-semibold text-crwn-text text-center ${signupContext ? 'mb-4' : 'mb-6'}`}>Sign Up</h2>
            <AuthForm mode="signup" pendingResultToken={pendingResultToken} onSignupComplete={() => setJustSignedUp(true)} onSuccess={() => {
              // New signups go into onboarding, not the feed. (Only reached when email
              // confirmation is off and signUp returns an immediate session.)
              setTimeout(() => router.replace('/welcome'), 100);
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
