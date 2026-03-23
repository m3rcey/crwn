'use client';

import { useState, useEffect } from 'react';
import { Plus, Link2, Loader2, Eye, Users, ExternalLink, Copy } from 'lucide-react';
import { useToast } from '@/components/shared/Toast';

interface SmartLink {
  id: string;
  slug: string;
  title: string | null;
  destination_url: string | null;
  is_active: boolean;
  view_count: number;
  capture_count: number;
  collect_email: boolean;
  collect_phone: boolean;
  collect_name: boolean;
  created_at: string;
}

interface SmartLinkListProps {
  artistId: string;
  onNew: () => void;
  onEdit: (id: string) => void;
}

export function SmartLinkList({ artistId, onNew, onEdit }: SmartLinkListProps) {
  const [links, setLinks] = useState<SmartLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/smart-links?artistId=${artistId}`);
        const json = await res.json();
        setLinks(json.links || []);
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [artistId]);

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`https://thecrwn.app/link/${slug}`);
    showToast('Link copied!', 'success');
  };

  const conversionRate = (views: number, captures: number) => {
    if (views === 0) return '0%';
    return `${Math.round((captures / views) * 100)}%`;
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-crwn-text">Smart Links</h2>
          <p className="text-sm text-crwn-text-secondary mt-0.5">Capture fan emails before redirecting them anywhere</p>
        </div>
        <button
          onClick={onNew}
          className="flex items-center gap-2 px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Link
        </button>
      </div>

      {links.length === 0 ? (
        <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-12 text-center">
          <Link2 className="w-10 h-10 text-crwn-text-secondary mx-auto mb-3" />
          <p className="text-crwn-text font-medium mb-1">No smart links yet</p>
          <p className="text-sm text-crwn-text-secondary mb-4">
            Create a link to capture fan info before sending them to Spotify, your merch store, etc.
          </p>
          <button
            onClick={onNew}
            className="px-4 py-2.5 bg-crwn-gold text-crwn-bg rounded-full text-sm font-semibold hover:bg-crwn-gold/90 transition-colors"
          >
            Create Link
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map(link => (
            <div key={link.id} className="bg-crwn-card rounded-xl border border-crwn-elevated p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-medium text-crwn-text truncate">
                      {link.title || link.slug}
                    </h3>
                    {!link.is_active && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-crwn-elevated text-crwn-text-secondary">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-crwn-text-secondary font-mono mb-2">
                    thecrwn.app/link/{link.slug}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-crwn-text-secondary">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      {link.view_count} views
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {link.capture_count} captures
                    </span>
                    <span className="text-crwn-gold font-medium">
                      {conversionRate(link.view_count, link.capture_count)} conversion
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => copyLink(link.slug)}
                    className="p-2 rounded-lg border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
                    title="Copy link"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <a
                    href={`/link/${link.slug}`}
                    target="_blank"
                    rel="noopener"
                    className="p-2 rounded-lg border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
                    title="Preview"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                  <button
                    onClick={() => onEdit(link.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
