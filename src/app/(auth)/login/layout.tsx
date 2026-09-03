import { shareMetadata } from '@/lib/shareMetadata';

export const metadata = shareMetadata({
  title: 'Log in to CRWN',
  description: 'Sign back in to your CRWN account.',
  path: '/login',
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
