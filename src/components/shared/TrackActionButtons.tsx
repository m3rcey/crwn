'use client';

import { useState, useRef, useEffect } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { Heart, Plus, X, Loader2 } from 'lucide-react';

interface TrackActionButtonsProps {
  trackId: string;
  size?: 'sm' | 'md';
  isLiked?: boolean;
  onToggleLike?: () => void;
}

export function TrackActionButtons({ trackId, size = 'sm', isLiked: initialLiked, onToggleLike }: TrackActionButtonsProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  
  const [isLiked, setIsLiked] = useState(initialLiked ?? false);
  const [isLoadingLike, setIsLoadingLike] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [playlists, setPlaylists] = useState<{ id: string; title: string }[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);

  // Update local state when prop changes
  useEffect(() => {
    if (initialLiked !== undefined) {
      setIsLiked(initialLiked);
    }
  }, [initialLiked]);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowPlaylistMenu(false);
        setShowCreatePlaylist(false);
      }
    }
    if (showPlaylistMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showPlaylistMenu]);

  const handleToggleLike = async () => {
    if (!user) {
      showToast('Sign in to save tracks', 'warning');
      return;
    }

    setIsLoadingLike(true);
    try {
      if (isLiked) {
        // Unlike
        await supabase
          .from('favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('track_id', trackId);
        setIsLiked(false);
        showToast('Removed from Liked Songs', 'success');
      } else {
        // Like
        await supabase
          .from('favorites')
          .insert({
            user_id: user.id,
            track_id: trackId,
          });
        setIsLiked(true);
        showToast('Added to Liked Songs', 'success');
      }
      onToggleLike?.();
    } catch (error) {
      console.error('Error toggling favorite:', error);
      showToast('Failed to update', 'error');
    } finally {
      setIsLoadingLike(false);
    }
  };

  const handleOpenPlaylistMenu = async () => {
    if (!user) {
      showToast('Sign in to save tracks', 'warning');
      return;
    }

    setShowPlaylistMenu(true);
    setIsLoadingPlaylists(true);
    
    const { data, error } = await supabase
      .from('playlists')
      .select('id, title')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setPlaylists(data);
    }
    setIsLoadingPlaylists(false);
  };

  const handleAddToPlaylist = async (playlistId: string, playlistTitle: string) => {
    // Check if track already in playlist
    const { data: existing } = await supabase
      .from('playlist_tracks')
      .select('id')
      .eq('playlist_id', playlistId)
      .eq('track_id', trackId)
      .maybeSingle();

    if (existing) {
      showToast(`Already in ${playlistTitle}`, 'warning');
      setShowPlaylistMenu(false);
      return;
    }

    // Get max position
    const { data: maxPos } = await supabase
      .from('playlist_tracks')
      .select('position')
      .eq('playlist_id', playlistId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const newPosition = (maxPos?.position ?? 0) + 1;

    // Add track
    const { error } = await supabase
      .from('playlist_tracks')
      .insert({
        playlist_id: playlistId,
        track_id: trackId,
        position: newPosition,
      });

    if (!error) {
      showToast(`Added to ${playlistTitle}`, 'success');
    } else {
      showToast('Failed to add track', 'error');
    }
    setShowPlaylistMenu(false);
  };

  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    
    setIsCreating(true);
    try {
      const { data: newPlaylist, error } = await supabase
        .from('playlists')
        .insert({
          user_id: user!.id,
          title: newPlaylistName.trim(),
          is_public: false,
        })
        .select('id, title')
        .single();

      if (!error && newPlaylist) {
        // Add track to new playlist
        await supabase
          .from('playlist_tracks')
          .insert({
            playlist_id: newPlaylist.id,
            track_id: trackId,
            position: 1,
          });
        
        showToast(`Added to ${newPlaylistName}`, 'success');
        setNewPlaylistName('');
        setShowCreatePlaylist(false);
        setShowPlaylistMenu(false);
      }
    } catch (error) {
      console.error('Error creating playlist:', error);
      showToast('Failed to create playlist', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const iconSize = size === 'sm' ? 16 : 20;
  const buttonPadding = size === 'sm' ? 'p-1.5' : 'p-2';

  return (
    <div className="flex items-center gap-1 relative" ref={menuRef}>
      {/* Heart/Like Button */}
      <button
        onClick={handleToggleLike}
        disabled={isLoadingLike}
        className={`${buttonPadding} rounded-full hover:bg-crwn-elevated transition-colors ${
          isLiked ? 'text-crwn-gold' : 'text-crwn-text-secondary hover:text-crwn-text'
        }`}
        title={isLiked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      >
        {isLoadingLike ? (
          <Loader2 className={`animate-spin`} size={iconSize} />
        ) : (
          <Heart size={iconSize} fill={isLiked ? 'currentColor' : 'none'} />
        )}
      </button>

      {/* Add to Playlist Button */}
      <div className="relative">
        <button
          onClick={handleOpenPlaylistMenu}
          className={`${buttonPadding} rounded-full text-crwn-text-secondary hover:text-crwn-text hover:bg-crwn-elevated transition-colors`}
          title="Add to Playlist"
        >
          <Plus size={iconSize} />
        </button>

        {/* Playlist Dropdown */}
        {showPlaylistMenu && (
          <div className="absolute right-0 top-full mt-1 w-48 neu-raised rounded-lg overflow-hidden z-50">
            <div className="p-2 border-b border-crwn-elevated">
              <p className="text-xs font-medium text-crwn-text-secondary uppercase">Add to Playlist</p>
            </div>
            
            {isLoadingPlaylists ? (
              <div className="p-4 flex justify-center">
                <Loader2 className="w-4 h-4 text-crwn-gold animate-spin" />
              </div>
            ) : playlists.length > 0 ? (
              <div className="max-h-48 overflow-y-auto">
                {playlists.map(playlist => (
                  <button
                    key={playlist.id}
                    onClick={() => handleAddToPlaylist(playlist.id, playlist.title)}
                    className="w-full px-3 py-2 text-left text-sm text-crwn-text hover:bg-crwn-gold/10 hover:text-crwn-gold transition-colors"
                  >
                    {playlist.title}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-3 py-2 text-sm text-crwn-text-secondary">No playlists yet</p>
            )}
            
            {/* Create New Playlist */}
            {showCreatePlaylist ? (
              <div className="p-2 border-t border-crwn-elevated">
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    placeholder="Playlist name"
                    className="flex-1 px-2 py-1 text-sm bg-crwn-bg border border-crwn-elevated rounded text-crwn-text placeholder-crwn-text-secondary focus:outline-none focus:border-crwn-gold"
                    onKeyDown={(e) => e.key === 'Enter' && handleCreatePlaylist()}
                    autoFocus
                  />
                  <button
                    onClick={handleCreatePlaylist}
                    disabled={isCreating || !newPlaylistName.trim()}
                    className="px-2 py-1 bg-crwn-gold text-crwn-bg text-sm rounded hover:bg-crwn-gold-hover disabled:opacity-50"
                  >
                    {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowCreatePlaylist(true)}
                className="w-full px-3 py-2 text-left text-sm text-crwn-gold hover:bg-crwn-gold/10 transition-colors border-t border-crwn-elevated"
              >
                + Create New Playlist
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
