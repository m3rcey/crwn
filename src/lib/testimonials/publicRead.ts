// The ONE public read path for fan testimonials.
//
// Reads `fan_testimonials_public` (schema-phase2-fan-testimonials.sql) with the caller's SESSION
// client, exactly like the public artist page reads `artist_profiles_public`. The base tables are
// closed to anon and authenticated, so this view is the entire public surface: its WHERE clause is
// the publication predicate and its SELECT list is the privacy boundary.
//
// Why a view and not the service role: CLAUDE.md restricts the admin client to /api/ routes, and
// the public artist page is a server component. A plain (non security_invoker) view runs as its
// owner, which is how the page can render rows the visitor's own role cannot select.

import { ANONYMOUS_DISPLAY_LABEL, MAX_PUBLIC_TESTIMONIALS, type PublicTestimonial } from './core';

/**
 * Featured, consented, non-withdrawn testimonials for one artist.
 *
 * Returns [] on ANY failure, including 42P01 before the migration runs, so the public page simply
 * omits the section rather than 404ing. Bounded by MAX_PUBLIC_TESTIMONIALS: V1 needs no pagination,
 * and an unbounded list is a slow page and a wall of text.
 */
export async function publicTestimonialsFor(
  supabase: any,
  artistId: string,
): Promise<PublicTestimonial[]> {
  try {
    const { data, error } = await supabase
      .from('fan_testimonials_public')
      // Explicit column list, never select('*'): a column added to the view later must be an
      // opt-in decision here too, not something that starts shipping on its own.
      .select('id, artist_id, body, display_name, verification_label, tenure_label, submitted_at, context_kind')
      .eq('artist_id', artistId)
      .order('submitted_at', { ascending: false })
      .limit(MAX_PUBLIC_TESTIMONIALS);
    if (error || !data) return [];

    return data.map((r: any) => ({
      id: r.id,
      artistId: r.artist_id,
      body: r.body,
      displayName: r.display_name ?? null,
      verificationLabel: r.verification_label ?? null,
      tenureLabel: r.tenure_label ?? null,
      submittedAt: r.submitted_at,
      contextKind: r.context_kind ?? null,
    }));
  } catch {
    return [];
  }
}

/** The byline a card shows. A fan who hides their name is still a verified human. */
export function bylineFor(t: PublicTestimonial): string {
  return t.displayName ?? ANONYMOUS_DISPLAY_LABEL;
}
