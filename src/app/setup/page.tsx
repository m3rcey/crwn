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
  UploadCloud,
  PartyPopper,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArtistSetup, SetupStepKey, ArtistSetupState } from '@/hooks/useArtistSetup';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/promiseTimeout';
import { trackFunnel } from '@/lib/analytics/trackFunnelClient';
import { OnboardingAvatarStep } from '@/components/onboarding/OnboardingAvatarStep';
import {
  createOnboardingTrack,
  createOnboardingTier,
  createOnboardingProduct,
} from '@/lib/onboardingItems';
import { getAnonId } from '@/lib/experiments/anonId';
import type { ProductType } from '@/types';

type ScreenKey =
  | 'photo'
  | 'tier-name'
  | 'tier-price'
  | 'tier-benefits'
  | 'track-audio'
  | 'track-title'
  | 'product-type'
  | 'product-title'
  | 'product-price';

interface ScreenDef {
  key: ScreenKey;
  group: SetupStepKey;
  groupRequired: boolean;
  title: string;
  subtitle: string;
  icon: typeof Palette;
  create?: 'tier' | 'track' | 'product'; // last field of the item → create on Continue
}

// One FIELD per screen. Groups (the four chips) span multiple screens.
const SCREENS: ScreenDef[] = [
  { key: 'photo', group: 'profile', groupRequired: true, title: 'Add a profile photo', subtitle: 'A face or logo is the first thing fans trust. Just one photo.', icon: Palette },
  { key: 'tier-name', group: 'monetize', groupRequired: false, title: 'Name your free entry point', subtitle: 'The free tier fans join first. e.g. “Bronze”. You build paid tiers later in Rise Mode.', icon: CreditCard },
  { key: 'tier-price', group: 'monetize', groupRequired: false, title: 'Set the price', subtitle: 'Keep this at 0 for your free entry point. Paid tiers come later in Rise Mode.', icon: CreditCard },
  { key: 'tier-benefits', group: 'monetize', groupRequired: false, title: 'What do free members get?', subtitle: 'Pick the perks free fans unlock. These show on your page. You can edit them anytime.', icon: CreditCard, create: 'tier' },
  { key: 'track-audio', group: 'music', groupRequired: true, title: 'Upload your first track', subtitle: 'The audio file fans will hear. This one starts free.', icon: Music },
  { key: 'track-title', group: 'music', groupRequired: true, title: 'Name your track', subtitle: 'What’s this one called?', icon: Music, create: 'track' },
  { key: 'product-type', group: 'shop', groupRequired: false, title: 'What are you selling?', subtitle: 'Pick the kind of product.', icon: ShoppingBag },
  { key: 'product-title', group: 'shop', groupRequired: false, title: 'Name your product', subtitle: 'What’s it called?', icon: ShoppingBag },
  { key: 'product-price', group: 'shop', groupRequired: false, title: 'Set the price', subtitle: 'What fans pay. Enter 0 to give it away.', icon: ShoppingBag, create: 'product' },
];

function screenDone(s: ScreenDef, setup: ArtistSetupState): boolean {
  switch (s.key) {
    case 'photo':
      return setup.hasAvatar;
    case 'tier-name':
    case 'tier-price':
    case 'tier-benefits':
      return setup.hasTier;
    case 'track-audio':
    case 'track-title':
      return setup.hasMusic;
    default:
      return setup.hasProduct;
  }
}

const isValidPrice = (v: string) => v.trim() !== '' && !isNaN(parseFloat(v)) && parseFloat(v) >= 0;

// Experiences/1-on-1s require scheduling — a Pro-only platform feature — so they're
// NOT offered here; artists set those up in the dashboard Shop tab (which gates Pro).
const PRODUCT_TYPES: { value: ProductType; label: string; hint: string }[] = [
  { value: 'digital', label: 'Digital download', hint: 'Unreleased tracks, videos, art' },
  { value: 'physical', label: 'Physical / merch', hint: 'Vinyl, shirts, CDs' },
];

// Setup creates the FREE "Bronze" entry point only (the smallest credible
// foundation). The PAID membership ladder (Silver/Gold/Platinum) is
// built later in Rise Mode Level 3, so setup and Rise never ask for the same thing.
// The Level 3 ladder template recognizes this free "Bronze" tier by name and
// shows it as already applied. This is the SAME free tier the Streaming Loss
// calculator ("/worth") promises, so the money it shows is the money onboarding builds.
const DEFAULT_TIER_NAME = 'Bronze';
const DEFAULT_TIER_PRICE = '0';
const TIER_BENEFIT_SUGGESTIONS = [
  'Free tracks and public posts',
  'Join the community',
  'Public livestream access',
  'Join public fan missions',
  'New music after the paid windows',
  'Release announcements',
];
const DEFAULT_TIER_BENEFITS = TIER_BENEFIT_SUGGESTIONS.slice(0, 5);

