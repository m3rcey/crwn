import { shareMetadata } from '@/lib/shareMetadata';

export const metadata = shareMetadata({
  title: 'CRWN support',
  description: 'Search the guides or ask a question, and a human picks it up when the answer is not there.',
  path: '/support',
});

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
