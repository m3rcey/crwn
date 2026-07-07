'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';

interface CreditRow {
  fan_id: string;
  role_label: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

// Public "Credits" list for a release (track or album). Reads release_credits +
// profiles via the public RLS SELECT policies, so it works for any visitor and
// lets a credited fan see themselves. Renders nothing when there are no credits.
export function ReleaseCredits({ releaseType, releaseId }: { releaseType: 'track' | 'album'; releaseId: string }) {
  const [credits, setCredits] = useState<CreditRow[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createBrowserSupabaseClient();
      const { data: rows } = await supabase
        .from('release_credits')
        .select('fan_id, role_label')
        .eq('release_type', releaseType)
        .eq('release_id', releaseId);
      if (!rows || rows.length === 0) { if (active) setCredits([]); return; }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, username, avatar_url')
        .in('id', rows.map((r) => r.fan_id as string));

      const merged: CreditRow[] = rows.map((r) => {
        const p = (profiles || []).find((x) => x.id === r.fan_id);
        return {
          fan_id: r.fan_id as string,
          role_label: (r.role_label as string) || 'Credited Supporter',
          display_name: p?.display_name ?? null,
          username: p?.username ?? null,
          avatar_url: p?.avatar_url ?? null,
        };
      });
      if (active) setCredits(merged);
    })();
    return () => { active = false; };
  }, [releaseType, releaseId]);

  if (credits.length === 0) return null;

  return (
    <div className="neu-inset rounded-2xl p-4 mb-6">
      <h2 className="text-crwn-text font-semibold text-sm mb-3 flex items-center gap-1.5">
        <span>📝</span> Credits
      </h2>
      <ul className="space-y-2">
        {credits.map((c) => {
          const name = c.display_name || c.username || 'Fan';
          return (
            <li key={c.fan_id} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full overflow-hidden bg-crwn-elevated flex items-center justify-center text-crwn-gold text-xs font-semibold flex-shrink-0">
                {c.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.avatar_url} alt={name} className="w-full h-full object-cover" />
                  : name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <Link href={`/${c.username || c.fan_id}`} className="text-crwn-text text-sm hover:text-crwn-gold truncate block">
                  {name}
                </Link>
                <p className="text-crwn-text-secondary text-xs truncate">{c.role_label}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
