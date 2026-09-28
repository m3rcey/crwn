// Named result links the founder sends to one artist: thecrwn.app/numbers/<slug>.
//
// A prefilled calculator link is a long query string, and its preview card says
// "CRWN Opportunity Calculator", which reads as a form to fill in, not something built for the
// person receiving it. Each entry here becomes one page whose preview names the artist and whose
// body opens straight on their result (`show=result`), with every answer still editable.
//
// Every value is a PUBLIC figure the founder chose to send (conservative by default: an unknown
// is left out, never guessed). It seeds a displayed estimate only, never a price, a fee, an
// entitlement or a permission, and it runs through the tool's own allowlist (`prefillFromQuery`),
// so an entry cannot carry a key the calculator never declared.

export interface ProspectLink {
  /** The URL segment. Never rename one that has been sent. */
  slug: string;
  /** The artist's name as it should read in the preview. */
  name: string;
  /** Calculator answers, keyed by the tool's declared input keys. Currency in dollars. */
  answers: Record<string, string | number>;
  /** The tool's entry context (sub-avatar front door), if one fits. */
  from?: string;
}

export const PROSPECT_TOOL_SLUG = 'opportunity-calculator';

export const PROSPECT_LINKS: ProspectLink[] = [
  {
    slug: 'layzie-bone',
    name: 'Layzie Bone',
    answers: {
      genre_family: 'hiphop',
      social_followers: 635000,
      monthly_listeners: 184000,
      monetization_status: 'direct_established',
      current_supporters: 0,
      time_capacity: 'low',
    },
    from: 'highest_priority_empire_builder',
  },
  {
    slug: 'mopacino',
    name: 'Mopacino',
    answers: {
      genre_family: 'hiphop',
      social_followers: 2000000,
      monthly_listeners: 9300,
      current_supporters: 0,
      time_capacity: 'low',
    },
    from: 'brand_led_hip_hop_artist',
  },
  {
    // Monthly listeners deliberately omitted (founder call): one Lil Durk feature carries the
    // Spotify number, so the Instagram following is the honest measure of his own audience.
    slug: 'prince-dre',
    name: 'Prince Dre',
    answers: {
      genre_family: 'hiphop',
      social_followers: 196000,
      current_supporters: 0,
      time_capacity: 'low',
    },
    from: 'brand_led_hip_hop_artist',
  },
];

export function getProspectLink(slug: string): ProspectLink | undefined {
  return PROSPECT_LINKS.find((p) => p.slug === slug);
}

/** The query the calculator reads: the answers, the entry context, and show=result. */
export function prospectSearch(p: ProspectLink): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(p.answers)) params.set(k, String(v));
  if (p.from) params.set('from', p.from);
  params.set('show', 'result');
  return `?${params.toString()}`;
}
