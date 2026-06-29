'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const REFERRAL_KEY = 'crwn_ref';
const SOURCE_KEY = 'crwn_ref_src';

/**
 * Persists the ?ref= (and ?src=) query params into sessionStorage so they survive
 * navigation across pages (e.g. from a shared track page to subscribe). ?src marks
 * whether the link came from a clipper vs an ordinary fan referrer.
 */
export function ReferralPersist() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      sessionStorage.setItem(REFERRAL_KEY, ref);
    }
    const src = searchParams.get('src');
    if (src) {
      sessionStorage.setItem(SOURCE_KEY, src);
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

/** Read the persisted attribution source ('clipper' | ''). URL param takes priority. */
export function getPersistedAttributionSource(urlSrc: string): string {
  if (urlSrc) return urlSrc;
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem(SOURCE_KEY) || '';
}
