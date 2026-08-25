'use client';

// /admin/forget-device — open this once on each device (and each network) you browse from.
//
// It deletes every anonymous metric row stored under this device's CURRENT identity (the
// IP+UA visitor hash), plus funnel rows stitched to this browser's durable anon id, and
// stamps the never-count-me cookie so nothing new is written. Admin only; anyone else
// gets a refusal from the API and nothing happens.

import { useEffect, useState } from 'react';

type Result = { ok: boolean; hashed: boolean; deleted: Record<string, number> };

const TABLE_LABELS: Record<string, string> = {
  site_visits: 'Site visits',
  artist_page_visits: 'Artist page visits',
  tier_events: 'Tier views',
  funnel_events: 'Funnel events',
};

export default function ForgetDevicePage() {
  const [state, setState] = useState<'running' | 'done' | 'denied' | 'failed'>('running');
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Read the durable anon id WITHOUT creating one: a device being forgotten should
        // not be handed a fresh tracking id in the same breath.
        let anonId: string | null = null;
        try {
          anonId = localStorage.getItem('crwn_aid');
        } catch {
          /* storage blocked */
        }
        const res = await fetch('/api/admin/forget-device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(anonId ? { anonId } : {}),
        });
        if (cancelled) return;
        if (res.status === 403) {
          setState('denied');
          return;
        }
        if (!res.ok) {
          setState('failed');
          return;
        }
        setResult(await res.json());
        setState('done');
      } catch {
        if (!cancelled) setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = result ? Object.values(result.deleted).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-xl font-semibold text-white mb-2">Forget this device</h1>
      {state === 'running' && <p className="text-gray-400">Erasing this device&apos;s metric history...</p>}
      {state === 'denied' && <p className="text-gray-400">This page only works for the admin account.</p>}
      {state === 'failed' && <p className="text-gray-400">Something went wrong. Reload to try again.</p>}
      {state === 'done' && result && (
        <div className="space-y-4">
          <p className="text-gray-300">
            Done. {total} row{total === 1 ? '' : 's'} deleted for this device&apos;s current
            network identity, and this device is now excluded from all future counting.
          </p>
          <ul className="text-sm text-gray-400 space-y-1">
            {Object.entries(result.deleted).map(([table, n]) => (
              <li key={table} className="flex justify-between border-b border-white/10 pb-1">
                <span>{TABLE_LABELS[table] ?? table}</span>
                <span className="text-white">{n}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500">
            History recorded under an older IP address or browser version cannot be identified
            (the hash is one-way) and stays. Open this page again whenever you browse from a new
            device or network.
          </p>
        </div>
      )}
    </div>
  );
}
