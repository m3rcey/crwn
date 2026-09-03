import { shareMetadata } from '@/lib/shareMetadata';

export const metadata = shareMetadata({
  title: 'Partner with CRWN',
  description: 'Bring artists to CRWN and get paid for the revenue they earn.',
  path: '/partner',
});

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
