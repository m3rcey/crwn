'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  DollarSign,
  FileText,
  Lightbulb,
  Lock,
  Megaphone,
  PartyPopper,
  Target,
  Users,
  Vote,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/promiseTimeout';
import { OptionSelect } from '@/components/ui/OptionSelect';

/**
 * Proof of Demand — a guided, one-decision-per-screen wizard that creates a
 * money-FREE demand test: fans RSVP / vote / join a waitlist on a public page,
 * and the artist sees whether the idea has real demand BEFORE building it.
 * Nothing here touches Stripe or checkout — the optional price question is a
 * NON-BINDING interest signal that is never charged.
 */

type SignalType = 'rsvp' | 'vote' | 'waitlist';
type Audience = 'all' | 'subscribers' | 'free';

type StepKey = 'title' | 'signal' | 'threshold' | 'price' | 'promoter' | 'audience' | 'copy' | 'review';

interface StepDef {
  key: StepKey;
  title: string;
  subtitle: string;
  icon: typeof Target;
}

const SIGNALS: { value: SignalType; label: string; hint: string }[] = [
  { value: 'rsvp', label: 'RSVP', hint: 'Fans reserve a spot. Best for shows, sessions, and events.' },
  { value: 'vote', label: 'Vote: "I want this"', hint: 'Fans tap to back the idea. Best for drops and merch concepts.' },
  { value: 'waitlist', label: 'Join waitlist', hint: 'Fans line up for launch day. Best for anything you\'d release later.' },
];

const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: 'all', label: 'All fans', hint: 'Anyone with the link can respond.' },
  { value: 'subscribers', label: 'Subscribers', hint: 'Aimed at your paying members.' },
  { value: 'free', label: 'Free fans', hint: 'Aimed at fans who haven\'t subscribed yet.' },
];

const SIGNAL_LABELS: Record<SignalType, string> = {
  rsvp: 'RSVP',
  vote: 'Vote: "I want this"',
  waitlist: 'Join waitlist',
};

const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'All fans',
  subscribers: 'Subscribers',
  free: 'Free fans',
};

const STEPS: StepDef[] = [
  { key: 'title', title: 'What do you want to validate?', subtitle: 'Name the idea like fans will see it: a show, a drop, a vinyl run.', icon: Lightbulb },
  { key: 'signal', title: 'How should fans show demand?', subtitle: 'One tap for fans either way. Pick the framing that fits the idea.', icon: Vote },
  { key: 'threshold', title: 'What number proves enough demand?', subtitle: 'Set the goal that would make this worth doing, and an optional deadline.', icon: Target },
  { key: 'price', title: 'Ask what fans would pay?', subtitle: 'Optional. A non-binding price question. Fans are NEVER charged.', icon: DollarSign },
  { key: 'promoter', title: 'Ask if fans would promote it?', subtitle: 'Optional. Adds an "I\'d help promote this" checkbox to the public page.', icon: Megaphone },
  { key: 'audience', title: 'Who is this test for?', subtitle: 'Who you\'ll aim the link at. Anyone with the link can still open it.', icon: Users },
  { key: 'copy', title: 'Write the public page', subtitle: 'What fans read before they tap. Short and concrete wins.', icon: FileText },
  { key: 'review', title: 'Review your demand test', subtitle: 'Check everything, then publish the public page.', icon: Check },
];

const isValidGoal = (v: string) => v.trim() !== '' && Number.isInteger(Number(v)) && Number(v) >= 1;
const isValidPrice = (v: string) => v.trim() !== '' && !isNaN(parseFloat(v)) && parseFloat(v) > 0;

const INPUT =
  'w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-4 text-lg text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold';

