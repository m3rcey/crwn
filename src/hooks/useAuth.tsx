'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, AuthError } from '@supabase/supabase-js';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { markDeviceDnt } from '@/lib/analytics/doNotTrack';

type UserRole = 'fan' | 'artist' | 'admin';

interface Profile {
  id: string;
  role: UserRole;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  social_links: Record<string, string> | null;
  has_completed_tour?: boolean;
  phone?: string | null;
  onboarding_completed?: boolean;
  is_approved?: boolean;
  created_at: string;
}

// Redeems a pending invite code (stashed at /signup?invite=CODE) once the user is
// authenticated, so the cookie session is available to the API route. Clears the
// code on a definitive response; keeps it on a transient network error to retry.
async function redeemPendingInvite(): Promise<void> {
  if (typeof window === 'undefined') return;
  const code = localStorage.getItem('crwn_invite');
  if (!code) return;
  try {
    const res = await fetch('/api/invite/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (res.ok || (res.status >= 400 && res.status < 500)) {
      localStorage.removeItem('crwn_invite');
    }
  } catch {
    // transient — leave the code in place to retry on next load
  }
}

// Attach any lead-magnet calculator result this person completed BEFORE signing up, the moment
// their session is known. Server-side only: the route matches on their VERIFIED email and a
// token carried through signup in user_metadata — no browser storage is involved or required.
// Fire-and-forget and fully idempotent: it must never delay profile load or block auth.
function redeemPendingClaims(): void {
  if (typeof window === 'undefined') return;
  fetch('/api/lead-results/auto-claim', { method: 'POST' }).catch(() => {
    // A failed claim is inert — the email match re-runs on the next load.
  });
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  signUp: (email: string, password: string, username?: string, fullName?: string, pendingResultToken?: string, pendingNext?: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithMagicLink: (email: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: (nextPath?: string) => Promise<{ error: AuthError | null }>;
  signInWithApple: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<{ error: AuthError | null }>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  updatePassword: (password: string) => Promise<{ error: AuthError | null }>;
  isArtist: () => boolean;
  isAdmin: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createBrowserSupabaseClient();

  // Explicit column list, NOT select('*'). `profiles` carries private columns
  // (email, phone, full_name, ...) whose SELECT is revoked from the browser roles
  // by schema-phase2-profiles-column-privileges.sql, and a `*` would ask for them
  // and 42501 for every logged-in user. Add a column here only if the browser
  // genuinely needs it AND it is granted in that migration. A user's own email
  // comes from the Supabase session (`user.email`), never from this row.
  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id, role, display_name, username, avatar_url, bio, social_links, is_active, created_at, updated_at, has_completed_tour, completed_tours, onboarding_completed'
      )
      .eq('id', userId)
      .single();
    
    if (!error && data) {
      // Founder exclusion: the moment an admin profile loads in this browser, mark the DEVICE
      // as never-counted for a year. Every tracking write path checks this cookie, so the
      // founder's own browsing (any account, logged out included) stops feeding the metrics.
      if ((data as Profile).role === 'admin') markDeviceDnt();

      // Logging back in reactivates a deactivated account (the promise shown in
      // the Deactivate modal). Deactivation only flips profiles.is_active to false,
      // so the first authenticated profile load flips it back to true.
      if ((data as Profile & { is_active?: boolean }).is_active === false) {
        fetch('/api/account/reactivate', { method: 'POST' }).catch(() => {});
        setProfile({ ...(data as Profile), is_active: true } as Profile);
      } else {
        setProfile(data as Profile);
      }
    }
    setIsLoading(false);
  }, [supabase]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await redeemPendingInvite();
        redeemPendingClaims();
        fetchProfile(session.user.id);
      } else {
        setIsLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await redeemPendingInvite();
        redeemPendingClaims();
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile, supabase]);

  const signUp = async (email: string, password: string, username?: string, fullName?: string, pendingResultToken?: string, pendingNext?: string) => {
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/verify`,
        data: {
          display_name: fullName || '',
          // A calculator result token, carried into the user record so it survives email
          // verification server-side. Auto-claim reads and burns it. NOT browser storage.
          ...(pendingResultToken ? { pending_result_token: pendingResultToken } : {}),
          // A validated internal return path (e.g. an artist lead-magnet landing), so the
          // /verify page can send the fan back to what they came for. Same rail as the
          // result token: user_metadata, never browser storage, survives verification.
          ...(pendingNext ? { pending_next: pendingNext } : {}),
        },
      },
    });

    if (!error && data.user) {
      // Update profile with username and display_name
      const updates: Record<string, string> = {};
      if (username) updates.username = username.toLowerCase();
      if (fullName) updates.display_name = fullName;
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('profiles')
          .update(updates)
          .eq('id', data.user.id);
      }
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/home`,
      },
    });
    return { error };
  };

  const signInWithGoogle = async (nextPath?: string) => {
    // Honor a validated internal return path so an OAuth signup/login lands back on
    // what the person came for (e.g. a Song Lab vote landing with the carried choice),
    // instead of unconditionally dropping them on /home. Same guard shape as
    // safeLabPath in src/lib/songLab/core.ts, inlined because this is a client hook
    // and the canonical safeInternalPath lives in a server-only module. If Supabase's
    // redirect allowlist rejects the URL it falls back to the Site URL, so a bad
    // allowlist degrades to today's behavior rather than breaking sign-in.
    const isSafeInternal =
      typeof nextPath === 'string' &&
      nextPath.startsWith('/') &&
      !nextPath.startsWith('//') &&
      !nextPath.includes('\\') &&
      !nextPath.includes('://') &&
      nextPath.length <= 512;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}${isSafeInternal ? nextPath : '/home'}`,
      },
    });
    return { error };
  };

  const signInWithApple = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo: `${window.location.origin}/home`,
      },
    });
    return { error };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error };
  };

  const updatePassword = async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  const isArtist = () => profile?.role === 'artist' || profile?.role === 'admin';
  const isAdmin = () => profile?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      isLoading,
      signUp,
      signIn,
      signInWithMagicLink,
      signInWithGoogle,
      signInWithApple,
      signOut,
      resetPassword,
      updatePassword,
      isArtist,
      isAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
