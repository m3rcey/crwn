'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import Image from 'next/image';
import Link from 'next/link';
import { 
  Settings, 
  LogOut, 
  User as UserIcon,
  Music,
  Eye,
  HelpCircle,
  AlertTriangle,
  CreditCard,
  Loader2,
  Megaphone,
  Crown,
  LifeBuoy
} from 'lucide-react';

export default function ProfilePage() {
  const { user, profile, signOut, isLoading } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const loadSubs = async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('id, tier_id, status, current_period_end, stripe_customer_id, artist_id, tier:subscription_tiers(name, price), artist:artist_profiles(slug, profile:profiles(display_name, avatar_url))')
        .eq('fan_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      setSubscriptions(data || []);
      setSubsLoading(false);
    };
    loadSubs();
  }, [user, supabase]);

  const handleManageSub = async (artistId: string, artistSlug: string) => {
    setPortalLoading(artistId);
    try {
      const res = await fetch('/api/stripe/fan-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId, artistSlug }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      console.error('Portal error:', err);
    } finally {
      setPortalLoading(null);
    }
  };
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/login';
  };

  const isArtist = profile?.role === 'artist';

  if (isLoading) {
    return (
      <div className="min-h-screen bg-crwn-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 stagger-fade-in">
      {/* Artist Dashboard Link */}
      {isArtist && (
        <Link
          href="/profile/artist"
          className="flex items-center justify-between bg-crwn-surface hover:bg-crwn-elevated border border-crwn-gold/30 rounded-xl p-4 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-crwn-gold/20 flex items-center justify-center">
              <Music className="w-5 h-5 text-crwn-gold" />
            </div>
            <div>
              <p className="font-medium text-crwn-text">Artist Dashboard</p>
              <p className="text-sm text-crwn-text-secondary">Manage your music, tiers, and earnings</p>
            </div>
          </div>
        </Link>
      )}

      {/* Profile Header */}
      <div className="bg-crwn-surface rounded-xl p-6">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-crwn-elevated overflow-hidden">
            {profile?.avatar_url ? (
              <Image
                src={profile.avatar_url}
                alt=""
                width={80}
                height={80}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary text-2xl font-semibold">
                {(profile?.display_name || user?.email?.charAt(0) || 'U').toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-crwn-text">
              {profile?.display_name || 'Your Profile'}
            </h1>
            <p className="text-crwn-text-secondary">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Profile Info */}
      <div className="bg-crwn-surface rounded-xl p-6">
        <h2 className="text-lg font-semibold text-crwn-text mb-4 flex items-center gap-2">
          <UserIcon className="w-5 h-5 text-crwn-gold" />
          Profile Information
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-crwn-text-secondary mb-1">Display Name</label>
            <p className="text-crwn-text">{profile?.display_name || 'Not set'}</p>
          </div>
          
          <div>
            <label className="block text-sm text-crwn-text-secondary mb-1">Bio</label>
            <p className="text-crwn-text">{profile?.bio || 'No bio yet'}</p>
          </div>
        </div>
      </div>







      {/* Recruit Artists */}
      <Link
        href="/recruit/dashboard"
        className="flex items-center justify-between bg-crwn-surface hover:bg-crwn-elevated rounded-xl p-4 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-crwn-gold/20 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-crwn-gold" />
          </div>
          <div>
            <p className="font-medium text-crwn-text">Recruit Artists</p>
            <p className="text-sm text-crwn-text-secondary">Earn commissions by bringing artists to CRWN</p>
          </div>
        </div>
      </Link>

      {/* Founding Artist Program */}
      <Link
        href="/founding-artists"
        className="flex items-center justify-between bg-crwn-surface hover:bg-crwn-elevated rounded-xl p-4 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-crwn-gold/20 flex items-center justify-center">
            <Crown className="w-5 h-5 text-crwn-gold" />
          </div>
          <div>
            <p className="font-medium text-crwn-text">Founding Artist Program</p>
            <p className="text-sm text-crwn-text-secondary">1 month free Pro + reduced fees for early artists</p>
          </div>
        </div>
      </Link>

      {/* My Subscriptions */}
      <div className="bg-crwn-surface rounded-xl p-6">
        <h2 className="text-lg font-semibold text-crwn-text mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-crwn-gold" />
          My Subscriptions
        </h2>
        {subsLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-6 h-6 text-crwn-gold animate-spin" />
          </div>
        ) : subscriptions.length === 0 ? (
          <p className="text-crwn-text-secondary text-sm">You don&apos;t have any active subscriptions yet.</p>
        ) : (
          <div className="space-y-3">
            {subscriptions.map((sub) => {
              const artistName = sub.artist?.profile?.display_name || 'Unknown Artist';
              const artistAvatar = sub.artist?.profile?.avatar_url;
              const artistSlug = sub.artist?.slug || '';
              const tierName = sub.tier?.name || 'Subscription';
              const tierPrice = sub.tier?.price ? `$${(sub.tier.price / 100).toFixed(2)}/mo` : '';
              return (
                <div key={sub.id} className="flex items-center justify-between py-3 border-b border-crwn-elevated last:border-0">
                  <Link href={`/${artistSlug}`} className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-full bg-crwn-elevated overflow-hidden flex-shrink-0">
                      {artistAvatar ? (
                        <Image src={artistAvatar} alt="" width={40} height={40} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary text-sm font-semibold">
                          {artistName.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-crwn-text font-medium text-sm truncate">{artistName}</p>
                      <p className="text-crwn-text-secondary text-xs">{tierName} {tierPrice && `· ${tierPrice}`}</p>
                    </div>
                  </Link>
                  <button
                    onClick={() => handleManageSub(sub.artist_id, artistSlug)}
                    disabled={portalLoading === sub.artist_id}
                    className="px-3 py-1.5 text-xs font-medium text-crwn-text-secondary border border-crwn-elevated rounded-full hover:text-crwn-gold hover:border-crwn-gold transition-colors flex-shrink-0 ml-2"
                  >
                    {portalLoading === sub.artist_id ? 'Loading...' : 'Manage'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-[#999999] text-xs mt-4">
          Having an issue with a charge?{' '}
          <a href="mailto:support@thecrwn.app" className="text-crwn-gold hover:underline">
            Contact support@thecrwn.app
          </a>
        </p>
      </div>

      {/* Account Actions */}
      <div className="bg-crwn-surface rounded-xl p-6">
        <h2 className="text-lg font-semibold text-crwn-text mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-crwn-gold" />
          Account
        </h2>
        
        <div className="space-y-2">
          <Link
            href="/support"
            className="w-full flex items-center gap-3 px-4 py-3 text-crwn-text-secondary hover:text-crwn-gold hover:bg-crwn-elevated rounded-lg transition-colors"
          >
            <LifeBuoy className="w-5 h-5" />
            <span>Support</span>
          </Link>
          <button
            onClick={async () => {
              await supabase
                .from('profiles')
                .update({ completed_tours: {} })
                .eq('id', user?.id);
              window.location.href = profile?.role === 'artist' ? '/profile/artist' : '/home';
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-crwn-text-secondary hover:text-crwn-gold hover:bg-crwn-elevated rounded-lg transition-colors"
          >
            <HelpCircle className="w-5 h-5" />
            <span>Replay Tour</span>
          </button>
          <button
            onClick={() => setShowDeactivate(true)}
            className="w-full flex items-center gap-3 px-4 py-3 text-crwn-text-secondary hover:text-crwn-error hover:bg-crwn-error/10 rounded-lg transition-colors"
          >
            <AlertTriangle className="w-5 h-5" />
            <span>Deactivate Account</span>
          </button>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 text-crwn-error hover:bg-crwn-error/10 rounded-lg transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
      {showDeactivate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="neu-raised rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-crwn-text mb-2">Deactivate Account</h3>
            <p className="text-crwn-text-secondary text-sm mb-4">
              Your profile will be hidden from other users. Your subscriptions will be paused. You can reactivate anytime by logging back in.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeactivate(false)}
                className="flex-1 py-2 rounded-lg neu-raised text-crwn-text font-semibold hover:opacity-80"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!user) return;
                  await fetch('/api/account/deactivate', { method: 'POST' });
                  await signOut();
                }}
                className="flex-1 py-2 rounded-lg bg-crwn-error text-white font-semibold hover:opacity-80"
              >
                Deactivate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
