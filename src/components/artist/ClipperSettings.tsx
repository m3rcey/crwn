'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Scissors, Plus, Trash2, Play, Square, Loader2 } from 'lucide-react';
import {
  CLIPPER_RAMP_PRESETS,
  resolveClipperRate,
  type ClipperRateStep,
} from '@/lib/clipperRate';

export function ClipperSettings() {
  const { user } = useAuth();
  const supabase = createBrowserSupabaseClient();
  const [artistId, setArtistId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [standardRate, setStandardRate] = useState(10);
  const [steps, setSteps] = useState<ClipperRateStep[]>([]);
  const [campaignStartedAt, setCampaignStartedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    async function load() {
      const { data: artist } = await supabase
        .from('artist_profiles')
        .select('id, clipper_commission_rate, clipper_rate_schedule, clipper_campaign_started_at')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (!artist) { setIsLoading(false); return; }
      setArtistId(artist.id);
      setStandardRate(artist.clipper_commission_rate ?? 10);
      setSteps(Array.isArray(artist.clipper_rate_schedule) ? artist.clipper_rate_schedule : []);
      setCampaignStartedAt(artist.clipper_campaign_started_at ?? null);
      setIsLoading(false);
    }
    load();
  }, [user, supabase]);

  const save = async (startCampaign?: boolean) => {
    if (!artistId) return;
    setSaving(true);
    const res = await fetch('/api/referrals/artist/clipper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        artistId,
        standardRate,
        schedule: steps,
        ...(startCampaign !== undefined ? { startCampaign } : {}),
      }),
    });
    const result = await res.json();
    if (result.success) {
      setStandardRate(result.clipper_commission_rate ?? standardRate);
      setSteps(Array.isArray(result.clipper_rate_schedule) ? result.clipper_rate_schedule : []);
      setCampaignStartedAt(result.clipper_campaign_started_at ?? null);
    }
    setSaving(false);
  };

  const updateStep = (i: number, field: keyof ClipperRateStep, value: number) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };
  const addStep = () => setSteps(prev => [...prev, { percent: 50, days: 30 }]);
  const removeStep = (i: number) => setSteps(prev => prev.filter((_, idx) => idx !== i));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  const rampActive = !!campaignStartedAt && steps.length > 0;
  const liveRate = resolveClipperRate({ schedule: steps, campaignStartedAt, standardRate });
  const dayInCampaign = campaignStartedAt
    ? Math.floor((Date.now() - new Date(campaignStartedAt).getTime()) / 86_400_000)
    : null;

  return (
    <div className="neu-raised rounded-xl p-6 mt-6 space-y-6">
      <div className="flex items-start gap-3">
        <Scissors className="w-5 h-5 text-crwn-gold mt-0.5 shrink-0" />
        <div>
          <h3 className="text-lg font-semibold text-crwn-text">Clipper Rev-Share</h3>
          <p className="text-sm text-crwn-text-secondary mt-1">
            Pay clippers a cut of every subscription their clip brings in. Start the cut high to
            pull clippers in, then step it down over time. New subscribers lock the rate that&apos;s
            live when they convert; existing subs are never changed.
          </p>
        </div>
      </div>

      {/* Live status */}
      <div className="flex items-center justify-between border-t border-crwn-elevated pt-4">
        <div>
          <p className="text-xs text-crwn-text-secondary uppercase tracking-wide">Live cut right now</p>
          <p className="text-2xl font-bold text-crwn-gold mt-1">{liveRate}%</p>
        </div>
        <div className="text-right">
          {rampActive ? (
            <p className="text-sm text-green-400">
              Ramp running{dayInCampaign !== null ? ` — day ${dayInCampaign}` : ''}
            </p>
          ) : (
            <p className="text-sm text-crwn-text-secondary">Flat standard rate (no ramp)</p>
          )}
        </div>
      </div>

      {/* Standard rate */}
      <div className="border-t border-crwn-elevated pt-4">
        <label className="block text-sm font-medium text-crwn-text mb-2">
          Standard rate (after the ramp ends)
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number" min={0} max={100}
            value={standardRate}
            onChange={(e) => setStandardRate(Math.min(100, Math.max(0, Math.round(Number(e.target.value)))))}
            className="w-24 bg-crwn-elevated rounded-lg px-3 py-2 text-crwn-text"
          />
          <span className="text-crwn-text-secondary">%</span>
        </div>
      </div>

      {/* Presets */}
      <div className="border-t border-crwn-elevated pt-4">
        <p className="text-sm font-medium text-crwn-text mb-3">Quick presets</p>
        <div className="flex flex-wrap gap-2">
          {CLIPPER_RAMP_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSteps(p.steps)}
              title={p.description}
              className="px-4 py-2 rounded-full text-sm bg-crwn-elevated text-crwn-text hover:bg-crwn-gold hover:text-black transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom steps */}
      <div className="border-t border-crwn-elevated pt-4">
        <p className="text-sm font-medium text-crwn-text mb-3">Step-down schedule</p>
        {steps.length === 0 && (
          <p className="text-sm text-crwn-text-secondary mb-3">
            No ramp. Clippers always earn your standard rate.
          </p>
        )}
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-crwn-text-secondary w-12">Pay</span>
              <input
                type="number" min={0} max={100}
                value={step.percent}
                onChange={(e) => updateStep(i, 'percent', Math.min(100, Math.max(0, Math.round(Number(e.target.value)))))}
                className="w-20 bg-crwn-elevated rounded-lg px-3 py-2 text-crwn-text"
              />
              <span className="text-crwn-text-secondary">% for</span>
              <input
                type="number" min={1} max={3650}
                value={step.days}
                onChange={(e) => updateStep(i, 'days', Math.max(1, Math.round(Number(e.target.value))))}
                className="w-20 bg-crwn-elevated rounded-lg px-3 py-2 text-crwn-text"
              />
              <span className="text-crwn-text-secondary">days</span>
              <button onClick={() => removeStep(i)} className="ml-auto text-crwn-text-secondary hover:text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        {steps.length < 6 && (
          <button onClick={addStep} className="mt-3 flex items-center gap-1 text-sm text-crwn-gold hover:underline">
            <Plus className="w-4 h-4" /> Add step
          </button>
        )}
        <p className="text-xs text-crwn-text-secondary mt-3">
          After all steps elapse, clippers earn your standard rate. The cut is capped at checkout so the
          platform fee plus the clipper cut never exceeds 100%.
        </p>
      </div>

      {/* Actions */}
      <div className="border-t border-crwn-elevated pt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => save()}
          disabled={saving}
          className="px-5 py-2 rounded-full text-sm font-medium bg-crwn-gold text-black hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        {rampActive ? (
          <button
            onClick={() => save(false)}
            disabled={saving}
            className="px-5 py-2 rounded-full text-sm font-medium bg-crwn-elevated text-crwn-text hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            <Square className="w-4 h-4" /> Stop ramp
          </button>
        ) : (
          <button
            onClick={() => save(true)}
            disabled={saving || steps.length === 0}
            className="px-5 py-2 rounded-full text-sm font-medium bg-crwn-elevated text-crwn-text hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            title={steps.length === 0 ? 'Add at least one step first' : 'Start the ramp clock from today'}
          >
            <Play className="w-4 h-4" /> Start ramp now
          </button>
        )}
      </div>
    </div>
  );
}
