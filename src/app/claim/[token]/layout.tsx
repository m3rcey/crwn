import { shareMetadata } from '@/lib/shareMetadata';

// A claim link is personal and unguessable: a real preview for whoever it was sent to,
// and noindex so it never lands in a search result.
export const metadata = {
  ...shareMetadata({
    title: 'Claim your CRWN result',
    description: 'Pick up the plan that was built for you.',
  }),
  robots: { index: false, follow: false },
};

export default function ClaimLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
