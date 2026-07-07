'use client';

// Fan-facing City Unlocks block on the Movement tab. Reads the artist's ACTIVE /
// UNLOCKED city unlocks directly (RLS allows public read of those) and lets fans
// jump to the shareable city page to rep their city. Renders nothing if none.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, ChevronRight } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { UNLOCK_TYPE_MAP, GOAL_TYPE_MAP, type UnlockType } from '@/lib/cityUnlocks';

interface Unlock {
  id: string; title: string; target_city: string; unlock_type: UnlockType;
  goal_type: string; goal_value: number; current_value: number; status: string;
}

export function ArtistCityUnlocks({ artistId }: { artistId: string }) {
  const router = useRouter();
  const [unlocks, setUnlocks] = useState<Unlock[]>([]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('city_unlocks')
      .select('id, title, target_city, unlock_type, goal_type, goal_value, current_value, status')
      .eq('artist_id', artistId)
      .in('status', ['active', 'unlocked'])
      .order('created_at', { ascending: false })
      .then(({ data }) => setUnlocks((data as Unlock[]) || []));
  }, [artistId]);

  if (unlocks.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-crwn-text mb-3 flex items-center gap-2"><MapPin className="w-4 h-4 text-crwn-gold" /> City Unlocks</h2>
      <div className="space-y-3">
        {unlocks.map(u => {
          const def = UNLOCK_TYPE_MAP[u.unlock_type];
          const pct = Math.min(100, Math.round((u.current_value / u.goal_value) * 100));
          const unit = GOAL_TYPE_MAP[u.goal_type]?.unit || u.goal_type;
          const unlocked = u.status === 'unlocked';
          return (
            <button key={u.id} onClick={() => router.push(`/city/${u.id}`)} className="w-full bg-crwn-card rounded-xl border border-crwn-elevated p-4 text-left hover:border-crwn-gold/40 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{def?.icon || '📍'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-crwn-text truncate">{u.title}</p>
                  <p className="text-xs text-crwn-text-secondary">{u.target_city}{unlocked ? ' · Unlocked 🎉' : ''}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-crwn-text-secondary shrink-0" />
              </div>
              <div className="h-1.5 w-full rounded-full bg-crwn-elevated overflow-hidden mb-1">
                <div className="h-full bg-crwn-gold rounded-full" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-xs text-crwn-text-secondary">{u.current_value}/{u.goal_value} {unit}{!unlocked && ' · tap to help'}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
