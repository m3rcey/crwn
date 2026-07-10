'use client';

import { useState } from 'react';
import { ARTIST_BUILDS } from '@/lib/quests/builds';
import { Check, Loader2 } from 'lucide-react';

// First-run Rise Mode step: the artist picks a Build. Come-Up is recommended for
// most (it's the from-zero path). The choice prioritizes quests; it never locks
// anyone out of features — every tool stays reachable regardless of build.
export function ArtistBuildPicker({ onChosen }: { onChosen: (primary: string) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!selected || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/quests/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primary: selected }),
      });
      if (!res.ok) throw new Error((await res.json())?.error || 'Failed to save');
      onChosen(selected);
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="text-xs font-semibold tracking-widest text-crwn-gold uppercase mb-2">Rise Mode</div>
        <h2 className="text-2xl font-bold text-crwn-text">Choose your Build</h2>
        <p className="text-crwn-text-secondary mt-2 max-w-lg mx-auto">
          Your Build shapes which moves CRWN puts first. You can switch anytime, and nothing is
          ever locked away — this just points you at your next best move.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ARTIST_BUILDS.map((b) => {
          const isRec = b.id === 'come_up';
          const isSel = selected === b.id;
          return (
            <button
              key={b.id}
              onClick={() => setSelected(b.id)}
              className={`text-left rounded-2xl p-4 border transition-all ${
                isSel
                  ? 'border-crwn-gold bg-crwn-gold/10'
                  : 'border-[#2A2A2A] bg-[#1A1A1A] hover:border-[#3A3A3A]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{b.emoji}</span>
                  <span className="font-semibold text-crwn-text">{b.title}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {isRec && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-crwn-gold border border-crwn-gold/40 rounded-full px-2 py-0.5">
                      Recommended
                    </span>
                  )}
                  {isSel && <Check className="w-4 h-4 text-crwn-gold" />}
                </div>
              </div>
              <p className="text-sm text-crwn-text-secondary mt-2">{b.tagline}</p>
              <p className="text-xs text-crwn-text-secondary/70 mt-2">{b.recommendedFor}</p>
            </button>
          );
        })}
      </div>

      {error && <p className="text-red-400 text-sm text-center mt-4">{error}</p>}

      <div className="flex justify-center mt-6">
        <button
          onClick={save}
          disabled={!selected || saving}
          className="neu-button-accent px-8 py-3 rounded-full font-semibold disabled:opacity-40 inline-flex items-center gap-2"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          Start my rise
        </button>
      </div>
    </div>
  );
}
