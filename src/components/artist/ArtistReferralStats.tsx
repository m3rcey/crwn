'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Users, DollarSign, TrendingUp, Settings, Loader2 } from 'lucide-react';

interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  totalCommissionPaid: number;
  commissionRate: number;
  topReferrers: {
    fanId: string;
    name: string;
    referralCount: number;
    totalEarned: number;
  }[];
}

export function ArtistReferralStats() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [data, setData] = useState<ReferralStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingRate, setEditingRate] = useState(false);
  const [newRate, setNewRate] = useState(10);
  const [saving, setSaving] = useState(false);
  const [artistId, setArtistId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    async function load() {
      const { data: artist } = await supabase
        .from('artist_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .maybeSingle();

      if (!artist) { setIsLoading(false); return; }
      setArtistId(artist.id);

      const res = await fetch(`/api/referrals/artist?artistId=${artist.id}`);
      const result = await res.json();
      if (!result.error) {
        setData(result);
        setNewRate(result.commissionRate);
      }
      setIsLoading(false);
    }

    load();
  }, [user, supabase]);

  const saveCommissionRate = async () => {
    if (!artistId) return;
    setSaving(true);

    const res = await fetch('/api/referrals/artist/commission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artistId, commissionRate: newRate }),
    });

    const result = await res.json();
    if (result.success) {
      setData(prev => prev ? { ...prev, commissionRate: result.commissionRate } : null);
      setEditingRate(false);
    }
    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  const formatCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Total Referrals</p>
          <p className="text-2xl font-bold text-crwn-text mt-1">{data?.totalReferrals || 0}</p>
        </div>
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Active</p>
          <p className="text-2xl font-bold text-green-400 mt-1">{data?.activeReferrals || 0}</p>
        </div>
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Commissions Paid</p>
          <p className="text-2xl font-bold text-crwn-gold mt-1">{formatCurrency(data?.totalCommissionPaid || 0)}</p>
        </div>
        <div className="neu-raised rounded-xl p-4">
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Commission Rate</p>
          {editingRate ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min="0"
                max="50"
                value={newRate}
                onChange={(e) => setNewRate(Number(e.target.value))}
                className="w-16 text-lg font-bold bg-crwn-elevated rounded px-2 py-1 text-crwn-text"
              />
              <span className="text-crwn-text-secondary">%</span>
              <button
                onClick={saveCommissionRate}
                disabled={saving}
                className="text-xs px-2 py-1 bg-crwn-gold text-crwn-bg rounded font-semibold"
              >
                {saving ? '...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditingRate(false); setNewRate(data?.commissionRate || 10); }}
                className="text-xs text-crwn-text-secondary"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <p className="text-2xl font-bold text-crwn-text">{data?.commissionRate || 10}%</p>
              <button
                onClick={() => setEditingRate(true)}
                className="text-crwn-text-secondary hover:text-crwn-gold transition-colors"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Top Referrers */}
      <div className="neu-raised rounded-xl p-4">
        <p className="text-sm text-crwn-text-secondary mb-3">Top Referrers</p>
        {data?.topReferrers && data.topReferrers.length > 0 ? (
          <div className="space-y-3">
            {data.topReferrers.map((ref, i) => (
              <div key={ref.fanId} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    i === 0 ? 'bg-crwn-gold text-crwn-bg' :
                    i === 1 ? 'bg-gray-400 text-crwn-bg' :
                    i === 2 ? 'bg-amber-700 text-white' :
                    'bg-crwn-elevated text-crwn-text-secondary'
                  }`}>
                    {i + 1}
                  </span>
                  <span className="text-crwn-text text-sm">{ref.name}</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-crwn-text-secondary">{ref.referralCount} refs</span>
                  <span className="text-crwn-gold font-semibold">{formatCurrency(ref.totalEarned)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-crwn-text-secondary text-sm">
            No referrals yet. When fans share your page and bring new subscribers, they'll appear here.
          </p>
        )}
      </div>
    </div>
  );
}
