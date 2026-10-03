import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { shareMetadata } from '@/lib/shareMetadata';
import { creditsPath } from '@/lib/projectCredits/credits';
import { loadCreditsProject } from '@/lib/projectCredits/server';
import { CreditsOffer } from '@/components/credits/CreditsOffer';

// The public project-credits page: /<artist>/credits/<project>. Read on the service role through
// loadCreditsProject, which projects names only for fans who opted in (src/lib/projectCredits).

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string; project: string }>;
}

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, project } = await params;
  const data = await loadCreditsProject(admin(), slug, project);
  if (!data) return { title: 'Not Found | CRWN' };
  return shareMetadata({
    title: `Get credited on ${data.album.title}`,
    description: `${data.artist.name} is putting the names of the people who backed ${data.album.title} in its credits.`,
    path: creditsPath(data.artist.slug, data.album.title),
    image: data.album.artUrl,
  });
}

export default async function CreditsPage({ params }: Props) {
  const { slug, project } = await params;
  const data = await loadCreditsProject(admin(), slug, project);
  if (!data) notFound();
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0D0D0D]" />}>
      <CreditsOffer
        artist={{ slug: data.artist.slug, name: data.artist.name }}
        album={data.album}
        offers={data.offers}
        credits={data.credits}
        path={creditsPath(data.artist.slug, data.album.title)}
        sessionLabel={data.sessionLabel}
      />
    </Suspense>
  );
}
