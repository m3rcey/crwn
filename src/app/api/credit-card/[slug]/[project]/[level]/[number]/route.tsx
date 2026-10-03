// The credit card as an image: ?format=story (1080x1920, for an Instagram story) or the default
// link preview (1200x630). Rendered from the same row as the card page, so it exists only for a
// listed, standing credit. The artwork itself is src/lib/projectCredits/cardImage.tsx.

import { createClient } from '@supabase/supabase-js';
import { isCreditLevel } from '@/lib/projectCredits/credits';
import { loadCreditsProject, loadListedCredit } from '@/lib/projectCredits/server';
import { cardFooterLink, creditCardImage } from '@/lib/projectCredits/cardImage';

export const dynamic = 'force-dynamic';

/** Album art as a data URL, or null. Satori renders png and jpeg only, and a failed fetch must
 *  never fail the card, so anything else is simply left out. */
async function artDataUrl(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    const type = (res.headers.get('content-type') || '').split(';')[0];
    if (!res.ok || !/^image\/(png|jpe?g)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 4_000_000) return null;
    return `data:${type};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; project: string; level: string; number: string }> },
) {
  const p = await params;
  if (!isCreditLevel(p.level)) return new Response('Not found', { status: 404 });
  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const project = await loadCreditsProject(db, p.slug, p.project);
  if (!project) return new Response('Not found', { status: 404 });
  const credit = await loadListedCredit(db, project.album.id, p.level, Number(p.number));
  if (!credit) return new Response('Not found', { status: 404 });

  const story = new URL(req.url).searchParams.get('format') === 'story';
  return creditCardImage(
    {
      artistName: project.artist.name,
      albumTitle: project.album.title,
      level: credit.level,
      number: credit.number,
      name: credit.name,
      link: cardFooterLink(project.artist.slug, project.album.title, story),
      art: await artDataUrl(project.album.artUrl),
      story,
    },
    { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  );
}
