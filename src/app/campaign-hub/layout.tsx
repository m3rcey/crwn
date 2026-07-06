import { BackgroundImage } from '@/components/ui/BackgroundImage';

// Full-screen, no sidebar/nav — same shell as /missions and /action-plan. Not a
// hard gate: the artist can exit back to /profile/artist any time.
export default function CampaignHubLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-crwn-bg">
      <BackgroundImage src="/backgrounds/bg-dashboard.jpg" overlayOpacity="bg-black/85" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
