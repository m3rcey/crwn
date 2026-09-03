'use client';

// useGuidedEntry: the context a Rise Mode quest hands a guided flow, read from the URL.
//
// Every value here is a POINTER, never authority. `?tier=` and `?funnel=` are matched by the
// flow against rows it already loaded for the signed-in artist; a foreign id selects nothing.
// `?returnTo=` is the same-site path Rise Mode expects the artist back on (CLAUDE.md: a flow
// launched from Rise Mode returns to Rise Mode), validated the way withReturnTo validates it.
// This replaces the four hand-rolled returnTo readers that existed before it.

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { RISE_MODE_PATH, safeSitePath } from '@/lib/guidedSetup/flows';

export interface GuidedEntry {
  /** Where the flow's exit, X and success all go. */
  returnTo: string;
  /** A tier the quest was about, if any. Match it against tiers you loaded; never trust it. */
  tierId: string | null;
  /** A funnel row the quest was about, if any. Same rule. */
  funnelId: string | null;
  /** True when the flow was opened from Rise Mode (returnTo names it). */
  fromRise: boolean;
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const idOrNull = (v: string | null) => (v && ID_RE.test(v) ? v : null);

export function useGuidedEntry(): GuidedEntry {
  const params = useSearchParams();
  return useMemo(() => {
    const returnTo = safeSitePath(params?.get('returnTo'), RISE_MODE_PATH);
    return {
      returnTo,
      tierId: idOrNull(params?.get('tier') ?? null),
      funnelId: idOrNull(params?.get('funnel') ?? null),
      fromRise: returnTo.startsWith(RISE_MODE_PATH),
    };
  }, [params]);
}
