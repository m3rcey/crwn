'use client';

import { useState, useEffect } from 'react';
import { TIER_LIMITS_V2 } from '@/lib/platformTier';

interface PlatformLimits {
  tier: string;
  limits: {
    tracks: number;
    fanTiers: number;
    members: number;
    bundles: boolean;
    scheduling: boolean;
    liveQA: boolean;
    analytics: string;
    artistProfiles: number;
    apiAccess: boolean;
  };
  usage: {
    tracks: number;
    fanTiers: number;
  };
  loading: boolean;
}

// Pre-fetch defaults mirror the real Launch limits from the source of truth. A private
// copy here once drifted to 10 tracks / 1 fan tier and rendered wrong caps before the
// fetch resolved.
const defaultLimits: PlatformLimits = {
  tier: 'starter',
  limits: { ...TIER_LIMITS_V2.starter },
  usage: { tracks: 0, fanTiers: 0 },
  loading: true,
};

export function usePlatformLimits(artistId: string | null): PlatformLimits {
  const [data, setData] = useState<PlatformLimits>(defaultLimits);

  useEffect(() => {
    if (!artistId) {
      setData(defaultLimits);
      return;
    }

    fetch(`/api/platform/limits?artistId=${artistId}`)
      .then(res => res.json())
      .then(result => {
        if (result.error) {
          console.error('Failed to fetch platform limits:', result.error);
          setData(defaultLimits);
          return;
        }
        setData({
          tier: result.tier,
          limits: result.limits,
          usage: result.usage,
          loading: false,
        });
      })
      .catch(err => {
        console.error('Error fetching platform limits:', err);
        setData(defaultLimits);
      });
  }, [artistId]);

  return data;
}
