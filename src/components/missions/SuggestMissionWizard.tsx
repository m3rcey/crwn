'use client';

import { useState } from 'react';
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
  MessageSquare,
  PartyPopper,
  Radio,
  Scissors,
  Share2,
  Target,
  UserPlus,
  Vote,
  Wand2,
  X,
} from 'lucide-react';
import { useToast } from '@/components/shared/Toast';
import { MISSION_TYPE_LABELS, type MissionType } from '@/lib/missions';

/**
 * Fan-facing "Suggest a mission" wizard — cloned from the artist Mission
 * Builder (one decision per screen, sticky footer, review + done). Money-FREE
 * and SUGGESTION-only: submitting never publishes anything. The proposal goes
 * to the artist's review queue; the artist decides the real reward. The
 * fan's "reward" screen is explicitly labeled non-binding free text.
 */

type TargetKind = 'none' | 'demand_test';
type StepKey = 'type' | 'target' | 'goal' | 'reward' | 'pitch' | 'review';

interface StepDef {
  key: StepKey;
  title: string;
  subtitle: string;
  icon: typeof Target;
}

const MISSION_TYPES: { value: MissionType; hint: string; icon: typeof Target }[] = [
  { value: 'share', hint: 'Fans spread the page far and wide.', icon: Share2 },
  { value: 'clip', hint: 'Fans cut clips from the content.', icon: Scissors },
  { value: 'referral', hint: 'Fans bring friends to the page.', icon: UserPlus },
  { value: 'subscribe', hint: 'Rally fans to join a tier.', icon: Crown },
  { value: 'rsvp', hint: 'Fans reserve spots for a show or session.', icon: CalendarCheck },
  { value: 'vote', hint: 'Fans back an idea or make a pick.', icon: Vote },
  { value: 'live', hint: 'Fans pull up to a live session.', icon: Radio },
  { value: 'city', hint: 'Rally fans in one city.', icon: MapPin },
  { value: 'comment', hint: 'Fans comment or post about the artist.', icon: MessageSquare },
  { value: 'presave', hint: 'Fans pre-save the next drop.', icon: Bookmark },
  { value: 'custom', hint: 'Any fan action you can dream up.', icon: Wand2 },
];

const STEPS: StepDef[] = [
  { key: 'type', title: 'What should fans do?', subtitle: 'Pick the one action your mission idea asks for.', icon: Flag },
  { key: 'target', title: 'What is it connected to?', subtitle: 'Point your idea at the page itself or one of the artist\'s demand tests.', icon: Target },
  { key: 'goal', title: 'Suggest a goal', subtitle: 'How many fans doing it would make this mission a win?', icon: Check },
  { key: 'reward', title: 'Suggest a reward', subtitle: 'Just a suggestion. The artist decides the real reward.', icon: Gift },
  { key: 'pitch', title: 'Make your pitch', subtitle: 'Name the mission and tell the artist why fans would show up for it.', icon: FileText },
  { key: 'review', title: 'Review your suggestion', subtitle: 'Check everything, then send it for approval.', icon: Check },
];

const isValidGoal = (v: string) => v.trim() !== '' && Number.isInteger(Number(v)) && Number(v) >= 1;

const INPUT =
  'w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-4 text-lg text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold';

