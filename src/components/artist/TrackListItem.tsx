'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase/client';
import { Playlist, Track } from '@/types';
import { Plus, Check, ChevronDown, ListMusic } from 'lucide-react';

interface AddToPlaylistMenuProps {
  track: Track;
}

export function AddToPlaylistMenu({ track }: AddToPlaylistMenuProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [trackPlaylistIds, setTrackPlaylistIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!user || !isOpen) return;

    async function loadPlaylists() {
      setIsLoading(true);
      try {
        // Load user's playlists
        const { data: playlistsData } = await supabase
          .from('playlists')
          .select('*')
          .eq('user_id', user!.id)
          .order('title');

        setPlaylists(playlistsData || []);

        // Load which playlists contain this track
        const { data: trackPlaylists } = await supabase
          .from('playlist_tracks')
          .select('playlist_id')
          .eq('track_id', track.id);

        const playlistIds = new Set((trackPlaylists || []).map((tp) => tp.playlist_id));
        setTrackPlaylistIds(playlistIds);
      } catch (error) {
        console.error('Error loading playlists:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadPlaylists();
  }, [user, track.id, isOpen]);

  const handleAddToPlaylist = async (playlistId: string) => {
    try {
      if (trackPlaylistIds.has(playlistId)) {
        // Remove from playlist
        await supabase
          .from('playlist_tracks')
          .delete()
          .eq('playlist_id', playlistId)
          .eq('track_id', track.id);

        setTrackPlaylistIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(playlistId);
          return newSet;
        });
      } else {
        // Get current max position
        const { data: existingTracks } = await supabase
          .from('playlist_tracks')
          .select('position')
          .eq('playlist_id', playlistId)
          .order('position', { ascending: false })
          .limit(1);

        const newPosition = (existingTracks?.[0]?.position || 0) + 1;

        // Add to playlist
        await supabase.from('playlist_tracks').insert({
          playlist_id: playlistId,
          track_id: track.id,
          position: newPosition,
        });

        setTrackPlaylistIds((prev) => new Set([...prev, playlistId]));
      }
    } catch (error) {
      console.error('Error updating playlist:', error);
    }
  };

  const handleCreatePlaylist = async () => {
    const title = prompt('Enter playlist name:');
    if (!title) return;

    try {
      const { data: newPlaylist, error } = await supabase
        .from('playlists')
        .insert({
          user_id: user!.id,
          title,
          is_public: false,
        })
        .select()
        .single();

      if (error) throw error;

      setPlaylists((prev) => [...prev, newPlaylist as Playlist]);
      setTrackPlaylistIds((prev) => new Set([...prev, newPlaylist.id]));

      // Add track to new playlist
      await supabase.from('playlist_tracks').insert({
        playlist_id: newPlaylist.id,
        track_id: track.id,
        position: 1,
      });
    } catch (error) {
      console.error('Error creating playlist:', error);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 text-crwn-text-secondary hover:text-crwn-text hover:bg-crwn-elevated rounded-lg"
        title="Add to playlist"
      >
        <ListMusic className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-56 bg-crwn-surface border border-crwn-elevated rounded-lg shadow-xl z-50">
          <div className="p-2 border-b border-crwn-elevated">
            <span className="text-xs font-medium text-crwn-text-secondary uppercase">Add to Playlist</span>
          </div>
          <div className="max-h-48 overflow-y-auto p-1">
            {isLoading ? (
              <div className="p-2 text-crwn-text-secondary text-sm">Loading...</div>
            ) : playlists.length > 0 ? (
              playlists.map((playlist) => (
                <button
                  key={playlist.id}
                  onClick={() => handleAddToPlaylist(playlist.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-crwn-elevated text-left"
                >
                  <div className="w-8 h-8 bg-crwn-elevated rounded flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">🎶</span>
                  </div>
                  <span className="flex-1 text-crwn-text truncate text-sm">{playlist.title}</span>
                  {trackPlaylistIds.has(playlist.id) && (
                    <Check className="w-4 h-4 text-crwn-gold" />
                  )}
                </button>
              ))
            ) : (
              <div className="p-2 text-crwn-text-secondary text-sm">No playlists yet</div>
            )}
          </div>
          <div className="p-1 border-t border-crwn-elevated">
            <button
              onClick={handleCreatePlaylist}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-crwn-elevated text-left text-crwn-gold"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">Create New Playlist</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
