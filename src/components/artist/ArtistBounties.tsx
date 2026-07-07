'use client';

// Fan-facing Clip Bounties block on the Movement tab. Reads the artist's ACTIVE
// bounties directly (RLS allows public read of active) and points clippers at the
// fan bounty hub to submit. Renders nothing if none.

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trophy, Clock, ChevronRight } from 'lucide-react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { BOUNTY_TYPE_MAP, type BountyType } from '@/lib/bounties';

interface Bounty {
  id: string; title: string; bounty_type: BountyType; reward_type: string; reward_detail: string | null; deadline: string | null;
}

export function ArtistBounties({ artistId }: { artistId: string }) {
  const router = useRouter();
  const [bounties, setBounties] = useState<Bounty[]>([]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('clip_bounties')
      .select('id, title, bounty_type, reward_type, reward_detail, deadline')
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .then(({ data }) => setBounties((data as Bounty[]) || []));
  }, [artistId]);

  if (bounties.length === 0) return null;

  return (
    <section>
      <h2 className="text-lg font-semibold text-crwn-text mb-3 flex items-center gap-2"><Trophy className="w-4 h-4 text-crwn-gold" /> Clip Bounties</h2>
      <div className="space-y-3">
        {bounties.map(b => {
          const def = BOUNTY_TYPE_MAP[b.bounty_type] || BOUNTY_TYPE_MAP.custom;
          return (
            <button key={b.id} onClick={() => router.push('/my-bounties')} className="w-full flex items-center gap-3 bg-crwn-card rounded-xl border border-crwn-elevated p-4 text-left hover:border-crwn-gold/40 transition-colors">
              <span className="text-2xl">{def.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-crwn-text truncate">{b.title}</p>
                <p className="text-xs text-crwn-text-secondary">🎁 {b.reward_detail || b.reward_type}{b.deadline && <span className="inline-flex items-center gap-1 ml-2"><Clock className="w-3 h-3" />{new Date(b.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-crwn-text-secondary shrink-0" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
