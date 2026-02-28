'use client';

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

type AccessLevel = 'free' | 'subscriber' | 'purchase';

interface ContentAccess {
  canAccess: boolean;
  isPreview: boolean;
  accessLevel: AccessLevel;
  requiresSubscription: boolean;
  isLoading: boolean;
}

export function useContentAccess(
  artistId: string | null,
  contentAccessLevel: AccessLevel = 'free'
): ContentAccess {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [access, setAccess] = useState<ContentAccess>({
    canAccess: contentAccessLevel === 'free',
    isPreview: false,
    accessLevel: contentAccessLevel,
    requiresSubscription: contentAccessLevel !== 'free',
    isLoading: contentAccessLevel !== 'free',
  });

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      // Free content is always accessible
      if (contentAccessLevel === 'free') {
        if (!cancelled) {
          setAccess({
            canAccess: true,
            isPreview: false,
            accessLevel: 'free',
            requiresSubscription: false,
            isLoading: false,
          });
        }
        return;
      }

      // Not logged in = preview only for non-free content
      if (!user || !artistId) {
        if (!cancelled) {
          setAccess({
            canAccess: false,
            isPreview: true,
            accessLevel: contentAccessLevel,
            requiresSubscription: true,
            isLoading: false,
          });
        }
        return;
      }

      // Check subscription
      const { data } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('fan_id', user.id)
        .eq('artist_id', artistId)
        .eq('status', 'active')
        .gt('current_period_end', new Date().toISOString())
        .maybeSingle();

      if (!cancelled) {
        const hasActiveSubscription = !!data;
        setAccess({
          canAccess: hasActiveSubscription,
          isPreview: !hasActiveSubscription,
          accessLevel: contentAccessLevel,
          requiresSubscription: !hasActiveSubscription,
          isLoading: false,
        });
      }
    }

    checkAccess();

    return () => {
      cancelled = true;
    };
  }, [user, artistId, contentAccessLevel, supabase]);

  return access;
}

// Helper to determine if content should be shown as preview
export function shouldShowPreview(
  accessLevel: AccessLevel,
  hasSubscription: boolean
): boolean {
  if (accessLevel === 'free') return false;
  return !hasSubscription;
}

// Helper to get preview duration (in seconds)
export function getPreviewDuration(accessLevel: AccessLevel): number | null {
  if (accessLevel === 'free') return null;
  return 30; // 30-second preview for locked content
}
