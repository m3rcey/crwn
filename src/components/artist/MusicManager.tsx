'use client';

import { useState } from 'react';
import { TrackUploadForm } from '@/components/artist/TrackUploadForm';
import { AlbumManager } from '@/components/artist/AlbumManager';
import { ArtistPlaylistManager } from '@/components/artist/ArtistPlaylistManager';

export function MusicManager() {
  const [activeSubTab, setActiveSubTab] = useState<'tracks' | 'albums' | 'playlists'>('tracks');

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveSubTab('tracks')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'tracks'
              ? 'bg-crwn-gold text-crwn-bg'
              : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
          }`}
        >
          Tracks
        </button>
        <button
          onClick={() => setActiveSubTab('albums')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'albums'
              ? 'bg-crwn-gold text-crwn-bg'
              : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
          }`}
        >
          Albums
        </button>
        <button
          onClick={() => setActiveSubTab('playlists')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            activeSubTab === 'playlists'
              ? 'bg-crwn-gold text-crwn-bg'
              : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
          }`}
        >
          Playlists
        </button>
      </div>

      {activeSubTab === 'tracks' ? (
        <TrackUploadForm />
      ) : activeSubTab === 'albums' ? (
        <AlbumManager />
      ) : (
        <ArtistPlaylistManager />
      )}
    </div>
  );
}
