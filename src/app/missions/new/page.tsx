'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CalendarCheck,
  Check,
  Crown,
  FileText,
  Flag,
  Gift,
  Lock,
  MapPin,
  Megaphone,
  MessageSquare,
  PartyPopper,
  Radio,
  Scissors,
  Share2,
  Target,
  UserPlus,
  Users,
  Vote,
  Wand2,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/promiseTimeout';
import {
  MISSION_AUDIENCE_LABELS,
  MISSION_REWARD_LABELS,
  MISSION_TYPE_LABELS,
  type MissionAudience,
  type MissionRewardType,
  type MissionType,
} from '@/lib/missions';

/**
 * Mission Builder — a guided, one-decision-per-screen wizard that creates ONE
 * trackable fan action (a "mission") toward a goal. Money-LIGHT: nothing here
 * touches Stripe or checkout. Earning missions (share/clip) pay through the
 * EXISTING artist-wide Share/Clip promotion — this wizard never sets a
 * per-mission commission rate (that comes later).
 */

type TargetKind = 'none' | 'demand_test' | 'tier';

type StepKey = 'type' | 'target' | 'goal' | 'reward' | 'earning-note' | 'audience' | 'copy' | 'review';

interface StepDef {
  key: StepKey;
  title: string;
  subtitle: string;
  icon: typeof Target;
}

const MISSION_TYPES: { value: MissionType; label: string; hint: string; icon: typeof Target }[] = [
  { value: 'share', label: 'Share-to-Earn', hint: 'Fans share your link and earn on the subs they refer.', icon: Share2 },
  { value: 'clip', label: 'Clip-to-Earn', hint: 'Clippers cut your content and earn on the subs they convert.', icon: Scissors },
  { value: 'referral', label: 'Refer fans', hint: 'Fans bring friends to your page.', icon: UserPlus },
  { value: 'subscribe', label: 'Get subscribers', hint: 'Push fans to join a tier.', icon: Crown },
  { value: 'rsvp', label: 'RSVP', hint: 'Fans reserve a spot for a show or session.', icon: CalendarCheck },
  { value: 'vote', label: 'Vote', hint: 'Fans back an idea or make a pick.', icon: Vote },
  { value: 'live', label: 'Live attendance', hint: 'Fans pull up to your live session.', icon: Radio },
  { value: 'city', label: 'City push', hint: 'Rally fans in one city.', icon: MapPin },
  { value: 'comment', label: 'Comment / Post', hint: 'Fans comment or post about you.', icon: MessageSquare },
  { value: 'presave', label: 'Pre-save', hint: 'Fans pre-save the next drop.', icon: Bookmark },
  { value: 'custom', label: 'Custom', hint: 'Any fan action you define.', icon: Wand2 },
];

// Sensible per-type default copy — client-side templates, no AI call.
const DEFAULT_COPY: Record<MissionType, { title: string; cta: string }> = {
  share: { title: 'Share my page', cta: 'Share now' },
  clip: { title: 'Clip my content', cta: 'Start clipping' },
  referral: { title: 'Bring a friend to the page', cta: 'Refer a fan' },
  subscribe: { title: 'Join the inner circle', cta: 'Subscribe' },
  rsvp: { title: 'Reserve your spot', cta: 'RSVP' },
  vote: { title: 'Vote on the next move', cta: 'Vote' },
  live: { title: 'Pull up to the live', cta: 'Join the live' },
  city: { title: 'Put your city on the map', cta: 'Rep your city' },
  comment: { title: 'Say something on the post', cta: 'Comment' },
  presave: { title: 'Pre-save the next drop', cta: 'Pre-save' },
  custom: { title: 'Complete the mission', cta: 'Get started' },
};

const REWARD_TYPES: { value: MissionRewardType; hint: string }[] = [
  { value: 'points', hint: 'Fans rack up points on the leaderboard.' },
  { value: 'badge', hint: 'A badge on their profile for completing it.' },
  { value: 'credits', hint: 'Credits toward your shop or drops.' },
  { value: 'access', hint: 'Unlock a perk — a track, a call, a listening session.' },
  { value: 'commission', hint: 'A cut of the subs they bring in (artist-wide rate).' },
  { value: 'custom', hint: 'Anything you want — describe it below.' },
];

