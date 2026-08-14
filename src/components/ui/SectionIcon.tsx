import type { ComponentType } from 'react';

/**
 * The large gold icon that opens a marketing section.
 *
 * The acquisition pages argue in prose, and after the Zero to One rewrite the lower page on the
 * homepage and on all six promoted calculators was a run of eyebrow, heading and paragraph with
 * nothing to break it. A reader scanning for where a section begins had only a small gold caps
 * line to find. This gives every section one large vector anchor.
 *
 * Vector, never emoji: emoji render differently on every platform, cannot take the brand colour,
 * and read as clip art next to a photo shoot (the same rule the Studio tiles follow).
 *
 * Sizing is deliberate. 64px is large enough to break a text column at a glance and small enough
 * that it never competes with the H2 underneath it, and `strokeWidth={1.5}` keeps a 32px glyph
 * from looking heavy beside the display type.
 */
export function SectionIcon({
  icon: Icon,
  className = '',
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  className?: string;
}) {
  return (
    <div
      className={`w-16 h-16 rounded-2xl bg-gradient-to-b from-crwn-gold/20 to-crwn-gold/5 border border-crwn-gold/25 flex items-center justify-center mb-5 ${className}`}
    >
      <Icon className="w-8 h-8 text-crwn-gold" strokeWidth={1.5} />
    </div>
  );
}
