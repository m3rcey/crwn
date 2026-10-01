'use client';

// The artist terms gate for the artist-tool pages that live OUTSIDE the main app shell (/build,
// /offers, /campaigns and the other bare layouts). MainShell and /setup already gate everything
// else; without this, a direct link to one of these pages let an artist work before signing.
// Same hook, same route, same screen, so there is still ONE definition of who owes the terms
// (src/lib/legal/artistTerms.ts). A fan, a signed-out visitor or an admin is never held here.

import type { ReactNode } from 'react';
import { useArtistTermsStatus } from '@/hooks/useArtistTermsStatus';
import { ArtistTermsGate } from '@/components/legal/ArtistTermsGate';

export function ArtistTermsGuard({ children }: { children: ReactNode }) {
  const { status, refresh } = useArtistTermsStatus(true);
  // Unresolved for one request: show nothing rather than the page and then yank it away.
  if (status === null) return null;
  if (status.required) return <ArtistTermsGate needsAddendum={status.needsAddendum} onAccepted={() => void refresh()} />;
  return <>{children}</>;
}
