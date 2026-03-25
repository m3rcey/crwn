'use client';

import { useState, useEffect, useCallback } from 'react';
import { Info, Plus, Trash2, Pencil, X, Check, Lock, TrendingUp, DollarSign, Target, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COST_CATEGORIES = [
  { value: 'instagram_ads', label: 'Instagram Ads' },
  { value: 'facebook_ads', label: 'Facebook Ads' },
  { value: 'tiktok_ads', label: 'TikTok Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'playlist_pitching', label: 'Playlist Pitching' },
  { value: 'pr_campaign', label: 'PR Campaign' },
  { value: 'music_video', label: 'Music Video' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'merch_promo', label: 'Merch / Promo' },
  { value: 'other', label: 'Other' },
] as const;

const CATEGORY_COLORS: Record<string, string> = {
  instagram_ads: '#E1306C',
  facebook_ads: '#1877F2',
  tiktok_ads: '#00F2EA',
  google_ads: '#4285F4',
  playlist_pitching: '#1DB954',
  pr_campaign: '#8B5CF6',
  music_video: '#EF4444',
  influencer: '#F59E0B',
  merch_promo: '#10B981',
  other: '#6B7280',
};

interface MarketingCost {
  id: string;
  artist_id: string;
  category: string;
  custom_label: string | null;
  amount: number;
  spend_date: string;
  notes: string | null;
  created_at: string;
}

interface UnitEconomicsProps {
  artistId: string;
  platformTier: string;
  analytics: {
    subscribers: {
      newThisMonth: number;
      ltv: number;
      mrr: number;
      arpu: number;
      active: number;
      churnRate: number;
    };
    revenue: {
      thisMonth: number;
    };
  };
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="relative group inline-flex ml-1 align-middle">
      <Info className="w-3 h-3 text-crwn-text-secondary/60 cursor-help" />
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1.5 rounded-lg bg-crwn-elevated text-[11px] text-crwn-text leading-tight whitespace-normal w-48 text-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-lg border border-crwn-elevated z-50">
        {text}
      </span>
    </span>
  );
}

function LockedCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated relative overflow-hidden">
      <div className="absolute inset-0 bg-crwn-bg/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
        <Lock className="w-5 h-5 text-crwn-text-secondary mb-1.5" />
        <p className="text-xs text-crwn-text-secondary font-medium">Label+ Feature</p>
        <a
          href="/profile/artist?tab=billing"
          className="text-[10px] text-crwn-gold hover:underline mt-0.5"
        >
          Upgrade to unlock
        </a>
      </div>
      <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-crwn-text-secondary/30 mt-1">—</p>
      <p className="text-xs text-crwn-text-secondary/30 mt-0.5">{description}</p>
    </div>
  );
}

