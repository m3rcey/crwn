'use client';

import { useEffect, useState } from 'react';
import { LiveKitRoom, VideoConference } from '@livekit/components-react';
import '@livekit/components-styles';
import { Loader2, X } from 'lucide-react';

interface BroadcasterStudioProps {
  sessionId: string;
  title: string;
  onClose: () => void;
}

// Artist's live broadcast view. Mints a broadcaster token (publish + roomAdmin)
// from /api/live/token and connects to the LiveKit room.
export function BroadcasterStudio({ sessionId, title, onClose }: BroadcasterStudioProps) {
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function connect() {
      try {
        const res = await fetch('/api/live/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.reason || data.error || 'Could not start broadcast');
          return;
        }
        if (!cancelled) {
          setToken(data.token);
          setUrl(data.url);
        }
      } catch {
        if (!cancelled) setError('Network error starting broadcast');
      }
    }
    connect();
    return () => { cancelled = true; };
  }, [sessionId]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-crwn-elevated">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-crwn-text font-semibold">Live · {title}</span>
        </div>
        <button onClick={onClose} className="text-crwn-text-dim hover:text-crwn-text p-2">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 min-h-0">
        {error ? (
          <div className="h-full flex items-center justify-center text-crwn-error px-6 text-center">
            {error}
          </div>
        ) : !token || !url ? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
          </div>
        ) : (
          <LiveKitRoom
            serverUrl={url}
            token={token}
            connect
            video
            audio
            data-lk-theme="default"
            style={{ height: '100%' }}
          >
            <VideoConference />
          </LiveKitRoom>
        )}
      </div>
    </div>
  );
}
