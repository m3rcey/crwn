import { BackgroundImage } from '@/components/ui/BackgroundImage';

// Full-screen, no sidebar or bottom bar. A guided flow is one task with one exit: the X and the
// final Continue both return to Rise Mode. Same shell as /setup, deliberately, so the two feel
// like the same product; the boundary between them is what they OWN, not how they look.
// /setup owns the one stored setup flag. /build owns nothing: every flow writes canonical rows
// the existing surfaces already own, and Rise Mode completes the quest from those rows.
export default function BuildLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-crwn-bg">
      <BackgroundImage src="/backgrounds/bg-dashboard.jpg" overlayOpacity="bg-black/85" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
