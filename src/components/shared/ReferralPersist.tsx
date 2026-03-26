'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const REFERRAL_KEY = 'crwn_ref';

/**
 * Persists the ?ref= query param into sessionStorage so it survives
 * navigation across pages (e.g. from a shared track page to subscribe).
 */
export function ReferralPersist() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      sessionStorage.setItem(REFERRAL_KEY, ref);
    }
  }, [searchParams]);

  return null;
}

/** Read the persisted referral code (URL param takes priority). */
export function getPersistedReferralCode(urlRef: string): string {
  if (urlRef) return urlRef;
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(REFERRAL_KEY) || '';
}