export default function UnitEconomics({ artistId, platformTier, analytics }: UnitEconomicsProps) {
  const isPro = platformTier !== 'starter';
  const isLabelPlus = platformTier === 'label' || platformTier === 'empire';

  const [costs, setCosts] = useState<MarketingCost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formCategory, setFormCategory] = useState('instagram_ads');
  const [formCustomLabel, setFormCustomLabel] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formNotes, setFormNotes] = useState('');

  // Date range defaults to current month
  const now = new Date();
  const [startDate] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  );
  const [endDate] = useState(
    new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  );

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const loadCosts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/marketing-costs?artistId=${artistId}&startDate=${startDate}&endDate=${endDate}`
      );
      const data = await res.json();
      setCosts(data.costs || []);
    } catch {
      console.error('Failed to load marketing costs');
    } finally {
      setIsLoading(false);
    }
  }, [artistId, startDate, endDate]);

  useEffect(() => {
    if (isPro) loadCosts();
    else setIsLoading(false);
  }, [isPro, loadCosts]);

  const resetForm = () => {
    setFormCategory('instagram_ads');
    setFormCustomLabel('');
    setFormAmount('');
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormNotes('');
  };

  const handleSave = async () => {
    const amountCents = Math.round(parseFloat(formAmount) * 100);
    if (!formAmount || isNaN(amountCents) || amountCents <= 0) return;

    const payload = {
      artistId,
      category: formCategory,
      customLabel: formCategory === 'other' ? formCustomLabel : null,
      amount: amountCents,
      spendDate: formDate,
      notes: formNotes || null,
    };

    if (editingId) {
      await fetch('/api/marketing-costs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, ...payload }),
      });
      setEditingId(null);
    } else {
      await fetch('/api/marketing-costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }

    resetForm();
    setIsAdding(false);
    loadCosts();
  };

  const handleDelete = async (id: string) => {
    await fetch('/api/marketing-costs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    loadCosts();
  };

  const handleEdit = (cost: MarketingCost) => {
    setEditingId(cost.id);
    setFormCategory(cost.category);
    setFormCustomLabel(cost.custom_label || '');
    setFormAmount((cost.amount / 100).toFixed(2));
    setFormDate(cost.spend_date);
    setFormNotes(cost.notes || '');
    setIsAdding(true);
  };

  if (!isPro) return null;

  // ── Calculations ──
  const totalSpend = costs.reduce((sum, c) => sum + c.amount, 0);
  const newFans = analytics.subscribers.newThisMonth;
  const cac = newFans > 0 ? Math.round(totalSpend / newFans) : 0;
  const ltv = analytics.subscribers.ltv;
  const ltvCacRatio = cac > 0 ? ltv / cac : 0;

  // Label+ metrics
  const arpu = analytics.subscribers.arpu;
  const paybackMonths = arpu > 0 && cac > 0 ? cac / arpu : 0;
  const grossProfit = analytics.revenue.thisMonth - totalSpend;
  const grossMarginPct = analytics.revenue.thisMonth > 0
    ? (grossProfit / analytics.revenue.thisMonth) * 100
    : 0;

  // Spend by category for chart
  const spendByCategory: Record<string, number> = {};
  costs.forEach(c => {
    const label = COST_CATEGORIES.find(cat => cat.value === c.category)?.label || c.category;
    spendByCategory[label] = (spendByCategory[label] || 0) + c.amount;
  });
  const categoryChartData = Object.entries(spendByCategory)
    .sort(([, a], [, b]) => b - a)
    .map(([name, amount]) => ({ name, amount }));

  // Color helpers
  const ratioColor = (r: number) =>
    r >= 3 ? 'text-green-400' : r >= 1 ? 'text-yellow-400' : r > 0 ? 'text-red-400' : 'text-crwn-text-secondary';

  const paybackColor = (m: number) =>
    m > 0 && m <= 6 ? 'text-green-400' : m <= 12 ? 'text-yellow-400' : 'text-red-400';

  const marginColor = (pct: number) =>
    pct >= 50 ? 'text-green-400' : pct >= 20 ? 'text-yellow-400' : 'text-red-400';

  // Health check items (Label+)
  const healthChecks = [
    { label: 'LTV:CAC above 3:1', pass: ltvCacRatio >= 3, tip: 'Lower your acquisition costs or increase fan lifetime value.' },
    { label: 'Payback under 6 months', pass: paybackMonths > 0 && paybackMonths <= 6, tip: 'Raise tier prices or reduce marketing spend per fan.' },
    { label: 'Gross margin above 50%', pass: grossMarginPct >= 50, tip: 'Cut underperforming ad channels or boost revenue per fan.' },
    { label: 'Churn rate under 5%', pass: analytics.subscribers.churnRate < 5, tip: 'Focus on onboarding and regular content to keep fans engaged.' },
  ];

  const getCategoryLabel = (cat: string) =>
    COST_CATEGORIES.find(c => c.value === cat)?.label || cat;

  return (
    <section>
      <h3 className="text-lg font-semibold text-crwn-text mb-1 flex items-center gap-2">
        <TrendingUp className="w-5 h-5 text-crwn-gold" />
        Unit Economics
        <span className="text-xs text-crwn-text-secondary font-normal ml-1">know your numbers</span>
      </h3>
      <p className="text-xs text-crwn-text-secondary mb-4">
        Track what you spend to acquire fans and whether your pricing is sustainable.
      </p>

      {/* ── Cost Tracking ── */}
      <div className="bg-crwn-surface rounded-xl border border-crwn-elevated p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-crwn-text flex items-center gap-1.5">
            <DollarSign className="w-4 h-4 text-crwn-gold" />
            Marketing Costs
            <InfoTooltip text="Log what you spend on ads, playlist pitching, PR, etc. This feeds your CAC and LTV:CAC calculations." />
          </p>
          {!isAdding && (
            <button
              onClick={() => { resetForm(); setIsAdding(true); setEditingId(null); }}
              className="flex items-center gap-1 px-3 py-1.5 bg-crwn-gold text-black text-xs font-semibold rounded-full hover:brightness-110 transition-all press-scale"
            >
              <Plus className="w-3 h-3" /> Add Cost
            </button>
          )}
        </div>

        {/* Add/Edit Form */}
        {isAdding && (
          <div className="bg-crwn-elevated rounded-lg p-3 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-crwn-text-secondary uppercase tracking-wide block mb-1">Category</label>
                <select
                  value={formCategory}
                  onChange={e => setFormCategory(e.target.value)}
                  className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-3 py-2 text-sm text-crwn-text focus:border-crwn-gold outline-none"
                >
                  {COST_CATEGORIES.map(cat => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] text-crwn-text-secondary uppercase tracking-wide block mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formAmount}
                  onChange={e => setFormAmount(e.target.value)}
                  placeholder="50.00"
                  className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-3 py-2 text-sm text-crwn-text focus:border-crwn-gold outline-none"
                />
              </div>
            </div>
            {formCategory === 'other' && (
              <div>
                <label className="text-[11px] text-crwn-text-secondary uppercase tracking-wide block mb-1">Custom Label</label>
                <input
                  type="text"
                  value={formCustomLabel}
                  onChange={e => setFormCustomLabel(e.target.value)}
                  placeholder="e.g. Studio Rental"
                  className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-3 py-2 text-sm text-crwn-text focus:border-crwn-gold outline-none"
                />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-crwn-text-secondary uppercase tracking-wide block mb-1">Date</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={e => setFormDate(e.target.value)}
                  className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-3 py-2 text-sm text-crwn-text focus:border-crwn-gold outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-crwn-text-secondary uppercase tracking-wide block mb-1">Notes (optional)</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Campaign details..."
                  className="w-full bg-crwn-surface border border-crwn-elevated rounded-lg px-3 py-2 text-sm text-crwn-text focus:border-crwn-gold outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setIsAdding(false); setEditingId(null); resetForm(); }}
                className="px-3 py-1.5 text-xs text-crwn-text-secondary hover:text-crwn-text transition-colors"
              >
                <X className="w-3.5 h-3.5 inline mr-1" />Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!formAmount || parseFloat(formAmount) <= 0}
                className="flex items-center gap-1 px-4 py-1.5 bg-crwn-gold text-black text-xs font-semibold rounded-full hover:brightness-110 transition-all press-scale disabled:opacity-40"
              >
                <Check className="w-3 h-3" />
                {editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {/* Cost list */}
        {isLoading ? (
          <p className="text-sm text-crwn-text-secondary py-4 text-center">Loading costs...</p>
        ) : costs.length === 0 ? (
          <div className="text-center py-6">
            <DollarSign className="w-8 h-8 text-crwn-text-secondary/30 mx-auto mb-2" />
            <p className="text-sm text-crwn-text-secondary">No costs logged this month</p>
            <p className="text-xs text-crwn-text-secondary/60 mt-1">
              Log your first marketing expense to unlock CAC tracking
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {costs.map(cost => (
                <div key={cost.id} className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-crwn-elevated/50 group transition-colors">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: CATEGORY_COLORS[cost.category] || '#6B7280' }}
                    />
                    <div className="min-w-0">
                      <p className="text-sm text-crwn-text truncate">
                        {cost.category === 'other' && cost.custom_label
                          ? cost.custom_label
                          : getCategoryLabel(cost.category)}
                      </p>
                      <p className="text-[10px] text-crwn-text-secondary">
                        {new Date(cost.spend_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {cost.notes ? ` · ${cost.notes}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-crwn-text">{formatCurrency(cost.amount)}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEdit(cost)} className="p-1 hover:text-crwn-gold text-crwn-text-secondary transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={() => handleDelete(cost.id)} className="p-1 hover:text-red-400 text-crwn-text-secondary transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Total */}
            <div className="flex justify-between items-center mt-3 pt-3 border-t border-crwn-elevated">
              <span className="text-xs text-crwn-text-secondary uppercase tracking-wide">Total This Month</span>
              <span className="text-lg font-bold text-crwn-text">{formatCurrency(totalSpend)}</span>
            </div>
          </>
        )}

        {/* Spend by category chart */}
        {categoryChartData.length > 1 && (
          <div className="mt-4 pt-4 border-t border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary mb-2">Spend by Category</p>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categoryChartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis type="number" stroke="#666" fontSize={11} tickFormatter={v => `$${(v / 100).toFixed(0)}`} />
                  <YAxis dataKey="name" type="category" stroke="#666" fontSize={10} width={90} />
                  <Tooltip formatter={(value: number | undefined) => formatCurrency(value || 0)} />
                  <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                    {categoryChartData.map((entry, i) => {
                      const catValue = COST_CATEGORIES.find(c => c.label === entry.name)?.value || 'other';
                      return <Cell key={i} fill={CATEGORY_COLORS[catValue] || '#6B7280'} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* ── Metric Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {/* CAC (Pro+) */}
        <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">
            CAC
            <InfoTooltip text="Customer Acquisition Cost. Total marketing spend this month divided by new fans acquired. Lower is better." />
          </p>
          {totalSpend > 0 && newFans > 0 ? (
            <>
              <p className="text-2xl font-bold text-crwn-text mt-1">{formatCurrency(cac)}</p>
              <p className="text-[10px] text-crwn-text-secondary mt-0.5">
                {formatCurrency(totalSpend)} spent ÷ {newFans} new fan{newFans !== 1 ? 's' : ''}
              </p>
            </>
          ) : totalSpend > 0 ? (
            <>
              <p className="text-2xl font-bold text-crwn-text-secondary/40 mt-1">—</p>
              <p className="text-[10px] text-crwn-text-secondary mt-0.5">No new fans yet this month</p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-crwn-text-secondary/40 mt-1">—</p>
              <p className="text-[10px] text-crwn-text-secondary mt-0.5">Log costs to see CAC</p>
            </>
          )}
        </div>

        {/* LTV:CAC (Pro+) */}
        <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">
            LTV:CAC
            <InfoTooltip text="Fan Lifetime Value divided by acquisition cost. 3:1+ is healthy — you earn 3x what you spend to get a fan." />
          </p>
          {ltvCacRatio > 0 ? (
            <>
              <p className={`text-2xl font-bold mt-1 ${ratioColor(ltvCacRatio)}`}>
                {ltvCacRatio.toFixed(1)}:1
              </p>
              <p className="text-[10px] text-crwn-text-secondary mt-0.5">
                {ltvCacRatio >= 3 ? 'Healthy — spending efficiently' :
                 ltvCacRatio >= 1 ? 'Watch it — tightening up' :
                 'Unsustainable — costs exceed fan value'}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-crwn-text-secondary/40 mt-1">—</p>
              <p className="text-[10px] text-crwn-text-secondary mt-0.5">
                {totalSpend === 0 ? 'Log costs to calculate' : 'Need fans & costs'}
              </p>
            </>
          )}
        </div>

        {/* Payback Period (Label+ or locked) */}
        {isLabelPlus ? (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">
              Payback Period
              <InfoTooltip text="How many months until a fan's subscription revenue covers the cost to acquire them. Under 6 months is great." />
            </p>
            {paybackMonths > 0 ? (
              <>
                <p className={`text-2xl font-bold mt-1 ${paybackColor(paybackMonths)}`}>
                  {paybackMonths.toFixed(1)}mo
                </p>
                <p className="text-[10px] text-crwn-text-secondary mt-0.5">
                  {paybackMonths <= 6 ? 'Great — fast payback' :
                   paybackMonths <= 12 ? 'Okay — could improve' :
                   'Slow — review your spend'}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-crwn-text-secondary/40 mt-1">—</p>
                <p className="text-[10px] text-crwn-text-secondary mt-0.5">Need CAC & ARPU data</p>
              </>
            )}
          </div>
        ) : (
          <LockedCard title="Payback Period" description="Months to recoup fan cost" />
        )}
      </div>

      {/* ── Gross Margin + Health Check (Label+ or locked) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gross Margin */}
        {isLabelPlus ? (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm font-medium text-crwn-text mb-3 flex items-center gap-1.5">
              <DollarSign className="w-4 h-4 text-crwn-gold" />
              Gross Margin
              <InfoTooltip text="Revenue minus marketing costs. Shows how much you keep after acquisition spend. Does not include platform fees." />
            </p>
            {analytics.revenue.thisMonth > 0 ? (
              <>
                <div className="space-y-2 mb-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-crwn-text-secondary">Revenue (this month)</span>
                    <span className="text-crwn-text">{formatCurrency(analytics.revenue.thisMonth)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-crwn-text-secondary">Marketing costs</span>
                    <span className="text-red-400">-{formatCurrency(totalSpend)}</span>
                  </div>
                  <div className="border-t border-crwn-elevated pt-2 flex justify-between text-sm">
                    <span className="text-crwn-text font-medium">Gross Profit</span>
                    <span className={`font-bold ${grossProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatCurrency(grossProfit)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-crwn-text-secondary">Margin:</span>
                  <span className={`text-sm font-bold ${marginColor(grossMarginPct)}`}>
                    {grossMarginPct.toFixed(1)}%
                  </span>
                  <div className="flex-1 h-2 bg-crwn-elevated rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        grossMarginPct >= 50 ? 'bg-green-500' : grossMarginPct >= 20 ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, grossMarginPct))}%` }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-crwn-text-secondary py-4 text-center">No revenue data this month</p>
            )}
          </div>
        ) : (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated relative overflow-hidden">
            <div className="absolute inset-0 bg-crwn-bg/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
              <Lock className="w-5 h-5 text-crwn-text-secondary mb-1.5" />
              <p className="text-xs text-crwn-text-secondary font-medium">Label+ Feature</p>
              <a href="/profile/artist?tab=billing" className="text-[10px] text-crwn-gold hover:underline mt-0.5">Upgrade to unlock</a>
            </div>
            <p className="text-sm font-medium text-crwn-text-secondary/30 mb-3">Gross Margin</p>
            <div className="space-y-2 opacity-30">
              <div className="flex justify-between text-sm"><span>Revenue</span><span>—</span></div>
              <div className="flex justify-between text-sm"><span>Costs</span><span>—</span></div>
              <div className="border-t border-crwn-elevated pt-2 flex justify-between text-sm"><span>Profit</span><span>—</span></div>
            </div>
          </div>
        )}

        {/* Health Check */}
        {isLabelPlus ? (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated">
            <p className="text-sm font-medium text-crwn-text mb-3 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-crwn-gold" />
              Pricing Health Check
              <InfoTooltip text="Are your fan tiers priced sustainably given your costs? Green = sustainable, red = losing money." />
            </p>
            {totalSpend > 0 || analytics.revenue.thisMonth > 0 ? (
              <>
                <div className="space-y-2.5 mb-4">
                  {healthChecks.map((check, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className={`mt-0.5 text-sm ${check.pass ? 'text-green-400' : 'text-red-400'}`}>
                        {check.pass ? '✓' : '✗'}
                      </span>
                      <div>
                        <p className={`text-sm ${check.pass ? 'text-crwn-text' : 'text-crwn-text-secondary'}`}>
                          {check.label}
                        </p>
                        {!check.pass && (
                          <p className="text-[10px] text-crwn-text-secondary/60 mt-0.5">{check.tip}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {(() => {
                  const passed = healthChecks.filter(c => c.pass).length;
                  const total = healthChecks.length;
                  return (
                    <div className={`rounded-lg px-3 py-2 text-xs font-medium ${
                      passed === total ? 'bg-green-500/10 text-green-400' :
                      passed >= 2 ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-red-500/10 text-red-400'
                    }`}>
                      {passed === total ? 'Your pricing is sustainable — keep going!' :
                       passed >= 2 ? 'Some areas need attention — review the tips above.' :
                       'Your unit economics need work — focus on the red items.'}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="text-center py-4">
                <Target className="w-6 h-6 text-crwn-text-secondary/30 mx-auto mb-2" />
                <p className="text-sm text-crwn-text-secondary">Log costs or earn revenue to see health check</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-crwn-surface p-4 rounded-xl border border-crwn-elevated relative overflow-hidden">
            <div className="absolute inset-0 bg-crwn-bg/60 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
              <Lock className="w-5 h-5 text-crwn-text-secondary mb-1.5" />
              <p className="text-xs text-crwn-text-secondary font-medium">Label+ Feature</p>
              <a href="/profile/artist?tab=billing" className="text-[10px] text-crwn-gold hover:underline mt-0.5">Upgrade to unlock</a>
            </div>
            <p className="text-sm font-medium text-crwn-text-secondary/30 mb-3">Pricing Health Check</p>
            <div className="space-y-2.5 opacity-30">
              {['LTV:CAC above 3:1', 'Payback under 6 months', 'Gross margin above 50%', 'Churn rate under 5%'].map((label, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm text-crwn-text-secondary">—</span>
                  <span className="text-sm text-crwn-text-secondary">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
