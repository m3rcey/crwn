'use client';

import { useState, useEffect } from 'react';
import { Star, Crown, Loader2, MessageCircle, TrendingUp } from 'lucide-react';
import Image from 'next/image';

interface Regular {
  fan_id: string;
  display_name: string;
  avatar_url: string | null;
  total_spent: number;
  engagement_score: number;
  subscribed_at: string;
  tier_name: string;
  comment_count: number;
}

interface TrueRegularsProps {
  artistId: string;
}

export function TrueRegulars({ artistId }: TrueRegularsProps) {
  const [regulars, setRegulars] = useState<Regular[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `/api/audience?artistId=${artistId}&sortBy=engagement_score&sortDir=desc&limit=10`
        );
        const json = await res.json();
        const fans = (json.fans || []).slice(0, 10).map((f: Record<string, unknown>) => ({
          fan_id: f.fan_id,
          display_name: f.display_name || 'Fan',
          avatar_url: f.avatar_url || null,
          total_spent: f.total_spent || 0,
          engagement_score: f.engagement_score || 0,
          subscribed_at: f.subscribed_at || '',
          tier_name: f.tier_name || '',
          comment_count: f.comment_count || 0,
        }));
        setRegulars(fans);
      } catch {
        // silent
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [artistId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-crwn-gold" />
      </div>
    );
  }

  if (regulars.length === 0) {
    return (
      <div className="bg-crwn-surface rounded-xl border border-crwn-elevated p-6 text-center">
        <Star className="w-8 h-8 text-crwn-text-secondary mx-auto mb-2" />
        <p className="text-crwn-text font-medium">No regulars yet</p>
        <p className="text-sm text-crwn-text-secondary mt-1">
          As fans subscribe and engage, your top 10 most loyal supporters will appear here.
        </p>
      </div>
    );
  }

  const daysSince = (dateStr: string) => {
    if (!dateStr) return 0;
    return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-crwn-text flex items-center gap-2">
            <Crown className="w-5 h-5 text-crwn-gold" />
            Your 10 True Regulars
          </h3>
          <p className="text-xs text-crwn-text-secondary mt-0.5">
            Your most engaged fans — introduce new members to them, spotlight them, keep them close.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {regulars.map((fan, index) => (
          <div
            key={fan.fan_id}
            className={`bg-crwn-surface rounded-xl border p-4 flex items-center gap-3 ${
              index < 3 ? 'border-crwn-gold/30' : 'border-crwn-elevated'
            }`}
          >
            {/* Rank */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
              index === 0 ? 'bg-crwn-gold/20 text-crwn-gold' :
              index === 1 ? 'bg-[#C0C0C0]/20 text-[#C0C0C0]' :
              index === 2 ? 'bg-[#CD7F32]/20 text-[#CD7F32]' :
              'bg-crwn-elevated text-crwn-text-secondary'
            }`}>
              {index + 1}
            </div>

            {/* Avatar */}
            <div className="w-10 h-10 rounded-full bg-crwn-elevated overflow-hidden flex-shrink-0">
              {fan.avatar_url ? (
                <Image src={fan.avatar_url} alt="" width={40} height={40} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary text-sm font-semibold">
                  {fan.display_name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-crwn-text truncate">{fan.display_name}</p>
              <div className="flex items-center gap-3 text-xs text-crwn-text-secondary mt-0.5">
                {fan.tier_name && <span>{fan.tier_name}</span>}
                <span>{daysSince(fan.subscribed_at)}d</span>
                {fan.comment_count > 0 && (
                  <span className="flex items-center gap-0.5">
                    <MessageCircle className="w-3 h-3" />
                    {fan.comment_count}
                  </span>
                )}
              </div>
            </div>

            {/* Score */}
            <div className="text-right flex-shrink-0">
              <div className="flex items-center gap-1 text-crwn-gold">
                <TrendingUp className="w-3 h-3" />
                <span className="text-sm font-semibold">{fan.engagement_score}</span>
              </div>
              <p className="text-[10px] text-crwn-text-secondary">
                ${(fan.total_spent / 100).toFixed(0)} spent
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-crwn-text-secondary text-center">
        Tip: introduce new members to your regulars. Fans who make one friend stay 5x longer.
      </p>
    </div>
  );
}
