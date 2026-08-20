'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
// Client-safe internal-path validator (same checks as safeRedirect's safeInternalPath;
// that module imports node:crypto and cannot ship in a client bundle).
import { safeLabPath as safeInternalPath } from '@/lib/songLab/core';
import { Loader2, CheckCircle } from 'lucide-react';

export default function VerifyEmailPage() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  // Where "Continue" sends them. When the code exchange succeeded (same browser),
  // they're logged in and go straight into onboarding/home. When it didn't (link
  // opened in a different browser/webview), there's no session — their email is
  // still verified, they just need to log in.
  const [next, setNext] = useState<{ href: string; label: string }>({
    href: '/login?verified=true',
    label: 'Continue to login',
  });

  useEffect(() => {
    let active = true;
    async function resolve() {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          if (active) setStatus('error');
          return;
        }

        if (session) {
          // A preserved destination (a fan claiming an artist offer) wins: it rode
          // user_metadata through verification exactly like pending_result_token, and
          // it is re-validated here before use.
          const pendingNext = safeInternalPath(
            (session.user.user_metadata as Record<string, unknown> | null)?.pending_next
          );
          if (pendingNext) {
            if (active) setNext({ href: pendingNext, label: 'Continue' });
          } else {
            // Logged in. Route by onboarding state, same as the login page does.
            const { data: profile } = await supabase
              .from('profiles')
              .select('onboarding_completed')
              .eq('id', session.user.id)
              .single();
            if (!active) return;
            setNext(
              profile?.onboarding_completed
                ? { href: '/home', label: 'Go to CRWN' }
                : { href: '/setup', label: 'Finish setting up' }
            );
          }
        }
        // No session: keep the default (login) next. Email is verified regardless.
        if (active) setStatus('success');
      } catch {
        if (active) setStatus('error');
      }
    }
    resolve();
    return () => {
      active = false;
    };
  }, [supabase]);

  return (
    <div className="min-h-screen bg-crwn-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {status === 'loading' ? (
          <>
            <Loader2 className="w-16 h-16 text-crwn-gold animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-crwn-text mb-2">Verifying...</h1>
            <p className="text-crwn-text-secondary">Please wait while we confirm your email.</p>
          </>
        ) : status === 'success' ? (
          <>
            <div className="w-16 h-16 bg-crwn-gold/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-crwn-gold" />
            </div>
            <h1 className="text-2xl font-bold text-crwn-text mb-2">Email verified</h1>
            <p className="text-crwn-text-secondary mb-6">
              You&apos;re all set. Welcome to CRWN.
            </p>
            <button
              onClick={() => router.push(next.href)}
              className="px-6 py-3 bg-crwn-gold text-crwn-bg rounded-full font-semibold hover:bg-crwn-gold/90 transition-colors"
            >
              {next.label}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-crwn-text mb-2">Verification failed</h1>
            <p className="text-crwn-text-secondary mb-6">
              The verification link may have expired or already been used.
            </p>
            <button
              onClick={() => router.push('/login')}
              className="px-6 py-3 bg-crwn-gold text-crwn-bg rounded-full font-semibold hover:bg-crwn-gold/90 transition-colors"
            >
              Back to login
            </button>
          </>
        )}
      </div>
    </div>
  );
}
