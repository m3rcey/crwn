'use client';

import { useState } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePlayer } from '@/hooks/usePlayer';

/**
 * The escape hatch on the setup wizard.
 *
 * `/setup` is a HARD GATE: the (main) shell bounces any account with
 * `onboarding_completed = false`, or any artist with `setup_completed = false`,
 * straight back here, and the wizard renders no nav of its own. Until this bar
 * existed the only way out was the "Not an artist? Continue as a supporter"
 * button, which lives on the FIRST screen only. Anyone past it who had signed up
 * on the wrong account, or who found a shared device still signed in, had no way
 * to leave short of clearing cookies.
 *
 * ONE action, on purpose. Switching accounts and signing out are the same
 * movement here: signing out lands on /login, which is where another account is
 * entered and where a new one is created. Two buttons calling one handler would
 * be a lie of choice, so the identity is shown instead (that is what makes a
 * wrong account discoverable) and the single action is labelled for both jobs.
 */
export function SetupAccountBar({ className = '' }: { className?: string }) {
  const { user, signOut } = useAuth();
  const { resetPlayer } = usePlayer();
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    if (busy) return;
    setBusy(true);
    resetPlayer();
    await signOut();
    // A full navigation, not router.push: every provider above this tree is
    // still holding state for the account being left. Same pattern as AccountHub.
    window.location.href = '/login';
  };

  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <p className="text-[11px] text-crwn-text-secondary/70 truncate min-w-0">
        {user?.email ? (
          <>
            Signed in as <span className="text-crwn-text-secondary">{user.email}</span>
          </>
        ) : (
          'Signed in'
        )}
      </p>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={busy}
        aria-label="Sign out and use a different account"
        title="Sign out and use a different account"
        className="inline-flex items-center gap-1.5 flex-shrink-0 rounded-full px-2 py-1 -mr-2 text-[11px] font-medium text-crwn-text-secondary hover:text-crwn-text disabled:opacity-40 transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  );
}
