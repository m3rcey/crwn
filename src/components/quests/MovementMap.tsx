'use client';

import {
  ARTIST_LEVEL_KEYS,
  ARTIST_LEVEL_TITLES,
  FAN_STAGE_KEYS,
  FAN_STAGE_TITLES,
} from '@/lib/quests/progression';
import { Lock, Check } from 'lucide-react';

// The Movement Map (artist) / Supporter Path (fan): the level/stage ladder with the
// current position highlighted. Read-only orientation — it shows the arc, not quests.
export function MovementMap({ role, currentLevel }: { role: 'artist' | 'fan'; currentLevel: number }) {
  const keys = role === 'artist' ? ARTIST_LEVEL_KEYS : FAN_STAGE_KEYS;
  const titles = role === 'artist' ? ARTIST_LEVEL_TITLES : FAN_STAGE_TITLES;
  const label = role === 'artist' ? 'Movement Map' : 'Supporter Path';

  return (
    <div className="rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] p-4">
      <h3 className="text-sm font-semibold text-crwn-text mb-4">{label}</h3>
      <ol className="space-y-2">
        {keys.map((key, i) => {
          const levelNum = i + 1;
          const passed = levelNum < currentLevel;
          const current = levelNum === currentLevel;
          return (
            <li key={key} className="flex items-center gap-3">
              <span
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                  passed
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : current
                    ? 'bg-crwn-gold text-black'
                    : 'bg-[#2A2A2A] text-crwn-text-secondary'
                }`}
              >
                {passed ? <Check className="w-3.5 h-3.5" /> : current ? levelNum : <Lock className="w-3 h-3" />}
              </span>
              <span
                className={`text-sm ${
                  current ? 'text-crwn-text font-semibold' : passed ? 'text-crwn-text-secondary' : 'text-crwn-text-secondary/60'
                }`}
              >
                {titles[key]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
