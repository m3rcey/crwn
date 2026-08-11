import { BackgroundImage } from '@/components/ui/BackgroundImage';

// Full-screen connector-tool shell, matching /missions and /offers. Not a hard gate: the artist
// leaves through HubBackControl at any time.
export default function FanCampaignsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-crwn-bg">
      <BackgroundImage src="/backgrounds/bg-dashboard.jpg" overlayOpacity="bg-black/85" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
