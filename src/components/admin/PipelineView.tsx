'use client';

import { useState, useEffect } from 'react';
import {
  Users, Star, AlertTriangle, UserX, Zap, Send,
  Loader2, Search, ChevronDown, ChevronUp, StickyNote, ArrowUpDown,
} from 'lucide-react';

interface PipelineArtist {
  id: string;
  user_id: string;
  slug: string;
  display_name: string;
  avatar_url: string | null;
  email: string;
  platform_tier: string;
  pipeline_stage: string;
  lead_score: number;
  has_stripe: boolean;
  revenue: number;
  subscribers: number;
  tracks: number;
  notes_count: number;
  in_sequence: boolean;
  last_active: string | null;
  joined: string;
}

interface Note {
  id: string;
  body: string;
  created_at: string;
}

const STAGES = [
  { id: 'signed_up', label: 'Signed Up', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: <Users className="w-4 h-4" /> },
  { id: 'onboarding', label: 'Onboarding', color: 'text-purple-400', bg: 'bg-purple-400/10', icon: <Zap className="w-4 h-4" /> },
  { id: 'free', label: 'Free (Starter)', color: 'text-crwn-text-secondary', bg: 'bg-crwn-elevated', icon: <Users className="w-4 h-4" /> },
  { id: 'paid', label: 'Paid', color: 'text-green-400', bg: 'bg-green-400/10', icon: <Star className="w-4 h-4" /> },
  { id: 'at_risk', label: 'At Risk', color: 'text-orange-400', bg: 'bg-orange-400/10', icon: <AlertTriangle className="w-4 h-4" /> },
  { id: 'churned', label: 'Churned', color: 'text-red-400', bg: 'bg-red-400/10', icon: <UserX className="w-4 h-4" /> },
];

