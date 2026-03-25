import { createServerSupabaseClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { SmartLinkCapture } from '@/components/smart-links/SmartLinkCapture';
import { PreSaveCapture } from '@/components/smart-links/PreSaveCapture';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  // Smart links use artist_id + slug combo, but the public URL is just /link/[slug]
  // We need to find the link by slug across all artists
  const { data: link } = await supabase
    .from('smart_links')
    .select('title, description, artist_id')
    .eq('slug', slug)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!link) return { title: 'Not Found | CRWN' };

  return {
    title: `${link.title || 'Connect'} | CRWN`,
    description: link.description || 'Join the community on CRWN',
  };
}

export default async function SmartLinkPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerSupabaseClient();

  // Find the smart link
  const { data: link } = await supabase
    .from('smart_links')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (!link) notFound();

  // Increment view count (fire and forget via admin)
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'
  );
  supabaseAdmin
    .from('smart_links')
    .update({ view_count: (link.view_count || 0) + 1 })
    .eq('id', link.id)
    .then(() => {});

  // Get artist info for branding
  const { data: artistProfile } = await supabase
    .from('artist_profiles')
    .select('slug, platform_tier, user_id')
    .eq('id', link.artist_id)
    .single();

  let artistName = 'Artist';
  let artistAvatar: string | null = null;
  if (artistProfile) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', artistProfile.user_id)
      .single();
    artistName = profile?.display_name || 'Artist';
    artistAvatar = profile?.avatar_url || null;
  }

  const showCrwnBranding = artistProfile?.platform_tier !== 'label' && artistProfile?.platform_tier !== 'empire';

  return (
    <div className="min-h-screen bg-[#0D0D0D] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Artist branding */}
        <div className="text-center mb-8">
          {link.link_type === 'presave' && link.artwork_url ? (
            <img
              src={link.artwork_url}
              alt={link.title || 'Release artwork'}
              className="w-40 h-40 rounded-2xl mx-auto mb-4 object-cover border-2 border-[#D4AF37]/20 shadow-lg shadow-black/50"
            />
          ) : artistAvatar ? (
            <img
              src={artistAvatar}
              alt={artistName}
              className="w-20 h-20 rounded-full mx-auto mb-4 object-cover border-2 border-[#D4AF37]/30"
            />
          ) : (
            <div className="w-20 h-20 rounded-full mx-auto mb-4 bg-[#1A1A1A] border-2 border-[#D4AF37]/30 flex items-center justify-center text-2xl font-bold text-[#D4AF37]">
              {artistName.charAt(0)}
            </div>
          )}
          <h1 className="text-xl font-bold text-white">{artistName}</h1>
          {link.title && (
            <h2 className="text-lg text-[#D4AF37] mt-1">{link.title}</h2>
          )}
          {link.description && (
            <p className="text-sm text-[#A0A0A0] mt-2">{link.description}</p>
          )}
          {link.link_type === 'presave' && link.release_date && (
            <p className="text-xs text-[#A0A0A0] mt-2">
              Drops {new Date(link.release_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          )}
        </div>

        {/* Capture form — presave or standard */}
        {link.link_type === 'presave' ? (
          <PreSaveCapture
            linkId={link.id}
            artistId={link.artist_id}
            collectEmail={link.collect_email}
            collectPhone={link.collect_phone}
            collectName={link.collect_name}
            spotifyUrl={link.spotify_url}
            appleMusicUrl={link.apple_music_url}
            youtubeUrl={link.youtube_url}
            soundcloudUrl={link.soundcloud_url}
            tidalUrl={link.tidal_url}
            releaseDate={link.release_date}
          />
        ) : (
          <SmartLinkCapture
            linkId={link.id}
            artistId={link.artist_id}
            collectEmail={link.collect_email}
            collectPhone={link.collect_phone}
            collectName={link.collect_name}
            destinationUrl={link.destination_url}
          />
        )}

        {/* Footer */}
        <div className="text-center mt-8">
          {showCrwnBranding && (
            <p className="text-[#555] text-xs">
              Powered by{' '}
              <a href="https://thecrwn.app" className="text-[#D4AF37] no-underline">CRWN</a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
