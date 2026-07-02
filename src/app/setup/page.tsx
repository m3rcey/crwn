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
  Quote,
  CreditCard,
  Music,
  ShoppingBag,
  PartyPopper,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArtistSetup, SetupStepKey, ArtistSetupState } from '@/hooks/useArtistSetup';
import { useToast } from '@/components/shared/Toast';
import { OnboardingAvatarStep } from '@/components/onboarding/OnboardingAvatarStep';
import { OnboardingTaglineStep } from '@/components/onboarding/OnboardingTaglineStep';
import { TierManager } from '@/components/artist/TierManager';
import { MusicManager } from '@/components/artist/MusicManager';
import { ShopManager } from '@/components/artist/ShopManager';

// One thing per screen. Each screen belongs to a group (the four chips up top) and
// derives its completion from live DB data via the setup hook.
type ScreenKey = 'photo' | 'tagline' | 'tier' | 'track' | 'product';

interface ScreenDef {
  key: ScreenKey;
  group: SetupStepKey;
  required: boolean;
  title: string;
  subtitle: string;
  icon: typeof Palette;
  done: (s: ArtistSetupState) => boolean;
  /** Embedded managers get a card wrapper; the focused profile steps don't. */
  card: boolean;
}

const SCREENS: ScreenDef[] = [
  {
    key: 'photo',
    group: 'profile',
    required: true,
    title: 'Add a profile photo',
    subtitle: 'A face or logo is the first thing fans trust. Just one photo.',
    icon: Palette,
    done: (s) => s.hasAvatar,
    card: false,
  },
  {
    key: 'tagline',
    group: 'profile',
    required: true,
    title: 'Write your tagline',
    subtitle: 'One line that tells fans who you are.',
    icon: Quote,
    done: (s) => s.hasTagline,
    card: false,
  },
  {
    key: 'tier',
    group: 'monetize',
    required: false,
    title: 'Set up a subscription tier',
    subtitle: 'Let fans pay you monthly. Connect Stripe now or finish it later.',
    icon: CreditCard,
    done: (s) => s.hasTier,
    card: true,
  },
  {
    key: 'track',
    group: 'music',
    required: true,
    title: 'Upload your first track',
    subtitle: 'This is what fans come to hear. Add one to go live.',
    icon: Music,
    done: (s) => s.hasMusic,
    card: true,
  },
  {
    key: 'product',
    group: 'shop',
    required: false,
    title: 'Add something to your shop',
    subtitle: 'Sell merch, downloads, or experiences. Optional — skip if not ready.',
    icon: ShoppingBag,
    done: (s) => s.hasProduct,
    card: true,
  },
];

