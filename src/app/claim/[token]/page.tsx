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
        // KNOWN LIMITATION, deliberately not patched here: /signup ignores ?next and always
        // routes to /welcome (and with email confirmation on, via /verify first). So the
        // token does not survive the funnel automatically. We stash it the same way the repo
        // already stashes crwn_recruiter and crwn_invite, and the artist claims on their next
        // visit to the result link (which they still have, in the DM and the email).
        //
        // Auto-redemption after signup means touching /welcome or useAuth, which are the two
        // files that broke onboarding silently for months. That is a phase-2 change with its
        // own testing, not a footnote to this one.
        localStorage.setItem('crwn_claim', token);
        router.push(`/signup?next=${encodeURIComponent(`/claim/${token}`)}`);
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
