'use client';

import { HubPage } from '@/components/layout/HubPage';
import { TestimonialLibrary } from '@/components/artist/TestimonialLibrary';

export default function StudioTestimonialsPage() {
  return (
    <HubPage
      title="Fan proof"
      subtitle="What your supporters actually said, in their words. You choose which ones go on your page."
      fallback="/studio"
      requireArtist
      artistOnlyMessage="Publish your artist page and this becomes where proof from your supporters collects."
      width="wide"
    >
      <TestimonialLibrary />
    </HubPage>
  );
}
