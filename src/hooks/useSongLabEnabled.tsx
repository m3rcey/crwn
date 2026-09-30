'use client';

// Is Song Lab switched on for the SIGNED-IN artist? The ONE client-side reader of that fact.
//
// WHY A HOOK AND NOT A COLUMN READ. `artist_profiles.song_lab_enabled` is a server-only column
// with no grant to anon or authenticated, exactly like `launch_partner`. Naming it from a browser
// client does not return a row with the field missing: it fails the WHOLE statement with
// `42501 permission denied for table artist_profiles` (probed 2026-09-30), so a component that
// added it to an existing select would silently break everything else that select was reading.
// The capability therefore has to arrive from the server, and `GET /api/song-lab/artist` already
// answers exactly this question behind `requireSongLabArtist`, returning `{ enabled: false }` for
// a fan, a non-enabled artist and a pre-migration database alike.
//
// WHY MODULE-CACHED. Two surfaces ask (the Studio grid and the AccountHub index) and they can be
// mounted together, so the answer is fetched once per page load and shared. One in-flight promise,
// not one per caller.
//
// FAILS CLOSED. Any error, any non-OK response, any shape surprise reads as false, so a hiccup
// hides an entry point rather than showing an artist a tool they do not have.

import { useEffect, useState } from 'react';

let cached: boolean | null = null;
let inFlight: Promise<boolean> | null = null;

async function readEnabled(): Promise<boolean> {
  try {
    const res = await fetch('/api/song-lab/artist', { cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return data?.enabled === true;
  } catch {
    return false;
  }
}

/** Reset between accounts. Called on sign-out so a new session never inherits the last answer. */
export function clearSongLabEnabledCache() {
  cached = null;
  inFlight = null;
}

export function useSongLabEnabled(): boolean {
  const [enabled, setEnabled] = useState<boolean>(cached ?? false);

  useEffect(() => {
    let alive = true;
    if (cached !== null) {
      setEnabled(cached);
      return () => { alive = false; };
    }
    inFlight = inFlight ?? readEnabled();
    inFlight.then((value) => {
      cached = value;
      inFlight = null;
      if (alive) setEnabled(value);
    });
    return () => { alive = false; };
  }, []);

  return enabled;
}
