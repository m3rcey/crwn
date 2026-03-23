'use client';

import { useState, useEffect, useCallback } from 'react';
import { AudienceFan } from '@/types';
import {
  Users, Search, ChevronDown, ChevronUp, ArrowUpDown,
  Loader2, Star, UserCheck, UserX, Upload, AlertTriangle,
  Bookmark, BookmarkCheck, Trash2, X,
} from 'lucide-react';
import { FanImportModal } from '@/components/artist/FanImportModal';
import { useToast } from '@/components/shared/Toast';

interface SavedSegment {
  id: string;
  name: string;
  filters: Record<string, string>;
  fan_count: number;
}

interface AudienceResponse {
  fans: AudienceFan[];
  total: number;
  page: number;
  limit: number;
  totalSubscribers: number;
  totalAudience: number;
  lifecycleCounts: Record<string, number>;
}

type SortField = 'display_name' | 'tier_name' | 'total_spent' | 'subscribed_at' | 'last_active' | 'engagement_score' | 'referral_count';

interface FanTableProps {
  artistId: string;
  tiers: { id: string; name: string }[];
}

export function FanTable({ artistId, tiers }: FanTableProps) {
  const { showToast } = useToast();
  const [data, setData] = useState<AudienceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [engagementFilter, setEngagementFilter] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('engagement_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [showImport, setShowImport] = useState(false);

  // Saved segments
  const [segments, setSegments] = useState<SavedSegment[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [segmentName, setSegmentName] = useState('');
  const [isSavingSegment, setIsSavingSegment] = useState(false);
  const [showSegments, setShowSegments] = useState(false);

  const hasActiveFilters = !!(tierFilter || locationFilter || engagementFilter || lifecycleFilter);

  const loadSegments = useCallback(async () => {
    try {
      const res = await fetch('/api/segments');
      const json = await res.json();
      setSegments(json.segments || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadSegments(); }, [loadSegments]);

  const handleSaveSegment = async () => {
    if (!segmentName.trim()) return;
    setIsSavingSegment(true);
    try {
      const filters: Record<string, string> = {};
      if (tierFilter) filters.tier = tierFilter;
      if (locationFilter) filters.location = locationFilter;
      if (engagementFilter) filters.engagement = engagementFilter;
      if (lifecycleFilter) filters.lifecycle = lifecycleFilter;

      const res = await fetch('/api/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: segmentName.trim(),
          filters,
          fanCount: data?.total || 0,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      showToast('Segment saved', 'success');
      setShowSaveDialog(false);
      setSegmentName('');
      setActiveSegmentId(json.id);
      await loadSegments();
    } catch (err: any) {
      showToast(err.message || 'Failed to save', 'error');
    } finally {
      setIsSavingSegment(false);
    }
  };

  const handleLoadSegment = (segment: SavedSegment) => {
    setTierFilter(segment.filters.tier || '');
    setLocationFilter(segment.filters.location || '');
    setEngagementFilter(segment.filters.engagement || '');
    setLifecycleFilter(segment.filters.lifecycle || '');
    setActiveSegmentId(segment.id);
    setShowSegments(false);
    if (segment.filters.tier || segment.filters.location || segment.filters.engagement || segment.filters.lifecycle) {
      setShowFilters(true);
    }
  };

  const handleDeleteSegment = async (id: string) => {
    try {
      await fetch('/api/segments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (activeSegmentId === id) setActiveSegmentId(null);
      await loadSegments();
      showToast('Segment deleted', 'success');
    } catch {
      showToast('Failed to delete', 'error');
    }
  };

  const handleClearFilters = () => {
    setTierFilter('');
    setLocationFilter('');
    setEngagementFilter('');
    setLifecycleFilter('');
    setActiveSegmentId(null);
  };

  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchAudience = useCallback(async () => {
    if (!artistId) return;
    setIsLoading(true);

    const params = new URLSearchParams({ artistId, page: String(page), limit: '50', sortBy, sortDir });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (tierFilter) params.set('tier', tierFilter);
    if (locationFilter) params.set('location', locationFilter);
    if (engagementFilter) params.set('engagement', engagementFilter);
    if (lifecycleFilter) params.set('lifecycle', lifecycleFilter);

    try {
      const res = await fetch(`/api/audience?${params}`);
      const json = await res.json();
      setData(json);
    } catch {
      // silent fail
    } finally {
      setIsLoading(false);
    }
  }, [artistId, page, sortBy, sortDir, debouncedSearch, tierFilter, locationFilter, engagementFilter, lifecycleFilter]);

  useEffect(() => { fetchAudience(); }, [fetchAudience]);

  useEffect(() => { setPage(1); }, [debouncedSearch, tierFilter, locationFilter, engagementFilter, lifecycleFilter]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-crwn-gold" />
      : <ChevronDown className="w-3 h-3 text-crwn-gold" />;
  };

  const formatSpent = (cents: number) => `$${(cents / 100).toFixed(0)}`;
  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
  };

  const engagementLabel = (score: number) => {
    if (score >= 100) return { text: 'Hot', color: 'text-red-400', bg: 'bg-red-400/10' };
    if (score >= 50) return { text: 'Warm', color: 'text-orange-400', bg: 'bg-orange-400/10' };
    if (score >= 20) return { text: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-400/10' };
    return { text: 'Cold', color: 'text-crwn-text-secondary', bg: 'bg-crwn-elevated' };
  };

  const lifecycleConfig: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
    vip: { label: 'VIP', color: 'text-crwn-gold', bg: 'bg-crwn-gold/10', icon: <Star className="w-3 h-3" /> },
    active: { label: 'Active', color: 'text-green-400', bg: 'bg-green-400/10', icon: <UserCheck className="w-3 h-3" /> },
    at_risk: { label: 'At Risk', color: 'text-orange-400', bg: 'bg-orange-400/10', icon: <AlertTriangle className="w-3 h-3" /> },
    churned: { label: 'Churned', color: 'text-red-400', bg: 'bg-red-400/10', icon: <UserX className="w-3 h-3" /> },
    cold: { label: 'Cold', color: 'text-crwn-text-secondary', bg: 'bg-crwn-elevated', icon: <Users className="w-3 h-3" /> },
    lead: { label: 'Lead', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: <Users className="w-3 h-3" /> },
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="space-y-6">
      {/* Header with Segments + Import */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {/* Saved segments dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowSegments(!showSegments)}
              className={`flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
                activeSegmentId
                  ? 'border-crwn-gold text-crwn-gold'
                  : 'border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
              }`}
            >
              {activeSegmentId ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
              <span className="hidden sm:inline">
                {activeSegmentId
                  ? segments.find(s => s.id === activeSegmentId)?.name || 'Segment'
                  : 'Segments'}
              </span>
              {segments.length > 0 && (
                <span className="text-xs opacity-60">({segments.length})</span>
              )}
            </button>

            {showSegments && (
              <div className="absolute top-full left-0 mt-1 w-64 bg-crwn-card border border-crwn-elevated rounded-xl shadow-lg z-20 overflow-hidden">
                {segments.length === 0 ? (
                  <div className="p-4 text-center text-xs text-crwn-text-secondary">
                    No saved segments yet. Apply filters and save them for quick access.
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {segments.map(seg => (
                      <div
                        key={seg.id}
                        className={`flex items-center justify-between px-3 py-2.5 hover:bg-crwn-elevated/50 transition-colors cursor-pointer ${
                          activeSegmentId === seg.id ? 'bg-crwn-elevated/30' : ''
                        }`}
                      >
                        <button
                          onClick={() => handleLoadSegment(seg)}
                          className="flex-1 text-left min-w-0"
                        >
                          <div className="text-sm font-medium text-crwn-text truncate">{seg.name}</div>
                          <div className="text-xs text-crwn-text-secondary">
                            {seg.fan_count} fan{seg.fan_count !== 1 ? 's' : ''}
                            {Object.keys(seg.filters).length > 0 && (
                              <> &middot; {Object.keys(seg.filters).length} filter{Object.keys(seg.filters).length !== 1 ? 's' : ''}</>
                            )}
                          </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteSegment(seg.id); }}
                          className="p-1 text-crwn-text-secondary hover:text-red-400 transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Save current filters as segment */}
          {hasActiveFilters && !showSaveDialog && (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-gold hover:border-crwn-gold/50 transition-colors"
            >
              <Bookmark className="w-3.5 h-3.5" />
              Save Segment
            </button>
          )}

          {/* Active segment indicator */}
          {activeSegmentId && (
            <button
              onClick={handleClearFilters}
              className="flex items-center gap-1 px-2 py-1 rounded-full text-xs text-crwn-text-secondary hover:text-crwn-text transition-colors"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>

        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">Import Fans</span>
        </button>
      </div>

      {/* Save segment dialog */}
      {showSaveDialog && (
        <div className="flex items-center gap-2 p-3 bg-crwn-card rounded-xl border border-crwn-gold/30">
          <Bookmark className="w-4 h-4 text-crwn-gold shrink-0" />
          <input
            type="text"
            value={segmentName}
            onChange={e => setSegmentName(e.target.value)}
            placeholder="Segment name (e.g. VIP fans in NYC)"
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleSaveSegment()}
            className="flex-1 px-3 py-1.5 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
          />
          <button
            onClick={handleSaveSegment}
            disabled={isSavingSegment || !segmentName.trim()}
            className="px-3 py-1.5 bg-crwn-gold text-crwn-bg rounded-lg text-xs font-semibold hover:bg-crwn-gold/90 disabled:opacity-40 transition-colors"
          >
            {isSavingSegment ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => { setShowSaveDialog(false); setSegmentName(''); }}
            className="p-1.5 text-crwn-text-secondary hover:text-crwn-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Lifecycle Summary Cards */}
      {data?.lifecycleCounts && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {(['vip', 'active', 'at_risk', 'churned', 'cold', 'lead'] as const).map(stage => {
            const config = lifecycleConfig[stage];
            const count = data.lifecycleCounts[stage] || 0;
            const isSelected = lifecycleFilter === stage;
            return (
              <button
                key={stage}
                onClick={() => setLifecycleFilter(isSelected ? '' : stage)}
                className={`bg-crwn-card rounded-xl p-3 text-left transition-all border ${
                  isSelected ? 'border-crwn-gold' : 'border-transparent hover:border-crwn-elevated'
                }`}
              >
                <div className={`flex items-center gap-1.5 mb-1 text-xs font-medium ${config.color}`}>
                  {config.icon}
                  {config.label}
                </div>
                <p className="text-lg font-bold text-crwn-text">{count}</p>
              </button>
            );
          })}
        </div>
      )}

      {/* Search + Filter Bar */}
      <div className="space-y-3">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-crwn-text-secondary" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-crwn-card border border-crwn-elevated rounded-full text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-4 py-2.5 rounded-full text-sm font-medium border transition-colors ${
              showFilters || tierFilter || locationFilter || engagementFilter || lifecycleFilter
                ? 'border-crwn-gold text-crwn-gold'
                : 'border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            Filters{(tierFilter || locationFilter || engagementFilter || lifecycleFilter) ? ' •' : ''}
          </button>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 p-4 bg-crwn-card rounded-xl border border-crwn-elevated">
            <select
              value={tierFilter}
              onChange={e => setTierFilter(e.target.value)}
              className="px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
            >
              <option value="">All Tiers</option>
              {tiers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>

            <input
              type="text"
              placeholder="City, state, or country..."
              value={locationFilter}
              onChange={e => setLocationFilter(e.target.value)}
              className="px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
            />

            <select
              value={engagementFilter}
              onChange={e => setEngagementFilter(e.target.value)}
              className="px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
            >
              <option value="">All Engagement</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={lifecycleFilter}
              onChange={e => setLifecycleFilter(e.target.value)}
              className="px-3 py-2 bg-crwn-elevated border border-crwn-elevated rounded-lg text-sm text-crwn-text focus:outline-none focus:border-crwn-gold/50"
            >
              <option value="">All Stages</option>
              <option value="vip">VIP</option>
              <option value="active">Active</option>
              <option value="at_risk">At Risk</option>
              <option value="churned">Churned</option>
              <option value="cold">Cold</option>
              <option value="lead">Lead</option>
            </select>

            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="px-3 py-2 text-sm text-crwn-text-secondary hover:text-crwn-text transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-crwn-card rounded-xl border border-crwn-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-crwn-elevated">
                {[
                  { field: 'display_name' as SortField, label: 'Fan' },
                  { field: 'tier_name' as SortField, label: 'Tier' },
                  { field: 'total_spent' as SortField, label: 'Spent' },
                  { field: 'engagement_score' as SortField, label: 'Engagement' },
                  { field: 'last_active' as SortField, label: 'Last Active' },
                  { field: 'subscribed_at' as SortField, label: 'Joined' },
                  { field: 'referral_count' as SortField, label: 'Referrals' },
                ].map(col => (
                  <th
                    key={col.field}
                    className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase tracking-wider cursor-pointer hover:text-crwn-text transition-colors"
                    onClick={() => handleSort(col.field)}
                  >
                    <div className="flex items-center gap-1.5">
                      {col.label}
                      <SortIcon field={col.field} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-crwn-gold mx-auto" />
                  </td>
                </tr>
              ) : !data?.fans.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-crwn-text-secondary text-sm">
                    {search || tierFilter || locationFilter || engagementFilter || lifecycleFilter
                      ? 'No fans match your filters.'
                      : 'No fans yet. Share your page to start building your audience.'}
                  </td>
                </tr>
              ) : (
                data.fans.map(fan => {
                  const eng = engagementLabel(fan.engagement_score);
                  return (
                    <tr key={fan.fan_id} className="border-b border-crwn-elevated/50 hover:bg-crwn-elevated/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-[200px]">
                          {fan.avatar_url ? (
                            <img src={fan.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-crwn-elevated flex items-center justify-center text-xs text-crwn-text-secondary font-medium">
                              {fan.display_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-crwn-text truncate">{fan.display_name}</p>
                            <p className="text-xs text-crwn-text-secondary truncate">{fan.email || '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {fan.is_subscriber && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-crwn-gold/10 text-crwn-gold w-fit">
                              <Star className="w-3 h-3" />
                              {fan.tier_name || 'Subscriber'}
                            </span>
                          )}
                          {(() => {
                            const lc = lifecycleConfig[fan.lifecycle];
                            return lc ? (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${lc.color} ${lc.bg} w-fit`}>
                                {lc.icon}
                                {lc.label}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-crwn-text">
                        {fan.total_spent > 0 ? formatSpent(fan.total_spent) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${eng.color} ${eng.bg}`}>{eng.text}</span>
                          <span className="text-xs text-crwn-text-secondary">{fan.engagement_score}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-crwn-text-secondary whitespace-nowrap">
                        {formatDate(fan.last_active)}
                      </td>
                      <td className="px-4 py-3 text-sm text-crwn-text-secondary whitespace-nowrap">
                        {formatDate(fan.subscribed_at)}
                      </td>
                      <td className="px-4 py-3 text-sm text-crwn-text">
                        {fan.referral_count > 0 ? fan.referral_count : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {data && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary">
              Showing {((page - 1) * data.limit) + 1}–{Math.min(page * data.limit, data.total)} of {data.total}
            </p>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Import Modal */}
      <FanImportModal
        artistId={artistId}
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => fetchAudience()}
      />
    </div>
  );
}
