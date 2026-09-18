// The Calculator VSL, played IN PLACE on the result page, full width, directly under the email ask.
//
// Founder decision 2026-09-18, replacing the 2026-09-01 poster link. The link was a 64px thumbnail
// with a caption beside it, parked in the evidence zone under the ladder, so on most calculators it
// sat below several screens of sections and nobody reached it. It now renders right after the email
// ask (the first thing below the fold), at the full width of the result, and plays where it is.
//
// Why this cannot push the ask off the first screen: it renders AFTER the email ask, never before
// it, and the page's gold CTA still scrolls straight past it to the builder. `preload="none"` means
// a visitor who never presses play downloads the poster and nothing else of a sixteen minute MP4.
// Native controls, same reason as the watch page: a custom player is one more thing that can fail
// on a phone browser. `playsInline` keeps iOS from forcing it full screen on play.
//
// A plain element with no client state, so the server-rendered DM result page can mount it too.
import { CALCULATOR_VSL, isVslLive } from '@/lib/vsl/catalog';

export function ExplainerVideoCard() {
  // Nothing renders while the video has no hosted URL, same rule the email block follows.
  if (!isVslLive(CALCULATOR_VSL)) return null;

  return (
    <section aria-label={CALCULATOR_VSL.title} className="w-full text-left">
      <p className="mb-2 text-sm font-semibold text-crwn-text">
        Not sure the number is real?{' '}
        <span className="font-normal text-crwn-text-secondary">Watch how it is built ({CALCULATOR_VSL.minutes} min).</span>
      </p>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black">
        <video
          className="block aspect-video w-full"
          controls
          playsInline
          preload="none"
          poster={CALCULATOR_VSL.poster}
          src={CALCULATOR_VSL.url ?? undefined}
        />
      </div>
    </section>
  );
}
