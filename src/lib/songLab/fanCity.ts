// Where a voter is, for the artist's venue planning (Prince Dre's 100-200 venue push, 2026-09-28).
//
// Before this, CRWN learned a fan's city only from a PAID checkout's billing address
// (earnings.fan_city), so every free vote arrived with no location at all, and that is data
// nobody can recover later. The vote form now asks "Your city", pre-filled from the request's
// Vercel location headers so most fans only confirm it. What is stored is what the FAN saw
// and submitted: never a silent IP lookup, and a cleared field stores nothing.
//
// Stored on fan_contacts.city (the artist's own contact row for that fan), through the same
// 'keyword' source the drop funnel uses plus a 'song-lab-vote' tag, so no migration is needed.
// It is a reporting fact about where fans are. It never gates, prices or authorizes anything.

const MAX_CITY = 80;

/** A typed city, trimmed to plain words. Null when nothing usable remains. */
export function cleanCity(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const s = raw
    .replace(/[<>{}[\]\\`"]/g, '')
    // Control characters (C0 and DEL) never belong in a place name.
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CITY);
  return s.length >= 2 ? s : null;
}

/** "Chicago, IL" from Vercel's request geolocation, or null off Vercel / when unknown.
 *  x-vercel-ip-city is URL-encoded; the region is the ISO 3166-2 subdivision code (the US
 *  state), and outside the US the country code reads better than a region code. */
export function cityHintFromHeaders(get: (name: string) => string | null): string | null {
  let city = get('x-vercel-ip-city');
  if (!city) return null;
  try { city = decodeURIComponent(city); } catch { /* use as sent */ }
  const country = (get('x-vercel-ip-country') || '').toUpperCase();
  const region = (get('x-vercel-ip-country-region') || '').toUpperCase();
  const suffix = country === 'US' ? region : country;
  return cleanCity(suffix ? `${city}, ${suffix}` : city);
}

/**
 * Put the voter on the artist's contact list with their city. Best-effort: a failure here
 * never fails the vote. An existing contact keeps its name and source; only the city is
 * refreshed, because the fan just told us where they are now.
 */
export async function recordVoterContact(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  opts: { artistId: string; email: string; name?: string | null; city: string | null },
): Promise<void> {
  if (!opts.email) return;
  try {
    await admin.from('fan_contacts').upsert(
      {
        artist_id: opts.artistId,
        email: opts.email,
        ...(opts.name ? { name: opts.name } : {}),
        ...(opts.city ? { city: opts.city } : {}),
        source: 'keyword',
        tags: ['song-lab-vote'],
        is_subscribed_email: true,
      },
      { onConflict: 'artist_id,email', ignoreDuplicates: true },
    );
    if (opts.city) {
      await admin.from('fan_contacts').update({ city: opts.city }).eq('artist_id', opts.artistId).eq('email', opts.email);
    }
  } catch {
    /* reporting only */
  }
}