const TIER_COLORS: Record<string, string> = {
  starter: 'text-crwn-text-secondary',
  pro: 'text-blue-400',
  label: 'text-purple-400',
  empire: 'text-crwn-gold',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1d ago';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function PipelineView() {
  const [artists, setArtists] = useState<PipelineArtist[]>([]);
  const [stages, setStages] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'lead_score' | 'revenue' | 'last_active' | 'joined'>('lead_score');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Artist detail drawer
  const [selectedArtist, setSelectedArtist] = useState<PipelineArtist | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/admin/pipeline');
        const json = await res.json();
        setArtists(json.artists || []);
        setStages(json.stages || {});
      } catch { /* silent */ }
      finally { setIsLoading(false); }
    }
    load();
  }, []);

  const loadNotes = async (artistId: string) => {
    try {
      const res = await fetch(`/api/admin/notes?artistId=${artistId}`);
      const json = await res.json();
      setNotes(json.notes || []);
    } catch { setNotes([]); }
  };

  const handleSelectArtist = (artist: PipelineArtist) => {
    setSelectedArtist(artist);
    loadNotes(artist.id);
    setNewNote('');
  };

  const handleSaveNote = async () => {
    if (!selectedArtist || !newNote.trim()) return;
    setIsSavingNote(true);
    try {
      await fetch('/api/admin/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId: selectedArtist.id, body: newNote.trim() }),
      });
      setNewNote('');
      await loadNotes(selectedArtist.id);
    } catch { /* silent */ }
    finally { setIsSavingNote(false); }
  };

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  // Filter + sort
  let filtered = artists;
  if (stageFilter) filtered = filtered.filter(a => a.pipeline_stage === stageFilter);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(a =>
      a.display_name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.slug && a.slug.toLowerCase().includes(q))
    );
  }

  filtered = [...filtered].sort((a, b) => {
    const aVal = a[sortBy] ?? '';
    const bVal = b[sortBy] ?? '';
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }
    return sortDir === 'asc'
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-crwn-text">Artist Pipeline</h2>
        <p className="text-sm text-crwn-text-secondary mt-0.5">{artists.length} artists across {Object.keys(stages).length} stages</p>
      </div>

      {/* Stage cards */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STAGES.map(stage => {
          const count = stages[stage.id] || 0;
          const isSelected = stageFilter === stage.id;
          return (
            <button
              key={stage.id}
              onClick={() => setStageFilter(isSelected ? '' : stage.id)}
              className={`bg-crwn-card rounded-xl p-3 text-left transition-all border ${
                isSelected ? 'border-crwn-gold' : 'border-transparent hover:border-crwn-elevated'
              }`}
            >
              <div className={`flex items-center gap-1.5 mb-1 text-xs font-medium ${stage.color}`}>
                {stage.icon}
                {stage.label}
              </div>
              <p className="text-lg font-bold text-crwn-text">{count}</p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-crwn-text-secondary" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, email, or slug..."
          className="w-full pl-10 pr-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-full text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
        />
      </div>

      {/* Table */}
      <div className="flex gap-6">
        <div className={`${selectedArtist ? 'flex-1' : 'w-full'} bg-crwn-card rounded-xl border border-crwn-elevated overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-crwn-elevated">
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Artist</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Stage</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase cursor-pointer" onClick={() => handleSort('lead_score')}>
                    <div className="flex items-center gap-1">Score <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Tier</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase cursor-pointer" onClick={() => handleSort('revenue')}>
                    <div className="flex items-center gap-1">Revenue <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Fans</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase cursor-pointer" onClick={() => handleSort('last_active')}>
                    <div className="flex items-center gap-1">Active <ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-crwn-text-secondary text-sm">No artists match your filters.</td></tr>
                ) : (
                  filtered.map(artist => {
                    const stage = STAGES.find(s => s.id === artist.pipeline_stage);
                    return (
                      <tr
                        key={artist.id}
                        onClick={() => handleSelectArtist(artist)}
                        className={`border-b border-crwn-elevated/50 cursor-pointer transition-colors ${
                          selectedArtist?.id === artist.id ? 'bg-crwn-elevated/40' : 'hover:bg-crwn-elevated/20'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5 min-w-[160px]">
                            {artist.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={artist.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                            ) : (
                              <div className="w-7 h-7 rounded-full bg-crwn-elevated flex items-center justify-center text-xs text-crwn-text-secondary font-medium">
                                {artist.display_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-crwn-text truncate">{artist.display_name}</p>
                              <p className="text-xs text-crwn-text-secondary truncate">{artist.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${stage?.color} ${stage?.bg}`}>
                            {stage?.icon}
                            {stage?.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-mono text-crwn-text">{artist.lead_score}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium uppercase ${TIER_COLORS[artist.platform_tier] || 'text-crwn-text-secondary'}`}>
                            {artist.platform_tier}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-crwn-text">
                          {artist.revenue > 0 ? `$${(artist.revenue / 100).toFixed(0)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-crwn-text">
                          {artist.subscribers > 0 ? artist.subscribers : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-crwn-text-secondary whitespace-nowrap">
                          {timeAgo(artist.last_active)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {artist.in_sequence && (
                              <span title="In sequence" className="text-crwn-gold"><Send className="w-3.5 h-3.5" /></span>
                            )}
                            {artist.notes_count > 0 && (
                              <span title={`${artist.notes_count} notes`} className="text-crwn-text-secondary"><StickyNote className="w-3.5 h-3.5" /></span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Artist detail drawer */}
        {selectedArtist && (
          <div className="w-80 shrink-0 bg-crwn-card rounded-xl border border-crwn-elevated p-4 space-y-4 self-start sticky top-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-crwn-text">{selectedArtist.display_name}</h3>
              <button onClick={() => setSelectedArtist(null)} className="text-xs text-crwn-text-secondary hover:text-crwn-text">Close</button>
            </div>

            <div className="text-xs text-crwn-text-secondary space-y-1">
              <p>{selectedArtist.email}</p>
              {selectedArtist.slug && <p>/{selectedArtist.slug}</p>}
              <p>Joined {new Date(selectedArtist.joined).toLocaleDateString()}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-crwn-elevated rounded-lg p-2.5">
                <div className="text-xs text-crwn-text-secondary">Score</div>
                <div className="text-lg font-bold text-crwn-text">{selectedArtist.lead_score}</div>
              </div>
              <div className="bg-crwn-elevated rounded-lg p-2.5">
                <div className="text-xs text-crwn-text-secondary">Revenue</div>
                <div className="text-lg font-bold text-crwn-text">${(selectedArtist.revenue / 100).toFixed(0)}</div>
              </div>
              <div className="bg-crwn-elevated rounded-lg p-2.5">
                <div className="text-xs text-crwn-text-secondary">Fans</div>
                <div className="text-lg font-bold text-crwn-text">{selectedArtist.subscribers}</div>
              </div>
              <div className="bg-crwn-elevated rounded-lg p-2.5">
                <div className="text-xs text-crwn-text-secondary">Tracks</div>
                <div className="text-lg font-bold text-crwn-text">{selectedArtist.tracks}</div>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-crwn-text-secondary">Stripe</span>
                <span className={selectedArtist.has_stripe ? 'text-green-400' : 'text-red-400'}>
                  {selectedArtist.has_stripe ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-crwn-text-secondary">Tier</span>
                <span className={`font-medium uppercase ${TIER_COLORS[selectedArtist.platform_tier]}`}>{selectedArtist.platform_tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-crwn-text-secondary">Last Active</span>
                <span className="text-crwn-text">{timeAgo(selectedArtist.last_active)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-crwn-text-secondary">In Sequence</span>
                <span className={selectedArtist.in_sequence ? 'text-crwn-gold' : 'text-crwn-text-secondary'}>
                  {selectedArtist.in_sequence ? 'Yes' : 'No'}
                </span>
              </div>
            </div>

            {/* Notes */}
            <div className="border-t border-crwn-elevated pt-3">
              <h4 className="text-xs font-medium text-crwn-text-secondary mb-2">Notes</h4>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveNote()}
                  placeholder="Add a note..."
                  className="flex-1 px-2.5 py-1.5 bg-crwn-elevated border border-crwn-elevated rounded-lg text-xs text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
                />
                <button
                  onClick={handleSaveNote}
                  disabled={isSavingNote || !newNote.trim()}
                  className="px-2.5 py-1.5 bg-crwn-gold text-crwn-bg rounded-lg text-xs font-semibold disabled:opacity-40"
                >
                  {isSavingNote ? '...' : 'Add'}
                </button>
              </div>
              {notes.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {notes.map(note => (
                    <div key={note.id} className="bg-crwn-elevated rounded-lg p-2">
                      <p className="text-xs text-crwn-text">{note.body}</p>
                      <p className="text-xs text-crwn-text-secondary mt-1">
                        {new Date(note.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