function SetupWizard() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const setup = useArtistSetup();
  const { loading, isArtist, slug, setupCompleted, steps, stripeConnected, avatarUrl, tagline, refresh, markComplete } =
    setup;

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'steps' | 'share'>('steps');
  const [finishing, setFinishing] = useState(false);
  const initRef = useRef(false);

  // ---- Route guards ------------------------------------------------------
  useEffect(() => {
    if (authLoading) return;
    if (!user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (loading) return;
    if (user && !isArtist) {
      router.replace('/home');
      return;
    }
    if (setupCompleted) router.replace('/profile/artist');
  }, [loading, isArtist, setupCompleted, user, router]);

  // ---- Resume at the first incomplete screen (runs once) -----------------
  useEffect(() => {
    if (loading || initRef.current) return;
    initRef.current = true;
    const firstIncomplete = SCREENS.findIndex((sc) => !sc.done(setup));
    if (firstIncomplete === -1) setPhase('share');
    else setStepIndex(firstIncomplete);
  }, [loading, setup]);

  // ---- Live re-check so Continue unlocks the moment a screen is satisfied -
  const current = SCREENS[stepIndex];
  const currentDone = current ? current.done(setup) : false;
  useEffect(() => {
    if (phase !== 'steps' || !current || currentDone) return;
    const iv = setInterval(refresh, 5000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(iv);
      window.removeEventListener('focus', onFocus);
    };
  }, [phase, stepIndex, currentDone, current, refresh]);

  if (loading || authLoading || !current) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
      </div>
    );
  }

  const completedScreens = SCREENS.filter((sc) => sc.done(setup)).length;
  const progressPct = phase === 'share' ? 100 : Math.round((completedScreens / SCREENS.length) * 100);

  const goNext = async () => {
    await refresh();
    if (stepIndex >= SCREENS.length - 1) setPhase('share');
    else setStepIndex((i) => i + 1);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(0, i - 1));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  if (phase === 'share') {
    return <ShareScreen slug={slug} finishing={finishing} onFinish={handleFinish} showToast={showToast} />;
  }

  const Icon = current.icon;
  const canContinue = currentDone || !current.required;

  const renderScreen = () => {
    switch (current.key) {
      case 'photo':
        return <OnboardingAvatarStep initialUrl={avatarUrl} onSaved={refresh} />;
      case 'tagline':
        return <OnboardingTaglineStep initialValue={tagline} onSaved={refresh} />;
      case 'tier':
        return <TierManager />;
      case 'track':
        return <MusicManager />;
      case 'product':
        return <ShopManager />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress header */}
      <header className="sticky top-0 z-20 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-crwn-gold font-bold tracking-tight">CRWN setup</span>
            <span className="text-xs text-crwn-text-secondary">
              Step {stepIndex + 1} of {SCREENS.length}
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-crwn-elevated overflow-hidden mb-4">
            <div
              className="h-full bg-crwn-gold rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* Group chips (Profile / Monetize / Music / Shop) for orientation */}
          <div className="flex items-center gap-2">
            {steps.map((g, i) => {
              const isActive = g.key === current.group;
              const state = g.done ? 'done' : isActive ? 'active' : 'todo';
              return (
                <div key={g.key} className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span
                    className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                      state === 'done'
                        ? 'bg-crwn-gold text-crwn-bg border-crwn-gold'
                        : state === 'active'
                        ? 'border-crwn-gold text-crwn-gold'
                        : 'border-crwn-elevated text-crwn-text-secondary/60'
                    }`}
                  >
                    {g.done ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  <span
                    className={`text-xs font-medium truncate ${
                      state === 'active' ? 'text-crwn-gold' : state === 'done' ? 'text-crwn-text' : 'text-crwn-text-secondary/60'
                    }`}
                  >
                    {g.label}
                    {!g.required && <span className="hidden sm:inline text-crwn-text-secondary/50"> · optional</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </header>

      {/* One-thing screen */}
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex items-start gap-3 mb-6">
            <div className="w-11 h-11 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-crwn-gold" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-crwn-text">{current.title}</h1>
              <p className="text-crwn-text-secondary text-sm mt-1">{current.subtitle}</p>
              {current.key === 'tier' && !stripeConnected && (
                <p className="text-xs text-crwn-gold/80 mt-2">
                  Stripe isn’t connected yet — that’s fine, you can finish it any time from your dashboard.
                </p>
              )}
            </div>
          </div>

          {current.card ? (
            <div className="neu-raised rounded-2xl p-4 sm:p-6">{renderScreen()}</div>
          ) : (
            <div className="py-4">{renderScreen()}</div>
          )}
        </div>
      </main>

      {/* Footer nav */}
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
            {!current.required && !currentDone && (
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
                {stepIndex >= SCREENS.length - 1 ? 'Finish setup' : 'Continue'}
                {canContinue && <ArrowRight className="w-4 h-4" />}
              </button>
              {!canContinue && (
                <span className="text-[11px] text-crwn-text-secondary mt-1.5">Complete this step to continue</span>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
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
    { label: 'Share on X', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}` },
    { label: 'Share on Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}` },
    { label: 'Share on WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(shareText)}` },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg text-center page-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-crwn-gold/15 flex items-center justify-center">
          <PartyPopper className="w-9 h-9 text-crwn-gold" />
        </div>
        <h1 className="text-3xl font-bold text-crwn-text mb-2">Your page is live 🎉</h1>
        <p className="text-crwn-text-secondary mb-8">
          Setup done. Now the most important step: get people on it. Share your link everywhere — your bio, your
          stories, your group chats.
        </p>

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
