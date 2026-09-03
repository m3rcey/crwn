import { shareMetadata } from '@/lib/shareMetadata';

export const metadata = {
  ...shareMetadata({
    title: 'One quick question',
    description: 'A short CRWN survey. It takes under a minute.',
  }),
  robots: { index: false, follow: false },
};

export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
