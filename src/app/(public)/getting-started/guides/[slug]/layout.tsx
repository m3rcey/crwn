import type { Metadata } from 'next';
import { shareMetadata } from '@/lib/shareMetadata';
import { getGuideBySlug } from '../guideContent';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) {
    return shareMetadata({
      title: 'CRWN guide',
      description: 'A short guide to getting paid by your fans.',
    });
  }
  return shareMetadata({
    title: guide.title,
    description: guide.subtitle,
    path: `/getting-started/guides/${slug}`,
  });
}

export default function GuideLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
