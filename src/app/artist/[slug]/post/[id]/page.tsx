import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Metadata } from 'next';
import { PostShareContent } from '@/components/share/PostShareContent';

interface PostPageProps {
  params: Promise<{ slug: string; id: string }>;
}

export async function generateMetadata({ params }: PostPageProps): Promise<Metadata> {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, profile:profiles(display_name, avatar_url)')
    .eq('slug', slug)
    .single();

  if (!artist) return { title: 'Not Found | CRWN' };

  const artistProfile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;

  const { data: post } = await supabase
    .from('posts')
    .select('content, post_type, media_urls, access_level')
    .eq('id', id)
    .single();

  if (!post) return { title: 'Post Not Found | CRWN' };

  const artistName = artistProfile?.display_name || 'Artist';
  const isGated = post.access_level !== 'free';
  
  // For gated posts, don't reveal content in OG description
  const description = isGated
    ? `Exclusive post from ${artistName} on CRWN`
    : post.content?.substring(0, 150) || `Post by ${artistName} on CRWN`;

  // Use first media as OG image if available, otherwise artist avatar
  const mediaUrls = post.media_urls || [];
  const ogImage = mediaUrls[0] || artistProfile?.avatar_url || '/icon-512x512.png';
  const url = `https://thecrwn.app/artist/${slug}/post/${id}`;

  return {
    title: `${artistName} on CRWN`,
    description,
    metadataBase: new URL('https://thecrwn.app'),
    openGraph: {
      title: `${artistName} on CRWN`,
      description,
      url,
      siteName: 'CRWN',
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: `Post by ${artistName}` }] : [],
      type: 'article',
    },
    twitter: {
      card: mediaUrls.length > 0 ? 'summary_large_image' : 'summary',
      title: `${artistName} on CRWN`,
      description,
      images: ogImage ? [ogImage] : [],
    },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { slug, id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('id, slug, profile:profiles(display_name, avatar_url)')
    .eq('slug', slug)
    .single();

  if (!artist) notFound();

  const artistProfile = Array.isArray(artist.profile) ? artist.profile[0] : artist.profile;

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('id', id)
    .single();

  if (!post) notFound();

  // Get tiers
  const { data: tiers } = await supabase
    .from('subscription_tiers')
    .select('id, name, price')
    .eq('artist_id', artist.id)
    .eq('is_active', true)
    .order('price', { ascending: true });

  // Get comment count
  const { count: commentCount } = await supabase
    .from('comments')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', id);

  return (
    <PostShareContent
      post={post}
      artist={{
        id: artist.id,
        slug: artist.slug,
        displayName: artistProfile?.display_name || 'Artist',
        avatarUrl: artistProfile?.avatar_url || null,
      }}
      tiers={tiers || []}
      commentCount={commentCount || 0}
    />
  );
}
