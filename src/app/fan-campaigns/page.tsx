'use client';

// "Fan Drives" — the artist's whole Virality Engine surface, deliberately one page.
//
// There is no Campaign Studio here and there should not be. An artist runs ONE drive at a time, so
// this page is either the constraint refusing to let them start one, the prefilled form for the one
// CRWN recommends, or the results of the one that is running.
//
// The gate is not decoration. When the Constraint Engine says the artist owes a fan something or is
// losing members faster than usual, this page shows THAT priority and its action instead, and the
// server refuses the create as well. Recruiting more fans into a system that is failing the fans
// already inside it makes the leak bigger.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Loader2, Megaphone, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { HubBackControl } from '@/components/shared/HubBackControl';
import type { CampaignArchetype } from '@/lib/campaigns/archetypes';
import type { CampaignResults } from '@/lib/campaigns/results';
import type { CampaignRow } from '@/lib/campaigns/store';

interface CampaignBundle {
  campaign: CampaignRow;
  archetype: CampaignArchetype | null;
  results: CampaignResults;
}

interface Payload {
  slug: string | null;
  offer: {
    eligible: boolean;
    reason: string;
    constraint: string | null;
    archetype: CampaignArchetype | null;
    canonicalAction: { label: string; href: string } | null;
  };
  campaigns: CampaignBundle[];
  olderCampaigns: { id: string; title: string; status: string; created_at: string }[];
}

