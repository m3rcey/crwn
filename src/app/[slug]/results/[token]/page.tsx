import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { isPresentableArtistName } from '@/lib/publicName';
import { songLabArtistBySlug } from '@/lib/songLab/access';
import { loadScoreboard } from '@/lib/songLab/server';
import { verifyScoreboardToken } from '@/lib/songLab/scoreboardToken';
import { LiveScoreboard } from '@/components/songlab/LiveScoreboard';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

interface ScoreboardPageProps {
  params: Promise<{ slug: string; token: string }>;
}

// Always read live: this page is only useful if it is current.
export const dynamic = 'force-dynamic';

/**
 * A private link must never be indexed, previewed with its token in a crawler cache, or
 * leak its URL to another site through the Referer header.
 *
 * The title is only set AFTER the token verifies. A static title rendered "Live results" on
 * the 404 for a wrong token too, which quietly confirmed the route exists. With a valid
 * token it matters for the opposite reason: when this page is added to a home screen, the
 * icon is labelled from it, so it has to be short and obvious ("Live Results" fits under
 * an iPhone icon without truncating).
 */
const PRIVATE: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export async function generateMetadata({ params }: ScoreboardPageProps): Promise<Metadata> {
  const { slug, token } = await params;
  const artist = await songLabArtistBySlug(supabaseAdmin, (slug || '').toLowerCase());
  if (!artist || !verifyScoreboardToken(artist.artistId, token, process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    return PRIVATE;
  }
  return {
    ...PRIVATE,
    title: 'Live Results',
    appleWebApp: { capable: true, title: 'Live Results', statusBarStyle: 'black-translucent' },
  };
}

/**
 * The artist's no-sign-in live scoreboard. Built for an artist who is not comfortable with
 * technology: one link on his home screen opens straight onto the standings, with no
 * account, no menu, no tabs and nothing he can accidentally change.
 *
 * An unknown artist, an artist without Song Lab, and a wrong or malformed token all 404
 * identically, so the page reveals nothing to anyone without the real link.
 */
export default async function ScoreboardPage({ params }: ScoreboardPageProps) {
  const { slug, token } = await params;

  const artist = await songLabArtistBySlug(supabaseAdmin, (slug || '').toLowerCase());
  if (!artist) notFound();
  if (!verifyScoreboardToken(artist.artistId, token, process.env.SUPABASE_SERVICE_ROLE_KEY)) notFound();

  const [shows, { data: profile }] = await Promise.all([
    loadScoreboard(supabaseAdmin, artist.artistId),
    supabaseAdmin.from('profiles').select('display_name').eq('id', artist.userId).maybeSingle(),
  ]);
  const rawName = profile?.display_name ?? null;
  const artistName = isPresentableArtistName(rawName) ? (rawName as string) : '';

  return (
    <LiveScoreboard
      artistSlug={artist.slug}
      token={token}
      artistName={artistName}
      initialShows={shows}
      initialUpdatedAt={new Date().toISOString()}
    />
  );
}