function DemandTestBuilder() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [artistSlug, setArtistSlug] = useState<string | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'steps' | 'done'>('steps');
  const [publishing, setPublishing] = useState(false);
  const [testId, setTestId] = useState<string | null>(null);

  // ---- Draft state (nothing persists until Publish) -----------------------
  const [title, setTitle] = useState('');
  const [signalType, setSignalType] = useState<SignalType>('rsvp');
  const [goalCount, setGoalCount] = useState('50');
  const [deadline, setDeadline] = useState('');
  const [priceOn, setPriceOn] = useState(false);
  const [price, setPrice] = useState('10');
  const [promoterOn, setPromoterOn] = useState(false);
  const [audience, setAudience] = useState<Audience>('all');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [unlockMessage, setUnlockMessage] = useState('');

  // ---- Resolve the artist (artist_profiles.id via user_id — same as useArtistSetup)
  const loadArtist = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('artist_profiles')
      .select('id, slug')
      .eq('user_id', user.id)
      .maybeSingle();
    setArtistId(data?.id ?? null);
    setArtistSlug(data?.slug ?? null);
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

  // Prefill from a Lead Magnet result (Proof of Demand Test Builder). One-time seed
  // of the draft; the artist still reviews and clicks Publish (validation intact).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('lm_prefill') !== '1') return;
    if (q.get('lm_title')) setTitle(q.get('lm_title')!.slice(0, 120));
    if (q.get('lm_description')) setDescription(q.get('lm_description')!.slice(0, 600));
    const sig = q.get('lm_signal');
    if (sig === 'rsvp' || sig === 'vote' || sig === 'waitlist') setSignalType(sig);
    if (q.get('lm_goal')) setGoalCount(String(Math.max(1, parseInt(q.get('lm_goal')!, 10) || 50)));
    const cents = q.get('lm_price_cents');
    if (cents && Number.isFinite(Number(cents)) && Number(cents) > 0) {
      setPriceOn(true);
      setPrice(String(Math.round(Number(cents) / 100)));
    }
    if (q.get('lm_unlock')) setUnlockMessage(q.get('lm_unlock')!.slice(0, 200));
  }, []);

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
        <p className="text-crwn-text mb-4">Demand tests are for artists. Publish your artist page first.</p>
        <button
          onClick={() => router.push('/home')}
          className="bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Back to CRWN
        </button>
      </div>
    );
  }

  if (phase === 'done' && testId) {
    return (
      <DoneScreen
        publicUrl={`https://thecrwn.app/${artistSlug}/demand/${testId}`}
        onResults={() => router.push(`/proof-of-demand/${testId}`)}
        onDashboard={() => router.push('/profile/artist')}
      />
    );
  }

  const current = STEPS[stepIndex];
  const isLast = stepIndex >= STEPS.length - 1;
  const progressPct = Math.round((stepIndex / STEPS.length) * 100);

  const canContinue = (): boolean => {
    switch (current.key) {
      case 'title':
        return title.trim() !== '';
      case 'signal':
        return true;
      case 'threshold':
        return isValidGoal(goalCount);
      case 'price':
        return !priceOn || isValidPrice(price);
      case 'promoter':
        return true;
      case 'audience':
        return true;
      case 'copy':
        return true;
      case 'review':
        return true;
    }
  };

  const scrollTop = () => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const publish = async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      // The owning artist inserts directly — RLS "Artists manage own proof_of_demand".
      const { data, error } = await withTimeout(
        supabase
          .from('proof_of_demand')
          .insert({
            artist_id: artistId,
            title: title.trim(),
            description: description.trim() || null,
            image_url: imageUrl.trim() || null,
            signal_type: signalType,
            goal_count: Math.round(Number(goalCount)),
            // End-of-day so the deadline day itself still counts.
            deadline: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : null,
            unlock_message: unlockMessage.trim() || null,
            test_price: priceOn ? Math.round(parseFloat(price) * 100) : null,
            test_promoter_interest: promoterOn,
            audience,
            status: 'active',
          })
          .select('id')
          .single()
      );

      if (error || !data) {
        showToast(error?.message || 'Could not publish the test. Please try again.', 'error');
        return; // stay on Review so they can retry
      }

      setTestId(data.id);
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress header */}
      <header className="sticky top-0 z-20 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-crwn-gold font-bold tracking-tight">Proof of Demand</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-crwn-text-secondary">
                Step {stepIndex + 1} of {STEPS.length}
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

          {current.key === 'title' && (
            <input
              autoFocus
              className={INPUT}
              maxLength={120}
              placeholder="Limited vinyl run of the new EP"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          )}

          {current.key === 'signal' && (
            <OptionSelect
              value={signalType}
              onChange={(v) => setSignalType(v as SignalType)}
              options={SIGNALS.map((s) => ({ value: s.value, label: s.label, hint: s.hint }))}
            />
          )}

          {current.key === 'threshold' && (
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
                  <span className="text-crwn-text-secondary">responses</span>
                </div>
                <p className="text-xs text-crwn-text-secondary mt-2">
                  If this many fans respond, the idea is worth doing.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Deadline (optional)</label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-3 text-crwn-text focus:outline-none focus:border-crwn-gold [color-scheme:dark]"
                />
                <p className="text-xs text-crwn-text-secondary mt-2">A deadline creates urgency on the public page.</p>
              </div>
            </div>
          )}

          {current.key === 'price' && (
            <div className="space-y-5">
              <ToggleRow
                on={priceOn}
                onToggle={() => setPriceOn((v) => !v)}
                label="Ask what fans would pay? (non-binding)"
                hint="Shows a suggested price on the public page as an interest signal. Fans are NEVER charged."
              />
              {priceOn && (
                <div>
                  <label className="block text-sm font-medium text-crwn-text mb-2">Price to test</label>
                  <div className="flex items-center w-40 bg-crwn-surface border border-crwn-elevated rounded-xl px-4 focus-within:border-crwn-gold">
                    <span className="text-lg text-crwn-text-secondary">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      className="flex-1 min-w-0 bg-transparent px-2 py-3 text-lg text-crwn-text outline-none"
                      placeholder="0.00"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-crwn-text-secondary mt-2">
                    Fans see &quot;would you pay ${isValidPrice(price) ? (Math.round(parseFloat(price) * 100) / 100).toFixed(2) : '0.00'}?&quot; No card, no charge, ever.
                  </p>
                </div>
              )}
            </div>
          )}

          {current.key === 'promoter' && (
            <ToggleRow
              on={promoterOn}
              onToggle={() => setPromoterOn((v) => !v)}
              label="Also ask if fans would promote this?"
              hint='Adds an "I&apos;d help promote this" checkbox, a preview of your future street team.'
            />
          )}

          {current.key === 'audience' && (
            <OptionSelect
              value={audience}
              onChange={(v) => setAudience(v as Audience)}
              options={AUDIENCES.map((a) => ({ value: a.value, label: a.label, hint: a.hint }))}
            />
          )}

          {current.key === 'copy' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Description</label>
                <textarea
                  autoFocus
                  rows={4}
                  maxLength={600}
                  placeholder="What is it, why it matters, what fans get."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={`${INPUT} resize-none text-base`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">Image URL (optional)</label>
                <input
                  type="url"
                  maxLength={500}
                  placeholder="https://…"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  className={`${INPUT} text-base`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-crwn-text mb-2">What happens if it hits the goal?</label>
                <input
                  maxLength={200}
                  placeholder="If we hit 50, the vinyl run happens."
                  value={unlockMessage}
                  onChange={(e) => setUnlockMessage(e.target.value)}
                  className={`${INPUT} text-base`}
                />
              </div>
            </div>
          )}

          {current.key === 'review' && (
            <div className="space-y-6">
              <div className="border border-crwn-elevated rounded-2xl divide-y divide-crwn-elevated">
                <ReviewRow label="Idea" value={title.trim()} />
                <ReviewRow label="Demand signal" value={SIGNAL_LABELS[signalType]} />
                <ReviewRow
                  label="Goal"
                  value={`${Math.round(Number(goalCount))} responses${deadline ? ` by ${new Date(`${deadline}T23:59:59`).toLocaleDateString()}` : ''}`}
                />
                <ReviewRow
                  label="Price question"
                  value={priceOn ? `$${(Math.round(parseFloat(price) * 100) / 100).toFixed(2)} (non-binding, never charged)` : 'Off'}
                />
                <ReviewRow label="Promoter question" value={promoterOn ? 'On' : 'Off'} />
                <ReviewRow label="Audience" value={AUDIENCE_LABELS[audience]} />
                {unlockMessage.trim() !== '' && <ReviewRow label="If it hits" value={unlockMessage.trim()} />}
              </div>

              <div className="bg-crwn-gold/5 border border-crwn-gold/20 rounded-2xl p-4">
                <p className="text-sm font-semibold text-crwn-gold mb-2">What CRWN sets up</p>
                <ul className="space-y-1.5 text-sm text-crwn-text-secondary">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                    A public page where fans respond with one tap. You get the shareable link next.
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                    A live results page: responses against your goal, in real time.
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                    No money moves. When demand is proven, convert it to a real offer in one tap.
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
              {publishing ? 'Publishing…' : isLast ? 'Publish test' : 'Continue'}
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

function ToggleRow({ on, onToggle, label, hint }: { on: boolean; onToggle: () => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left px-4 py-4 rounded-xl border transition-colors flex items-center gap-4 ${
        on ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
      }`}
    >
      <div className="flex-1">
        <p className="font-medium text-crwn-text">{label}</p>
        <p className="text-xs text-crwn-text-secondary mt-0.5">{hint}</p>
      </div>
      <span
        className={`flex-shrink-0 w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-crwn-gold' : 'bg-crwn-elevated'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-crwn-bg transition-all ${on ? 'left-[22px]' : 'left-0.5'}`}
        />
      </span>
    </button>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-sm text-crwn-text-secondary flex-shrink-0">{label}</span>
      <span className="text-sm text-crwn-text text-right">{value}</span>
    </div>
  );
}

function DoneScreen({
  publicUrl,
  onResults,
  onDashboard,
}: {
  publicUrl: string;
  onResults: () => void;
  onDashboard: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — the URL is visible to copy manually.
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg text-center page-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-crwn-gold/15 flex items-center justify-center">
          <PartyPopper className="w-9 h-9 text-crwn-gold" />
        </div>
        <h1 className="text-3xl font-bold text-crwn-text mb-2">Your demand test is live 🎉</h1>
        <p className="text-crwn-text-secondary mb-6">
          Put this link everywhere fans already watch you. The responses tell you whether to build it.
        </p>

        <button
          type="button"
          onClick={copyLink}
          className="w-full flex items-center gap-3 bg-crwn-surface border border-crwn-elevated hover:border-crwn-gold/50 rounded-xl px-4 py-3.5 mb-8 transition-colors"
        >
          <span className="flex-1 text-sm text-crwn-text truncate text-left">{publicUrl}</span>
          {copied ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-400 flex-shrink-0">
              <Check className="w-4 h-4" />
              Copied
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-crwn-gold flex-shrink-0">
              <Copy className="w-4 h-4" />
              Copy
            </span>
          )}
        </button>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onResults}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-8 py-3 rounded-full hover:bg-crwn-gold/90 transition-colors"
          >
            View Results
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

export default function NewDemandTestPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
        </div>
      }
    >
      <DemandTestBuilder />
    </Suspense>
  );
}
