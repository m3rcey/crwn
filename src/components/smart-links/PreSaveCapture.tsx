'use client';

import { useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';

interface PreSaveCaptureProps {
  linkId: string;
  artistId: string;
  collectEmail: boolean;
  collectPhone: boolean;
  collectName: boolean;
  spotifyUrl: string | null;
  appleMusicUrl: string | null;
  youtubeUrl: string | null;
  soundcloudUrl: string | null;
  tidalUrl: string | null;
  releaseDate: string | null;
}

const PLATFORM_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  spotify: { label: 'Spotify', bg: 'bg-[#1DB954]', text: 'text-white' },
  apple_music: { label: 'Apple Music', bg: 'bg-[#FA243C]', text: 'text-white' },
  youtube: { label: 'YouTube Music', bg: 'bg-[#FF0000]', text: 'text-white' },
  soundcloud: { label: 'SoundCloud', bg: 'bg-[#FF5500]', text: 'text-white' },
  tidal: { label: 'TIDAL', bg: 'bg-white', text: 'text-black' },
};

export function PreSaveCapture({
  linkId,
  artistId,
  collectEmail,
  collectPhone,
  collectName,
  spotifyUrl,
  appleMusicUrl,
  youtubeUrl,
  soundcloudUrl,
  tidalUrl,
  releaseDate,
}: PreSaveCaptureProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const isReleased = releaseDate ? new Date(releaseDate + 'T00:00:00') <= new Date() : false;

  const platformLinks = [
    { key: 'spotify', url: spotifyUrl },
    { key: 'apple_music', url: appleMusicUrl },
    { key: 'youtube', url: youtubeUrl },
    { key: 'soundcloud', url: soundcloudUrl },
    { key: 'tidal', url: tidalUrl },
  ].filter(p => p.url);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (collectEmail && !email.trim()) {
      setError('Email is required');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/smart-links/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkId,
          artistId,
          name: collectName ? name.trim() : undefined,
          email: collectEmail ? email.trim() : undefined,
          phone: collectPhone ? phone.trim() : undefined,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Something went wrong');
      setIsSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  // After submission — show streaming links
  if (isSubmitted) {
    return (
      <div className="bg-[#1A1A1A] rounded-2xl border border-[#333] p-8 text-center space-y-5">
        <CheckCircle className="w-12 h-12 text-[#D4AF37] mx-auto" />
        <div>
          <p className="text-white font-medium text-lg">
            {isReleased ? "It's out now!" : "You're on the list!"}
          </p>
          <p className="text-[#A0A0A0] text-sm mt-1">
            {isReleased
              ? 'Listen now on your favorite platform.'
              : "We'll notify you the moment it drops."}
          </p>
        </div>

        {platformLinks.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-[#666] uppercase tracking-wider">
              {isReleased ? 'Listen Now' : 'Pre-Save On'}
            </p>
            {platformLinks.map(({ key, url }) => {
              const style = PLATFORM_STYLES[key];
              return (
                <a
                  key={key}
                  href={url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`block w-full py-3 ${style.bg} ${style.text} rounded-xl text-sm font-bold hover:opacity-90 transition-opacity`}
                >
                  {style.label}
                </a>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-[#1A1A1A] rounded-2xl border border-[#333] p-6 space-y-4">
      <p className="text-center text-sm text-[#A0A0A0]">
        {isReleased
          ? 'Enter your info to get future releases first.'
          : 'Pre-save to get notified on release day.'}
      </p>

      {collectName && (
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Your name"
          className="w-full px-4 py-3 bg-[#242424] border border-[#333] rounded-xl text-sm text-white placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37]/50"
        />
      )}

      {collectEmail && (
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Your email"
          required
          className="w-full px-4 py-3 bg-[#242424] border border-[#333] rounded-xl text-sm text-white placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37]/50"
        />
      )}

      {collectPhone && (
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="Phone number (optional)"
          className="w-full px-4 py-3 bg-[#242424] border border-[#333] rounded-xl text-sm text-white placeholder:text-[#666] focus:outline-none focus:border-[#D4AF37]/50"
        />
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 bg-gradient-to-r from-[#9a7b2a] to-[#D4AF37] text-[#0D0D0D] rounded-xl text-sm font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {isSubmitting ? (
          <Loader2 className="w-4 h-4 animate-spin mx-auto" />
        ) : isReleased ? (
          'Get Access'
        ) : (
          'Pre-Save'
        )}
      </button>
    </form>
  );
}
