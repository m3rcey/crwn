'use client';

// The admin Dashboard tab, since the 2026-08-13 pre-PMF surface reduction.
//
// One screen, twelve numbers, one question: is content -> qualified artist -> launch -> first
// paid member actually happening, and what is it costing the founder? The previous dashboard
// (AdminDashboard.tsx, preserved in the repo, unmounted) rendered LGP:CAC, per-tier Hormozi
// economics, payback period, cohort retention, churn benchmarks and projections over a
// population of nine artists. Every one of those was a mature-SaaS instrument reading a signal
// that does not exist yet, and each invited a decision based on noise.
//
// Rules:
//  - ABSOLUTE COUNTS, never rates. n <= 10 makes every percentage a confident lie.
//  - null renders as "not measured", NEVER as 0. A broken query must not read as a failing
//    experiment (Money Model's rule, doc 21).
//  - The goal line (3 first-paid) is printed on the tile itself so the screen answers
//    "are we there" without interpretation.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Settings } from 'lucide-react';
import SettingsPanel from './SettingsPanel';

interface Scorecard {
  windowDays: number;
  generatedAt: string;
  acquisition: { qualifiedLeads: number | null; signupsFromClaimedResults: number | null };
  activation: {
    artists: number | null;
    setupCompleted: number | null;
    stripeConnected: number | null;
    contactsImportedArtists: number | null;
    launchCampaignsSent: number | null;
    launched: number | null;
    firstPaidConversions: number | null;
    medianDaysToFirstPaid: number | null;
  };
  economics: { founderMinutes: number | null; artistGmvCents: number | null; crwnRevenueCents: number | null };
}

const money = (cents: number | null) =>
  cents === null ? null : `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

function Tile({ label, value, sub, highlight }: { label: string; value: string | number | null; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-4 bg-[#1A1A1A] border ${highlight ? 'border-crwn-gold' : 'border-[#2A2A2A]'}`}>
      <p className="text-[#999] text-xs uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${value === null ? 'text-[#555]' : highlight ? 'text-crwn-gold' : 'text-white'}`}>
        {value === null ? 'not measured' : value}
      </p>
      {sub && <p className="text-[#777] text-xs mt-1">{sub}</p>}
    </div>
  );
}

export default function ExperimentScorecard({ userId }: { userId: string }) {
  const [data, setData] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/scorecard');
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-crwn-gold animate-spin" />
      </div>
    );
  }

  const a = data?.acquisition;
  const act = data?.activation;
  const eco = data?.economics;
  const founderHours =
    eco?.founderMinutes === null || eco?.founderMinutes === undefined ? null : Math.round((eco.founderMinutes / 60) * 10) / 10;

  return (
    <div className="max-w-5xl mx-auto px-4 pb-12">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-white">The 90-day experiment</h1>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 rounded-full text-[#999] hover:text-white" aria-label="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="p-2 rounded-full text-[#999] hover:text-white"
            aria-label="Cost settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-sm text-[#999] mb-6">
        3 qualified artists to a first paid member, documented. Counts are absolute on purpose: at this
        size a percentage is a lie. Money is trailing {data?.windowDays ?? 30} days; the roster numbers are all-time.
      </p>

      {showSettings && (
        <div className="mb-6">
          <SettingsPanel userId={userId} onSaved={load} />
        </div>
      )}

      <p className="text-xs uppercase tracking-wide text-[#777] mb-2">Acquisition</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tile label="Qualified leads" value={a?.qualifiedLeads ?? null} sub={`call requests the server scorer qualified, ${data?.windowDays ?? 30}d`} />
        <Tile label="Signups from claimed results" value={a?.signupsFromClaimedResults ?? null} sub="calculator -> account, all-time" />
      </div>

      <p className="text-xs uppercase tracking-wide text-[#777] mb-2">Activation</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tile label="Artists" value={act?.artists ?? null} sub="all accounts, founder tests included" />
        <Tile label="Setup completed" value={act?.setupCompleted ?? null} />
        <Tile label="Stripe connected" value={act?.stripeConnected ?? null} />
        <Tile label="Imported contacts" value={act?.contactsImportedArtists ?? null} sub="artists with any imported fans" />
        <Tile label="Launch campaigns sent" value={act?.launchCampaignsSent ?? null} sub="sent, not drafted" />
        <Tile label="Launched" value={act?.launched ?? null} sub="finished the setup wizard" />
        <Tile label="First paid conversions" value={act?.firstPaidConversions ?? null} sub="GOAL: 3 qualified artists" highlight />
        <Tile
          label="Signup to first paid"
          value={act?.medianDaysToFirstPaid ?? null}
          sub={act?.medianDaysToFirstPaid === null ? 'no conversions yet' : 'median days'}
        />
      </div>

      <p className="text-xs uppercase tracking-wide text-[#777] mb-2">Economics</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Founder hours logged" value={founderHours} sub="Money Model work entries, all-time" />
        <Tile label="Artist GMV" value={money(eco?.artistGmvCents ?? null)} sub={`what fans paid, ${data?.windowDays ?? 30}d`} />
        <Tile label="CRWN revenue" value={money(eco?.crwnRevenueCents ?? null)} sub={`platform fees taken, ${data?.windowDays ?? 30}d`} />
      </div>
    </div>
  );
}
