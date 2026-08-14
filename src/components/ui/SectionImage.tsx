import Image from 'next/image';

/**
 * The full-width brand photograph that opens a marketing section.
 *
 * This replaced a 64px icon badge (2026-08-14). The badge was the right idea at the wrong scale:
 * on a desktop column roughly 700px wide it read as a bullet, not as a break, and it did not
 * carry any of the brand. A photograph does both jobs at once, and CRWN already owns a cinematic
 * charcoal-and-gold library shot to the house rules, so this costs no new asset.
 *
 * Sized to actually break the column: 16:9 on a phone, a fixed 280px band on desktop so a tall
 * portrait crop cannot push the next heading off screen. `object-cover` with a bottom scrim keeps
 * the heading underneath legible against a bright gold highlight.
 *
 * `priority` is deliberately NOT set. Every one of these sits below the funnel fold, and marking
 * them high priority would make them compete with the hero image for the same connection.
 */
export function SectionImage({
  src,
  alt,
  className = '',
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <div
      className={`relative w-full aspect-[16/9] md:aspect-auto md:h-[280px] rounded-2xl overflow-hidden border border-crwn-elevated mb-6 ${className}`}
    >
      <Image src={src} alt={alt} fill loading="lazy" sizes="(max-width: 768px) 100vw, 700px" className="object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-crwn-bg/60 via-transparent to-transparent" />
    </div>
  );
}
