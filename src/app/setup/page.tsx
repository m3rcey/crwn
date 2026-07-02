'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Lock,
  ArrowLeft,
  ArrowRight,
  Copy,
  Palette,
  CreditCard,
  Music,
  ShoppingBag,
  PartyPopper,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArtistSetup, SetupStepKey } from '@/hooks/useArtistSetup';
import { useToast } from '@/components/shared/Toast';
import { ArtistProfileForm } from '@/components/artist/ArtistProfileForm';
import { TierManager } from '@/components/artist/TierManager';
import { MusicManager } from '@/components/artist/MusicManager';
import { ShopManager } from '@/components/artist/ShopManager';

const STEP_META: Record<SetupStepKey, { title: string; subtitle: string; icon: typeof Palette }> = {
  profile: {
    title: 'Set up your artist page',
    subtitle: 'Add a profile photo and a tagline so fans know who they’re following.',
    icon: Palette,
  },
  monetize: {
    title: 'Turn on subscriptions',
    subtitle:
      'Connect Stripe and create at least one tier so fans can pay you. Haven’t got a minute for Stripe? Create a tier now and finish connecting later.',
    icon: CreditCard,
  },
  music: {
    title: 'Upload your first track',
    subtitle: 'This is what fans come to hear. Add at least one track to go live.',
    icon: Music,
  },
  shop: {
    title: 'Add something to your shop',
    subtitle: 'Sell digital products, merch, or experiences. Optional — skip if you’re not ready.',
    icon: ShoppingBag,
  },
};

function StepBody({ stepKey }: { stepKey: SetupStepKey }) {
  switch (stepKey) {
    case 'profile':
      return <ArtistProfileForm mode="onboarding" />;
    case 'monetize':
      return <TierManager />;
    case 'music':
      return <MusicManager />;
    case 'shop':
      return <ShopManager />;
  }
}