const AUDIENCES: { value: MissionAudience; label: string; hint: string }[] = [
  { value: 'all', label: 'All fans', hint: 'Anyone can take this mission on.' },
  { value: 'subscribers', label: 'Subscribers', hint: 'Aimed at your paying members.' },
  { value: 'free', label: 'Free fans', hint: 'Aimed at fans who haven\'t subscribed yet.' },
];

interface DemandTestOption {
  id: string;
  title: string;
}

interface TierOption {
  id: string;
  name: string;
  price: number;
}

const isValidGoal = (v: string) => v.trim() !== '' && Number.isInteger(Number(v)) && Number(v) >= 1;

const INPUT =
  'w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-4 text-lg text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold';

const isEarning = (t: MissionType | null) => t === 'share' || t === 'clip';

function stepList(missionType: MissionType | null): StepDef[] {
  return [
    { key: 'type', title: 'What should fans do?', subtitle: 'Pick the one action this mission asks for.', icon: Flag },
    { key: 'target', title: 'What should this mission push?', subtitle: 'Point the mission at your page, a demand test, or a tier.', icon: Target },
    { key: 'goal', title: 'What number wins the mission?', subtitle: 'Set the goal, and an optional deadline for urgency.', icon: Check },
    { key: 'reward', title: 'What do fans get for it?', subtitle: 'The reward that makes the mission worth doing.', icon: Gift },
    ...(isEarning(missionType)
      ? [{ key: 'earning-note' as const, title: 'How this mission pays', subtitle: 'Earning missions run on your artist-wide promotion.', icon: Megaphone }]
      : []),
    { key: 'audience', title: 'Who is this mission for?', subtitle: 'Who you\'ll aim it at. It shows to fans in a later phase.', icon: Users },
    { key: 'copy', title: 'Write the mission', subtitle: 'What fans read before they act. Short and concrete wins.', icon: FileText },
    { key: 'review', title: 'Review your mission', subtitle: 'Check everything, then publish.', icon: Check },
  ];
}

