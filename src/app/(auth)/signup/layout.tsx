import { shareMetadata } from '@/lib/shareMetadata';

export const metadata = shareMetadata({
  title: 'Create your CRWN account',
  description: 'Set up the page where your fans pay you directly.',
  path: '/signup',
});

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
