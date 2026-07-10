'use client';

import { useState } from 'react';
import { ARTIST_BUILDS, getArtistBuild } from '@/lib/quests/builds';
import { Check, ChevronDown, Loader2 } from 'lucide-react';

// First-run Rise Mode step: pick a Build from a dropdown (defaults to the
// recommended Come-Up). The choice prioritizes quests; nothing is ever locked.
export function ArtistBuildPicker({ onChosen }: { onChosen: (primary: string) => void }) {
  const [selected, setSelected] = useState('come_up');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sel = getArtistBuild(selected)!;

  async function save() {
    if (saving) return;
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
    <div className="max-w-2xl mx-auto px-1">
      <div className="text-center mb-8">
        <div className="text-base font-bold tracking-widest text-crwn-gold uppercase mb-3">Rise Mode</div>
        <h2 className="text-3xl font-bold text-crwn-text">Choose your Build</h2>
        <p className="text-lg text-crwn-text-secondary mt-4 leading-relaxed max-w-lg mx-auto">
          Your Build decides what CRWN shows you first. You can change it anytime. Nothing is ever locked away.
        </p>
      </div>

      {/* Dropdown */}
      <div className="relative">
        <button
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] px-5 py-5 text-left"
        >
          <span className="flex items-center gap-3 min-w-0">
            <span className="text-3xl">{sel.emoji}</span>
            <span className="text-xl font-bold text-crwn-text truncate">{sel.title}</span>
            {selected === 'come_up' && (
              <span className="hidden sm:inline text-sm font-bold uppercase tracking-wide text-crwn-gold border border-crwn-gold/40 rounded-full px-2.5 py-1 shrink-0">
                Recommended
              </span>
            )}
          </span>
          <ChevronDown className={`w-7 h-7 text-crwn-text-secondary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div className="absolute z-30 mt-2 w-full rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] shadow-2xl overflow-hidden max-h-[60vh] overflow-y-auto">
            {ARTIST_BUILDS.map((b) => (
              <button
                key={b.id}
                onClick={() => {
                  setSelected(b.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-5 py-4 text-left border-b border-[#242424] last:border-0 ${
                  b.id === selected ? 'bg-crwn-gold/10' : 'hover:bg-[#222]'
                }`}
              >
                <span className="text-3xl shrink-0">{b.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-lg font-bold text-crwn-text">{b.title}</span>
                    {b.id === 'come_up' && (
                      <span className="text-xs font-bold uppercase tracking-wide text-crwn-gold border border-crwn-gold/40 rounded-full px-2 py-0.5">
                        Recommended
                      </span>
                    )}
                  </span>
                  <span className="block text-base text-crwn-text-secondary mt-1 leading-snug">{b.tagline}</span>
                </span>
                {b.id === selected && <Check className="w-6 h-6 text-crwn-gold shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected build description */}
      <div className="mt-5 rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] p-5">
        <p className="text-lg text-crwn-text leading-relaxed">{sel.tagline}</p>
        <p className="text-base text-crwn-text-secondary mt-3">Best for: {sel.recommendedFor}</p>
      </div>

      {error && <p className="text-red-400 text-base text-center mt-4">{error}</p>}

      <button
        onClick={save}
        disabled={saving}
        className="neu-button-accent w-full mt-6 py-4 rounded-full font-bold text-lg disabled:opacity-40 inline-flex items-center justify-center gap-2"
      >
        {saving && <Loader2 className="w-5 h-5 animate-spin" />}
        Start my rise
      </button>
    </div>
  );
}
