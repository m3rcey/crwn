'use client';

import { useState, useEffect } from 'react';
import { Save, Loader2 } from 'lucide-react';

interface SettingsPanelProps {
  userId: string;
  onSaved: () => void;
}

interface FixedCosts {
  supabase: number;
  resend: number;
  claude: number;
  domain: number;
  vercel: number;
  cloudflare: number;
  [key: string]: number;
}

const COST_LABELS: Record<string, string> = {
  supabase: 'Supabase',
  resend: 'Resend',
  claude: 'Claude',
  domain: 'Domain (monthly)',
  vercel: 'Vercel',
  cloudflare: 'Cloudflare',
};

export default function SettingsPanel({ userId, onSaved }: SettingsPanelProps) {
  const [costs, setCosts] = useState<FixedCosts>({
    supabase: 2500,
    resend: 2500,
    claude: 10000,
    domain: 108,
    vercel: 0,
    cloudflare: 0,
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    fetch(`/api/admin/settings?userId=${userId}`)
      .then(r => r.json())
      .then((data: { key: string; value: any }[]) => {
        const fc = data.find(d => d.key === 'fixed_costs');
        if (fc?.value) setCosts(fc.value);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [userId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, key: 'fixed_costs', value: costs }),
      });
      onSaved();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCost = () => {
    if (!newKey.trim()) return;
    const cents = Math.round(parseFloat(newValue || '0') * 100);
    setCosts(prev => ({ ...prev, [newKey.toLowerCase().replace(/\s+/g, '_')]: cents }));
    setNewKey('');
    setNewValue('');
  };

  const handleRemoveCost = (key: string) => {
    setCosts(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const totalMonthly = Object.values(costs).reduce((s, v) => s + v, 0);

  if (!loaded) return null;

  return (
    <div className="bg-[#1A1A1A] rounded-xl border border-[#2a2a2a] p-6">
      <h3 className="text-white font-semibold mb-4">Fixed Monthly Costs</h3>
      <p className="text-[#666] text-xs mb-4">All values in dollars per month. Used to calculate gross margin and LGP accurately.</p>

      <div className="space-y-3 mb-4">
        {Object.entries(costs).map(([key, cents]) => (
          <div key={key} className="flex items-center gap-3">
            <span className="text-[#999] text-sm w-32">{COST_LABELS[key] || key}</span>
            <div className="relative flex-1 max-w-[160px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] text-sm">$</span>
              <input
                type="number"
                value={(cents / 100).toFixed(2)}
                onChange={(e) => {
                  const val = Math.round(parseFloat(e.target.value || '0') * 100);
                  setCosts(prev => ({ ...prev, [key]: val }));
                }}
                className="w-full bg-[#141414] border border-[#333] rounded-lg pl-7 pr-3 py-2 text-white text-sm focus:border-crwn-gold outline-none"
              />
            </div>
            {!COST_LABELS[key] && (
              <button
                onClick={() => handleRemoveCost(key)}
                className="text-red-400 hover:text-red-300 text-xs"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add custom cost */}
      <div className="flex items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="New cost name"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="bg-[#141414] border border-[#333] rounded-lg px-3 py-2 text-white text-sm w-40 focus:border-crwn-gold outline-none"
        />
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#666] text-sm">$</span>
          <input
            type="number"
            placeholder="0.00"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="bg-[#141414] border border-[#333] rounded-lg pl-7 pr-3 py-2 text-white text-sm w-28 focus:border-crwn-gold outline-none"
          />
        </div>
        <button
          onClick={handleAddCost}
          className="text-crwn-gold hover:text-crwn-gold-hover text-sm font-medium"
        >
          + Add
        </button>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-[#2a2a2a]">
        <div>
          <span className="text-[#999] text-sm">Total Monthly: </span>
          <span className="text-white font-bold">${(totalMonthly / 100).toFixed(2)}</span>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 bg-crwn-gold hover:bg-crwn-gold-hover text-black font-medium px-4 py-2 rounded-full text-sm transition disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </button>
      </div>
    </div>
  );
}
