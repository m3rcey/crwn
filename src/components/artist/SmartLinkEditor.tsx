'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/components/shared/Toast';
import { ArrowLeft, Save, Loader2, Link2 } from 'lucide-react';

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
        }
      } catch {
        showToast('Failed to load link', 'error');
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [linkId, artistId, showToast]);

  const handleSave = async () => {
    if (!slug.trim()) {
      showToast('Slug is required', 'error');
      return;
    }

    setIsSaving(true);
    try {
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
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      showToast('Link saved', 'success');
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
            {linkId ? 'Edit Link' : 'New Smart Link'}
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
              <div className="w-10 h-10 rounded-full bg-crwn-elevated mx-auto mb-2 flex items-center justify-center">
                <Link2 className="w-5 h-5 text-crwn-gold" />
              </div>
              <p className="text-xs text-white font-medium">{title || 'Your Title'}</p>
              {description && <p className="text-[10px] text-[#A0A0A0] mt-1">{description}</p>}
              <div className="mt-3 space-y-1.5">
                {collectName && <div className="h-7 bg-[#242424] rounded-lg" />}
                {collectEmail && <div className="h-7 bg-[#242424] rounded-lg" />}
                {collectPhone && <div className="h-7 bg-[#242424] rounded-lg" />}
                <div className="h-7 bg-gradient-to-r from-[#9a7b2a] to-[#D4AF37] rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
