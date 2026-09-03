import { shareMetadata } from '@/lib/shareMetadata';

export const metadata = shareMetadata({
  title: 'Getting started on CRWN',
  description: 'Short guides that take an artist from an empty page to a first paying fan.',
  path: '/getting-started',
});

export default function GettingStartedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
