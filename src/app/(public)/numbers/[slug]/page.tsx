import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { shareMetadata } from '@/lib/shareMetadata';
import { PROSPECT_LINKS, PROSPECT_TOOL_SLUG, getProspectLink, prospectSearch } from '@/lib/prospectLinks';
import { PublicToolClient } from '@/components/lead-magnets/PublicToolClient';

// One named result page per artist the founder is talking to (src/lib/prospectLinks.ts). The
// preview names the artist, and the page opens on their result instead of a blank calculator.

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return PROSPECT_LINKS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const prospect = getProspectLink(slug);
  const config = getLeadMagnet(PROSPECT_TOOL_SLUG);
  if (!prospect || !config) return { title: 'Not Found | CRWN' };
  return shareMetadata({
    title: `${prospect.name}: your CRWN numbers`,
    description: 'What your fans would pay you directly every month, and what you leave on the table without it. Built from your public numbers.',
    path: `/numbers/${prospect.slug}`,
    image: config.hero.image,
    wideImage: true,
  });
}

export default async function ProspectNumbersPage({ params }: Props) {
  const { slug } = await params;
  const prospect = getProspectLink(slug);
  const config = getLeadMagnet(PROSPECT_TOOL_SLUG);
  if (!prospect || !config) notFound();
  return <PublicToolClient config={config} presetSearch={prospectSearch(prospect)} />;
}
