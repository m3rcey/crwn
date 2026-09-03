import { BackgroundImage } from '@/components/ui/BackgroundImage';
import { shareMetadata } from '@/lib/shareMetadata';

export const metadata = shareMetadata({
  title: 'Unlock this city',
  description: 'Get enough fans in one city on the list and the artist comes.',
});

export default function CityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-crwn-bg">
      <BackgroundImage src="/backgrounds/bg-dashboard.jpg" overlayOpacity="bg-black/85" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
