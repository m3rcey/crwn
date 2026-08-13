// The public "what supporters are saying" section on the artist page.
//
// SERVER component, rendered with the page's own session client. It shows only rows the
// `fan_testimonials_public` view already filtered: consented, featured by the artist, not
// withdrawn, not hidden, not blocked. Automatic collection is never automatic publication, so a
// testimonial reaches this component only after the artist deliberately featured it.
//
// Renders NOTHING when the list is empty. No empty state, no "be the first" prompt: a visitor who
// sees a placeholder learns the artist has no proof, which is worse than silence.
//
// PRIVACY. Every field here comes from the view's fixed column list. There is no tier name and no
// exact tenure, because tier plus tenure beside a public price list is a lifetime-spend disclosure
// (the defect src/lib/leaderboardPrivacy.ts exists to prevent). Text renders through React, which
// escapes it; nothing here uses dangerouslySetInnerHTML.

import { ShieldCheck, Quote } from 'lucide-react';
import type { PublicTestimonial } from '@/lib/testimonials/core';
import { bylineFor } from '@/lib/testimonials/publicRead';

export function PublicTestimonials({ testimonials }: { testimonials: PublicTestimonial[] }) {
  if (!testimonials || testimonials.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-crwn-text mb-3">What supporters are saying</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {testimonials.map((t) => (
          <figure key={t.id} className="neu-raised rounded-xl p-4">
            <Quote className="w-4 h-4 text-crwn-gold/60 mb-2" />
            <blockquote className="text-sm text-crwn-text whitespace-pre-wrap">{t.body}</blockquote>
            <figcaption className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span className="text-crwn-text-secondary font-medium">{bylineFor(t)}</span>
              {t.verificationLabel && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-crwn-gold/15 text-crwn-gold font-semibold">
                  <ShieldCheck className="w-3 h-3" />
                  {t.verificationLabel}
                </span>
              )}
              {t.tenureLabel && <span className="text-crwn-text-secondary">{t.tenureLabel}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