function SetupWizard() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  // The wizard is the only place that reads `stripeConnected`, so it is the only
  // place that pays for the Stripe round trip.
  const setup = useArtistSetup({ withStripe: true });
  const { loading, isArtist, artistId, slug, setupCompleted, steps, stripeConnected, avatarUrl, refresh, markComplete } =
    setup;

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'steps' | 'share'>('steps');
  const [finishing, setFinishing] = useState(false);
  const [creating, setCreating] = useState(false);
  // Optimistic photo-done flag so Continue unlocks the instant the upload saves,
  // without waiting on the DB refresh (which could be slow).
  const [photoUploaded, setPhotoUploaded] = useState(false);
  // Rights/Artist-Agreement consent for uploading music (same as the Music tab).
  const [trackTermsAgreed, setTrackTermsAgreed] = useState(false);
  const initRef = useRef(false);

  // Drafts for the multi-screen item flows (persisted only when the item is created).
  const [tierDraft, setTierDraft] = useState<{ name: string; price: string; benefits: string[] }>({
    name: DEFAULT_TIER_NAME,
    price: DEFAULT_TIER_PRICE,
    benefits: DEFAULT_TIER_BENEFITS,
  });
  const [trackDraft, setTrackDraft] = useState<{ audioFile: File | null; title: string }>({ audioFile: null, title: '' });
  const [productDraft, setProductDraft] = useState<{ type: ProductType; title: string; price: '' | string }>({
    type: 'digital',
    title: '',
    price: '',
  });

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
    // Funnel: Setup Started. Server dedups once per user, so a resume/reload is not a new start.
    if (isArtist && !setupCompleted) trackFunnel('setup_started');
    const firstIncomplete = SCREENS.findIndex((sc) => !screenDone(sc, setup));
    if (firstIncomplete === -1) setPhase('share');
    else setStepIndex(firstIncomplete);
  }, [loading, setup, isArtist, setupCompleted]);

  const current = SCREENS[stepIndex];
  const currentDone = current ? screenDone(current, setup) : false;

  // ---- Live re-check (managers/uploads can complete out of band) ----------
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

  const progressPct = phase === 'share' ? 100 : Math.round((stepIndex / SCREENS.length) * 100);

  // Local (draft) readiness for field screens that aren't derived from the DB.
  const localReady = (): boolean => {
    switch (current.key) {
      case 'tier-name':
        return tierDraft.name.trim() !== '';
      case 'tier-price':
        return isValidPrice(tierDraft.price);
      case 'tier-benefits':
        return true; // benefits are optional; Continue creates the tier
      case 'track-audio':
        return !!trackDraft.audioFile && trackTermsAgreed;
      case 'track-title':
        return trackDraft.title.trim() !== '';
      case 'product-type':
        return true;
      case 'product-title':
        return productDraft.title.trim() !== '';
      case 'product-price':
        return isValidPrice(productDraft.price);
      default:
        return false; // photo gates on screenDone (autosaves on upload)
    }
  };

  const canContinue = currentDone || localReady() || (current.key === 'photo' && photoUploaded);

  const scrollTop = () => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const advance = () => {
    if (stepIndex >= SCREENS.length - 1) setPhase('share');
    else setStepIndex((i) => i + 1);
    scrollTop();
  };

  const runCreate = async (kind: 'tier' | 'track' | 'product'): Promise<string | undefined> => {
    if (!artistId) return 'Your artist profile is still loading. Try again.';
    if (kind === 'tier') {
      return (
        await createOnboardingTier(supabase, artistId, {
          name: tierDraft.name,
          priceCents: Math.round(parseFloat(tierDraft.price) * 100),
          benefits: tierDraft.benefits,
        })
      ).error;
    }
    if (kind === 'track') {
      if (!trackDraft.audioFile) return 'Pick an audio file first.';
      return (await createOnboardingTrack(supabase, artistId, { audioFile: trackDraft.audioFile, title: trackDraft.title })).error;
    }
    return (await createOnboardingProduct(supabase, artistId, { type: productDraft.type, title: productDraft.title, priceCents: Math.round(parseFloat(productDraft.price) * 100) })).error;
  };

  const goNext = async () => {
    if (creating) return;
    // Last field of an item → create it (unless it already exists).
    if (current.create && !currentDone) {
      setCreating(true);
      let err: string | undefined;
      try {
        err = await withTimeout(runCreate(current.create));
      } catch (e) {
        // A thrown error must NOT leave the button stuck — always fall through to
        // the finally so `creating` resets.
        err = e instanceof Error ? e.message : 'Something went wrong. Please try again.';
      } finally {
        setCreating(false);
      }
      if (err) {
        showToast(err, 'error');
        return; // stay on this screen so they can retry
      }
      // Create succeeded → ADVANCE IMMEDIATELY. Do NOT await refresh() here: the
      // next screen is a different item and doesn't need this one's completion,
      // and a slow/hanging refresh (it runs several Supabase queries) would freeze
      // the wizard right after a successful submit — the actual "stuck on submit"
      // bug. refresh runs in the background; the group chip / live poll catch up.
      refresh().catch(() => {});
    }
    advance();
  };

  const goBack = () => {
    setStepIndex((i) => Math.max(0, i - 1));
    scrollTop();
  };

  const skipGroup = () => {
    const g = current.group;
    let i = stepIndex + 1;
    while (i < SCREENS.length && SCREENS[i].group === g) i++;
    if (i >= SCREENS.length) setPhase('share');
    else setStepIndex(i);
    scrollTop();
  };

  async function handleFinish() {
    setFinishing(true);
    try {
      await withTimeout(markComplete());
      // Land inside the builder that matches the calculator they came in on, preloaded. Falls
      // back to Rise Mode when there is no calculator to route from (or the lookup fails).
      let dest = '/profile/artist';
      try {
        // Carry the durable anon id so the resolver can re-derive (never trust) the experiment
        // variant and preserve it into the restored builder.
        const aid = getAnonId();
        const res = await fetch(`/api/lead-results/post-setup-destination${aid ? `?aid=${encodeURIComponent(aid)}` : ''}`);
        const json = await res.json();
        if (res.ok && typeof json?.redirect === 'string' && json.redirect) dest = json.redirect;
      } catch {
        // Non-fatal: the dashboard is always a safe landing.
      }
      router.replace(dest);
    } catch {
      setFinishing(false);
      showToast('Something went wrong. Please try again.', 'error');
    }
  }

  if (phase === 'share') {
    return <ShareScreen slug={slug} finishing={finishing} onFinish={handleFinish} showToast={showToast} />;
  }

  const Icon = current.icon;
  const isLast = stepIndex >= SCREENS.length - 1;
  const showSkip = !current.groupRequired && !currentDone;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress header */}
      <header className="sticky top-0 z-20 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-crwn-gold font-bold tracking-tight">CRWN setup</span>
            <span className="text-xs text-crwn-text-secondary">
              Step {stepIndex + 1} of {SCREENS.length}
            </span>
          </div>

          <div className="h-1.5 rounded-full bg-crwn-elevated overflow-hidden mb-4">
            <div className="h-full bg-crwn-gold rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>

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

      {/* One field */}
      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex items-start gap-3 mb-8">
            <div className="w-11 h-11 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-crwn-gold" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-crwn-text">{current.title}</h1>
              <p className="text-crwn-text-secondary text-sm mt-1">{current.subtitle}</p>
              {current.key === 'tier-price' && !stripeConnected && parseFloat(tierDraft.price || '0') > 0 && (
                <p className="text-xs text-crwn-gold/80 mt-2">
                  You’ll connect Stripe to actually get paid. You can do that any time from your dashboard.
                </p>
              )}
            </div>
          </div>

          <FieldBody
            screen={current}
            setup={setup}
            onPhotoSaved={() => {
              setPhotoUploaded(true);
              refresh().catch(() => {});
            }}
            avatarUrl={avatarUrl}
            tierDraft={tierDraft}
            setTierDraft={setTierDraft}
            trackDraft={trackDraft}
            setTrackDraft={setTrackDraft}
            trackTermsAgreed={trackTermsAgreed}
            setTrackTermsAgreed={setTrackTermsAgreed}
            productDraft={productDraft}
            setProductDraft={setProductDraft}
            onSkipGroup={skipGroup}
          />
        </div>
      </main>

      {/* Footer nav */}
      <footer className="sticky bottom-0 z-20 bg-crwn-bg/90 backdrop-blur-md border-t border-crwn-elevated">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <button
            onClick={goBack}
            disabled={stepIndex === 0 || creating}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium text-crwn-text-secondary hover:text-crwn-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="flex items-center gap-3">
            {showSkip && (
              <button
                onClick={skipGroup}
                disabled={creating}
                className="px-4 py-2.5 rounded-full text-sm font-medium text-crwn-text-secondary hover:text-crwn-text transition-colors disabled:opacity-40"
              >
                Skip for now
              </button>
            )}

            <div className="flex flex-col items-end">
              <button
                onClick={goNext}
                disabled={!canContinue || creating}
                className="inline-flex items-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-6 py-2.5 rounded-full hover:bg-crwn-gold/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {!canContinue && !creating && <Lock className="w-4 h-4" />}
                {creating ? 'Adding…' : isLast ? 'Finish setup' : 'Continue'}
                {canContinue && !creating && <ArrowRight className="w-4 h-4" />}
              </button>
              {!canContinue && !creating && (
                <span className="text-[11px] text-crwn-text-secondary mt-1.5">Complete this step to continue</span>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ---- Per-field bodies ----------------------------------------------------

const INPUT =
  'w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-4 text-lg text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold';

function FieldBody({
  screen,
  setup,
  onPhotoSaved,
  avatarUrl,
  tierDraft,
  setTierDraft,
  trackDraft,
  setTrackDraft,
  trackTermsAgreed,
  setTrackTermsAgreed,
  productDraft,
  setProductDraft,
  onSkipGroup,
}: {
  screen: ScreenDef;
  setup: ArtistSetupState;
  onPhotoSaved: () => void;
  avatarUrl: string;
  tierDraft: { name: string; price: string; benefits: string[] };
  setTierDraft: React.Dispatch<React.SetStateAction<{ name: string; price: string; benefits: string[] }>>;
  trackDraft: { audioFile: File | null; title: string };
  setTrackDraft: React.Dispatch<React.SetStateAction<{ audioFile: File | null; title: string }>>;
  trackTermsAgreed: boolean;
  setTrackTermsAgreed: React.Dispatch<React.SetStateAction<boolean>>;
  productDraft: { type: ProductType; title: string; price: string };
  setProductDraft: React.Dispatch<React.SetStateAction<{ type: ProductType; title: string; price: string }>>;
  onSkipGroup: () => void;
}) {
  switch (screen.key) {
    case 'photo':
      return <OnboardingAvatarStep initialUrl={avatarUrl} onSaved={onPhotoSaved} />;
    case 'tier-name':
      return (
        <input
          autoFocus
          className={INPUT}
          maxLength={40}
          placeholder="Bronze"
          value={tierDraft.name}
          onChange={(e) => setTierDraft((d) => ({ ...d, name: e.target.value }))}
        />
      );
    case 'tier-price':
      return <PriceInput value={tierDraft.price} onChange={(v) => setTierDraft((d) => ({ ...d, price: v }))} suffix="/mo" done={setup.hasTier} />;
    case 'tier-benefits':
      return (
        <BenefitPicker
          selected={tierDraft.benefits}
          onChange={(benefits) => setTierDraft((d) => ({ ...d, benefits }))}
          done={setup.hasTier}
        />
      );
    case 'track-audio':
      if (setup.hasMusic) {
        return <AudioPicker file={trackDraft.audioFile} onPick={(f) => setTrackDraft((d) => ({ ...d, audioFile: f }))} done />;
      }
      return (
        <div>
          <AudioPicker file={trackDraft.audioFile} onPick={(f) => setTrackDraft((d) => ({ ...d, audioFile: f }))} />
          <label className="flex items-start gap-3 mt-5 cursor-pointer">
            <input
              type="checkbox"
              checked={trackTermsAgreed}
              onChange={(e) => setTrackTermsAgreed(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-crwn-gold flex-shrink-0"
            />
            <span className="text-sm text-crwn-text-secondary">
              I own or have the rights to distribute this music, and I agree to the{' '}
              <a
                href="/artist-agreement"
                target="_blank"
                rel="noopener noreferrer"
                className="text-crwn-gold hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Artist Agreement
              </a>
              .
            </span>
          </label>
        </div>
      );
    case 'track-title':
      return (
        <input
          autoFocus
          className={INPUT}
          maxLength={120}
          placeholder="Track name"
          value={trackDraft.title}
          onChange={(e) => setTrackDraft((d) => ({ ...d, title: e.target.value }))}
        />
      );
    case 'product-type':
      return (
        <div className="grid gap-3">
          {PRODUCT_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setProductDraft((d) => ({ ...d, type: t.value }))}
              className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                productDraft.type === t.value ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
              }`}
            >
              <p className="font-medium text-crwn-text">{t.label}</p>
              <p className="text-xs text-crwn-text-secondary mt-0.5">{t.hint}</p>
            </button>
          ))}
          <button
            type="button"
            onClick={onSkipGroup}
            className="text-left px-4 py-4 rounded-xl border border-dashed border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/40 transition-colors"
          >
            <p className="font-medium">I don’t have anything to sell yet</p>
            <p className="text-xs mt-0.5">Skip this. You can add products later from your dashboard.</p>
          </button>
        </div>
      );
    case 'product-title':
      return (
        <input
          autoFocus
          className={INPUT}
          maxLength={120}
          placeholder="Product name"
          value={productDraft.title}
          onChange={(e) => setProductDraft((d) => ({ ...d, title: e.target.value }))}
        />
      );
    case 'product-price':
      return <PriceInput value={productDraft.price} onChange={(v) => setProductDraft((d) => ({ ...d, price: v }))} done={setup.hasProduct} />;
  }
}

function PriceInput({ value, onChange, suffix, done }: { value: string; onChange: (v: string) => void; suffix?: string; done?: boolean }) {
  if (done) {
    return <p className="text-crwn-text-secondary">Already added. Hit Continue.</p>;
  }
  return (
    <div className="flex items-center bg-crwn-surface border border-crwn-elevated rounded-xl px-4 focus-within:border-crwn-gold">
      <span className="text-lg text-crwn-text-secondary">$</span>
      <input
        autoFocus
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        className="flex-1 bg-transparent px-2 py-4 text-lg text-crwn-text outline-none"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && <span className="text-crwn-text-secondary">{suffix}</span>}
    </div>
  );
}

function AudioPicker({ file, onPick, done }: { file: File | null; onPick: (f: File) => void; done?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  if (done) {
    return <p className="text-crwn-text-secondary">Track already uploaded. Hit Continue.</p>;
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-full border-2 border-dashed border-crwn-elevated rounded-2xl py-12 flex flex-col items-center gap-3 hover:border-crwn-gold/50 transition-colors"
      >
        <UploadCloud className="w-8 h-8 text-crwn-gold" />
        <span className="text-crwn-text font-medium">{file ? file.name : 'Tap to choose an audio file'}</span>
        <span className="text-xs text-crwn-text-secondary">MP3, WAV, FLAC · up to the size limit</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.flac,.m4a,.aac"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
    </div>
  );
}

function BenefitPicker({ selected, onChange, done }: { selected: string[]; onChange: (v: string[]) => void; done?: boolean }) {
  const [custom, setCustom] = useState('');
  if (done) {
    return <p className="text-crwn-text-secondary">Tier already created. Hit Continue.</p>;
  }
  const toggle = (b: string) => onChange(selected.includes(b) ? selected.filter((x) => x !== b) : [...selected, b]);
  const addCustom = () => {
    const v = custom.trim();
    if (v && !selected.includes(v)) onChange([...selected, v]);
    setCustom('');
  };
  const extras = selected.filter((b) => !TIER_BENEFIT_SUGGESTIONS.includes(b));
  const chips = [...TIER_BENEFIT_SUGGESTIONS, ...extras];
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips.map((b) => {
          const on = selected.includes(b);
          return (
            <button
              key={b}
              type="button"
              onClick={() => toggle(b)}
              className={`px-3 py-2 rounded-full text-sm border transition-colors ${
                on ? 'bg-crwn-gold text-crwn-bg border-crwn-gold font-medium' : 'border-crwn-elevated text-crwn-text-secondary hover:border-crwn-gold/40'
              }`}
            >
              {on ? '✓ ' : ''}
              {b}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-4">
        <input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addCustom();
            }
          }}
          maxLength={60}
          placeholder="Add your own perk"
          className="flex-1 bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-3 text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim()}
          className="px-4 py-3 rounded-xl border border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text disabled:opacity-40 transition-colors"
        >
          Add
        </button>
      </div>
      <p className="text-xs text-crwn-text-secondary mt-3">Tap to toggle. These show on your tier. Edit anytime in the dashboard.</p>
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
  const shareText = `I just launched my page on CRWN. Come support me here: ${shareUrl}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Link copied!', 'success');
    } catch {
      showToast('Could not copy. Long-press the link to copy it.', 'error');
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
          Setup done. Now the most important step: get people on it. Share your link everywhere: your bio, your
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
        <p className="text-xs text-crwn-text-secondary mb-8">On Instagram or TikTok? Copy the link and drop it in your bio.</p>

        <button
          onClick={onFinish}
          disabled={finishing}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-8 py-3 rounded-full hover:bg-crwn-gold/90 disabled:opacity-50 transition-colors"
        >
          {finishing ? 'Loading…' : 'Start Rise Mode'}
          {!finishing && <ArrowRight className="w-4 h-4" />}
        </button>
        <p className="text-xs text-crwn-text-secondary mt-4">Rise Mode will guide you through building the rest of your infrastructure.</p>
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
