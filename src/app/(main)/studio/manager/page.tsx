'use client';

import { useRouter } from 'next/navigation';
import { HubPage } from '@/components/layout/HubPage';
import { AiManagerCard } from '@/components/artist/AiManagerCard';
import { TAB_ROUTES } from '@/lib/dashboardRoutes';

export default function StudioManagerPage() {
  const router = useRouter();
  return (
    <HubPage
      title="Manager"
      subtitle="What to do next, and what it costs you to skip it."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and your manager starts reading your numbers."
      width="wide"
    >
      {(ctx) => (
        <AiManagerCard
          artistId={ctx.artistId}
          platformTier={ctx.platformTier}
          // The manager's action buttons still speak in old tab ids. Translate
          // them to the real routes those tabs became.
          onSwitchTab={(tab) => router.push(TAB_ROUTES[tab] ?? '/studio')}
        />
      )}
    </HubPage>
  );
}
