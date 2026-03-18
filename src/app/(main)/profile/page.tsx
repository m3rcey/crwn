'use client';

import { useState } from 'react';
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
  AlertTriangle
} from 'lucide-react';

export default function ProfilePage() {
  const { user, profile, signOut, isLoading } = useAuth();
  const [showDeactivate, setShowDeactivate] = useState(false);
  const router = useRouter();
  const supabase = createBrowserSupabaseClient();

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

      {/* Account Actions */}
      <div className="bg-crwn-surface rounded-xl p-6">
        <h2 className="text-lg font-semibold text-crwn-text mb-4 flex items-center gap-2">
          <Settings className="w-5 h-5 text-crwn-gold" />
          Account
        </h2>
        
        <div className="space-y-2">
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
                  await supabase
                    .from('profiles')
                    .update({ is_active: false })
                    .eq('id', user.id);
                  if (profile?.role === 'artist') {
                    await supabase
                      .from('artist_profiles')
                      .update({ is_active: false })
                      .eq('user_id', user.id);
                  }
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
