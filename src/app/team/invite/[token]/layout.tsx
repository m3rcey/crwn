import { shareMetadata } from '@/lib/shareMetadata';

// A collaborator invite link is personal: a real preview for the person it was sent to,
// and noindex so it never lands in a search result.
export const metadata = {
  ...shareMetadata({
    title: 'You have a split invite',
    description: 'An artist wants to cut you in on their CRWN earnings. Open it to see the terms.',
  }),
  robots: { index: false, follow: false },
};

export default function TeamInviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
