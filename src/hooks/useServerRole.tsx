'use client';

import { createContext, useContext } from 'react';

// The role the SERVER resolved for this request, threaded into the (main) client
// tree by `src/app/(main)/layout.tsx`.
//
// THE PROBLEM THIS EXISTS FOR. `useAuth` learns the role over the network: the
// browser resolves the session, then reads `profiles`. Until both land, `profile`
// is null and `isArtist()` answers false. Every consumer treated that as "fan", so
// an artist's first paint was the FAN interface (a two-slot tab bar instead of
// three, Home without Studio, Supporter Mode where Rise belongs), which swapped to
// the artist interface once the round trips finished. Unknown is not fan.
//
// A client-side cache could not fix it. The server already renders this HTML with
// `profile` null, so the fan-shaped markup is painted before any JavaScript runs.
// Only the server knowing the role removes the flash, which is why it is read
// there and passed down as a prop.
//
// IT IS A RENDERING HINT AND MAY NEVER BECOME AUTHORITY. It decides which nav
// items and which quick-action tiles are drawn, nothing more. Every gate keeps
// reading what it read before: the setup gate reads the `artist_profiles` row,
// AccountHub reads `hasArtistRow`, and access control lives in RLS and the API
// routes. `null` means "the server had no answer" (signed out, or the read
// failed), which correctly falls back to the old client-side behavior.
export type ServerRole = 'fan' | 'artist' | 'admin' | null;

const ServerRoleContext = createContext<ServerRole>(null);

export function ServerRoleProvider({
  value,
  children,
}: {
  value: ServerRole;
  children: React.ReactNode;
}) {
  return <ServerRoleContext.Provider value={value}>{children}</ServerRoleContext.Provider>;
}

// Outside the (main) tree this returns null, which is the same answer as "not
// resolved" and leaves every caller on its existing client-side path.
export function useServerRole(): ServerRole {
  return useContext(ServerRoleContext);
}

// "Should this render the artist interface?" — the ONE question the three chrome
// surfaces ask. The server answer wins when it exists, because it is available a
// paint earlier; otherwise this is exactly the old `isArtist()` check.
export function useShowArtistUI(clientIsArtist: boolean): boolean {
  const serverRole = useServerRole();
  if (serverRole) return serverRole === 'artist' || serverRole === 'admin';
  return clientIsArtist;
}
