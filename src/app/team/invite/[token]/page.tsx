'use client';

import { useEffect, useState, use as usePromise } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, Users } from 'lucide-react';

// Email-invite landing. If the invitee isn't signed in, prompt signup/login
// (preserving the token). Once signed in, bind the deal to their account and
// send them to the deal.
export default function TeamInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = usePromise(params);
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [binding, setBinding] = useState(false);

  useEffect(() => {
    if (isLoading || !user) return;
    setBinding(true);
    fetch('/api/team-splits/accept-invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
      .then((r) => r.json())
      .then((data) => {
        if (data.dealId) router.replace(`/team/${data.dealId}`);
        else setError(data.error || 'This invite could not be found.');
      })
      .catch(() => setError('Something went wrong.'))
      .finally(() => setBinding(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, token]);

  if (isLoading || binding) {
    return <div className="flex justify-center py-24"><Loader2 className="w-7 h-7 text-crwn-gold animate-spin" /></div>;
  }

  if (!user) {
    const next = encodeURIComponent(`/team/invite/${token}`);
    return (
      <div className="max-w-sm mx-auto px-4 py-20 text-center page-fade-in">
        <Users className="w-12 h-12 text-crwn-gold/40 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-crwn-text mb-1">You’ve got a Team Split invite</h1>
        <p className="text-sm text-crwn-text-secondary mb-6">Sign in or create a free CRWN account to review the deal and get paid.</p>
        <div className="space-y-2">
          <button onClick={() => router.push(`/signup?next=${next}`)} className="w-full bg-crwn-gold text-crwn-bg font-semibold py-3 rounded-full">Create account</button>
          <button onClick={() => router.push(`/login?next=${next}`)} className="w-full bg-crwn-card text-crwn-text py-3 rounded-full">I already have an account</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-20 text-center">
      <p className="text-crwn-text-secondary">{error || 'Loading your deal…'}</p>
    </div>
  );
}
