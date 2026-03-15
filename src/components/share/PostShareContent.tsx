'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { ShareButtons } from '@/components/shared/ShareButtons';
import { Lock, ArrowLeft, MessageCircle, Heart } from 'lucide-react';
import { BackgroundImage } from '@/components/ui/BackgroundImage';

interface PostShareContentProps {
  post: {
    id: string;
    content: string;
    post_type: string;
    media_urls: string[] | null;
    access_level: string;
    created_at: string;
    allowed_tier_ids: string[] | null;
    is_free?: boolean;
  };
  artist: {
    id: string;
    slug: string;
    displayName: string;
    avatarUrl: string | null;
  };
  tiers: { id: string; name: string; price: number }[];
  commentCount: number;
}

export function PostShareContent({ post, artist, tiers, commentCount }: PostShareContentProps) {
  const { user } = useAuth();
  const { tierId } = useSubscription(artist.id);

  const isFree = post.access_level === 'free' || post.is_free === true;
  const hasAccess = isFree || (tierId && post.allowed_tier_ids?.includes(tierId));
  const shareUrl = `https://thecrwn.app/${artist.slug}/post/${post.id}`;
  const lowestTier = tiers[0];
  const mediaUrls = post.media_urls || [];

  const timeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="relative min-h-screen">
      <BackgroundImage src="/backgrounds/bg-home.jpg" overlayOpacity="bg-black/80" />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-lg">
          {/* Back to artist */}
          <Link
            href={`/${artist.slug}`}
            className="flex items-center gap-2 text-crwn-text-secondary hover:text-crwn-gold text-sm mb-6 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{artist.displayName}</span>
          </Link>

          {/* Post Card */}
          <div className="neu-raised rounded-xl overflow-hidden">
            {/* Author Header */}
            <div className="flex items-center gap-3 p-4 border-b border-crwn-elevated">
              <div className="w-10 h-10 rounded-full overflow-hidden bg-crwn-elevated flex-shrink-0">
                {artist.avatarUrl ? (
                  <Image src={artist.avatarUrl} alt={artist.displayName} width={40} height={40} className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary text-sm">
                    {artist.displayName.charAt(0)}
                  </div>
                )}
              </div>
              <div>
                <Link href={`/${artist.slug}`} className="text-crwn-text font-medium text-sm hover:text-crwn-gold">
                  {artist.displayName}
                </Link>
                <p className="text-crwn-text-secondary text-xs">{timeAgo(post.created_at)}</p>
              </div>
              {!isFree && (
                <span className="ml-auto text-xs px-2 py-1 rounded-full bg-crwn-gold/10 text-crwn-gold">
                  Exclusive
                </span>
              )}
            </div>

            {/* Post Content */}
            <div className="p-4">
              {hasAccess ? (
                <>
                  <p className="text-crwn-text text-sm whitespace-pre-wrap">{post.content}</p>
                  {/* Media */}
                  {mediaUrls.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {mediaUrls.map((url, i) => (
                        <div key={i} className="rounded-lg overflow-hidden relative aspect-video">
                          <Image src={url} alt="" fill className="object-cover" />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <Lock className="w-8 h-8 text-crwn-gold/50 mx-auto mb-3" />
                  <p className="text-crwn-text font-medium text-sm mb-1">Exclusive Content</p>
                  <p className="text-crwn-text-secondary text-xs mb-4">
                    Subscribe to {artist.displayName} to see this post.
                  </p>
                  {lowestTier && (
                    <Link
                      href={`/${artist.slug}`}
                      className="neu-button-accent inline-block px-6 py-2 rounded-lg text-sm font-semibold"
                    >
                      Subscribe from ${(lowestTier.price / 100).toFixed(2)}/mo
                    </Link>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-4 px-4 py-3 border-t border-crwn-elevated text-crwn-text-secondary text-xs">
              <span className="flex items-center gap-1">
                <MessageCircle className="w-3.5 h-3.5" />
                {commentCount}
              </span>
            </div>
          </div>

          {/* Share */}
          <div className="flex justify-center mt-4">
            <ShareButtons
              url={shareUrl}
              title={`${artist.displayName} on CRWN`}
              description={isFree ? post.content?.substring(0, 100) : `Exclusive post from ${artist.displayName}`}
            />
          </div>

          {/* CTA to view full community */}
          <div className="text-center mt-6">
            <Link
              href={`/${artist.slug}`}
              className="text-crwn-gold hover:underline text-sm"
            >
              View {artist.displayName}'s full community →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
