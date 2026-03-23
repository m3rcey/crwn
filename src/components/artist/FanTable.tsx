'use client';

import { useState, useEffect, useCallback } from 'react';
import { AudienceFan } from '@/types';
import {
  Users, Search, ChevronDown, ChevronUp, ArrowUpDown,
  Loader2, Star, UserCheck, UserX,
} from 'lucide-react';

interface AudienceResponse {
  fans: AudienceFan[];
  total: number;
  page: number;
  limit: number;
  totalSubscribers: number;
  totalAudience: number;
}

type SortField = 'display_name' | 'tier_name' | 'total_spent' | 'subscribed_at' | 'last_active' | 'engagement_score' | 'referral_count';

interface FanTableProps {
  artistId: string;
  tiers: { id: string; name: string }[];
}

export function FanTable({ artistId, tiers }: FanTableProps) {
  const [data, setData] = useState<AudienceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [engagementFilter, setEngagementFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('engagement_score');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

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

    try {
      const res = await fetch(`/api/audience?${params}`);
      const json = await res.json();
      setData(json);
    } catch {
      // silent fail
    } finally {
      setIsLoading(false);
    }
  }, [artistId, page, sortBy, sortDir, debouncedSearch, tierFilter, locationFilter, engagementFilter]);

  useEffect(() => { fetchAudience(); }, [fetchAudience]);

  useEffect(() => { setPage(1); }, [debouncedSearch, tierFilter, locationFilter, engagementFilter]);

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
    if (score >= 100) return { text: 'High', color: 'text-green-400' };
    if (score >= 20) return { text: 'Medium', color: 'text-yellow-400' };
    return { text: 'Low', color: 'text-crwn-text-secondary' };
  };

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-crwn-card rounded-xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <Users className="w-5 h-5 text-crwn-gold" />
            <span className="text-sm text-crwn-text-secondary">Total Audience</span>
          </div>
          <p className="text-2xl font-bold text-crwn-text">
            {isLoading ? '—' : (data?.totalAudience || 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-crwn-card rounded-xl p-5">
          <div className="flex items-center gap-3 mb-1">
            <UserCheck className="w-5 h-5 text-green-400" />
            <span className="text-sm text-crwn-text-secondary">Active Subscribers</span>
          </div>
          <p className="text-2xl font-bold text-crwn-text">
            {isLoading ? '—' : (data?.totalSubscribers || 0).toLocaleString()}
          </p>
        </div>
      </div>

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
              showFilters || tierFilter || locationFilter || engagementFilter
                ? 'border-crwn-gold text-crwn-gold'
                : 'border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            Filters{(tierFilter || locationFilter || engagementFilter) ? ' •' : ''}
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

            {(tierFilter || locationFilter || engagementFilter) && (
              <button
                onClick={() => { setTierFilter(''); setLocationFilter(''); setEngagementFilter(''); }}
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
                    {search || tierFilter || locationFilter || engagementFilter
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
                        {fan.is_subscriber ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-crwn-gold/10 text-crwn-gold">
                            <Star className="w-3 h-3" />
                            {fan.tier_name || 'Subscriber'}
                          </span>
                        ) : fan.subscription_status === 'canceled' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400">
                            <UserX className="w-3 h-3" />
                            Churned
                          </span>
                        ) : (
                          <span className="text-xs text-crwn-text-secondary">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-crwn-text">
                        {fan.total_spent > 0 ? formatSpent(fan.total_spent) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${eng.color}`}>{eng.text}</span>
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
    </div>
  );
}
