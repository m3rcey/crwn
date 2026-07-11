import { notFound } from 'next/navigation';
import { getLeadMagnet } from '@/lib/leadMagnets/registry';
import { ArtistToolClient } from '@/components/lead-magnets/ArtistToolClient';

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function ArtistToolPage({ params }: Props) {
  const { slug } = await params;
  const config = getLeadMagnet(slug);
  if (!config) notFound();
  return <ArtistToolClient config={config} />;
}
