import { WorthExperience } from './WorthExperience';
import { shareMetadata } from '@/lib/shareMetadata';
import { worthPrefillFromQuery } from '@/lib/leadMagnets/worthEntry';

// /worth — the clean, nav-less calculator used for cold outreach and prefilled links.
export const metadata = shareMetadata({
  title: 'What your fanbase is worth',
  description: 'Answer a few questions and see the money your current audience is already worth.',
  path: '/worth',
});

/**
 * The prefill is read HERE, on the server, and handed to the component's existing `prefill` prop.
 *
 * It used to be read in a client effect, which runs after the first render, and the entry wizard
 * snapshots its answers on that first render: every `?listeners=N` link showed the generic 150,000
 * default instead of N, and computed the result from it (fixed 2026-09-20). Reading it here is what
 * makes the artist's own number present on the very first render, with no flash and no second
 * mechanism. Reading `searchParams` makes this one route render per request rather than prerender,
 * which is the point of a route whose whole job is prefilled outreach links.
 */
export default async function WorthPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const prefill = worthPrefillFromQuery(await searchParams);
  return <WorthExperience prefill={prefill} />;
}
