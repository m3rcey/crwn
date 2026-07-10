'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import type { QuestInstance, CompletionEvent } from '@/lib/quests/types';
import { QuestCard } from '@/components/quests/QuestCard';
import { MovementMap } from '@/components/quests/MovementMap';
import { QuestCompletionModal } from '@/components/quests/QuestCompletionModal';
import { FAN_ROLES, getFanRole } from '@/lib/quests/fanRoles';
import { Zap, Flame, Compass, UserPlus, Users, Loader2, ArrowRight, Sparkles } from 'lucide-react';

interface QuestsResponse {
  enabled: boolean;
  role: 'artist' | 'fan';
  artistId: string | null;
  artistCount: number;
  primaryArtist: { id: string; slug: string; displayName: string; avatarUrl: string | null } | null;
  quests: QuestInstance[];
  completions: CompletionEvent[];
  recommended: { questId: string; title: string; reason: string } | null;
  progression: {
    xp: number;
    level: number;
    levelTitle: string;
    percentToNext: number;
    isMax: boolean;
    streak: number;
    fanRole: string | null;
  };
}

const OPEN = ['available', 'active', 'in_progress', 'ready_to_complete'];

// Supporter Mode — the fan's guided participation home. Adapts to how many artists
// the fan supports (0 / 1 / 2-3 / 4+) so early low-artist-supply still feels like a
// full world: one artist = a full game, never an empty marketplace.
export function SupporterMode() {
  const router = useRouter();
  const [data, setData] = useState<QuestsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRolePicker, setShowRolePicker] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/quests', { cache: 'no-store' });
      setData(await res.json());
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function chooseRole(roleId: string) {
    setShowRolePicker(false);
    await fetch('/api/quests/role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: roleId }),
    });
    load();
  }

  // While dark-launched or for artists, render nothing so Home looks normal.
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-crwn-gold" />
      </div>
    );
  }
  if (!data || !data.enabled || data.role === 'artist') return null;

  const artistSlug = data.primaryArtist?.slug;
  // Fill fan-quest CTAs that need the artist's public page.
  const ctaFor = (q: QuestInstance): string | undefined => {
    if (!artistSlug) return undefined;
    if (q.template_key === 'fan_subscribe_to_artist' || q.template_key === 'fan_back_campaign') return `/${artistSlug}`;
    if (q.template_key === 'fan_share_campaign') return `/${artistSlug}`;
    return undefined;
  };

  // ---- 0 artists: lead into discovery without an empty marketplace ----
  if (data.artistCount === 0) {
    return (
      <div className="rounded-xl bg-crwn-surface p-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-base font-bold tracking-widest text-crwn-gold uppercase">Supporter Mode</span>
        </div>
        <h2 className="text-2xl font-bold text-crwn-text">Find an artist to rise with</h2>
        <p className="text-lg text-crwn-text-secondary mt-3 max-w-lg leading-relaxed">
          Supporter Mode gives you a role, daily assignments, and proof you were early — the moment
          you back your first artist. Pick someone below to begin.
        </p>
        <div className="flex flex-wrap gap-3 mt-5">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 px-5 py-3 bg-crwn-gold text-crwn-bg rounded-full font-bold text-lg hover:bg-crwn-gold-hover transition-colors"
          >
            <Compass className="w-5 h-5" /> Explore artists
          </Link>
        </div>
      </div>
    );
  }

  const open = data.quests.filter((q) => OPEN.includes(q.status));
  const todaysAssignment =
    open.find((q) => ['daily_assignment', 'daily_move', 'campaign_quest'].includes(q.quest_type)) || open[0];
  const questline = open.filter((q) => q.id !== todaysAssignment?.id);
  const rewardsClose = open.filter((q) => q.reward?.proofCard || (q.reward?.badges?.length ?? 0) > 0);
  const recommendedQuest = data.recommended ? open.find((q) => q.id === data.recommended!.questId) : undefined;
  const p = data.progression;
  const role = getFanRole(p.fanRole) || getFanRole('listener')!;
  const multi = data.artistCount >= 2;

  return (
    <div className="space-y-5">
      <QuestCompletionModal events={data.completions} />
      {/* Header + My Artist */}
      <div className="rounded-xl bg-crwn-surface p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            {data.primaryArtist?.avatarUrl ? (
              <Image
                src={data.primaryArtist.avatarUrl}
                alt={data.primaryArtist.displayName}
                width={48}
                height={48}
                className="rounded-full object-cover w-12 h-12"
              />
            ) : (
              <div className="w-12 h-12 rounded-full bg-crwn-elevated flex items-center justify-center text-crwn-text font-bold">
                {(data.primaryArtist?.displayName || 'A').charAt(0)}
              </div>
            )}
            <div>
              <div className="text-base font-bold tracking-widest text-crwn-gold uppercase">Supporter Mode</div>
              <div className="text-2xl font-bold text-crwn-text leading-tight">
                Supporting {data.primaryArtist?.displayName}
              </div>
              <button
                onClick={() => setShowRolePicker((s) => !s)}
                className="text-base text-crwn-text-secondary hover:text-crwn-gold mt-1"
              >
                {role.emoji} {role.title} · change role
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-crwn-text">
              <Zap className="w-5 h-5 text-crwn-gold" />
              <span className="text-2xl font-bold">{p.xp}</span>
              <span className="text-base text-crwn-text-secondary">XP</span>
            </div>
            {p.streak > 0 && (
              <div className="flex items-center gap-2 text-crwn-text">
                <Flame className="w-5 h-5 text-orange-400" />
                <span className="text-2xl font-bold">{p.streak}</span>
              </div>
            )}
          </div>
        </div>

        {showRolePicker && (
          <div className="mt-4 flex flex-wrap gap-2">
            {FAN_ROLES.filter((r) => r.selectable).map((r) => (
              <button
                key={r.id}
                onClick={() => chooseRole(r.id)}
                className={`text-sm rounded-full px-4 py-2 border transition-colors ${
                  r.id === role.id
                    ? 'border-crwn-gold text-crwn-gold bg-crwn-gold/10'
                    : 'border-[#2A2A2A] text-crwn-text-secondary hover:border-[#3A3A3A]'
                }`}
              >
                {r.emoji} {r.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Today's Assignment */}
      {todaysAssignment && (
        <div>
          <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2">
            Today's Assignment
          </h3>
          <QuestCard quest={todaysAssignment} variant="hero" ctaHref={ctaFor(todaysAssignment)} />
        </div>
      )}

      {/* Recommended next move */}
      {recommendedQuest && data.recommended && recommendedQuest.id !== todaysAssignment?.id && (
        <div className="rounded-2xl border border-crwn-gold/30 bg-[#1A1A1A] p-4">
          <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-crwn-gold" /> Recommended for you
          </h3>
          <p className="text-lg text-crwn-text-secondary italic mb-3">“{data.recommended.reason}”</p>
          <QuestCard quest={recommendedQuest} variant="compact" ctaHref={ctaFor(recommendedQuest)} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {questline.length > 0 && (
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2">
                Your Questline
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {questline.slice(0, 6).map((q) => (
                  <QuestCard key={q.id} quest={q} variant="compact" ctaHref={ctaFor(q)} />
                ))}
              </div>
            </div>
          )}

          {rewardsClose.length > 0 && (
            <div>
              <h3 className="text-base font-bold uppercase tracking-wide text-crwn-text-secondary mb-2">
                Rewards Close to Unlock
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rewardsClose.slice(0, 4).map((q) => (
                  <QuestCard key={q.id} quest={q} variant="compact" ctaHref={ctaFor(q)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <MovementMap role="fan" currentLevel={p.level} />

          {/* Invite / scout / command center */}
          <div className="rounded-2xl border border-[#2A2A2A] bg-[#1A1A1A] p-4 space-y-2">
            <button
              onClick={() => router.push('/earn')}
              className="w-full flex items-center gap-2 text-base text-crwn-text hover:text-crwn-gold"
            >
              <UserPlus className="w-4 h-4 text-crwn-gold" /> Invite a friend
            </button>
            <button
              onClick={() => router.push('/explore')}
              className="w-full flex items-center gap-2 text-base text-crwn-text hover:text-crwn-gold"
            >
              <Compass className="w-4 h-4 text-crwn-gold" /> Scout more artists
            </button>
            {multi && (
              <button
                onClick={() => router.push('/command')}
                className="w-full flex items-center justify-between text-base text-crwn-text hover:text-crwn-gold"
              >
                <span className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-crwn-gold" /> Fan Command Center
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
