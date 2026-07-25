'use client';

// The claim page.
//
// It does almost nothing, which is the point. All it does is: make sure you are logged in,
// then POST the token to a server route that checks your session for itself.
//
// No decision of consequence is made in this file. A hostile user can rewrite every line of
// it in their browser and still not claim a result that is not theirs, because the server
// route derives the user from the session cookie and never trusts anything sent from here.

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export default function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [status, setStatus] = useState<'checking' | 'claiming' | 'error'>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        // Send them through the EXISTING auth flow. We do not invent a second way to make an
        // account, and we do not bypass Supabase email verification.
        //
        // The token now survives the funnel SERVER-SIDE: /signup?token= carries it into the new
        // user record (Supabase user_metadata), and auto-claim reads + burns it on first login.
        // We still stash it in localStorage as a belt-and-suspenders fallback for the specific
        // case where they finish signup on this same device; the durable path is the query param
        // plus the verified-email match, neither of which depends on this browser.
        localStorage.setItem('crwn_claim', token);
        router.push(`/signup?token=${encodeURIComponent(token)}&next=${encodeURIComponent(`/claim/${token}`)}`);
        return;
      }

      setStatus('claiming');

      const res = await fetch(`/api/lead-results/${encodeURIComponent(token)}/claim`, {
        method: 'POST',
      });
      const json = await res.json();

      if (cancelled) return;

      if (!res.ok || !json.ok) {
        setStatus('error');
        setMessage(json.error || 'This link cannot be claimed.');
        return;
      }

      // router.push, never window.location.href: it preserves the audio player (CLAUDE.md).
      router.push(json.redirect || '/profile/artist');
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  return (
    <main className="min-h-screen bg-crwn-bg text-white flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        {status === 'error' ? (
          <>
            <h1 className="text-2xl font-semibold mb-3">We could not save this one</h1>
            <p className="text-white/60 mb-8">{message}</p>
            <button
              onClick={() => router.push('/tools')}
              className="bg-[#D4AF37] text-black font-semibold px-6 py-3 rounded-full"
            >
              Run your numbers again
            </button>
          </>
        ) : (
          <>
            <div className="w-10 h-10 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin mx-auto mb-6" />
            <p className="text-white/60">
              {status === 'checking' ? 'One second.' : 'Saving your result.'}
            </p>
          </>
        )}
      </div>
    </main>
  );
}
