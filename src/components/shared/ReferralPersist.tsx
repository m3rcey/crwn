'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const REFERRAL_KEY = 'crwn_ref';
const SOURCE_KEY = 'crwn_ref_src';
// 30-day attribution window
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function setCookie(name: string, value: string) {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

function getCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const row = document.cookie
    .split('; ')
    .find((part) => part.startsWith(name + '='));
  return row ? decodeURIComponent(row.slice(name.length + 1)) : '';
}

/**
 * Persists the ?ref= (and ?src=) query params into a first-party cookie
 * (30-day max-age) so they survive navigation across pages AND new tabs /
 * browser restarts (sessionStorage did not). ?src marks whether the link
 * came from a clipper vs an ordinary fan referrer.
 */
export function ReferralPersist() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      setCookie(REFERRAL_KEY, ref);
    }
    const src = searchParams.get('src');
    if (src) {
      setCookie(SOURCE_KEY, src);
    }
  }, [searchParams]);

  return null;
}

/** Read the persisted referral code (URL param takes priority). */
export function getPersistedReferralCode(urlRef: string): string {
  if (urlRef) return urlRef;
  if (typeof document === 'undefined') return '';
  // Legacy fallback: sessions that stored the code before the cookie switch.
  return getCookie(REFERRAL_KEY) || sessionStorage.getItem(REFERRAL_KEY) || '';
}

/** Read the persisted attribution source ('clipper' | ''). URL param takes priority. */
export function getPersistedAttributionSource(urlSrc: string): string {
  if (urlSrc) return urlSrc;
  if (typeof document === 'undefined') return '';
  return getCookie(SOURCE_KEY) || sessionStorage.getItem(SOURCE_KEY) || '';
}
