'use client';

import { useEffect, useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import Image from 'next/image';
import Link from 'next/link';

interface Supporter {
  id: string;
  fan_id: string;
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
}

interface SupporterWallProps {
  artistId: string;
}

export function SupporterWall({ artistId }: SupporterWallProps) {
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadSupporters() {
      if (!artistId) return;

      const supabase = createBrowserSupabaseClient();

      // Get active subscriptions with tier benefits
      const { data: subscriptions, error } = await supabase
        .from('subscriptions')
        .select(`
          fan_id,
          tier:tier_id(
            id,
            benefits:tier_benefits(benefit_type, config)
          )
        `)
        .eq('artist_id', artistId)
        .eq('status', 'active');

      if (error || !subscriptions) {
        console.error('Error loading supporters:', error);
        setIsLoading(false);
        return;
      }

      // Filter to only fans whose tier has supporter_wall benefit
      const fanIdsWithSupportersWall: string[] = [];
      
      for (const sub of subscriptions) {
        const tier = sub.tier as any;
        if (tier?.benefits) {
          const hasSupporterWall = tier.benefits.some(
            (b: any) => b.benefit_type === 'supporter_wall' && b.config?.enabled !== false
          );
          if (hasSupporterWall) {
            fanIdsWithSupportersWall.push(sub.fan_id);
          }
        }
      }

      if (fanIdsWithSupportersWall.length === 0) {
        setSupporters([]);
        setIsLoading(false);
        return;
      }

      // Get fan profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, username')
        .in('id', fanIdsWithSupportersWall);

      const mappedSupporters: Supporter[] = (profiles || []).map(p => ({
        id: p.id,
        fan_id: p.id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
        username: p.username,
      }));

      setSupporters(mappedSupporters);
      setIsLoading(false);
    }

    loadSupporters();
  }, [artistId]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-6 gap-2">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="w-10 h-10 rounded-full neu-inset animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (supporters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {supporters.map((supporter) => (
        <Link
          key={supporter.id}
          href={`/artist/${supporter.username || supporter.id}`}
          className="relative group"
          title={supporter.display_name || supporter.username || 'Supporter'}
        >
          <div className="w-10 h-10 rounded-full border-2 border-crwn-gold overflow-hidden neu-raised transition-transform group-hover:scale-110">
            {supporter.avatar_url ? (
              <Image
                src={supporter.avatar_url}
                alt={supporter.display_name || 'Supporter'}
                width={40}
                height={40}
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-crwn-surface text-crwn-gold font-semibold">
                {(supporter.display_name || supporter.username || 'U').charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
