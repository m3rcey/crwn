'use client';

import { useEffect, useState } from 'react';
import { X, Loader2, Award } from 'lucide-react';

interface EligibleFan {
  fan_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  default_role: string;
}

interface ReleaseCreditsModalProps {
  releaseType: 'track' | 'album';
  releaseId: string;
  releaseTitle: string;
  onClose: () => void;
}

// Artist-facing: choose which credits-eligible fans are credited on this release
// and how they're labeled. Eligibility comes from the `credits_on_releases` tier
// benefit; see /api/release-credits.
export function ReleaseCreditsModal({ releaseType, releaseId, releaseTitle, onClose }: ReleaseCreditsModalProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eligible, setEligible] = useState<EligibleFan[]>([]);
  // fan_id -> { checked, role }
  const [selection, setSelection] = useState<Record<string, { checked: boolean; role: string }>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/release-credits?releaseType=${releaseType}&releaseId=${releaseId}`);
        const data = await res.json();
        if (!active) return;
        if (!res.ok) { setError(data.error || 'Failed to load'); setLoading(false); return; }
        const elig: EligibleFan[] = data.eligible || [];
        const current: { fan_id: string; role_label: string }[] = data.credits || [];
        const currentMap = new Map(current.map((c) => [c.fan_id, c.role_label]));
        const sel: Record<string, { checked: boolean; role: string }> = {};
        for (const f of elig) {
          sel[f.fan_id] = {
            checked: currentMap.has(f.fan_id),
            role: currentMap.get(f.fan_id) || f.default_role,
          };
        }
        setEligible(elig);
        setSelection(sel);
      } catch {
        if (active) setError('Failed to load');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [releaseType, releaseId]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const credits = Object.entries(selection)
        .filter(([, v]) => v.checked)
        .map(([fan_id, v]) => ({ fan_id, role_label: v.role }));
      const res = await fetch('/api/release-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseType, releaseId, credits }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to save'); setSaving(false); return; }
      onClose();
    } catch {
      setError('Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="neu-raised bg-crwn-surface rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-crwn-elevated/50">
          <div className="flex items-center gap-2 min-w-0">
            <Award className="w-5 h-5 text-crwn-gold flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="text-crwn-text font-semibold truncate">Credits</h3>
              <p className="text-crwn-text-secondary text-xs truncate">{releaseTitle}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-crwn-text-secondary hover:text-crwn-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-crwn-gold animate-spin" /></div>
          ) : eligible.length === 0 ? (
            <p className="text-crwn-text-secondary text-sm py-6 text-center">
              No subscribers are in a credits-enabled tier yet. Add the
              &ldquo;Credits on Releases&rdquo; benefit to a tier, and fans who
              subscribe to it will show up here.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-crwn-text-secondary text-xs">
                Check the fans you want to credit on this release. They&apos;ll see
                the credit and get notified.
              </p>
              {eligible.map((f) => {
                const s = selection[f.fan_id];
                const name = f.display_name || f.username || 'Fan';
                return (
                  <div key={f.fan_id} className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={s?.checked || false}
                      onChange={(e) =>
                        setSelection((prev) => ({ ...prev, [f.fan_id]: { ...prev[f.fan_id], checked: e.target.checked } }))
                      }
                      className="w-4 h-4 accent-crwn-gold flex-shrink-0"
                    />
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-crwn-elevated flex items-center justify-center text-crwn-gold text-sm font-semibold flex-shrink-0">
                      {f.avatar_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={f.avatar_url} alt={name} className="w-full h-full object-cover" />
                        : name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-crwn-text text-sm truncate">{name}</p>
                      <input
                        type="text"
                        maxLength={40}
                        value={s?.role || ''}
                        disabled={!s?.checked}
                        placeholder="Credited as…"
                        onChange={(e) =>
                          setSelection((prev) => ({ ...prev, [f.fan_id]: { ...prev[f.fan_id], role: e.target.value } }))
                        }
                        className="neu-inset w-full px-2 py-1 text-crwn-text text-xs focus:outline-none mt-1 disabled:opacity-40"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {error && <p className="text-crwn-error text-xs mt-3">{error}</p>}
        </div>

        <div className="px-5 py-4 border-t border-crwn-elevated/50 flex justify-end gap-2">
          <button onClick={onClose} className="neu-button px-4 py-2 rounded-full text-sm font-semibold">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || loading || eligible.length === 0}
            className="neu-button-accent px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save credits
          </button>
        </div>
      </div>
    </div>
  );
}
