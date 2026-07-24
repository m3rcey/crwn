'use client';

import { useRouter } from 'next/navigation';
import { HubPage } from '@/components/layout/HubPage';
import { AnalyticsDashboard } from '@/components/artist/AnalyticsDashboard';
import { AiManagerTeaser } from '@/components/artist/AiManagerCard';

export default function StudioAnalyticsPage() {
  const router = useRouter();
  return (
    <HubPage
      title="Analytics"
      subtitle="Numbers you never look at are money you never chase."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and your plays, fans, and revenue land here."
      width="wide"
    >
      {(ctx) => (
        <>
          <AiManagerTeaser artistId={ctx.artistId} onNavigate={() => router.push('/studio/manager')} />
          <AnalyticsDashboard platformTier={ctx.platformTier} />
        </>
      )}
    </HubPage>
  );
}
