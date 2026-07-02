'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

export type SetupStepKey = 'profile' | 'monetize' | 'music' | 'shop';

export interface SetupStep {
  key: SetupStepKey;
  label: string;
  required: boolean;
  done: boolean;
}

export interface ArtistSetupState {
  loading: boolean;
  isArtist: boolean;
  artistId: string | null;
  slug: string;
  setupCompleted: boolean;
  steps: SetupStep[];
  stripeConnected: boolean;
  allRequiredDone: boolean;
  refresh: () => Promise<void>;
  markComplete: () => Promise<void>;
}

/**
 * Single source of truth for the artist setup wizard (/setup).
 *
 * Step completion is DERIVED from real data, never stored per-step:
 *  - profile  : has an avatar (profiles.avatar_url) AND a tagline
 *  - monetize : >=1 active subscription tier
 *  - music    : >=1 track
 *  - shop     : >=1 product
 *
 * `setup_completed` (artist_profiles) only records that the artist reached the
 * end of the wizard once, so the hard gate can release them.
 */
export function useArtistSetup(): ArtistSetupState {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [setupCompleted, setSetupCompleted] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [hasMusic, setHasMusic] = useState(false);
  const [hasTier, setHasTier] = useState(false);
  const [hasProduct, setHasProduct] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [isArtist, setIsArtist] = useState(false);

  // Cheap, DB-only refresh — this is what the wizard polls to unlock "Continue"
  // the moment a step is satisfied. Everything is read from the DB, NOT the
  // useAuth context: (a) avatar_url so an avatar just uploaded in the wizard is
  // detected immediately, and (b) artist status. The context's `profile.role`
  // lags — right after /welcome flips fan→artist it's still 'fan' until the next
  // token refresh — so we treat "has an artist_profiles row (or role=artist)" as
  // the fresh source of truth. Deriving isArtist from stale context would bounce
  // a brand-new artist out of /setup and into a redirect loop.
  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const [artistRes, profileRes] = await Promise.all([
      supabase
        .from('artist_profiles')
        .select('id, slug, tagline, setup_completed')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('profiles').select('avatar_url, role').eq('id', user.id).maybeSingle(),
    ]);

    const ap = artistRes.data;
    setIsArtist(!!ap || profileRes.data?.role === 'artist');

    if (!ap) {
      setLoading(false);
      return;
    }

    setArtistId(ap.id);
    setSlug(ap.slug || '');
    setSetupCompleted(!!ap.setup_completed);

    // Profile is "done" when it has both a face and a tagline — the two things
    // that make a shared link worth clicking.
    setHasProfile(!!profileRes.data?.avatar_url && !!(ap.tagline && ap.tagline.trim()));

    const [tracks, tiers, products] = await Promise.all([
      supabase.from('tracks').select('id', { count: 'exact', head: true }).eq('artist_id', ap.id),
      supabase
        .from('subscription_tiers')
        .select('id', { count: 'exact', head: true })
        .eq('artist_id', ap.id)
        .eq('is_active', true),
      supabase.from('products').select('id', { count: 'exact', head: true }).eq('artist_id', ap.id),
    ]);

    setHasMusic((tracks.count ?? 0) > 0);
    setHasTier((tiers.count ?? 0) > 0);
    setHasProduct((products.count ?? 0) > 0);
    setLoading(false);
  }, [user, supabase]);

  // Stripe status is only a cosmetic note on the Monetize step, so fetch it once
  // on mount rather than on every poll — it doesn't gate any step. Guard on `user`
  // only (not isArtist, which is set asynchronously by load()); the endpoint is a
  // no-op for non-artists.
  const loadStripe = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/stripe/connect/status');
      if (res.ok) {
        const d = await res.json();
        setStripeConnected(!!d.chargesEnabled);
      }
    } catch {
      /* ignore — Stripe is skippable in the wizard */
    }
  }, [user]);

  useEffect(() => {
    load();
    loadStripe();
  }, [load, loadStripe]);

  const markComplete = useCallback(async () => {
    if (!user) return;
    await supabase.from('artist_profiles').update({ setup_completed: true }).eq('user_id', user.id);
    setSetupCompleted(true);
  }, [user, supabase]);

  const steps: SetupStep[] = [
    { key: 'profile', label: 'Profile', required: true, done: hasProfile },
    { key: 'monetize', label: 'Monetize', required: false, done: hasTier },
    { key: 'music', label: 'Music', required: true, done: hasMusic },
    { key: 'shop', label: 'Shop', required: false, done: hasProduct },
  ];

  const allRequiredDone = steps.filter((s) => s.required).every((s) => s.done);

  return {
    loading,
    isArtist: !!isArtist,
    artistId,
    slug,
    setupCompleted,
    steps,
    stripeConnected,
    allRequiredDone,
    refresh: load,
    markComplete,
  };
}