const DEFAULT_DAYS = 14;

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function FanCampaignsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Payload | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const [title, setTitle] = useState('');
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [toolkit, setToolkit] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/fan-campaigns');
      if (res.status === 403) {
        setForbidden(true);
        setLoading(false);
        return;
      }
      const payload: Payload = await res.json();
      setData(payload);
      if (payload.offer.archetype) {
        setToolkit((current) =>
          Object.keys(current).length ? current : { ...payload.offer.archetype!.defaultToolkit },
        );
        setTitle((current) => current || payload.offer.archetype!.label);
      }
    } catch {
      setData(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authLoading && user) load();
    else if (!authLoading && !user) setLoading(false);
  }, [authLoading, user, load]);

  const active = data?.campaigns.find((c) => c.campaign.status === 'active') ?? null;
  const drafts = data?.campaigns.filter((c) => c.campaign.status === 'draft') ?? [];
  const finished = data?.campaigns.filter((c) => c.campaign.status === 'ended' || c.campaign.status === 'archived') ?? [];

  const launch = async () => {
    if (!data?.offer.archetype) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/fan-campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          archetype: data.offer.archetype.key,
          title,
          endsAt: isoInDays(days),
          toolkit,
          launch: true,
        }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error || 'Could not start the drive.');
      else await load();
    } catch {
      setError('Could not start the drive.');
    }
    setSaving(false);
  };

  const endDrive = async (id: string) => {
    setSaving(true);
    try {
      await fetch(`/api/fan-campaigns/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end' }),
      });
      await load();
    } catch {
      /* the list reload will show the real state */
    }
    setSaving(false);
  };

  const shareUrl = data?.slug ? `https://thecrwn.app/${data.slug}/campaign` : '';

  const copyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the URL is on screen either way */
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (forbidden || !user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <p className="text-crwn-text">Fan drives are an artist tool.</p>
        <Link href="/home" className="inline-block mt-4 text-sm text-crwn-gold">
          Go home
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <HubBackControl fallback="/studio" label="Back to Studio" />

      <div className="flex items-center gap-3 mb-2">
        <Megaphone className="w-5 h-5 text-crwn-gold" />
        <h1 className="text-2xl font-bold text-crwn-text">Fan drives</h1>
      </div>
      <p className="text-sm text-crwn-text-secondary mb-6">
        Your fans are the only distribution you own, and right now none of them have been asked for
        anything specific. A drive gives a handful of them one job, one deadline and one link.
      </p>

      {/* THE GATE. Rendered before anything else, because it is the whole point. */}
      {data && !data.offer.eligible && !active && (
        <div className="neu-raised rounded-xl p-4 mb-6 border border-crwn-gold/30">
          <p className="text-xs uppercase tracking-wide text-crwn-gold">Not the right move yet</p>
          <p className="text-crwn-text mt-2">{data.offer.reason}</p>
          {data.offer.canonicalAction && (
            <Link
              href={data.offer.canonicalAction.href}
              className="inline-block mt-4 px-5 py-2 rounded-full bg-crwn-gold text-crwn-bg text-sm font-semibold"
            >
              {data.offer.canonicalAction.label}
            </Link>
          )}
        </div>
      )}

      {/* THE RUNNING DRIVE */}
      {active && (
        <div className="neu-raised rounded-xl p-4 mb-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-crwn-gold">Running</p>
              <h2 className="text-lg font-semibold text-crwn-text">{active.campaign.title}</h2>
              <p className="text-xs text-crwn-text-secondary">
                Closes {dayLabel(active.campaign.ends_at)}
              </p>
            </div>
            <button
              onClick={() => endDrive(active.campaign.id)}
              disabled={saving}
              className="text-xs px-3 py-1.5 rounded-full bg-crwn-elevated text-crwn-text-secondary"
            >
              End drive
            </button>
          </div>

          <div>
            <p className="text-xs uppercase tracking-wide text-crwn-text-secondary">
              Send this to the fans you want in
            </p>
            <div className="flex items-center gap-2 mt-2">
              <code className="flex-1 text-xs text-crwn-text bg-crwn-elevated rounded-lg px-3 py-2 truncate">
                {shareUrl}
              </code>
              <button onClick={copyShare} className="p-2 rounded-lg bg-crwn-elevated text-crwn-gold" aria-label="Copy the drive link">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <Results bundle={active} />
        </div>
      )}

      {/* THE PREFILLED FORM */}
      {!active && data?.offer.eligible && data.offer.archetype && (
        <div className="neu-raised rounded-xl p-4 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-crwn-gold">
              {data.offer.archetype.label}
            </p>
            <p className="text-sm text-crwn-text-secondary mt-1">{data.offer.reason}</p>
          </div>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-crwn-text-secondary">Title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              className="w-full mt-1 bg-crwn-elevated rounded-lg px-3 py-2 text-crwn-text"
            />
          </label>

          <label className="block">
            <span className="text-xs uppercase tracking-wide text-crwn-text-secondary">
              How many days it runs
            </span>
            <input
              type="number"
              min={1}
              max={90}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) || DEFAULT_DAYS)}
              className="w-full mt-1 bg-crwn-elevated rounded-lg px-3 py-2 text-crwn-text"
            />
          </label>

          {data.offer.archetype.toolkit.map((slot) => (
            <label key={slot.key} className="block">
              <span className="text-xs uppercase tracking-wide text-crwn-text-secondary">
                {slot.label}
                {slot.required ? '' : ' (optional)'}
              </span>
              <textarea
                value={toolkit[slot.key] ?? ''}
                onChange={(e) => setToolkit({ ...toolkit, [slot.key]: e.target.value })}
                maxLength={slot.maxLength}
                rows={3}
                className="w-full mt-1 bg-crwn-elevated rounded-lg px-3 py-2 text-crwn-text text-sm"
              />
              <span className="text-[11px] text-crwn-text-secondary">{slot.help}</span>
            </label>
          ))}

          <div className="text-xs text-crwn-text-secondary bg-crwn-elevated rounded-lg p-3 space-y-1">
            <p className="text-crwn-text">{data.offer.archetype.incentive.description}</p>
            {data.offer.archetype.unmeasuredOutcomes.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>

          <button
            onClick={launch}
            disabled={saving}
            className="w-full py-3 rounded-full bg-crwn-gold text-crwn-bg font-semibold disabled:opacity-60"
          >
            {saving ? 'Starting...' : 'Start the drive'}
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}

      {drafts.length > 0 && (
        <div className="mt-6 space-y-3">
          <h2 className="text-sm font-semibold text-crwn-text">Saved, not started</h2>
          {drafts.map((d) => (
            <div key={d.campaign.id} className="neu-raised rounded-xl p-3">
              <p className="text-sm text-crwn-text">{d.campaign.title}</p>
            </div>
          ))}
        </div>
      )}

      {finished.length > 0 && (
        <div className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold text-crwn-text">Finished drives</h2>
          {finished.map((f) => (
            <div key={f.campaign.id} className="neu-raised rounded-xl p-4 space-y-3">
              <div>
                <p className="text-sm font-medium text-crwn-text">{f.campaign.title}</p>
                <p className="text-xs text-crwn-text-secondary">
                  {f.campaign.starts_at ? dayLabel(f.campaign.starts_at) : '?'} to{' '}
                  {dayLabel(f.campaign.ends_at)}
                </p>
              </div>
              <Results bundle={f} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The result panel. Distribution, conversion and cost together, and every unknown labelled as
 * unknown rather than shown as zero. A campaign report that shows conversions without cost, or
 * shows an unmeasurable number as 0, is the artist-facing version of a vanity metric.
 */
function Results({ bundle }: { bundle: CampaignBundle }) {
  const r = bundle.results;
  const commission = r.commissionsOnThoseConversions;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-crwn-elevated rounded-lg p-3">
          <p className="text-xs text-crwn-text-secondary flex items-center gap-1">
            <Users className="w-3 h-3" /> Joined
          </p>
          <p className="text-xl font-bold text-crwn-text">{r.participants}</p>
        </div>
        <div className="bg-crwn-elevated rounded-lg p-3">
          <p className="text-xs text-crwn-text-secondary">Paying members brought in</p>
          <p className="text-xl font-bold text-crwn-gold">
            {r.verifiedPaidConversions.value ?? 'Not yet'}
          </p>
        </div>
      </div>

      <p className="text-[11px] text-crwn-text-secondary">{r.verifiedPaidConversions.note}</p>

      <div className="text-[11px] text-crwn-text-secondary space-y-1 border-t border-crwn-elevated pt-2">
        <p>
          Commission owed on those:{' '}
          {commission.cents === null ? 'unknown' : `$${(commission.cents / 100).toFixed(2)}`}.{' '}
          {commission.note}
        </p>
        <p>Free members brought in: unknown. {r.freeJoinsAttributed.note}</p>
        <p>Views anywhere else: unknown. {r.externalReach.note}</p>
      </div>

      {r.perParticipant.length > 0 && (
        <div className="border-t border-crwn-elevated pt-2">
          <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-2">
            Who showed up
          </p>
          <div className="space-y-1">
            {r.perParticipant.slice(0, 25).map((p) => (
              <div key={p.fanId} className="flex items-center justify-between text-sm">
                <span className="text-crwn-text truncate">{p.displayName || 'A fan'}</span>
                <span className="text-crwn-text-secondary text-xs">
                  {p.verifiedPaidConversions} paying
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
