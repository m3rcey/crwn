import { BackgroundImage } from '@/components/ui/BackgroundImage';

export default function CityLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-crwn-bg">
      <BackgroundImage src="/backgrounds/bg-dashboard.jpg" overlayOpacity="bg-black/85" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
