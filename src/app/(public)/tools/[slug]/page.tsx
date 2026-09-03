import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLeadMagnet, LEAD_MAGNET_SLUGS } from '@/lib/leadMagnets/registry';
import { shareTitle } from '@/lib/shareMetadata';
import { PublicToolClient } from '@/components/lead-magnets/PublicToolClient';

interface Props {
  params: Promise<{ slug: string }>;
}

// Public tool shells are safe to prerender (no owned data is fetched server-side).
export function generateStaticParams() {
  return LEAD_MAGNET_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const config = getLeadMagnet(slug);
  if (!config) return { title: 'Tool Not Found | CRWN' };
  // Under 40 characters: a link preview truncates past roughly that, and the site name
  // already rides along in openGraph.siteName.
  const title = shareTitle(config.name);
  return {
    title,
    description: config.description,
    openGraph: {
      title,
      description: config.hero.subheadline,
      siteName: 'CRWN',
      url: config.publicRoute,
    },
    twitter: { card: 'summary_large_image', title, description: config.description },
  };
}

export default async function PublicToolPage({ params }: Props) {
  const { slug } = await params;
  const config = getLeadMagnet(slug);
  if (!config) notFound();
  return <PublicToolClient config={config} />;
}
