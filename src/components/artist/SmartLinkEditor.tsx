'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/shared/Toast';
import { ArrowLeft, Save, Loader2, Link2, Music, Calendar, ImagePlus, X } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface SmartLinkEditorProps {
  artistId: string;
  linkId: string | null;
  onBack: () => void;
  onSaved: () => void;
}

export function SmartLinkEditor({ artistId, linkId, onBack, onSaved }: SmartLinkEditorProps) {
  const { showToast } = useToast();

  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [collectEmail, setCollectEmail] = useState(true);
  const [collectPhone, setCollectPhone] = useState(false);
  const [collectName, setCollectName] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(!!linkId);

  // Pre-save fields
  const [linkType, setLinkType] = useState<'standard' | 'presave'>('standard');
  const [releaseDate, setReleaseDate] = useState('');
  const [artworkUrl, setArtworkUrl] = useState('');
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [artworkPreview, setArtworkPreview] = useState<string | null>(null);
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const [appleMusicUrl, setAppleMusicUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [soundcloudUrl, setSoundcloudUrl] = useState('');
  const [tidalUrl, setTidalUrl] = useState('');

  useEffect(() => {
    if (!linkId) {
      setIsLoading(false);
      return;
    }
    async function load() {
      try {
        const res = await fetch(`/api/smart-links?artistId=${artistId}`);
        const json = await res.json();
        const link = (json.links || []).find((l: any) => l.id === linkId);
        if (link) {
          setSlug(link.slug);
          setTitle(link.title || '');
          setDescription(link.description || '');
          setDestinationUrl(link.destination_url || '');
          setCollectEmail(link.collect_email);
          setCollectPhone(link.collect_phone);
          setCollectName(link.collect_name);
          setLinkType(link.link_type || 'standard');
          setReleaseDate(link.release_date || '');
          setArtworkUrl(link.artwork_url || '');
          if (link.artwork_url) setArtworkPreview(link.artwork_url);
          setSpotifyUrl(link.spotify_url || '');
          setAppleMusicUrl(link.apple_music_url || '');
          setYoutubeUrl(link.youtube_url || '');
          setSoundcloudUrl(link.soundcloud_url || '');
          setTidalUrl(link.tidal_url || '');
        }
      } catch {
        showToast('Failed to load link', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [linkId, artistId, showToast]);

  const handleArtworkSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image must be under 5MB', 'error');
      return;
    }
    setArtworkFile(file);
    setArtworkPreview(URL.createObjectURL(file));
  };

  const clearArtwork = () => {
    if (artworkPreview && artworkPreview.startsWith('blob:')) URL.revokeObjectURL(artworkPreview);
    setArtworkFile(null);
    setArtworkPreview(null);
    setArtworkUrl('');
  };

  const handleSave = async () => {
    if (!slug.trim()) {
      showToast('Slug is required', 'error');
      return;
    }
    if (linkType === 'presave' && !releaseDate) {
      showToast('Release date is required for pre-save campaigns', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // Upload artwork if new file selected
      let finalArtworkUrl = artworkUrl;
      if (artworkFile) {
        const supabase = createBrowserSupabaseClient();
        const ext = artworkFile.name.split('.').pop() || 'jpg';
        const path = `${artistId}/presave/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('album-art')
          .upload(path, artworkFile);
        if (uploadError) throw new Error('Artwork upload failed');
        const { data: { publicUrl } } = supabase.storage
          .from('album-art')
          .getPublicUrl(path);
        finalArtworkUrl = publicUrl;
      }

      const res = await fetch('/api/smart-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: linkId,
          artistId,
          slug: slug.trim(),
          title: title.trim(),
          description: description.trim(),
          destinationUrl: destinationUrl.trim(),
          collectEmail,
          collectPhone,
          collectName,
          linkType,
          releaseDate: linkType === 'presave' ? releaseDate : null,
          artworkUrl: linkType === 'presave' ? finalArtworkUrl : null,
          spotifyUrl: linkType === 'presave' ? spotifyUrl.trim() : null,
          appleMusicUrl: linkType === 'presave' ? appleMusicUrl.trim() : null,
          youtubeUrl: linkType === 'presave' ? youtubeUrl.trim() : null,
          soundcloudUrl: linkType === 'presave' ? soundcloudUrl.trim() : null,
          tidalUrl: linkType === 'presave' ? tidalUrl.trim() : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      showToast(linkType === 'presave' ? 'Pre-save campaign saved' : 'Link saved', 'success');
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-lg text-crwn-text-secondary hover:text-crwn-text transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-crwn-text">
            {linkId ? (linkType === 'presave' ? 'Edit Pre-Save' : 'Edit Link') : (linkType === 'presave' ? 'New Pre-Save Campaign' : 'New Smart Link')}
          </h2>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || !slug.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>

      {/* Link Type Toggle */}
      {!linkId && (
        <div className="flex items-center gap-2 bg-crwn-card rounded-full p-1 w-fit">
          <button
            onClick={() => setLinkType('standard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              linkType === 'standard' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Link2 className="w-4 h-4" />
            Smart Link
          </button>
          <button
            onClick={() => setLinkType('presave')}
            className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              linkType === 'presave' ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            <Music className="w-4 h-4" />
            Pre-Save
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div>
            <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">
              URL Slug
            </label>
            <div className="flex items-center gap-0">
              <span className="px-3 py-2.5 bg-crwn-elevated border border-crwn-elevated border-r-0 rounded-l-xl text-xs text-crwn-text-secondary">
                thecrwn.app/link/
              </span>
              <input
                type="text"
                value={slug}
                onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-new-single"
                maxLength={50}
                className="flex-1 px-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-r-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Get early access to my new album"
              className="w-full px-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional message shown on the capture page"
              className="w-full px-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50 resize-y"
            />
          </div>

          {/* Pre-Save Fields */}
          {linkType === 'presave' && (
            <>
              <div>
                <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">
                  <Calendar className="w-3 h-3 inline mr-1" />
                  Release Date
                </label>
                <input
                  type="date"
                  value={releaseDate}
                  onChange={e => setReleaseDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-xl text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
                />
                <p className="text-xs text-crwn-text-secondary mt-1">
                  Fans who pre-save will be notified on release day via email.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">Artwork</label>
                {artworkPreview ? (
                  <div className="relative inline-block">
                    <img
                      src={artworkPreview}
                      alt="Release artwork"
                      className="w-32 h-32 object-cover rounded-xl border border-crwn-elevated"
                    />
                    <button
                      onClick={clearArtwork}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-400 transition-colors"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg cursor-pointer hover:border-crwn-gold/30 transition-colors w-fit">
                    <ImagePlus className="w-4 h-4 text-crwn-text-secondary" />
                    <span className="text-sm text-crwn-text-secondary">Upload artwork</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleArtworkSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div className="border-t border-crwn-elevated pt-4">
                <h3 className="text-xs font-medium text-crwn-text-secondary mb-3">Streaming Platform Links</h3>
                <p className="text-xs text-crwn-text-secondary mb-3">
                  Add links as they become available. Fans see buttons for each platform after pre-saving.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-crwn-text-secondary mb-1">Spotify</label>
                    <input
                      type="url"
                      value={spotifyUrl}
                      onChange={e => setSpotifyUrl(e.target.value)}
                      placeholder="https://open.spotify.com/..."
                      className="w-full px-3 py-2 bg-crwn-card border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-crwn-text-secondary mb-1">Apple Music</label>
                    <input
                      type="url"
                      value={appleMusicUrl}
                      onChange={e => setAppleMusicUrl(e.target.value)}
                      placeholder="https://music.apple.com/..."
                      className="w-full px-3 py-2 bg-crwn-card border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-crwn-text-secondary mb-1">YouTube Music</label>
                    <input
                      type="url"
                      value={youtubeUrl}
                      onChange={e => setYoutubeUrl(e.target.value)}
                      placeholder="https://music.youtube.com/..."
                      className="w-full px-3 py-2 bg-crwn-card border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-crwn-text-secondary mb-1">SoundCloud</label>
                    <input
                      type="url"
                      value={soundcloudUrl}
                      onChange={e => setSoundcloudUrl(e.target.value)}
                      placeholder="https://soundcloud.com/..."
                      className="w-full px-3 py-2 bg-crwn-card border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-crwn-text-secondary mb-1">TIDAL</label>
                    <input
                      type="url"
                      value={tidalUrl}
                      onChange={e => setTidalUrl(e.target.value)}
                      placeholder="https://tidal.com/..."
                      className="w-full px-3 py-2 bg-crwn-card border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {linkType === 'standard' && (
            <div>
              <label className="block text-xs font-medium text-crwn-text-secondary mb-1.5">
                Redirect URL (after capture)
              </label>
              <input
                type="url"
                value={destinationUrl}
                onChange={e => setDestinationUrl(e.target.value)}
                placeholder="https://open.spotify.com/album/..."
                className="w-full px-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-xl text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
              />
              <p className="text-xs text-crwn-text-secondary mt-1">
                Where fans go after submitting. Spotify, Apple Music, merch store, etc.
              </p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4 space-y-3">
            <h3 className="text-sm font-medium text-crwn-text">Collect</h3>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={collectEmail}
                onChange={e => setCollectEmail(e.target.checked)}
                className="rounded border-crwn-elevated text-crwn-gold focus:ring-crwn-gold/50"
              />
              <span className="text-xs text-crwn-text-secondary">Email address</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={collectName}
                onChange={e => setCollectName(e.target.checked)}
                className="rounded border-crwn-elevated text-crwn-gold focus:ring-crwn-gold/50"
              />
              <span className="text-xs text-crwn-text-secondary">Name</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={collectPhone}
                onChange={e => setCollectPhone(e.target.checked)}
                className="rounded border-crwn-elevated text-crwn-gold focus:ring-crwn-gold/50"
              />
              <span className="text-xs text-crwn-text-secondary">Phone number</span>
            </label>
          </div>

          <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
            <h3 className="text-sm font-medium text-crwn-text mb-2">Preview</h3>
            <div className="bg-[#0D0D0D] rounded-lg p-4 text-center">
              {linkType === 'presave' && artworkPreview ? (
                <img src={artworkPreview} alt="Artwork" className="w-20 h-20 rounded-lg mx-auto mb-2 object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-crwn-elevated mx-auto mb-2 flex items-center justify-center">
                  {linkType === 'presave' ? <Music className="w-5 h-5 text-crwn-gold" /> : <Link2 className="w-5 h-5 text-crwn-gold" />}
                </div>
              )}
              <p className="text-xs text-white font-medium">{title || (linkType === 'presave' ? 'Your Release' : 'Your Title')}</p>
              {description && <p className="text-[10px] text-[#A0A0A0] mt-1">{description}</p>}
              {linkType === 'presave' && releaseDate && (
                <p className="text-[10px] text-crwn-gold mt-1">
                  Drops {new Date(releaseDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
              <div className="mt-3 space-y-1.5">
                {collectName && <div className="h-7 bg-[#242424] rounded-lg" />}
                {collectEmail && <div className="h-7 bg-[#242424] rounded-lg" />}
                {collectPhone && <div className="h-7 bg-[#242424] rounded-lg" />}
                <div className="h-7 bg-gradient-to-r from-[#9a7b2a] to-[#D4AF37] rounded-lg" />
              </div>
              {linkType === 'presave' && (
                <div className="mt-3 space-y-1.5">
                  {spotifyUrl && <div className="h-6 bg-[#1DB954]/20 rounded-lg flex items-center justify-center"><span className="text-[9px] text-[#1DB954]">Spotify</span></div>}
                  {appleMusicUrl && <div className="h-6 bg-[#FA243C]/20 rounded-lg flex items-center justify-center"><span className="text-[9px] text-[#FA243C]">Apple Music</span></div>}
                  {youtubeUrl && <div className="h-6 bg-[#FF0000]/20 rounded-lg flex items-center justify-center"><span className="text-[9px] text-[#FF0000]">YouTube</span></div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
