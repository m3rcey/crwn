'use client';

// What a fan sees on an artist's page: the member downloads, locked ones included.
//
// A locked bundle is shown on purpose, by title and by the rung that unlocks it. A
// benefit nobody can see is not a benefit. What is never shown is anything that could
// become bytes: the API returns file names only to an entitled fan, and the download
// link is minted per click after a server-side entitlement check.

import { useEffect, useState } from 'react';
import { Download, Lock, Loader2 } from 'lucide-react';

interface Bundle {
  id: string;
  title: string;
  description: string | null;
  fileCount: number;
  files: { index: number; name: string; size: number | null }[];
  entitled: boolean;
  lockedLabel: string | null;
}

export function MemberFilesSection({ artistId }: { artistId: string }) {
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/member-files/public?artistId=${encodeURIComponent(artistId)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setBundles(d.bundles || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [artistId]);

  const download = async (bundleId: string, index: number) => {
    setBusy(`${bundleId}:${index}`);
    try {
      const res = await fetch(`/api/member-files/download?id=${encodeURIComponent(bundleId)}&i=${index}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        alert(data.error || 'That file is not available right now.');
        return;
      }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return null;
  if (bundles.length === 0) return null;

  return (
    <section className="mb-8">
      <h2 className="text-xl font-semibold text-crwn-text mb-4">Member downloads</h2>
      <div className="space-y-3">
        {bundles.map((b) => (
          <div key={b.id} className="rounded-xl bg-crwn-surface p-4">
            <div className="flex items-start gap-3">
              {b.entitled
                ? <Download className="w-4 h-4 text-crwn-gold mt-0.5 shrink-0" />
                : <Lock className="w-4 h-4 text-crwn-text-secondary mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-crwn-text">{b.title}</p>
                {b.description ? (
                  <p className="text-sm text-crwn-text-secondary mt-0.5">{b.description}</p>
                ) : null}

                {b.entitled ? (
                  <ul className="mt-2 space-y-1">
                    {b.files.map((f) => (
                      <li key={f.index}>
                        <button
                          disabled={busy === `${b.id}:${f.index}`}
                          onClick={() => download(b.id, f.index)}
                          className="text-sm text-crwn-gold hover:underline flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {busy === `${b.id}:${f.index}`
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Download className="w-3.5 h-3.5" />}
                          {f.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-crwn-text-secondary mt-1">
                    {b.fileCount} {b.fileCount === 1 ? 'file' : 'files'}
                    {b.lockedLabel ? `, for ${b.lockedLabel}` : ''}
                  </p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
