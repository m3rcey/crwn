'use client';

// /preview — one stable link to "my page, as a fan sees it".
//
// The preview itself is `/${slug}?preview=visitor` (src/hooks/useArtistPreview.tsx), which every
// surface that knows the artist's slug can link directly. Nothing else does: a pop-up definition,
// an email template and a tour step all have to name a destination without ever having read the
// artist's row. Before this route they hardcoded /profile/artist and relied on a "View as fan"
// pill sitting there, so removing that pill from Rise Mode on 2026-08-13 quietly broke the
// `announce_fan_preview` pop-up's call to action.
//
// This resolves the slug from the SESSION (useArtistContext, module-cached) and replaces. It adds
// no capability: the owner preview is still owner-only by construction, and a viewer with no
// artist row is sent home rather than shown anyone else's page.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useArtistContext } from '@/hooks/useArtistContext';

export default function PreviewRedirectPage() {
  const router = useRouter();
  const { status, context } = useArtistContext();

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'artist' && context?.slug) {
      router.replace(`/${context.slug}?preview=visitor`);
      return;
    }
    router.replace('/home');
  }, [status, context, router]);

  return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      <span className="sr-only">Opening your page as a fan sees it</span>
    </div>
  );
}
