'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Loader2, Star, ExternalLink, Search } from 'lucide-react';

/**
 * Admin > Artists: every artist on CRWN, newest first, with the founder's Featured switch.
 *
 * Featured is the founder's discretion (2026-09-26): a new artist is never on Home's Featured
 * row until it is switched on here. Artists cannot set it themselves. "Hidden" is the older
 * discovery flag (also removes an artist from Explore) and is shown read-only for context.
 */

type AdminArtist = {
  id: string;
  slug: string | null;
  createdAt: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  accountActive: boolean;
  plan: string;
  stripeConnected: boolean;
  tracks: number;
  activeMembers: number;
  featured: boolean;
  hidden: boolean;
};

const PLAN_LABEL: Record<string, string> = { starter: 'Launch', pro: 'Pro', scale: 'Scale' };

export default function ArtistsView() {
  const [artists, setArtists] = useState<AdminArtist[]>([]);
  const [featuredColumn, setFeaturedColumn] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/admin/artists')
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'Could not load artists');
        setArtists(j.artists);
        setFeaturedColumn(j.featuredColumn);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleFeatured = async (a: AdminArtist) => {
    setSaving(a.id);
    setError(null);
    try {
      const r = await fetch('/api/admin/artists', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId: a.id, featured: !a.featured }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not save');
      setArtists((prev) => prev.map((x) => (x.id === a.id ? { ...x, featured: j.featured } : x)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((a) =>
      [a.displayName, a.slug, a.email].some((v) => v?.toLowerCase().includes(q))
    );
  }, [artists, query]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  const featuredCount = artists.filter((a) => a.featured && !a.hidden).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-crwn-text">All artists ({artists.length})</h2>
          <p className="text-sm text-crwn-text-secondary">
            {featuredCount} switched on for the Home Featured row. New artists stay off it until you
            switch them on, and a featured artist still needs music, a photo and a name to appear.
          </p>
        </div>
        <label className="relative block sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-crwn-text-secondary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, link or email"
            className="w-full rounded-full bg-crwn-elevated pl-9 pr-4 py-2 text-sm text-crwn-text placeholder:text-crwn-text-secondary outline-none"
          />
        </label>
      </div>

      {!featuredColumn && (
        <p className="rounded-xl bg-crwn-elevated p-4 text-sm text-crwn-text-secondary">
          The Featured switch goes live once supabase/schema-phase2-featured-on-home-opt-in.sql is
          run. Until then Home features every complete artist.
        </p>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="divide-y divide-crwn-elevated">
        {shown.map((a) => (
          <div key={a.id} className="flex items-center gap-3 py-3">
            <div className="relative w-10 h-10 shrink-0 rounded-full overflow-hidden bg-crwn-elevated">
              {a.avatarUrl && <Image src={a.avatarUrl} alt="" fill sizes="40px" className="object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-crwn-text">{a.displayName || 'No name'}</span>
                {!a.accountActive && <span className="text-xs text-red-400">Deactivated</span>}
                {a.hidden && <span className="text-xs text-crwn-text-secondary">Hidden from discovery</span>}
              </div>
              <div className="truncate text-xs text-crwn-text-secondary">
                {a.slug ? `thecrwn.app/${a.slug}` : 'No link'} · {a.email || 'no email'}
              </div>
              <div className="text-xs text-crwn-text-secondary">
                Joined {new Date(a.createdAt).toLocaleDateString()} · {a.tracks} tracks · {a.activeMembers} active
                members · {PLAN_LABEL[a.plan] || a.plan} · {a.stripeConnected ? 'Stripe connected' : 'No Stripe'}
              </div>
            </div>
            {a.slug && (
              <Link
                href={`/${a.slug}`}
                target="_blank"
                className="shrink-0 p-2 text-crwn-text-secondary hover:text-crwn-gold"
                aria-label={`Open ${a.displayName || a.slug}'s page`}
              >
                <ExternalLink className="w-4 h-4" />
              </Link>
            )}
            <button
              onClick={() => toggleFeatured(a)}
              disabled={!featuredColumn || saving === a.id}
              aria-pressed={a.featured}
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                a.featured ? 'bg-crwn-gold text-crwn-bg' : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              {saving === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
              {a.featured ? 'Featured' : 'Feature'}
            </button>
          </div>
        ))}
        {shown.length === 0 && <p className="py-8 text-center text-sm text-crwn-text-secondary">No artists match.</p>}
      </div>
    </div>
  );
}
