'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Navigation } from '@/components/layout/Navigation';
import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { ClaimRedeemer } from '@/components/lead-magnets/ClaimRedeemer';
import { PopupHost } from '@/components/popups/PopupHost';
import { ServerRoleProvider, type ServerRole } from '@/hooks/useServerRole';


// The client half of the (main) layout. `serverRole` is the role the SERVER already
// resolved for this request (see layout.tsx); it is what lets the tab bar and Home
// render the right interface in the FIRST HTML instead of painting the fan version
// and swapping half a second later, once the browser has fetched the profile row.
export default function MainShell({
  children,
  serverRole,
}: {
  children: React.ReactNode;
  serverRole: ServerRole;
}) {
  const { user, profile, isLoading } = useAuth();
  const router = useRouter();

  // BOTH gates read the DATABASE, never the useAuth context. `null` = not yet
  // resolved, which is an anti-flash state and never a reason to redirect.
  //
  // The setup gate always did (see below). The onboarding gate used to read
  // `profile.onboarding_completed` off the context, and that was an infinite
  // redirect loop for every brand-new signup who pressed "Continue as a supporter"
  // on the wizard's first screen:
  //
  //   /api/onboarding/identity sets onboarding_completed = true with the service-role
  //   client, so the ROW is true, but the context profile was fetched at login and
  //   still says false until the next token refresh. The wizard sends them to /home;
  //   this shell read the stale false and pushed them back to /setup; /setup re-read
  //   the row, saw onboarding done with no artist row, and replaced back to /home.
  //   Neither side was wrong about its own source. They just had different ones.
  //
  // The context lag is already documented right here for `role`, and the same lag
  // applies to every column on that profile. So the rule is now the whole rule: this
  // shell redirects on what the database says, and on nothing else.
  const [gate, setGate] = useState<{ needsOnboarding: boolean; needsSetup: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    async function checkGates() {
      if (isLoading || !user || !profile) return;
      // Admins (the founder) are never gated.
      if (profile.role === 'admin') {
        setGate({ needsOnboarding: false, needsSetup: false });
        return;
      }
      const supabase = createBrowserSupabaseClient();
      // Explicit single columns on both: `profiles` carries columns whose SELECT is
      // revoked from the browser roles, and one revoked column fails the WHOLE
      // statement, which would read as "no row" and gate a legitimate user forever.
      const [prof, artist] = await Promise.all([
        supabase.from('profiles').select('onboarding_completed').eq('id', user.id).maybeSingle(),
        supabase.from('artist_profiles').select('setup_completed').eq('user_id', user.id).maybeSingle(),
      ]);
      if (!active) return;
      setGate({
        // Only an explicit false gates. A failed read answers null, and holding
        // somebody in a wizard because a query failed is worse than letting them in.
        needsOnboarding: prof.data?.onboarding_completed === false,
        // No artist_profiles row → a fan, nothing to gate. Row with setup_completed
        // false → an artist mid-setup, hold them in the wizard.
        needsSetup: !!artist.data && artist.data.setup_completed === false,
      });
    }
    checkGates();
    return () => {
      active = false;
    };
  }, [user, profile, isLoading]);

  const needsOnboarding = gate?.needsOnboarding === true;
  const needsSetup = gate?.needsSetup === true;

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    // Force new signups through onboarding before they can use the app. This is the
    // single enforcement point: email signup, Google OAuth, and direct navigation all
    // land on a (main) page, so gating here catches every bypass path into the wizard.
    // Both gates now point at the same place: /setup opens on the identity screens
    // for a brand-new signup and resumes mid-wizard for an artist.
    if (needsOnboarding) {
      router.push('/setup');
      return;
    }
    // Then hold artists in the focused setup wizard until it's complete.
    if (needsSetup) {
      router.push('/setup');
    }
  }, [user, needsOnboarding, needsSetup, isLoading, router]);


  if (!isLoading && !user) {
    return null;
  }

  // Anti-flash only, and it is the ONE place the context is still read. Hold the
  // shell while the gates are unresolved for somebody the context suggests might be
  // gated: an artist (who may be mid-setup) or anyone whose cached profile says
  // onboarding is unfinished. An established fan is never delayed by this, and no
  // redirect is ever decided here, so a stale hint can only cost a frame, never a
  // wrong destination.
  const mightBeGated =
    !!profile && profile.role !== 'admin' && (profile.role === 'artist' || !profile.onboarding_completed);
  if (gate === null && mightBeGated) {
    return null;
  }
  if (needsOnboarding || needsSetup) {
    return null;
  }

  return (
    <ServerRoleProvider value={serverRole}>
    <div className="relative min-h-screen bg-transparent">
      <BackgroundImage src="/backgrounds/bg-home.jpg" />
      <Navigation />

      {/* Renders nothing. Redeems a lead-magnet result claim stranded by the signup funnel.
          Only reached once both gates above have passed, which is exactly when the artist
          has an artist_profiles row and a claim can link it. Never blocks, never redirects. */}
      <ClaimRedeemer />

      {/* Pop-up Engine. Renders nothing until admin_settings.popup_engine is on,
          and never more than one governed pop-up per user per day. */}
      <PopupHost />

      {/* Main Content - with padding for mobile nav and sidebar. The mobile nav
          is 56px tall plus its own safe-area inset, so the clearance has to
          track that inset too or the last row of content sits under it. */}
      {/* Mobile top clearance so the fixed top-left hamburger never sits over a
          page header. The hamburger bottom is ~3rem below the safe-area top, so
          content starts at 3.5rem + inset. Desktop has no floating hamburger (it
          lives in the sidebar), so md: reverts to the normal padding. */}
      <div className="relative z-10 md:pl-64 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
        <main className="p-4 md:p-8 pt-[calc(3.5rem+env(safe-area-inset-top))] md:pt-8">
          {children}
        </main>
      </div>
    </div>
    </ServerRoleProvider>
  );
}
