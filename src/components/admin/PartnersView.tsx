'use client';

import { useState, useEffect } from 'react';
import {
  Loader2, Search, Check, X, ExternalLink, ArrowUpDown,
  ClipboardList, Users, DollarSign, TrendingUp, Code,
} from 'lucide-react';

interface PartnerApplication {
  id: string;
  name: string;
  email: string;
  platform: string;
  audience_size: string;
  profile_url: string;
  why_crwn: string | null;
  status: 'pending' | 'approved' | 'rejected';
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
}

interface PartnerCode {
  id: string;
  code: string;
  recruiter_id: string;
  is_active: boolean;
  partnerName: string;
}

interface Partner {
  id: string;
  userId: string;
  displayName: string;
  email: string;
  referralCode: string;
  flatFee: number | null;
  recurringRate: number | null;
  totalReferred: number;
  qualified: number;
  pending: number;
  churned: number;
  conversionRate: number;
  totalEarned: number;
  totalPaid: number;
  codes: { id: string; code: string; is_active: boolean }[];
  joinedAt: string;
}

interface Summary {
  totalApplications: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  approvalRate: number;
  activePartners: number;
  totalPartnerSignups: number;
  totalPartnerEarnings: number;
}

type AppFilter = 'all' | 'pending' | 'approved' | 'rejected';
type Section = 'applications' | 'performance' | 'codes';

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

const STATUS_STYLES: Record<string, string> = {
  pending: 'text-amber-400 bg-amber-400/10',
  approved: 'text-green-400 bg-green-400/10',
  rejected: 'text-red-400 bg-red-400/10',
};

