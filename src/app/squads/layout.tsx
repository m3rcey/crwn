import { BackgroundImage } from '@/components/ui/BackgroundImage';

// Full-screen shell, same as /missions and /offers. Not a hard gate — the artist
// can exit back to the dashboard any time.
export default function SquadsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-crwn-bg">
      <BackgroundImage src="/backgrounds/bg-dashboard.jpg" overlayOpacity="bg-black/85" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
