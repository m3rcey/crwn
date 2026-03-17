'use client';

import { useState, useEffect } from 'react';
import {
  MapPin, Calendar, Globe, Lock, ExternalLink, Star, Filter,
  Music, Tv, Film, Megaphone, Gamepad2, Sparkles
} from 'lucide-react';

interface SyncOpportunity {
  id: string;
  title: string;
  description: string;
  type: 'event' | 'brief';
  location_city: string | null;
  location_state: string | null;
  is_online: boolean;
  event_url: string | null;
  registration_url: string | null;
  price_min: number;
  price_max: number;
  event_date: string | null;
  event_end_date: string | null;
  deadline: string | null;
  genres: string[];
  moods: string[];
  project_type: string | null;
  brief_details: string | null;
  looking_for: string | null;
  source: string | null;
  is_featured: boolean;
  locked: boolean;
  genreMatch?: boolean;
  locationMatch?: boolean;
  recommended?: boolean;
}

interface SyncDashboardProps {
  artistId: string;
  platformTier: string;
}

export function SyncDashboard({ artistId, platformTier }: SyncDashboardProps) {
  const [opportunities, setOpportunities] = useState<SyncOpportunity[]>([]);
  const [total, setTotal] = useState(0);
  const [nearYou, setNearYou] = useState(0);
  const [genreMatches, setGenreMatches] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'events' | 'briefs'>('all');

  useEffect(() => {
    const fetchOpps = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/sync-opportunities?artistId=${artistId}&tier=${platformTier}`);
        const data = await res.json();
        setOpportunities(data.opportunities || []);
        setTotal(data.total || 0);
        setNearYou(data.nearYou || 0);
        setGenreMatches(data.genreMatches || 0);
      } catch (err) {
        console.error('Failed to fetch sync opportunities:', err);
      } finally {
        setIsLoading(false);
      }
    };
    if (artistId) fetchOpps();
  }, [artistId, platformTier]);

  const filtered = opportunities.filter(o =>
    filter === 'all' ? true : filter === 'events' ? o.type === 'event' : o.type === 'brief'
  );

  const getProjectIcon = (type: string | null) => {
    switch (type) {
      case 'tv': return <Tv className="w-4 h-4" />;
      case 'film': return <Film className="w-4 h-4" />;
      case 'ad': return <Megaphone className="w-4 h-4" />;
      case 'game': return <Gamepad2 className="w-4 h-4" />;
      default: return <Music className="w-4 h-4" />;
    }
  };

  const formatPrice = (min: number, max: number) => {
    if (min === 0 && max === 0) return 'TBD';
    if (min === max) return `$${(min / 100).toFixed(0)}`;
    return `$${(min / 100).toFixed(0)}–$${(max / 100).toFixed(0)}`;
  };

  const formatDate = (date: string | null, endDate?: string | null) => {
    if (!date) return '';
    const d = new Date(date + 'T00:00:00');
    const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    if (endDate && endDate !== date) {
      const e = new Date(endDate + 'T00:00:00');
      return `${formatted} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    return formatted;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6 page-fade-in">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated text-center">
          <p className="text-2xl font-bold text-crwn-text">{total}</p>
          <p className="text-xs text-crwn-text-secondary">Opportunities</p>
        </div>
        <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated text-center">
          <p className="text-2xl font-bold text-crwn-gold">{nearYou}</p>
          <p className="text-xs text-crwn-text-secondary">Near You</p>
        </div>
        <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated text-center">
          <p className="text-2xl font-bold text-green-400">{genreMatches}</p>
          <p className="text-xs text-crwn-text-secondary">Genre Match</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(['all', 'events', 'briefs'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              filter === f
                ? 'bg-crwn-gold text-black'
                : 'bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            {f === 'all' ? 'All' : f === 'events' ? 'Events' : 'Briefs'}
          </button>
        ))}
      </div>

      {/* Set up location prompt */}
      {nearYou === 0 && total > 0 && (
        <div className="bg-crwn-gold/10 border border-crwn-gold/20 rounded-xl p-4">
          <p className="text-sm text-crwn-gold">
            Add your city and state in your <a href="/profile/artist?tab=profile" className="underline font-semibold">Profile Settings</a> to see events near you.
          </p>
        </div>
      )}

      {/* Opportunities List */}
      <div className="space-y-3" data-tour="sync-opportunities">
        {filtered.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-crwn-text-secondary">No sync opportunities available right now. Check back soon!</p>
          </div>
        ) : (
          filtered.map((opp) => (
            <div
              key={opp.id}
              className={`bg-crwn-surface rounded-xl border p-4 ${
                opp.recommended ? 'border-crwn-gold' : 'border-crwn-elevated'
              }`}
            >
              {/* Recommended badge */}
              {opp.recommended && (
                <div className="flex items-center gap-1 text-crwn-gold text-xs font-semibold mb-2">
                  <Sparkles className="w-3 h-3" />
                  Recommended for you
                </div>
              )}

              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {opp.is_featured && <Star className="w-4 h-4 text-crwn-gold fill-crwn-gold" />}
                    <h3 className="font-semibold text-crwn-text">{opp.title}</h3>
                  </div>

                  {/* Meta row */}
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-crwn-text-secondary">
                    {opp.event_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(opp.event_date, opp.event_end_date)}
                      </span>
                    )}
                    {opp.is_online ? (
                      <span className="flex items-center gap-1 text-blue-400">
                        <Globe className="w-3 h-3" />
                        Online
                      </span>
                    ) : opp.location_city ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {opp.location_city}, {opp.location_state}
                        {opp.locationMatch && <span className="text-green-400 ml-1">• Near you</span>}
                      </span>
                    ) : null}
                    {opp.project_type && (
                      <span className="flex items-center gap-1">
                        {getProjectIcon(opp.project_type)}
                        {opp.project_type.toUpperCase()}
                      </span>
                    )}
                    {(opp.price_min > 0 || opp.price_max > 0) && (
                      <span className="text-crwn-gold font-medium">
                        {formatPrice(opp.price_min, opp.price_max)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Type badge */}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                  opp.type === 'event'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {opp.type === 'event' ? 'Event' : 'Brief'}
                </span>
              </div>

              {/* Locked content for Starter */}
              {opp.locked ? (
                <div className="mt-3 flex items-center gap-2 text-sm text-crwn-text-secondary">
                  <Lock className="w-4 h-4" />
                  <span>Upgrade to Pro to see details and register</span>
                </div>
              ) : (
                <>
                  {/* Description */}
                  {opp.description && (
                    <p className="text-sm text-crwn-text-secondary mt-2">{opp.description}</p>
                  )}

                  {/* Brief details */}
                  {opp.type === 'brief' && opp.looking_for && (
                    <div className="mt-2 bg-crwn-elevated/50 rounded-lg p-3">
                      <p className="text-xs text-crwn-text-secondary font-semibold mb-1">LOOKING FOR</p>
                      <p className="text-sm text-crwn-text">{opp.looking_for}</p>
                    </div>
                  )}

                  {/* Deadline */}
                  {opp.deadline && (
                    <p className="text-xs text-crwn-error mt-2">
                      Deadline: {new Date(opp.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}

                  {/* CTA */}
                  {opp.registration_url && (
                    <a
                      href={opp.registration_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-crwn-gold text-black text-sm font-semibold rounded-full hover:brightness-110 transition-all press-scale"
                    >
                      {opp.type === 'event' ? 'Register' : 'Submit'}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {/* Source */}
                  {opp.source && (
                    <p className="text-xs text-crwn-text-secondary mt-2">via {opp.source}</p>
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>

      {/* Starter upgrade CTA */}
      {platformTier === 'starter' && (
        <div className="bg-crwn-gold/10 border border-crwn-gold/20 rounded-xl p-6 text-center">
          <Lock className="w-8 h-8 text-crwn-gold mx-auto mb-2" />
          <h3 className="text-lg font-bold text-crwn-text mb-1">Unlock Sync Opportunities</h3>
          <p className="text-sm text-crwn-text-secondary mb-4">
            Upgrade to Pro to see full details, registration links, and get matched with opportunities that fit your genre and location.
          </p>
          <a
            href="/profile/artist?tab=billing"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-crwn-gold text-black font-semibold rounded-full hover:brightness-110 transition-all press-scale"
          >
            Upgrade to Pro
          </a>
        </div>
      )}
    </div>
  );
}
