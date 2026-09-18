'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
// Client-safe internal-path validator (same checks as safeRedirect's safeInternalPath;
// that module imports node:crypto and cannot ship in a client bundle).
import { safeLabPath as safeInternalPath } from '@/lib/songLab/core';
import type { EmailOtpType } from '@supabase/supabase-js';
import { Loader2, CheckCircle } from 'lucide-react';

const OTP_TYPES: readonly string[] = ['magiclink', 'signup', 'invite', 'recovery', 'email_change', 'email'];

export default function VerifyEmailPage() {
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  // The provider's own words when an exchange fails. Without this the page said only
  // "may have expired or already been used" for every cause, which is indistinguishable
  // from a misconfiguration and cost several rounds of blind guessing to diagnose.
  const [detail, setDetail] = useState<string | null>(null);
  // Where "Continue" sends them. When the code exchange succeeded (same browser),
  // they're logged in and go straight into onboarding/home. When it didn't (link
  // opened in a different browser/webview), there's no session — their email is
  // still verified, they just need to log in.
  const [next, setNext] = useState<{ href: string; label: string }>({
    href: '/login?verified=true',
    label: 'Continue to login',
  });
  // A password reset borrows this page to spend its token, but it is not an email
  // verification and must not say it was one. "Email verified. Welcome to CRWN."
  // in front of somebody who came to change their password is the page telling them
  // their problem is solved when it is not.
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let active = true;
    async function resolve() {
      try {
        // A `token_hash` link exchanges DIRECTLY for a session. It needs no PKCE
        // code-verifier, no URL fragment and no redirect allowlist, which is what makes
        // it the only hand-off that survives being opened in a browser that did not
        // request it: a different device, an email app's in-app browser, or an
        // admin-minted support link. Read from location rather than useSearchParams so
        // this page needs no Suspense boundary.
        const params = new URLSearchParams(window.location.search);
        const tokenHash = params.get('token_hash');
        const rawType = params.get('type') || 'magiclink';
        const otpType = OTP_TYPES.includes(rawType) ? rawType : 'magiclink';
        if (otpType === 'recovery' && active) setRecovery(true);

        if (tokenHash) {
          const { error: otpError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType as EmailOtpType,
          });
          if (otpError) {
            if (active) {
              setDetail(otpError.message);
              setStatus('error');
            }
            return;
          }
          // Take the single-use credential out of the address bar once it is spent, so it
          // cannot be replayed from history, a screenshot or a pasted URL.
          window.history.replaceState({}, '', '/verify');
        }

        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          if (active) {
            setDetail(error.message);
            setStatus('error');
          }
          return;
        }

        if (session) {
          // A PASSWORD RESET ends at the password form, and nowhere else.
          //
          // This page already accepted `recovery` in OTP_TYPES, so a reset link
          // verified fine and produced a session. It then fell through to the
          // onboarding router below and offered "Finish setting up" (/setup) or
          // "Go to CRWN" (/home). The person who asked to reset their password was
          // handed the signup wizard and never saw a password field, so the reset
          // was impossible to complete: the one thing they came to do was the one
          // thing this page did not offer.
          //
          // The session the recovery token just minted is exactly what
          // /reset-password waits for, so it can update the password immediately.
          // This branch comes FIRST, ahead of the preserved destination: a reset is
          // an explicit, time-boxed request, and sending them anywhere else leaves
          // the account still locked behind a password they cannot remember.
          if (otpType === 'recovery') {
            if (active) {
              setNext({ href: '/reset-password', label: 'Set a new password' });
              setStatus('success');
            }
            return;
          }
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
        // No session. Email is verified regardless, so the default (login) next is
        // right for every other type. A RESET cannot proceed without one, though:
        // /reset-password would sit there with no session and no way to save, so the
        // honest answer is a fresh link rather than a form that cannot work.
        if (!session && otpType === 'recovery' && active) {
          setNext({ href: '/forgot-password', label: 'Send me a new link' });
        }
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
            <h1 className="text-2xl font-bold text-crwn-text mb-2">
              {recovery ? 'Link confirmed' : 'Email verified'}
            </h1>
            <p className="text-crwn-text-secondary mb-6">
              {recovery
                ? 'Choose a new password and you are back in.'
                : 'You’re all set. Welcome to CRWN.'}
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
            <p className="text-crwn-text-secondary mb-4">
              The verification link may have expired or already been used.
            </p>
            {detail ? (
              <p className="text-xs text-crwn-text-secondary/70 mb-6 break-words">
                Reason: {detail}
              </p>
            ) : (
              <div className="mb-6" />
            )}
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