export default function PartnersView() {
  const [isLoading, setIsLoading] = useState(true);
  const [applications, setApplications] = useState<PartnerApplication[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerCodes, setPartnerCodes] = useState<PartnerCode[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const [section, setSection] = useState<Section>('applications');
  const [appFilter, setAppFilter] = useState<AppFilter>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'totalReferred' | 'qualified' | 'totalPaid' | 'conversionRate'>('totalPaid');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // Review state
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Expanded application
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await fetch('/api/admin/partners');
      const json = await res.json();
      setApplications(json.applications || []);
      setPartners(json.partners || []);
      setPartnerCodes(json.partnerCodes || []);
      setSummary(json.summary || null);
    } catch { /* silent */ }
    finally { setIsLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const handleReview = async (applicationId: string, status: 'approved' | 'rejected') => {
    setIsSubmitting(true);
    try {
      await fetch('/api/admin/partners', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applicationId, status, notes: reviewNotes.trim() || null }),
      });
      setReviewingId(null);
      setReviewNotes('');
      await loadData();
    } catch { /* silent */ }
    finally { setIsSubmitting(false); }
  };

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(field); setSortDir('desc'); }
  };

  // Filter applications
  let filteredApps = applications;
  if (appFilter !== 'all') filteredApps = filteredApps.filter(a => a.status === appFilter);
  if (search) {
    const q = search.toLowerCase();
    filteredApps = filteredApps.filter(a =>
      a.name.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      a.platform.toLowerCase().includes(q)
    );
  }

  // Sort partners
  const sortedPartners = [...partners].sort((a, b) => {
    const aVal = a[sortBy];
    const bVal = b[sortBy];
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
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
        <h2 className="text-lg font-semibold text-crwn-text">Partner Program</h2>
        <p className="text-sm text-crwn-text-secondary mt-0.5">Manage applications, track performance, and monitor partner codes</p>
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-crwn-card rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1 text-xs font-medium text-crwn-text-secondary">
              <ClipboardList className="w-3.5 h-3.5" />
              Applications
            </div>
            <p className="text-xl font-bold text-crwn-text">{summary.totalApplications}</p>
            <p className="text-xs text-amber-400 mt-0.5">{summary.pendingCount} pending</p>
          </div>
          <div className="bg-crwn-card rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1 text-xs font-medium text-crwn-text-secondary">
              <Users className="w-3.5 h-3.5" />
              Active Partners
            </div>
            <p className="text-xl font-bold text-crwn-text">{summary.activePartners}</p>
            <p className="text-xs text-green-400 mt-0.5">{summary.approvalRate}% approval rate</p>
          </div>
          <div className="bg-crwn-card rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1 text-xs font-medium text-crwn-text-secondary">
              <TrendingUp className="w-3.5 h-3.5" />
              Partner Signups
            </div>
            <p className="text-xl font-bold text-crwn-text">{summary.totalPartnerSignups}</p>
            <p className="text-xs text-crwn-text-secondary mt-0.5">artists referred</p>
          </div>
          <div className="bg-crwn-card rounded-xl p-4">
            <div className="flex items-center gap-1.5 mb-1 text-xs font-medium text-crwn-text-secondary">
              <DollarSign className="w-3.5 h-3.5" />
              Total Paid
            </div>
            <p className="text-xl font-bold text-crwn-text">${(summary.totalPartnerEarnings / 100).toFixed(0)}</p>
            <p className="text-xs text-crwn-text-secondary mt-0.5">to partners</p>
          </div>
        </div>
      )}

      {/* Section tabs */}
      <div className="flex items-center gap-1 bg-crwn-card rounded-full p-1 w-fit">
        {([
          { id: 'applications' as Section, label: 'Applications', icon: <ClipboardList className="w-3.5 h-3.5" /> },
          { id: 'performance' as Section, label: 'Performance', icon: <TrendingUp className="w-3.5 h-3.5" /> },
          { id: 'codes' as Section, label: 'Partner Codes', icon: <Code className="w-3.5 h-3.5" /> },
        ]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              section === tab.id ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Applications section */}
      {section === 'applications' && (
        <div className="space-y-4">
          {/* Filter pills */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              {(['all', 'pending', 'approved', 'rejected'] as AppFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setAppFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    appFilter === f ? 'bg-crwn-elevated text-crwn-text' : 'text-crwn-text-secondary hover:text-crwn-text'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {f !== 'all' && ` (${applications.filter(a => a.status === f).length})`}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-crwn-text-secondary" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search applications..."
                className="w-full pl-9 pr-4 py-2 bg-crwn-card border border-crwn-elevated rounded-full text-xs text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50"
              />
            </div>
          </div>

          {/* Applications table */}
          <div className="bg-crwn-card rounded-xl border border-crwn-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-crwn-elevated">
                    <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Applicant</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Platform</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Audience</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Applied</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredApps.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-crwn-text-secondary text-sm">No applications match your filters.</td></tr>
                  ) : (
                    filteredApps.map(app => (
                      <>
                        <tr
                          key={app.id}
                          onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}
                          className="border-b border-crwn-elevated/50 cursor-pointer hover:bg-crwn-elevated/20 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <div className="min-w-[160px]">
                              <p className="text-sm font-medium text-crwn-text">{app.name}</p>
                              <p className="text-xs text-crwn-text-secondary">{app.email}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-sm text-crwn-text capitalize">{app.platform}</td>
                          <td className="px-4 py-3 text-sm text-crwn-text">{app.audience_size}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[app.status]}`}>
                              {app.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-crwn-text-secondary whitespace-nowrap">{timeAgo(app.created_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <a
                                href={app.profile_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="p-1.5 rounded-lg hover:bg-crwn-elevated text-crwn-text-secondary hover:text-crwn-text transition-colors"
                                title="View profile"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              {app.status === 'pending' && (
                                <>
                                  <button
                                    onClick={e => { e.stopPropagation(); setReviewingId(app.id); setReviewNotes(''); }}
                                    className="p-1.5 rounded-lg hover:bg-green-400/10 text-green-400 transition-colors"
                                    title="Review"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleReview(app.id, 'rejected'); }}
                                    className="p-1.5 rounded-lg hover:bg-red-400/10 text-red-400 transition-colors"
                                    title="Reject"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        {/* Expanded detail row */}
                        {expandedId === app.id && (
                          <tr key={`${app.id}-detail`} className="border-b border-crwn-elevated/50 bg-crwn-elevated/10">
                            <td colSpan={6} className="px-4 py-4">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <p className="text-xs font-medium text-crwn-text-secondary mb-1">Profile URL</p>
                                  <a href={app.profile_url} target="_blank" rel="noopener noreferrer" className="text-crwn-gold hover:underline text-xs break-all">
                                    {app.profile_url}
                                  </a>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-crwn-text-secondary mb-1">Why CRWN</p>
                                  <p className="text-xs text-crwn-text">{app.why_crwn || '—'}</p>
                                </div>
                                {app.notes && (
                                  <div className="col-span-2">
                                    <p className="text-xs font-medium text-crwn-text-secondary mb-1">Admin Notes</p>
                                    <p className="text-xs text-crwn-text">{app.notes}</p>
                                  </div>
                                )}
                                {app.reviewed_at && (
                                  <div>
                                    <p className="text-xs font-medium text-crwn-text-secondary mb-1">Reviewed</p>
                                    <p className="text-xs text-crwn-text">{new Date(app.reviewed_at).toLocaleDateString()}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        {/* Review modal inline */}
                        {reviewingId === app.id && (
                          <tr key={`${app.id}-review`} className="border-b border-crwn-elevated/50 bg-crwn-elevated/20">
                            <td colSpan={6} className="px-4 py-4">
                              <div className="max-w-md space-y-3">
                                <p className="text-sm font-medium text-crwn-text">Review: {app.name}</p>
                                <textarea
                                  value={reviewNotes}
                                  onChange={e => setReviewNotes(e.target.value)}
                                  placeholder="Add notes (optional)..."
                                  rows={2}
                                  className="w-full px-3 py-2 bg-crwn-card border border-crwn-elevated rounded-lg text-xs text-crwn-text placeholder:text-crwn-text-secondary focus:outline-none focus:border-crwn-gold/50 resize-none"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleReview(app.id, 'approved')}
                                    disabled={isSubmitting}
                                    className="px-4 py-1.5 bg-green-500/20 text-green-400 rounded-full text-xs font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
                                  >
                                    {isSubmitting ? 'Saving...' : 'Approve'}
                                  </button>
                                  <button
                                    onClick={() => handleReview(app.id, 'rejected')}
                                    disabled={isSubmitting}
                                    className="px-4 py-1.5 bg-red-500/20 text-red-400 rounded-full text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                  >
                                    Reject
                                  </button>
                                  <button
                                    onClick={() => { setReviewingId(null); setReviewNotes(''); }}
                                    className="px-4 py-1.5 text-crwn-text-secondary rounded-full text-xs font-medium hover:text-crwn-text transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Performance section */}
      {section === 'performance' && (
        <div className="space-y-4">
          {partners.length === 0 ? (
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-12 text-center">
              <p className="text-sm text-crwn-text-secondary">No active partners yet.</p>
            </div>
          ) : (
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-crwn-elevated">
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Partner</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Terms</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase cursor-pointer" onClick={() => handleSort('totalReferred')}>
                        <div className="flex items-center gap-1">Referred <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase cursor-pointer" onClick={() => handleSort('qualified')}>
                        <div className="flex items-center gap-1">Qualified <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase cursor-pointer" onClick={() => handleSort('conversionRate')}>
                        <div className="flex items-center gap-1">Conv. % <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase cursor-pointer" onClick={() => handleSort('totalPaid')}>
                        <div className="flex items-center gap-1">Paid <ArrowUpDown className="w-3 h-3" /></div>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPartners.map(p => (
                      <tr key={p.id} className="border-b border-crwn-elevated/50 hover:bg-crwn-elevated/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="min-w-[140px]">
                            <p className="text-sm font-medium text-crwn-text">{p.displayName}</p>
                            <p className="text-xs text-crwn-text-secondary">{p.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs text-crwn-gold">{p.referralCode}</span>
                        </td>
                        <td className="px-4 py-3 text-xs text-crwn-text-secondary whitespace-nowrap">
                          ${((p.flatFee ?? 5000) / 100).toFixed(0)}/artist
                          {p.recurringRate ? ` + ${p.recurringRate}%` : ''}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-crwn-text">
                            {p.totalReferred}
                            {p.pending > 0 && <span className="text-xs text-amber-400 ml-1">({p.pending} pending)</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-crwn-text">{p.qualified}</td>
                        <td className="px-4 py-3">
                          <span className={`text-sm font-medium ${
                            p.conversionRate >= 50 ? 'text-green-400' : p.conversionRate >= 25 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {p.conversionRate}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-crwn-text">
                          {p.totalPaid > 0 ? `$${(p.totalPaid / 100).toFixed(0)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-crwn-text-secondary whitespace-nowrap">
                          {timeAgo(p.joinedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Codes section */}
      {section === 'codes' && (
        <div className="space-y-4">
          {partnerCodes.length === 0 ? (
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated p-12 text-center">
              <p className="text-sm text-crwn-text-secondary">No partner codes created yet.</p>
            </div>
          ) : (
            <div className="bg-crwn-card rounded-xl border border-crwn-elevated overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-crwn-elevated">
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Partner</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-crwn-text-secondary uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partnerCodes.map(c => (
                      <tr key={c.id} className="border-b border-crwn-elevated/50 hover:bg-crwn-elevated/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-mono text-sm text-crwn-gold">{c.code}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-crwn-text">{c.partnerName}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${c.is_active ? 'text-green-400' : 'text-crwn-text-secondary'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${c.is_active ? 'bg-green-400' : 'bg-crwn-text-secondary'}`} />
                            {c.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
