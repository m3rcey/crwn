import { BackgroundImage } from '@/components/ui/BackgroundImage';

// Full-screen, no sidebar/nav. The wizard is a hard gate — nothing else in the
// app is reachable until the required steps are done — so we deliberately do NOT
// render the (main) app shell here.
export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-crwn-bg">
      <BackgroundImage src="/backgrounds/bg-dashboard.jpg" overlayOpacity="bg-black/85" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
