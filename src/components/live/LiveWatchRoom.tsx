'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  useTracks,
  RoomAudioRenderer,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { useSubscription } from '@/hooks/useSubscription';
import { SubscribeCTA } from '@/components/gating';
import { LiveChatPanel } from './LiveChatPanel';
import { LiveSession } from '@/types/live';
import { Loader2, Radio } from 'lucide-react';

interface LiveWatchRoomProps {
  session: LiveSession;
  artistId: string;
  artistSlug: string;
  artistName: string;
  currentUserId: string | null;
  isOwner: boolean;
}

function WatchVideo() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: true }
  );
  return (
    <div className="h-full w-full">
      {tracks.length > 0 ? (
        <GridLayout tracks={tracks} style={{ height: '100%' }}>
          <ParticipantTile />
        </GridLayout>
      ) : (
        <div className="h-full flex items-center justify-center text-crwn-text-dim">
          Waiting for the artist to start the video...
        </div>
      )}
      <RoomAudioRenderer />
    </div>
  );
}

export function LiveWatchRoom({ session, artistId, artistSlug, artistName, currentUserId, isOwner }: LiveWatchRoomProps) {
  const { tierId, isLoading: subLoading } = useSubscription(artistId);
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const joinedRef = useRef(false);

  const allowedTiers = Array.isArray(session.allowed_tier_ids) ? session.allowed_tier_ids : [];
  const canAccess = isOwner || session.is_free || (!!tierId && allowedTiers.includes(tierId));

  // Free the slot on unmount / page hide.
  useEffect(() => {
    const leave = () => {
      if (!joinedRef.current) return;
      navigator.sendBeacon?.(
        '/api/live/leave',
        new Blob([JSON.stringify({ sessionId: session.id })], { type: 'application/json' })
      );
    };
    window.addEventListener('beforeunload', leave);
    return () => {
      leave();
      window.removeEventListener('beforeunload', leave);
    };
  }, [session.id]);

  const join = async () => {
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch('/api/live/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setJoinError(data.reason || data.error || 'Could not join');
        return;
      }
      joinedRef.current = true;
      setToken(data.token);
      setUrl(data.url);
    } catch {
      setJoinError('Network error');
    } finally {
      setJoining(false);
    }
  };

  // --- Non-live states ---
  if (session.status === 'ended') {
    return <Centered title="This session has ended" subtitle={`${artistName} is no longer live.`} />;
  }
  if (session.status === 'scheduled') {
    const when = session.scheduled_at ? new Date(session.scheduled_at).toLocaleString() : null;
    return <Centered title="Not live yet" subtitle={when ? `Scheduled for ${when}` : `${artistName} hasn't started yet.`} />;
  }

  // --- Live: gate before join ---
  if (!currentUserId) {
    return (
      <Centered title={`${artistName} is live`} subtitle="Log in to join this session.">
        <a href={`/login`} className="neu-button-accent px-6 py-3 rounded-xl font-semibold">Log in</a>
      </Centered>
    );
  }

  if (subLoading) {
    return <div className="h-full flex items-center justify-center"><Loader2 className="w-8 h-8 text-crwn-gold animate-spin" /></div>;
  }

  if (!canAccess) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4">
        <SubscribeCTA artistName={artistName} artistSlug={artistSlug} />
      </div>
    );
  }

  // Allowed but not yet connected
  if (!token || !url) {
    return (
      <Centered title={`${artistName} is live`} subtitle={session.title}>
        {joinError && <p className="text-crwn-error text-sm mb-3">{joinError}</p>}
        <button onClick={join} disabled={joining} className="neu-button-accent px-8 py-3 rounded-xl font-semibold flex items-center gap-2 disabled:opacity-50">
          {joining ? <Loader2 className="w-5 h-5 animate-spin" /> : <Radio className="w-5 h-5" />}
          Join Live
        </button>
      </Centered>
    );
  }

  // Connected: video + chat
  return (
    <div className="flex flex-col md:flex-row h-[calc(100vh-4rem)]">
      <div className="flex-1 min-h-0 bg-black">
        <LiveKitRoom serverUrl={url} token={token} connect video={false} audio={false} data-lk-theme="default" style={{ height: '100%' }}>
          <WatchVideo />
        </LiveKitRoom>
      </div>
      <div className="w-full md:w-80 h-64 md:h-auto">
        <LiveChatPanel sessionId={session.id} currentUserId={currentUserId} canPost={canAccess} canModerate={isOwner} />
      </div>
    </div>
  );
}

function Centered({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <h1 className="text-2xl font-bold text-crwn-text mb-2">{title}</h1>
      {subtitle && <p className="text-crwn-text-secondary mb-6">{subtitle}</p>}
      {children}
    </div>
  );
}