function MissionBuilder() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [demandTests, setDemandTests] = useState<DemandTestOption[]>([]);
  const [tiers, setTiers] = useState<TierOption[]>([]);

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'steps' | 'done'>('steps');
  const [publishing, setPublishing] = useState(false);

  // ---- Draft state (nothing persists until Publish) -----------------------
  const [missionType, setMissionType] = useState<MissionType | null>(null);
  const [targetKind, setTargetKind] = useState<TargetKind>('none');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetLabel, setTargetLabel] = useState<string | null>(null);
  const [goalCount, setGoalCount] = useState('100');
  const [deadline, setDeadline] = useState('');
  const [rewardType, setRewardType] = useState<MissionRewardType>('points');
  const [rewardDetail, setRewardDetail] = useState('');
  const [audience, setAudience] = useState<MissionAudience>('all');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [cta, setCta] = useState('');

  // ---- Resolve the artist (artist_profiles.id via user_id — same as useArtistSetup)
  const loadArtist = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    setArtistId(data?.id ?? null);

    if (data?.id) {
      // Target options — the artist's demand tests + active tiers.
      const [demandRes, tierRes] = await Promise.all([
        supabase
          .from('proof_of_demand')
          .select('id, title')
          .eq('artist_id', data.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('subscription_tiers')
          .select('id, name, price')
          .eq('artist_id', data.id)
          .eq('is_active', true)
          .order('price', { ascending: true }),
      ]);
      setDemandTests((demandRes.data as DemandTestOption[]) || []);
      setTiers((tierRes.data as TierOption[]) || []);
    }
    setLoading(false);
  }, [user, supabase]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    loadArtist();
  }, [authLoading, user, router, loadArtist]);

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  if (!artistId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">Missions are for artists. Publish your artist page first.</p>
        <button
          onClick={() => router.push('/home')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to CRWN
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    return <DoneScreen onMissions={() => router.push('/missions')} onDashboard={() => router.push('/profile/artist')} />;
  }

  const steps = stepList(missionType);
  const current = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;
  const progressPct = Math.round((stepIndex / steps.length) * 100);

  const applyType = (t: MissionType) => {
    setMissionType(t);
    // Type presets the copy templates + the reward default. Share/clip missions
    // default to commission (paid via the artist-wide promotion).
    setTitle(DEFAULT_COPY[t].title);
    setCta(DEFAULT_COPY[t].cta);
    setRewardType(t === 'share' || t === 'clip' ? 'commission' : 'points');
  };

  const applyTargetKind = (kind: TargetKind) => {
    setTargetKind(kind);
    setTargetId(null);
    setTargetLabel(null);
  };

  const canContinue = (): boolean => {
    switch (current.key) {
      case 'type':
        return missionType !== null;
      case 'target':
        return targetKind === 'none' || targetId !== null;
      case 'goal':
        return isValidGoal(goalCount);
      case 'reward':
        return true;
      case 'earning-note':
        return true;
      case 'audience':
        return true;
      case 'copy':
        return title.trim() !== '';
      case 'review':
        return true;
    }
  };

  const scrollTop = () => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const publish = async () => {
    if (publishing || !missionType) return;
    setPublishing(true);
    try {
      // The owning artist inserts directly — RLS "Artists manage own missions".
      const { error } = await withTimeout(
        supabase.from('missions').insert({
          artist_id: artistId,
          type: missionType,
          target_kind: targetKind,
          target_id: targetKind === 'none' ? null : targetId,
          target_label: targetKind === 'none' ? null : targetLabel,
          goal_count: Math.round(Number(goalCount)),
          // End-of-day so the deadline day itself still counts.
          deadline: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null,
          reward_type: rewardType,
          reward_detail: rewardDetail.trim() || null,
          audience,
          title: title.trim(),
          description: description.trim() || null,
          cta: cta.trim() || null,
          status: 'active',
        })
      );

      if (error) {
        showToast(error.message || 'Could not publish the mission. Please try again.', 'error');
        return; // stay on Review so they can retry
      }

      setPhase('done');
      scrollTop();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong. Please try again.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  const goNext = () => {
    if (isLast) {
      publish();
      return;
    }
    setStepIndex((i) => i + 1);
    scrollTop();
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(0, i - 1));
    scrollTop();
  };

  const Icon = current.icon;

  const targetSummary =
    targetKind === 'none' ? 'My artist page' : `${targetKind === 'demand_test' ? 'Demand test' : 'Tier'} — ${targetLabel ?? ''}`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress header */}
      <header className="sticky top-0 z-20 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-crwn-gold font-bold tracking-tight">Mission Builder</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-crwn-text-secondary">
                Step {stepIndex + 1} of {steps.length}
              </span>
              <button
                onClick={() => router.push('/studio')}
                aria-label="Exit to Studio"
                className="text-crwn-text-secondary hover:text-crwn-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="h-1.5 rounded-full bg-crwn-elevated overflow-hidden">
            <div className="h-full bg-crwn-gold rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </header>

      {/* One decision */}
      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-start gap-3 mb-8">
            <div className="w-11 h-11 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-crwn-gold" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-crwn-text">{current.title}</h1>
              <p className="text-crwn-text-secondary text-sm mt-1">{current.subtitle}</p>
            </div>
          </div>

          {current.key === 'type' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {MISSION_TYPES.map((t) => {
                const TypeIcon = t.icon;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => applyType(t.value)}
                    className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                      missionType === t.value ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <TypeIcon className="w-4 h-4 text-crwn-gold flex-shrink-0" />
                      <p className="font-medium text-crwn-text">{t.label}</p>
                    </div>
                    <p className="text-xs text-crwn-text-secondary">{t.hint}</p>
                  </button>
                );
              })}
            </div>
          )}

          {current.key === 'target' && (
            <div className="space-y-5">
              <div className="grid gap-3">
                <button
                  type="button"
                  onClick={() => applyTargetKind('none')}
                  className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                    targetKind === 'none' ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                  }`}
                >
                  <p className="font-medium text-crwn-text">My artist page</p>
                  <p className="text-xs text-crwn-text-secondary mt-0.5">The mission points fans at your page itself.</p>
                </button>
                <button
                  type="button"
                  onClick={() => applyTargetKind('demand_test')}
                  className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                    targetKind === 'demand_test' ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                  }`}
                >
                  <p className="font-medium text-crwn-text">A demand test</p>
                  <p className="text-xs text-crwn-text-secondary mt-0.5">
                    Push responses to a Proof of Demand test — progress tracks automatically.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => applyTargetKind('tier')}
                  className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                    targetKind === 'tier' ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                  }`}
                >
                  <p className="font-medium text-crwn-text">An offer / tier</p>
                  <p className="text-xs text-crwn-text-secondary mt-0.5">Push fans toward one of your membership tiers.</p>
                </button>
              </div>

              {targetKind === 'demand_test' && (
                <div>
                  <p className="text-sm font-medium text-crwn-text mb-2">Which demand test?</p>
                  {demandTests.length === 0 ? (
                    <p className="text-sm text-crwn-text-secondary border border-dashed border-crwn-elevated rounded-xl px-4 py-5">
                      No demand tests yet — create one from Proof of Demand first, or pick a different target.
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {demandTests.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => {
                            setTargetId(d.id);
                            setTargetLabel(d.title);
                          }}
                          className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                            targetId === d.id ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                          }`}
                        >
                          <p className="text-sm font-medium text-crwn-text truncate">{d.title}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {targetKind === 'tier' && (
                <div>
                  <p className="text-sm font-medium text-crwn-text mb-2">Which tier?</p>
                  {tiers.length === 0 ? (
                    <p className="text-sm text-crwn-text-secondary border border-dashed border-crwn-elevated rounded-xl px-4 py-5">
                      No active tiers yet — build one in the Offer Builder first, or pick a different target.
                    </p>
                  ) : (
                    <div className="grid gap-2">
                      {tiers.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setTargetId(t.id);
                            setTargetLabel(t.name);
                          }}
                          className={`text-left px-4 py-3 rounded-xl border transition-colors ${
                            targetId === t.id ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                          }`}
                        >
                          <p className="text-sm font-medium text-crwn-text truncate">
                            {t.name}
                            <span className="text-crwn-text-secondary font-normal"> · ${(t.price / 100).toFixed(2)}/mo</span>
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {current.key === 'goal' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Goal</label>
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={goalCount}
                    onChange={(e) => setGoalCount(e.target.value)}
                    className="w-32 bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-3 text-lg text-crwn-text focus:outline-none focus:border-crwn-gold"
                  />
                  <span className="text-crwn-text-secondary">completions</span>
                </div>
                <p className="text-xs text-crwn-text-secondary mt-2">When this many fans do it, the mission is won.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Deadline (optional)</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-3 text-crwn-text focus:outline-none focus:border-crwn-gold [color-scheme:dark]"
                />
                <p className="text-xs text-crwn-text-secondary mt-2">A deadline creates urgency.</p>
              </div>
            </div>
          )}

          {current.key === 'reward' && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2">
                {REWARD_TYPES.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRewardType(r.value)}
                    className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                      rewardType === r.value ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                    }`}
                  >
                    <p className="font-medium text-crwn-text">{MISSION_REWARD_LABELS[r.value]}</p>
                    <p className="text-xs text-crwn-text-secondary mt-0.5">{r.hint}</p>
                  </button>
                ))}
              </div>
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Reward details (optional)</label>
                <input
                  maxLength={200}
                  placeholder="100 credits + BTS clip"
                  value={rewardDetail}
                  onChange={(e) => setRewardDetail(e.target.value)}
                  className={`${INPUT} text-base`}
                />
                <p className="text-xs text-crwn-text-secondary mt-2">Exactly what fans get — shown on the mission.</p>
              </div>
            </div>
          )}

          {current.key === 'earning-note' && (
            <div className="bg-crwn-gold/5 border border-crwn-gold/20 rounded-2xl p-5">
              <p className="text-sm font-semibold text-crwn-gold mb-2">This mission pays through your artist-wide Share/Clip promotion.</p>
              <p className="text-sm text-crwn-text-secondary mb-3">
                Set the rate in the Offer Builder or the Referrals tab — this mission uses whatever your artist-wide rate is.
              </p>
              <p className="text-xs text-crwn-text-secondary">Per-mission rates come later. Nothing money-related is set here.</p>
            </div>
          )}

          {current.key === 'audience' && (
            <div className="grid gap-3">
              {AUDIENCES.map((a) => (
                <button
                  key={a.value}
                  type="button"
                  onClick={() => setAudience(a.value)}
                  className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                    audience === a.value ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                  }`}
                >
                  <p className="font-medium text-crwn-text">{a.label}</p>
                  <p className="text-xs text-crwn-text-secondary mt-0.5">{a.hint}</p>
                </button>
              ))}
            </div>
          )}

          {current.key === 'copy' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Title</label>
                <input
                  autoFocus
                  className={INPUT}
                  maxLength={120}
                  placeholder="Share my page"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Description (optional)</label>
                <textarea
                  rows={4}
                  maxLength={600}
                  placeholder="What to do, why it matters, what fans get."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${INPUT} resize-none text-base`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Button label</label>
                <input
                  maxLength={30}
                  placeholder="Share now"
                  value={cta}
                  onChange={(e) => setCta(e.target.value)}
                  className={`${INPUT} text-base`}
                />
                <p className="text-xs text-crwn-text-secondary mt-2">The short label on the mission button.</p>
              </div>
            </div>
          )}

          {current.key === 'review' && missionType && (
            <div className="space-y-6">
              <div className="border border-crwn-elevated rounded-2xl divide-y divide-crwn-elevated">
                <ReviewRow label="Mission" value={MISSION_TYPE_LABELS[missionType]} />
                <ReviewRow label="Target" value={targetSummary} />
                <ReviewRow
                  label="Goal"
                  value={`${Math.round(Number(goalCount))} completions${deadline ? ` by ${new Date(`${deadline}T23:59:59`).toLocaleDateString()}` : ''}`}
                />
                <ReviewRow
                  label="Reward"
                  value={`${MISSION_REWARD_LABELS[rewardType]}${rewardDetail.trim() ? ` — ${rewardDetail.trim()}` : ''}`}
                />
                <ReviewRow label="Audience" value={MISSION_AUDIENCE_LABELS[audience]} />
                <ReviewRow label="Title" value={title.trim()} />
                {cta.trim() !== '' && <ReviewRow label="Button" value={cta.trim()} />}
              </div>

              {isEarning(missionType) && (
                <p className="text-xs text-crwn-text-secondary">
                  Pays through your artist-wide Share/Clip promotion — set the rate in the Offer Builder or the Referrals tab.
                </p>
              )}

              <div className="bg-crwn-gold/5 border border-crwn-gold/20 rounded-2xl p-4">
                <p className="text-sm font-semibold text-crwn-gold mb-2">What CRWN sets up</p>
                <ul className="space-y-1.5 text-sm text-crwn-text-secondary">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                    Your mission, live in your Missions list with progress against the goal.
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                    {targetKind === 'demand_test'
                      ? 'Progress auto-tracks from the demand test’s live responses.'
                      : 'Update progress anytime from the mission page.'}
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                    No money moves here — fan-facing mission pages come in a later phase.
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer nav */}
      <footer className="sticky bottom-0 z-20 bg-crwn-bg/90 backdrop-blur-md border-t border-crwn-elevated">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <button
            onClick={goBack}
            disabled={stepIndex === 0 || publishing}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-crwn-text-secondary hover:text-crwn-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex flex-col items-end">
            <button
              onClick={goNext}
              disabled={!canContinue() || publishing}
              className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {!canContinue() && !publishing && <Lock className="w-4 h-4" />}
              {publishing ? 'Publishing…' : isLast ? 'Publish mission' : current.key === 'earning-note' ? 'Got it' : 'Continue'}
              {canContinue() && !publishing && <ArrowRight className="w-4 h-4" />}
            </button>
            {!canContinue() && !publishing && (
              <span className="text-[11px] text-crwn-text-secondary mt-1.5">Complete this step to continue</span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---- Small pieces ----------------------------------------------------------

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-sm text-crwn-text-secondary flex-shrink-0">{label}</span>
      <span className="text-sm text-crwn-text text-right">{value}</span>
    </div>
  );
}

function DoneScreen({ onMissions, onDashboard }: { onMissions: () => void; onDashboard: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg text-center page-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-crwn-gold/15 flex items-center justify-center">
          <PartyPopper className="w-9 h-9 text-crwn-gold" />
        </div>
        <h1 className="text-3xl font-bold text-crwn-text mb-2">Mission is live 🎉</h1>
        <p className="text-crwn-text-secondary mb-8">
          Track it from your Missions list — fan-facing mission pages come in a later phase.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onMissions}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-8 py-3 rounded-full hover:bg-crwn-gold/90 transition-colors"
          >
            View Missions
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onDashboard}
            className="w-full sm:w-auto px-8 py-3 rounded-full border border-crwn-elevated text-sm font-medium text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/50 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NewMissionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
        </div>
      }
    >
      <MissionBuilder />
    </Suspense>
  );
}