function SetupWizard() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const {
    loading,
    isArtist,
    slug,
    setupCompleted,
    steps,
    stripeConnected,
    refresh,
    markComplete,
  } = useArtistSetup();

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'steps' | 'share'>('steps');
  const [finishing, setFinishing] = useState(false);
  const initRef = useRef(false);

  // ---- Route guards ------------------------------------------------------
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (loading) return;
    if (user && !isArtist) {
      router.replace('/home');
      return;
    }
    if (setupCompleted) {
      router.replace('/profile/artist');
    }
  }, [loading, isArtist, setupCompleted, user, router]);

  // ---- Resume at the first incomplete step (runs once) -------------------
  useEffect(() => {
    if (loading || initRef.current) return;
    initRef.current = true;
    const firstIncomplete = steps.findIndex((s) => !s.done);
    if (firstIncomplete === -1) {
      setPhase('share');
    } else {
      setStepIndex(firstIncomplete);
    }
  }, [loading, steps]);

  // ---- Live re-check so Continue unlocks the moment a step is satisfied ---
  const current = steps[stepIndex];
  useEffect(() => {
    if (phase !== 'steps' || !current || current.done) return;
    const iv = setInterval(refresh, 5000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
    };
  }, [phase, stepIndex, current?.done, refresh]);

  if (loading || authLoading || !current) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  const completedCount = steps.filter((s) => s.done).length;
  const progressPct = phase === 'share' ? 100 : Math.round((completedCount / steps.length) * 100);

  const goNext = async () => {
    await refresh();
    if (stepIndex >= steps.length - 1) {
      setPhase('share');
    } else {
      setStepIndex((i) => i + 1);
    }
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(0, i - 1));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ---- Share screen ------------------------------------------------------
  if (phase === 'share') {
    return <ShareScreen slug={slug} finishing={finishing} onFinish={handleFinish} showToast={showToast} />;
  }

  const Meta = STEP_META[current.key];
  const Icon = Meta.icon;
  const canContinue = current.done || !current.required;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress header — sticky so it stays visible while forms scroll */}
      <header className="sticky top-0 z-20 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-crwn-gold font-bold tracking-tight">CRWN setup</span>
            <span className="text-xs text-crwn-text-secondary">
              Step {stepIndex + 1} of {steps.length}
            </span>
          </div>

          {/* Fill bar */}
          <div className="h-1.5 rounded-full bg-crwn-elevated overflow-hidden mb-4">
            <div
              className="h-full bg-crwn-gold rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Step chips */}
          <div className="flex items-center gap-2">
            {steps.map((s, i) => {
              const state = s.done ? 'done' : i === stepIndex ? 'active' : 'todo';
              return (
                <div key={s.key} className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className={`flex items-center gap-1.5 min-w-0 ${
                      state === 'active' ? 'text-crwn-gold' : state === 'done' ? 'text-crwn-text' : 'text-crwn-text-secondary/60'
                    }`}
                  >
                    <span
                      className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                        state === 'done'
                          ? 'bg-crwn-gold text-crwn-bg border-crwn-gold'
                          : state === 'active'
                          ? 'border-crwn-gold text-crwn-gold'
                          : 'border-crwn-elevated text-crwn-text-secondary/60'
                      }`}
                    >
                      {s.done ? <Check className="w-3 h-3" /> : i + 1}
                    </span>
                    <span className="text-xs font-medium truncate">
                      {s.label}
                      {!s.required && <span className="hidden sm:inline text-crwn-text-secondary/50"> · optional</span>}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* Step content */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-11 h-11 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-crwn-gold" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-crwn-text">{Meta.title}</h1>
              <p className="text-crwn-text-secondary text-sm mt-1">{Meta.subtitle}</p>
              {current.key === 'monetize' && !stripeConnected && (
                <p className="text-xs text-crwn-gold/80 mt-2">
                  Stripe isn’t connected yet — that’s fine, you can finish it any time from your dashboard.
                </p>
              )}
            </div>
          </div>

          {/* Embedded manager */}
          <div className="neu-raised rounded-2xl p-4 sm:p-6">
            <StepBody stepKey={current.key} />
          </div>
        </div>
      </main>

      {/* Sticky footer nav */}
      <footer className="sticky bottom-0 z-20 bg-crwn-bg/90 backdrop-blur-md border-t border-crwn-elevated">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <button
            onClick={goBack}
            disabled={stepIndex === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-crwn-text-secondary hover:text-crwn-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            {!current.required && !current.done && (
              <button
                onClick={goNext}
                className="px-4 py-2.5 rounded-full text-sm font-medium text-crwn-text-secondary hover:text-crwn-text transition-colors"
              >
                Skip for now
              </button>
            )}

            <div className="flex flex-col items-end">
              <button
                onClick={goNext}
                disabled={!canContinue}
                className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {!canContinue && <Lock className="w-4 h-4" />}
                {stepIndex >= steps.length - 1 ? 'Finish setup' : 'Continue'}
                {canContinue && <ArrowRight className="w-4 h-4" />}
              </button>
              {!canContinue && (
                <span className="text-[11px] text-crwn-text-secondary mt-1.5">
                  Complete this step to continue
                </span>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );

  async function handleFinish() {
    setFinishing(true);
    try {
      await markComplete();
      router.replace('/profile/artist');
    } catch {
      setFinishing(false);
      showToast('Something went wrong. Please try again.', 'error');
    }
  }
}

function ShareScreen({
  slug,
  finishing,
  onFinish,
  showToast,
}: {
  slug: string;
  finishing: boolean;
  onFinish: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}) {
  const shareUrl = `https://thecrwn.app/${slug}`;
  const shareText = `I just launched my page on CRWN — come support me here: ${shareUrl}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied!', 'success');
    } catch {
      showToast('Could not copy — long-press the link to copy it.', 'error');
    }
  };

  const socials = [
    {
      label: 'Share on X',
      href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`,
    },
    {
      label: 'Share on Facebook',
      href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
    },
    {
      label: 'Share on WhatsApp',
      href: `https://wa.me/?text=${encodeURIComponent(shareText)}`,
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg text-center page-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-crwn-gold/15 flex items-center justify-center">
          <PartyPopper className="w-9 h-9 text-crwn-gold" />
        </div>
        <h1 className="text-3xl font-bold text-crwn-text mb-2">Your page is live 🎉</h1>
        <p className="text-crwn-text-secondary mb-8">
          Setup done. Now the most important step: get people on it. Share your link everywhere —
          your bio, your stories, your group chats.
        </p>

        {/* The link */}
        <div className="neu-raised rounded-2xl p-4 mb-4 flex items-center gap-3">
          <div className="flex-1 min-w-0 text-left">
            <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-0.5">Your CRWN link</p>
            <p className="text-crwn-gold font-medium truncate">thecrwn.app/{slug}</p>
          </div>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-4 py-2.5 rounded-full hover:bg-crwn-gold/90 transition-colors flex-shrink-0"
          >
            <Copy className="w-4 h-4" />
            Copy
          </button>
        </div>

        {/* Social buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {socials.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-3 rounded-xl border border-crwn-elevated text-sm font-medium text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/50 transition-colors"
            >
              {s.label}
            </a>
          ))}
        </div>
        <p className="text-xs text-crwn-text-secondary mb-8">
          On Instagram or TikTok? Copy the link and drop it in your bio.
        </p>

        <button
          onClick={onFinish}
          disabled={finishing}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-8 py-3 rounded-full hover:bg-crwn-gold/90 disabled:opacity-50 transition-colors"
        >
          {finishing ? 'Loading…' : 'Enter CRWN'}
          {!finishing && <ArrowRight className="w-4 h-4" />}
        </button>
        <p className="text-xs text-crwn-text-secondary mt-4">
          We’ll show you around the rest of your dashboard next.
        </p>
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
        </div>
      }
    >
      <SetupWizard />
    </Suspense>
  );
}
