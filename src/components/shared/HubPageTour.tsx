'use client';

// F-13: first-visit page tour + replay control for hub screens. Mount this INSIDE the
// gated content (HubPage children or below a page's own auth gate), so the tour can only
// start once the real screen is actually visible, never over a spinner or an access wall.
// Persistence rides the existing completed_tours machinery keyed by tourId.

import type { DriveStep } from 'driver.js';
import { useAuth } from '@/hooks/useAuth';
import { usePageTour } from '@/hooks/usePageTour';
import { TourReplayButton } from '@/components/shared/TourReplayButton';

interface HubPageTourProps {
  tourId: string;
  steps: DriveStep[];
}

export function HubPageTour({ tourId, steps }: HubPageTourProps) {
  const { user, isLoading } = useAuth();
  const { replay } = usePageTour({ tourId, steps, userId: user?.id, enabled: !isLoading });
  return <TourReplayButton onClick={replay} />;
}
