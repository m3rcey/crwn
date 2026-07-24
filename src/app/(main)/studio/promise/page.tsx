'use client';

import { HubPage } from '@/components/layout/HubPage';
import { PromiseCalendar } from '@/components/artist/PromiseCalendar';

export default function StudioPromisePage() {
  return (
    <HubPage
      title="Promise Calendar"
      subtitle="A benefit you promised and never delivered is the reason members cancel."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and this becomes how you keep every promise you sold."
      width="wide"
    >
      <PromiseCalendar />
    </HubPage>
  );
}
