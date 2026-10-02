'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ArtistTermsStatus } from '@/lib/legal/artistTerms';

/**
 * Does the signed-in account owe the artist terms? Reads `/api/artist/terms`, which decides from
 * the session and the service-role record (src/lib/legal/artistTerms.ts). `null` while loading.
 *
 * A failed read answers "nothing owed": holding someone out of the app because a request failed
 * is worse than one more visit before the gate catches them, and the gate asks again next load.
 */
export function useArtistTermsStatus(enabled: boolean) {
  const [status, setStatus] = useState<ArtistTermsStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/artist/terms', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      setStatus({ needsTerms: !!j.needsTerms, needsAddendum: !!j.needsAddendum, required: !!j.required });
    } catch {
      setStatus({ needsTerms: false, needsAddendum: false, required: false });
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return { status, refresh };
}
