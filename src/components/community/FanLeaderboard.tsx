'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Trophy, Users, Star, Loader2 } from 'lucide-react';
import Image from 'next/image';

interface LeaderboardEntry {
  rank: number;
  fanId: string;
  name: string;
  avatar: string | null;
  score: number;
  spent: number;
  referralCount: number;
  tier: string;
}

interface FanLeaderboardProps {
  artistId: string;
}

export function FanLeaderboard({ artistId }: FanLeaderboardProps) {
  const { user } = useAuth();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/leaderboard?artistId=${artistId}`)
      .then(res => res.json())
      .then(data => {
        if (data.leaderboard) setLeaderboard(data.leaderboard);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [artistId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 text-crwn-gold animate-spin" />
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="neu-raised rounded-xl p-6 text-center">
        <Trophy className="w-10 h-10 text-crwn-gold/30 mx-auto mb-2" />
        <p className="text-crwn-text text-sm font-medium">No supporters yet</p>
        <p className="text-xs text-crwn-text-secondary mt-1">
          Be the first to support this artist!
        </p>
      </div>
    );
  }

  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-crwn-gold text-crwn-bg';
    if (rank === 2) return 'bg-gray-400 text-crwn-bg';
    if (rank === 3) return 'bg-amber-700 text-white';
    return 'bg-crwn-elevated text-crwn-text-secondary';
  };

  const getRankEmoji = (rank: number) => {
    if (rank === 1) return '👑';
    if (rank === 2) return '⭐';
    if (rank === 3) return '🔥';
    return null;
  };

  const isCurrentUser = (fanId: string) => user?.id === fanId;

  return (
    <div className="neu-raised rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-crwn-elevated flex items-center gap-2">
        <Trophy className="w-4 h-4 text-crwn-gold" />
        <h3 className="text-sm font-semibold text-crwn-text">Top Supporters</h3>
      </div>

      <div className="divide-y divide-crwn-elevated">
        {leaderboard.map(entry => (
          <div
            key={entry.fanId}
            className={`flex items-center gap-3 px-4 py-3 ${
              isCurrentUser(entry.fanId) ? 'bg-crwn-gold/5' : ''
            }`}
          >
            {/* Rank */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${getRankStyle(entry.rank)}`}>
              {getRankEmoji(entry.rank) || entry.rank}
            </div>

            {/* Avatar */}
            <div className="w-8 h-8 rounded-full bg-crwn-elevated overflow-hidden flex-shrink-0">
              {entry.avatar ? (
                <Image
                  src={entry.avatar}
                  alt={entry.name}
                  width={32}
                  height={32}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-crwn-text-secondary text-xs">
                  {entry.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            {/* Name + Tier */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${
                isCurrentUser(entry.fanId) ? 'text-crwn-gold font-semibold' : 'text-crwn-text'
              }`}>
                {entry.name}
                {isCurrentUser(entry.fanId) && ' (You)'}
              </p>
              {entry.tier && (
                <p className="text-[10px] text-crwn-text-secondary">{entry.tier}</p>
              )}
            </div>

            {/* Score + Stats */}
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-semibold text-crwn-gold">{entry.score.toLocaleString()} pts</p>
              <div className="flex items-center gap-2 text-[10px] text-crwn-text-secondary">
                {entry.referralCount > 0 && (
                  <span>{entry.referralCount} ref{entry.referralCount !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