export function SuggestMissionWizard({
  artistId,
  artistName,
  artistSlug,
  demandTests,
  isLoggedIn,
  isOwnPage,
}: {
  artistId: string;
  artistName: string;
  artistSlug: string;
  demandTests: { id: string; title: string }[];
  isLoggedIn: boolean;
  isOwnPage: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'steps' | 'done'>('steps');
  const [wasDuplicate, setWasDuplicate] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ---- Draft state (nothing persists until Submit) -------------------------
  const [missionType, setMissionType] = useState<MissionType | null>(null);
  const [targetKind, setTargetKind] = useState<TargetKind>('none');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [targetLabel, setTargetLabel] = useState<string | null>(null);
  const [goalCount, setGoalCount] = useState('100');
  const [suggestedReward, setSuggestedReward] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  if (isOwnPage) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <p className="text-crwn-text mb-4">This is your own page. Create the mission directly instead.</p>
        <button
          onClick={() => router.push('/missions/new')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Open the Mission Builder
        </button>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <DoneScreen
        artistName={artistName}
        duplicate={wasDuplicate}
        onBack={() => router.push(`/${artistSlug}`)}
      />
    );
  }

  const current = STEPS[stepIndex];
  const isLast = stepIndex >= STEPS.length - 1;
  const progressPct = Math.round((stepIndex / STEPS.length) * 100);

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
      case 'pitch':
        return title.trim() !== '';
      case 'review':
        return true;
    }
  };

  const scrollTop = () => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    if (submitting || !missionType) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/mission-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artistId,
          type: missionType,
          targetKind,
          targetId: targetKind === 'none' ? null : targetId,
          targetLabel: targetKind === 'none' ? null : targetLabel,
          goalCount: Math.round(Number(goalCount)),
          title: title.trim(),
          note: note.trim() || null,
          suggestedReward: suggestedReward.trim() || null,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        showToast(data?.error || 'Could not send your suggestion. Please try again.', 'error');
        return; // stay on Review so they can retry
      }
      setWasDuplicate(!!data.duplicate);
      setPhase('done');
      scrollTop();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Something went wrong. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    // Suggestions need an account — send them to login with a way back here.
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/${artistSlug}/suggest-mission`)}`);
      return;
    }
    if (isLast) {
      submit();
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
    targetKind === 'none' ? `${artistName}'s page` : `Demand test — ${targetLabel ?? ''}`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress header */}
      <header className="sticky top-0 z-20 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-crwn-gold font-bold tracking-tight">Suggest a Mission</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-crwn-text-secondary">
                Step {stepIndex + 1} of {STEPS.length}
              </span>
              <button
                onClick={() => router.push(`/${artistSlug}`)}
                aria-label="Exit to artist page"
                className="text-crwn-text-secondary hover:text-crwn-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <p className="text-xs text-crwn-text-secondary mb-3">
            You&apos;re pitching an idea to {artistName}. It only goes live if they approve it, and they set the reward.
          </p>
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
                    onClick={() => setMissionType(t.value)}
                    className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                      missionType === t.value ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <TypeIcon className="w-4 h-4 text-crwn-gold flex-shrink-0" />
                      <p className="font-medium text-crwn-text">{MISSION_TYPE_LABELS[t.value]}</p>
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
                  <p className="font-medium text-crwn-text">The page itself</p>
                  <p className="text-xs text-crwn-text-secondary mt-0.5">The mission points fans at {artistName}&apos;s page.</p>
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
                    Push responses to one of {artistName}&apos;s live demand tests.
                  </p>
                </button>
              </div>

              {targetKind === 'demand_test' && (
                <div>
                  <p className="text-sm font-medium text-crwn-text mb-2">Which demand test?</p>
                  {demandTests.length === 0 ? (
                    <p className="text-sm text-crwn-text-secondary border border-dashed border-crwn-elevated rounded-xl px-4 py-5">
                      {artistName} has no live demand tests right now. Point the mission at the page instead.
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
            </div>
          )}

          {current.key === 'goal' && (
            <div>
              <label className="block text-sm font-medium text-crwn-text mb-2">Suggested goal</label>
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
              <p className="text-xs text-crwn-text-secondary mt-2">
                A number you believe the fanbase can actually hit. {artistName} can adjust it.
              </p>
            </div>
          )}

          {current.key === 'reward' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Suggested reward (optional)</label>
                <input
                  autoFocus
                  maxLength={120}
                  placeholder="An unreleased track for everyone who joins"
                  value={suggestedReward}
                  onChange={(e) => setSuggestedReward(e.target.value)}
                  className={`${INPUT} text-base`}
                />
              </div>
              <div className="bg-crwn-gold/5 border border-crwn-gold/20 rounded-2xl p-4">
                <p className="text-sm text-crwn-text-secondary">
                  <span className="text-crwn-gold font-medium">Just a suggestion</span>. The artist decides the real
                  reward. Nothing you write here is binding, and no money is involved.
                </p>
              </div>
            </div>
          )}

          {current.key === 'pitch' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Mission title</label>
                <input
                  autoFocus
                  className={INPUT}
                  maxLength={80}
                  placeholder="Get 100 of us into the next live"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Your pitch (optional)</label>
                <textarea
                  rows={4}
                  maxLength={500}
                  placeholder={`Why fans would show up for this. Make the case to ${artistName}.`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={`${INPUT} resize-none text-base`}
                />
              </div>
            </div>
          )}

          {current.key === 'review' && missionType && (
            <div className="space-y-6">
              <div className="border border-crwn-elevated rounded-2xl divide-y divide-crwn-elevated">
                <ReviewRow label="Mission" value={MISSION_TYPE_LABELS[missionType]} />
                <ReviewRow label="Connected to" value={targetSummary} />
                <ReviewRow label="Suggested goal" value={`${Math.round(Number(goalCount))} completions`} />
                <ReviewRow
                  label="Suggested reward"
                  value={suggestedReward.trim() !== '' ? suggestedReward.trim() : 'Left up to the artist'}
                />
                <ReviewRow label="Title" value={title.trim()} />
                {note.trim() !== '' && <ReviewRow label="Pitch" value={note.trim()} />}
              </div>

              <div className="bg-crwn-gold/5 border border-crwn-gold/20 rounded-2xl p-4">
                <p className="text-sm font-semibold text-crwn-gold mb-2">What happens next</p>
                <ul className="space-y-1.5 text-sm text-crwn-text-secondary">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                    Your idea lands in {artistName}&apos;s review queue. Nothing goes live until they approve it.
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                    If they approve, they set the real reward and the mission goes live.
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                    You&apos;ll get a notification either way. No money moves here.
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
            disabled={stepIndex === 0 || submitting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-crwn-text-secondary hover:text-crwn-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex flex-col items-end">
            <button
              onClick={goNext}
              disabled={(isLoggedIn && !canContinue()) || submitting}
              className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isLoggedIn && !canContinue() && !submitting && <Lock className="w-4 h-4" />}
              {!isLoggedIn
                ? 'Log in to suggest'
                : submitting
                  ? 'Sending…'
                  : isLast
                    ? 'Send for approval'
                    : 'Continue'}
              {(!isLoggedIn || canContinue()) && !submitting && <ArrowRight className="w-4 h-4" />}
            </button>
            {!isLoggedIn ? (
              <span className="text-[11px] text-crwn-text-secondary mt-1.5">Free CRWN account required. Takes a few seconds</span>
            ) : (
              !canContinue() && !submitting && (
                <span className="text-[11px] text-crwn-text-secondary mt-1.5">Complete this step to continue</span>
              )
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

function DoneScreen({
  artistName,
  duplicate,
  onBack,
}: {
  artistName: string;
  duplicate: boolean;
  onBack: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg text-center page-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-crwn-gold/15 flex items-center justify-center">
          <PartyPopper className="w-9 h-9 text-crwn-gold" />
        </div>
        <h1 className="text-3xl font-bold text-crwn-text mb-2">
          {duplicate ? 'Already in the queue' : `Sent to ${artistName} for approval 🎉`}
        </h1>
        <p className="text-crwn-text-secondary mb-8">
          {duplicate
            ? `You already suggested this. It's with ${artistName}. You'll hear back once they review it.`
            : `${artistName} will review your idea. If they approve it, they set the reward and the mission goes live. You'll get a notification either way.`}
        </p>
        <button
          onClick={onBack}
          className="inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-8 py-3 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to {artistName}&apos;s page
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
