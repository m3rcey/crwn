import { redirect } from 'next/navigation';

// Compatibility shim (2026-08-13). This route was a byte-near-identical copy of
// /[slug]/album/[id] that had already drifted; the canonical page renders the share content.
// Old shared links must NEVER 404, so the path survives as a redirect.
interface Props {
  params: Promise<{ slug: string; id: string }>;
}

export default async function LegacyArtistAlbumRedirect({ params }: Props) {
  const { slug, id } = await params;
  redirect(`/${slug}/album/${id}`);
}
