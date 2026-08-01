'use client';

import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  User,
  Link2,
  CalendarCheck,
  Banknote,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useArtistSetup, SetupStepKey, ArtistSetupState } from '@/hooks/useArtistSetup';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/promiseTimeout';
import { trackFunnel } from '@/lib/analytics/trackFunnelClient';
import { OnboardingAvatarStep } from '@/components/onboarding/OnboardingAvatarStep';
import { BulkUploadForm } from '@/components/artist/BulkUploadForm';
import { FanImportModal } from '@/components/artist/FanImportModal';
import {
  createOnboardingTrack,
  createOnboardingProduct,
} from '@/lib/onboardingItems';
import { RECOMMENDED_LADDER, benefitLabels, tierNameAliases } from '@/lib/tierTemplate';
import { applyTemplateTier } from '@/lib/applyTierTemplate';
import {
  planLadderPromises,
  estimateMonthlyWorkload,
  workloadLabel,
  projectedBuyersFor,
  ALLOWED_RECURRENCES,
  WORKLOAD_MINUTES,
  type PlannedPromise,
  type TierProjection,
} from '@/lib/promisePlan';
import { RECURRENCE_LABEL, FULFILLMENT_TYPE_LABEL, type Recurrence } from '@/lib/fulfillment';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { recommendPlan, monthlyPlanCostCents, proBreakEvenGmvCents } from '@/lib/planRecommendation';
import { TIER_PRICING, TIER_LIMITS } from '@/lib/platformTier';
import { getAnonId } from '@/lib/experiments/anonId';
import { slugify } from '@/lib/slugify';
import { isEmailLike } from '@/lib/publicName';
import type { ProductType } from '@/types';

type ScreenKey =
  | 'artist-name'
  | 'artist-link'
  | 'photo'
  | 'ladder'
  | 'promises'
  | 'stripe'
  | 'content-plan'
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
  create?: 'identity' | 'ladder' | 'track' | 'product'; // last field of the item → create on Continue
}

// One FIELD per screen. Groups (the four chips) span multiple screens.
// The identity screens (name + link) replaced the old /welcome page on
// 2026-07-30: signup now lands straight in the wizard, and the link screen's
// Continue saves the name and creates the artist page via /api/onboarding/identity.
const SCREENS: ScreenDef[] = [
  { key: 'artist-name', group: 'profile', groupRequired: true, title: 'What do fans call you?', subtitle: 'Your artist or stage name. This is the name on your page, not your email.', icon: User },
  { key: 'artist-link', group: 'profile', groupRequired: true, title: 'Claim your CRWN link', subtitle: 'The link you share everywhere. You can change it later in your profile.', icon: Link2, create: 'identity' },
  { key: 'photo', group: 'profile', groupRequired: true, title: 'Add a profile photo', subtitle: 'A face or logo is the first thing fans trust. Just one photo.', icon: Palette },
  // Launch Wizard Stage 2 (docs/ARTIST_LAUNCH_WIZARD.md): confirm the recommended
  // model instead of hand-building one free tier. Same apply path as Rise Level 3,
  // so the Promise Calendar obligations seed here too. Stage 3 split the decision
  // in two: confirm the MODEL (ladder), then confirm the WORKLOAD (promises) —
  // the create runs on the promises screen so cadence/date edits ride along.
  { key: 'ladder', group: 'monetize', groupRequired: false, title: 'Confirm your membership ladder', subtitle: 'The proven four-tier model: a free front door plus three paid tiers. Adjust a price or drop a tier. Everything is editable later.', icon: CreditCard },
  { key: 'promises', group: 'monetize', groupRequired: false, title: 'Review your promise schedule', subtitle: 'The only recurring commitments this ladder creates. Set the cadence and the first date. They land on your Promise Calendar so nothing slips.', icon: CalendarCheck, create: 'ladder' },
  // Launch Wizard Stage 4: surface Stripe right after the model is confirmed and
  // before anything else. Never blocks Continue (paid tiers work later via the
  // price backfill); the connect link returns to /setup and the resume effect
  // restores this exact screen.
  { key: 'stripe', group: 'monetize', groupRequired: false, title: 'Connect Stripe to get paid', subtitle: 'Connect Stripe so fans can purchase your offers and you can receive payouts. Until then, your paid tiers exist but cannot take a payment.', icon: Banknote },
  // Launch Wizard Stage 5: minimum viable content. One decision (featured track
  // vs full catalog vs later), then the matching uploader. The catalog path
  // mounts the EXISTING BulkUploadForm (per-track access + artwork + progress),
  // not an onboarding-only media system.
  { key: 'content-plan', group: 'music', groupRequired: true, title: 'How do you want to add your music?', subtitle: 'Start with one track or bring your catalog. A page with nothing to hear converts nobody.', icon: Music },
  { key: 'track-audio', group: 'music', groupRequired: true, title: 'Upload your first track', subtitle: 'The audio file fans will hear. This one starts free.', icon: Music },
  { key: 'track-title', group: 'music', groupRequired: true, title: 'Name your track', subtitle: 'What’s this one called?', icon: Music, create: 'track' },
  { key: 'product-type', group: 'shop', groupRequired: false, title: 'What are you selling?', subtitle: 'Pick the kind of product.', icon: ShoppingBag },
  { key: 'product-title', group: 'shop', groupRequired: false, title: 'Name your product', subtitle: 'What’s it called?', icon: ShoppingBag },
  { key: 'product-price', group: 'shop', groupRequired: false, title: 'Set the price', subtitle: 'What fans pay. Enter 0 to give it away.', icon: ShoppingBag, create: 'product' },
];

function screenDone(s: ScreenDef, setup: ArtistSetupState): boolean {
  switch (s.key) {
    case 'artist-name':
    case 'artist-link':
      // Identity is saved the moment the artist page exists (an artist who
      // onboarded through the old /welcome page resumes past these screens).
      return !!setup.artistId;
    case 'photo':
      return setup.hasAvatar;
    case 'ladder':
    case 'promises':
      return setup.hasTier;
    case 'stripe':
      return setup.stripeConnected;
    case 'content-plan':
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

// The wizard confirms the full recommended ladder (Bronze free + Silver $10 +
// Gold $25 + Platinum $100 from RECOMMENDED_LADDER). Bronze is always applied;
// paid rungs can be dropped or repriced. Rise Level 3 recognizes whatever was
// created here (name/alias matching) and never offers duplicates, so an artist
// who drops a rung can add it there later.
type LadderRungDraft = { include: boolean; priceDollars: string; name: string };
type LadderDraft = Record<string, LadderRungDraft>;
// The artist's own pre-signup edits (names/prices) seed the draft when they
// exist ("restore the business they designed"); the stock template otherwise.
const buildLadderDraft = (prefill?: { key: string; name: string; priceCents: number }[] | null): LadderDraft =>
  Object.fromEntries(
    RECOMMENDED_LADDER.map((r) => {
      const p = prefill?.find((x) => x.key === r.key);
      return [
        r.key,
        {
          include: true,
          priceDollars: ((p?.priceCents ?? r.priceCents) / 100).toString(),
          name: p?.name ?? r.name,
        },
      ];
    }),
  );

// Launch Wizard Stage 3: the promise-review screen's adjustments, keyed by the
// planned promise key. Dates are YYYY-MM-DD (native date input).
type PromiseDraft = Record<string, { recurrence: Recurrence; firstDueDate: string }>;

const toDateInputValue = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Default first date: a week of runway (matching the server's fallback), plus a
 *  per-promise stagger so two commitments never DEFAULT to the same day. */
const defaultPromiseDate = (offsetDays = 0): string =>
  toDateInputValue(new Date(Date.now() + (7 + offsetDays) * 24 * 60 * 60 * 1000));
const isValidPromiseDate = (v: string): boolean => !Number.isNaN(new Date(`${v}T12:00:00`).getTime());

/** The promises the CONFIRMED ladder draft will create (dedup + inheritance applied).
 *  Custom rung names ride into the plan so "serves your X members" says THEIR name. */
const planFromDraft = (draft: LadderDraft): PlannedPromise[] =>
  planLadderPromises(
    RECOMMENDED_LADDER.map((def) => {
      const customName = draft[def.key]?.name?.trim();
      return {
        def: customName && customName !== def.name ? { ...def, name: customName } : def,
        included: def.priceCents === 0 || (draft[def.key]?.include ?? true),
      };
    }),
  );

/** The (possibly adjusted) cadence + first date for a planned promise. The
 *  offset staggers untouched defaults one day apart (no same-day stacking). */
const promiseSettings = (p: PlannedPromise, draft: PromiseDraft, offsetDays = 0) => ({
  recurrence: draft[p.key]?.recurrence ?? p.defaultRecurrence,
  firstDueDate: draft[p.key]?.firstDueDate ?? defaultPromiseDate(offsetDays),
});

function SetupWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();
  // The wizard is the only place that reads `stripeConnected`, so it is the only
  // place that pays for the Stripe round trip.
  const setup = useArtistSetup({ withStripe: true });
  const { loading, isArtist, onboardingCompleted, artistId, slug, setupCompleted, steps, stripeConnected, avatarUrl, refresh, markComplete } =
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

  // Identity draft (name + link). Never pre-filled from profile.display_name:
  // before onboarding completes that field is only the un-chosen seed (the signup
  // email via the DB default), and pre-filling it is exactly how emails leak out
  // as public artist names. The handle auto-syncs from the name until edited.
  const [identityDraft, setIdentityDraft] = useState<{ name: string; handle: string; handleEdited: boolean }>({
    name: '',
    handle: '',
    handleEdited: false,
  });
  const [supporterBusy, setSupporterBusy] = useState(false);

  // Stage 1 of the launch wizard (docs/ARTIST_LAUNCH_WIZARD.md): restore the
  // plan they built before signup. Auto-claim is idempotent and derives
  // everything from the session (verified email + signup-carried token), and
  // returns the claimed calculator summary. The intro renders only for a
  // brand-new signup (no artist row, nothing typed yet), so a returning artist
  // resumes the wizard without a detour.
  const [plan, setPlan] = useState<{
    toolName: string;
    headline: string;
    heroValue: string | null;
    heroSuffix: string | null;
    estimatedMonthlyCents: number | null;
    /** Per-tier buyer counts THEIR calculator modeled (Stage 3 attribution). */
    tierProjections?: TierProjection[];
    /** The artist's own tier names/prices from pre-signup edits (null = stock). */
    ladderPrefill?: { key: string; name: string; priceCents: number }[] | null;
    /** The Share-to-Earn config they set in the builder (null = not configured). */
    shareToEarn?: { percent: number } | null;
  } | null>(null);
  const [planIntroSeen, setPlanIntroSeen] = useState(false);
  // Once the artist edits the ladder draft, their edits win over any prefill.
  const ladderTouchedRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    fetch('/api/lead-results/auto-claim', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const s = j?.seed ?? null;
        setPlan(s);
        // Restore the ladder THEY designed pre-signup (names + prices), unless
        // they already started editing the stock draft in this session.
        if (s?.ladderPrefill && !ladderTouchedRef.current) {
          setLadderDraft(buildLadderDraft(s.ladderPrefill));
        }
      })
      .catch(() => {});
  }, [user]);

  // Drafts for the multi-screen item flows (persisted only when the item is created).
  const [ladderDraft, setLadderDraft] = useState<LadderDraft>(() => buildLadderDraft());
  // Edits mark the draft as the artist's; a late-arriving prefill then never clobbers them.
  const setLadderDraftTouched: React.Dispatch<React.SetStateAction<LadderDraft>> = (v) => {
    ladderTouchedRef.current = true;
    setLadderDraft(v);
  };
  // Cadence + first-date adjustments from the promise-review screen, keyed by the
  // planned promise's key. Missing entries fall back to the plan's defaults.
  const [promiseDraft, setPromiseDraft] = useState<PromiseDraft>({});
  // Stage 5: how the artist starts their catalog. 'single' = one featured free
  // track (the fastest minimum). 'bulk' = the existing BulkUploadForm mounted
  // in-wizard (multi-file, per-track tier access), for the 40-300-song ICP.
  const [contentPlan, setContentPlan] = useState<'single' | 'bulk'>('single');
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
    // An established fan (onboarding done, no artist page) has no business in the
    // wizard. A BRAND-NEW signup is neither an artist nor onboarded — they stay:
    // the identity screens are exactly where they choose their name and link.
    if (user && !isArtist && onboardingCompleted) {
      router.replace('/home');
      return;
    }
    if (setupCompleted) router.replace('/profile/artist');
  }, [loading, isArtist, onboardingCompleted, setupCompleted, user, router]);

  // ---- Resume at the first incomplete screen (runs once) -----------------
  useEffect(() => {
    if (loading || initRef.current) return;
    initRef.current = true;
    // Funnel: Setup Started. Server dedups once per user, so a resume/reload is not a new start.
    // New signups aren't artists yet (the identity screens create the artist row), so
    // "not yet onboarded" counts as a start too.
    if ((isArtist || !onboardingCompleted) && !setupCompleted) trackFunnel('setup_started');
    // Back from Stripe onboarding (?stripe=success|refresh): restore the EXACT
    // wizard step so the artist lands on the connect screen's outcome, not
    // wherever the completion scan would put them (Launch Wizard Stage 4).
    if (searchParams.get('stripe')) {
      setStepIndex(SCREENS.findIndex((sc) => sc.key === 'stripe'));
      return;
    }
    const firstIncomplete = SCREENS.findIndex((sc) => !screenDone(sc, setup));
    if (firstIncomplete === -1) setPhase('share');
    else setStepIndex(firstIncomplete);
  }, [loading, setup, isArtist, setupCompleted, searchParams]);

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
      case 'artist-name':
        return identityDraft.name.trim() !== '';
      case 'artist-link':
        return slugify(identityDraft.handle || identityDraft.name) !== '';
      case 'ladder':
        // Bronze always applies; every included paid rung needs a valid price.
        return RECOMMENDED_LADDER.every(
          (r) => r.priceCents === 0 || !ladderDraft[r.key]?.include || isValidPrice(ladderDraft[r.key].priceDollars),
        );
      case 'promises':
        // Defaults are always valid; only a hand-cleared date blocks Continue.
        return planFromDraft(ladderDraft).every((p, i) =>
          isValidPromiseDate(promiseSettings(p, promiseDraft, i).firstDueDate),
        );
      case 'stripe':
        // Never blocks: Stripe is required to TAKE money, not to finish setup.
        // Prices backfill automatically when the artist connects later.
        return true;
      case 'content-plan':
        return true; // a default is always selected
      case 'track-audio':
        // Bulk mode gates on real tracks existing (the form uploads them itself).
        if (contentPlan === 'bulk') return false;
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

  // Bulk uploads name their tracks from the file names inside the form, so the
  // single-track title screen is meaningless on that path and gets skipped.
  const skipScreen = (s: ScreenDef): boolean => s.key === 'track-title' && contentPlan === 'bulk';

  const advance = () => {
    let next = stepIndex + 1;
    while (next < SCREENS.length && skipScreen(SCREENS[next])) next++;
    if (next >= SCREENS.length) setPhase('share');
    else setStepIndex(next);
    scrollTop();
  };

  // Saves the identity screens (name + link + role) through the server route.
  // Server-side because the browser cannot update `profiles` at all right now
  // (see /api/onboarding/identity), and so the artist page + name land together.
  const saveIdentity = async (role: 'artist' | 'fan'): Promise<string | undefined> => {
    const recruiterCode = typeof window !== 'undefined' ? localStorage.getItem('crwn_recruiter') : null;
    let res: Response;
    try {
      res = await fetch('/api/onboarding/identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: identityDraft.name,
          role,
          handle: identityDraft.handle,
          recruiterCode,
        }),
      });
    } catch {
      return 'Something went wrong saving your info. Please try again.';
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return json?.message || 'Something went wrong saving your info. Please try again.';
    }
    if (json?.role === 'artist' && json?.artistId) {
      // Same fire-and-forgets the old /welcome page ran after creating the page.
      fetch('/api/sequences/seed-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artistId: json.artistId }),
      }).catch(() => {});
      if (recruiterCode && user) {
        fetch('/api/admin/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markConverted: { recruiterCode, userId: user.id } }),
        }).catch(() => {});
      }
      fetch('/api/admin/milestone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestone: 'onboarding_completed' }),
      }).catch(() => {});
    }
    return undefined;
  };

  // The small escape hatch on the name screen for someone who is only here to
  // support artists: same identity save, fan role, straight to the feed.
  const continueAsSupporter = async () => {
    if (supporterBusy) return;
    if (!identityDraft.name.trim()) {
      showToast('Enter your name first, then continue as a supporter.', 'error');
      return;
    }
    setSupporterBusy(true);
    const err = await saveIdentity('fan');
    if (err) {
      showToast(err, 'error');
      setSupporterBusy(false);
      return;
    }
    router.replace('/home');
  };

  const runCreate = async (kind: 'identity' | 'ladder' | 'track' | 'product'): Promise<string | undefined> => {
    if (kind === 'identity') return saveIdentity('artist');
    if (!artistId) return 'Your artist profile is still loading. Try again.';
    if (kind === 'ladder') {
      // Apply every included rung through the SAME path as Rise Level 3 (Stripe
      // backfill on connect + Promise Calendar seeding). Retry-safe: rungs whose
      // name (or legacy name) already exists are skipped, so a partial failure
      // can be retried without duplicates.
      const { data: existing } = await supabase
        .from('subscription_tiers')
        .select('name')
        .eq('artist_id', artistId);
      const existingNames = new Set((existing ?? []).map((t: { name: string }) => t.name.trim().toLowerCase()));
      // The promise-review screen's cadence/date adjustments ride each rung's
      // benefit configs into the ONE shared apply path (Stage 3).
      const planned = planFromDraft(ladderDraft);
      for (const rung of RECOMMENDED_LADDER) {
        const draft = ladderDraft[rung.key];
        const isPaid = rung.priceCents > 0;
        if (isPaid && draft && !draft.include) continue; // Bronze always applies
        // The artist's own name for this rung (from their pre-signup draft or template).
        const rungName = draft?.name?.trim() || rung.name;
        if ([...tierNameAliases(rung), rungName.toLowerCase()].some((n) => existingNames.has(n))) continue;
        const priceCents = isPaid ? Math.round((parseFloat(draft?.priceDollars ?? '') || 0) * 100) : 0;
        const overrides: Record<string, Record<string, unknown>> = {};
        for (const p of planned) {
          if (p.tierKey !== rung.key) continue;
          const s = promiseSettings(p, promiseDraft, planned.indexOf(p));
          overrides[p.benefitType] = {
            frequency: s.recurrence,
            first_due_at: new Date(`${s.firstDueDate}T12:00:00`).toISOString(),
          };
        }
        const { error } = await applyTemplateTier(supabase, {
          artistId,
          stripeConnected,
          def: rung,
          name: rungName,
          priceCents,
          description: rung.description,
          benefits: benefitLabels(rung),
          benefitConfigOverrides: overrides,
        });
        if (error) return `Could not add the ${rungName} tier. Please try again.`;
      }
      // Restore the Share-to-Earn program they configured in the builder: the
      // rate THEY chose, applied once the ladder it feeds exists. Best-effort;
      // the toggle stays editable in Referrals.
      if (plan?.shareToEarn?.percent) {
        fetch('/api/referrals/artist/commission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ artistId, commissionRate: plan.shareToEarn.percent }),
        }).catch(() => {});
      }
      return undefined;
    }
    if (kind === 'track') {
      if (!trackDraft.audioFile) return 'Pick an audio file first.';
      return (await createOnboardingTrack(supabase, artistId, { audioFile: trackDraft.audioFile, title: trackDraft.title })).error;
    }
    return (await createOnboardingProduct(supabase, artistId, { type: productDraft.type, title: productDraft.title, priceCents: Math.round(parseFloat(productDraft.price) * 100) })).error;
  };

  const goNext = async () => {
    if (creating) return;
    // Catch an email typed as the artist name HERE, not two screens later when
    // the server rejects it. The name is public everywhere.
    if (current.key === 'artist-name' && !currentDone && isEmailLike(identityDraft.name)) {
      showToast('Use your artist or stage name here, not your email.', 'error');
      return;
    }
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
    let prev = stepIndex - 1;
    while (prev > 0 && skipScreen(SCREENS[prev])) prev--;
    setStepIndex(Math.max(0, prev));
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
    return (
      <LaunchReview
        slug={slug}
        artistId={artistId}
        setup={setup}
        finishing={finishing}
        onFinish={handleFinish}
        showToast={showToast}
        onFix={(key) => {
          const idx = SCREENS.findIndex((s) => s.key === key);
          if (idx >= 0) {
            setPhase('steps');
            setStepIndex(idx);
            scrollTop();
          }
        }}
      />
    );
  }

  // "Welcome them back to their plan": a claimed calculator result greets the
  // brand-new signup with the number THEY calculated before the first ask.
  if (!artistId && plan && !planIntroSeen && stepIndex === 0 && identityDraft.name === '') {
    return <PlanIntro plan={plan} onContinue={() => setPlanIntroSeen(true)} />;
  }

  const Icon = current.icon;
  const isLast = stepIndex >= SCREENS.length - 1;
  const showSkip = !current.groupRequired && !currentDone;
  // The audio screen wears catalog copy when the artist chose the bulk path.
  const isBulkAudio = current.key === 'track-audio' && contentPlan === 'bulk' && !currentDone;
  const headerTitle = isBulkAudio ? 'Upload your catalog' : current.title;
  const headerSubtitle = isBulkAudio
    ? 'Upload your catalog in one batch. Set access per track or apply one setting to all. Add more anytime in Studio.'
    : current.subtitle;

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
              <h1 className="text-2xl font-bold text-crwn-text">{headerTitle}</h1>
              <p className="text-crwn-text-secondary text-sm mt-1">{headerSubtitle}</p>
              {current.key === 'ladder' && !stripeConnected && (
                <p className="text-xs text-crwn-gold/80 mt-2">
                  You’ll connect Stripe in a moment to actually get paid. Prices are created automatically when you connect.
                </p>
              )}
              {current.key === 'ladder' && plan?.shareToEarn?.percent ? (
                <p className="text-xs text-crwn-gold/80 mt-1">
                  Your Share-to-Earn program comes with this plan: fans earn {plan.shareToEarn.percent}% recruiting
                  for you, exactly as you set it. Adjust anytime in Referrals.
                </p>
              ) : null}
            </div>
          </div>

          <FieldBody
            screen={current}
            setup={setup}
            identityDraft={identityDraft}
            setIdentityDraft={setIdentityDraft}
            onContinueAsSupporter={continueAsSupporter}
            supporterBusy={supporterBusy}
            onPhotoSaved={() => {
              setPhotoUploaded(true);
              refresh().catch(() => {});
            }}
            avatarUrl={avatarUrl}
            ladderDraft={ladderDraft}
            setLadderDraft={setLadderDraftTouched}
            promiseDraft={promiseDraft}
            setPromiseDraft={setPromiseDraft}
            tierProjections={plan?.tierProjections ?? []}
            toolName={plan?.toolName ?? null}
            contentPlan={contentPlan}
            setContentPlan={setContentPlan}
            onBulkComplete={() => {
              // The single-track path fires this inside createOnboardingTrack;
              // the bulk form doesn't, so keep the activation milestone honest.
              fetch('/api/admin/milestone', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ milestone: 'first_track_uploaded' }),
              }).catch(() => {});
              refresh().catch(() => {});
            }}
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
  identityDraft,
  setIdentityDraft,
  onContinueAsSupporter,
  supporterBusy,
  onPhotoSaved,
  avatarUrl,
  ladderDraft,
  setLadderDraft,
  promiseDraft,
  setPromiseDraft,
  tierProjections,
  toolName,
  contentPlan,
  setContentPlan,
  onBulkComplete,
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
  identityDraft: { name: string; handle: string; handleEdited: boolean };
  setIdentityDraft: React.Dispatch<React.SetStateAction<{ name: string; handle: string; handleEdited: boolean }>>;
  onContinueAsSupporter: () => void;
  supporterBusy: boolean;
  onPhotoSaved: () => void;
  avatarUrl: string;
  ladderDraft: LadderDraft;
  setLadderDraft: React.Dispatch<React.SetStateAction<LadderDraft>>;
  promiseDraft: PromiseDraft;
  setPromiseDraft: React.Dispatch<React.SetStateAction<PromiseDraft>>;
  tierProjections: TierProjection[];
  toolName: string | null;
  contentPlan: 'single' | 'bulk';
  setContentPlan: React.Dispatch<React.SetStateAction<'single' | 'bulk'>>;
  onBulkComplete: () => void;
  trackDraft: { audioFile: File | null; title: string };
  setTrackDraft: React.Dispatch<React.SetStateAction<{ audioFile: File | null; title: string }>>;
  trackTermsAgreed: boolean;
  setTrackTermsAgreed: React.Dispatch<React.SetStateAction<boolean>>;
  productDraft: { type: ProductType; title: string; price: string };
  setProductDraft: React.Dispatch<React.SetStateAction<{ type: ProductType; title: string; price: string }>>;
  onSkipGroup: () => void;
}) {
  switch (screen.key) {
    case 'artist-name':
      if (setup.artistId) {
        return <p className="text-crwn-text-secondary">Already set. Hit Continue.</p>;
      }
      return (
        <div>
          <input
            autoFocus
            className={INPUT}
            maxLength={80}
            placeholder="Your artist or stage name"
            value={identityDraft.name}
            onChange={(e) =>
              setIdentityDraft((d) => ({
                ...d,
                name: e.target.value,
                // Keep the handle in sync with the name until the artist customizes it.
                handle: d.handleEdited ? d.handle : slugify(e.target.value),
              }))
            }
          />
          <button
            type="button"
            onClick={onContinueAsSupporter}
            disabled={supporterBusy}
            className="mt-6 text-sm text-crwn-text-secondary hover:text-crwn-text underline underline-offset-4 transition-colors disabled:opacity-50"
          >
            {supporterBusy ? 'One moment…' : 'Not an artist? Continue as a supporter'}
          </button>
        </div>
      );
    case 'artist-link':
      if (setup.artistId) {
        return (
          <p className="text-crwn-text-secondary">
            Your link is thecrwn.app/{setup.slug}. Hit Continue.
          </p>
        );
      }
      return (
        <div className="flex items-stretch rounded-xl border border-crwn-elevated bg-crwn-surface focus-within:border-crwn-gold transition-colors overflow-hidden">
          <span className="flex items-center pl-4 pr-1 text-lg text-crwn-text-secondary/70 select-none whitespace-nowrap">
            thecrwn.app/
          </span>
          <input
            autoFocus
            type="text"
            value={identityDraft.handle}
            onChange={(e) =>
              setIdentityDraft((d) => ({ ...d, handle: slugify(e.target.value), handleEdited: true }))
            }
            placeholder="yourname"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 min-w-0 py-4 pr-4 bg-transparent text-lg text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none"
          />
        </div>
      );
    case 'photo':
      return <OnboardingAvatarStep initialUrl={avatarUrl} onSaved={onPhotoSaved} />;
    case 'ladder':
      if (setup.hasTier) {
        // A returning artist still gets to SEE what "confirmed" means: their
        // real tiers, read-only, never a blank "hit Continue".
        return <ExistingLadderSummary artistId={setup.artistId} />;
      }
      return (
        <LadderConfirm
          draft={ladderDraft}
          setDraft={setLadderDraft}
          projections={tierProjections}
          toolName={toolName}
        />
      );
    case 'promises':
      if (setup.hasTier) {
        return <ExistingPromisesSummary artistId={setup.artistId} />;
      }
      return (
        <PromisesReview
          ladderDraft={ladderDraft}
          draft={promiseDraft}
          setDraft={setPromiseDraft}
        />
      );
    case 'stripe':
      return <StripeConnectStep connectedAtLoad={setup.stripeConnected} />;
    case 'content-plan':
      if (setup.hasMusic) {
        return <p className="text-crwn-text-secondary">You already have music on your page. Hit Continue.</p>;
      }
      return (
        <div className="grid gap-3">
          {(
            [
              { value: 'single', label: 'One featured track', hint: 'Fastest. It starts free so new fans have something to hear today.' },
              { value: 'bulk', label: 'My catalog (multiple tracks)', hint: 'Upload a batch in one go, with per-track access. Best if you already have released music: a deep catalog is exactly what your Gold tier sells.' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setContentPlan(opt.value)}
              className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                contentPlan === opt.value ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
              }`}
            >
              <p className="font-medium text-crwn-text">{opt.label}</p>
              <p className="text-xs text-crwn-text-secondary mt-0.5">{opt.hint}</p>
            </button>
          ))}
          <button
            type="button"
            onClick={onSkipGroup}
            className="text-left px-4 py-4 rounded-xl border border-dashed border-crwn-elevated text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/40 transition-colors"
          >
            <p className="font-medium">I’ll add music later</p>
            <p className="text-xs mt-0.5">Skip for now. Until something is up, your page gives fans no reason to stay.</p>
          </button>
        </div>
      );
    case 'track-audio':
      if (setup.hasMusic) {
        return <AudioPicker file={trackDraft.audioFile} onPick={(f) => setTrackDraft((d) => ({ ...d, audioFile: f }))} done />;
      }
      if (contentPlan === 'bulk') {
        if (!setup.artistId) {
          return <p className="text-crwn-text-secondary">Your artist profile is still loading. One moment.</p>;
        }
        // The EXISTING dashboard bulk uploader, mounted in-wizard: multi-file
        // queue, per-track tier access, artwork, progress, Artist Agreement
        // consent. Continue unlocks from the DB the moment tracks exist.
        return <BulkUploadForm artistProfileId={setup.artistId} onComplete={onBulkComplete} />;
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

// Read-only done states (a returning artist sees WHAT exists, never a blank
// "hit Continue" under a headline that promised a review).
function ExistingLadderSummary({ artistId }: { artistId: string | null }) {
  const [tiers, setTiers] = useState<{ name: string; price: number }[] | null>(null);
  useEffect(() => {
    if (!artistId) return;
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('subscription_tiers')
      .select('name, price')
      .eq('artist_id', artistId)
      .not('is_active', 'is', false)
      .order('price', { ascending: true })
      .then(({ data }) => setTiers((data ?? []).map((t) => ({ name: t.name, price: Number(t.price) || 0 }))));
  }, [artistId]);
  if (!tiers) {
    return <p className="text-crwn-text-secondary text-sm">Loading your ladder…</p>;
  }
  return (
    <div className="space-y-3">
      {tiers.map((t) => (
        <div key={t.name} className="flex items-center justify-between border border-crwn-gold/40 bg-crwn-gold/5 rounded-xl px-4 py-3">
          <span className="font-semibold text-crwn-gold">{t.name}</span>
          <span className="text-sm text-crwn-text">{t.price === 0 ? 'Free' : `$${(t.price / 100).toFixed(0)}/mo`}</span>
        </div>
      ))}
      <p className="text-xs text-crwn-text-secondary">
        Your ladder is already live; nothing here will be duplicated. Edit names, prices, and benefits anytime
        in Fan tiers and pricing. Hit Continue.
      </p>
    </div>
  );
}

function ExistingPromisesSummary({ artistId }: { artistId: string | null }) {
  const [rows, setRows] = useState<{ title: string; recurrence: string; next_due_at: string | null }[] | null>(null);
  useEffect(() => {
    if (!artistId) return;
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('fulfillment_obligations')
      .select('title, recurrence, next_due_at')
      .eq('artist_id', artistId)
      .eq('status', 'active')
      .order('next_due_at', { ascending: true })
      .then(({ data }) => setRows(data ?? []));
  }, [artistId]);
  if (!rows) {
    return <p className="text-crwn-text-secondary text-sm">Loading your promises…</p>;
  }
  if (rows.length === 0) {
    return (
      <p className="text-crwn-text-secondary text-sm">
        Your tiers create no scheduled promises, so nothing recurring sits on your calendar. Hit Continue.
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="border border-crwn-gold/40 bg-crwn-gold/5 rounded-xl px-4 py-3">
          <p className="font-semibold text-crwn-text">{r.title}</p>
          <p className="text-xs text-crwn-text-secondary mt-0.5">
            {RECURRENCE_LABEL[(r.recurrence as Recurrence) ?? 'none'] ?? r.recurrence}
            {r.next_due_at
              ? `, next due ${new Date(r.next_due_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
              : ''}
          </p>
        </div>
      ))}
      <p className="text-xs text-crwn-text-secondary">
        These are already on your Promise Calendar; nothing will be duplicated. Adjust dates or pause any of
        them there. Hit Continue.
      </p>
    </div>
  );
}

function LadderConfirm({
  draft,
  setDraft,
  projections,
  toolName,
}: {
  draft: LadderDraft;
  setDraft: React.Dispatch<React.SetStateAction<LadderDraft>>;
  /** Per-tier buyer counts from the artist's own claimed calculator (may be empty). */
  projections: TierProjection[];
  toolName: string | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const patch = (key: string, p: Partial<LadderRungDraft>) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], ...p } }));

  return (
    <div className="space-y-3">
      {RECOMMENDED_LADDER.map((rung) => {
        const r =
          draft[rung.key] ?? { include: true, priceDollars: (rung.priceCents / 100).toString(), name: rung.name };
        const isPaid = rung.priceCents > 0;
        const displayName = r.name?.trim() || rung.name;
        const isOpen = expanded === rung.key;
        const benefits = benefitLabels(rung);
        const note = rung.benefits.find((b) => b.fulfillment)?.fulfillment?.note;
        const dropped = isPaid && !r.include;
        // "Why CRWN recommends it": the buyer count THEIR calculator modeled for
        // this rung (matched by current or legacy tier name). Null when unmodeled.
        const buyers = isPaid ? projectedBuyersFor(rung, projections) : null;
        return (
          <div
            key={rung.key}
            className={`border rounded-xl p-4 transition-colors ${
              dropped ? 'border-crwn-elevated opacity-60' : 'border-crwn-gold/40 bg-crwn-gold/5'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="font-semibold text-crwn-gold">{displayName}</h4>
                  {displayName !== rung.name && (
                    <span className="text-[10px] text-crwn-text-secondary">your {rung.name} rung</span>
                  )}
                  {!isPaid ? (
                    <span className="text-sm text-crwn-text">Free</span>
                  ) : (
                    <span className="inline-flex items-center text-sm text-crwn-text">
                      $
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="decimal"
                        value={r.priceDollars}
                        disabled={dropped}
                        onChange={(e) => patch(rung.key, { priceDollars: e.target.value })}
                        className="w-16 bg-crwn-bg border border-crwn-elevated rounded-lg px-2 py-1 text-crwn-text text-sm ml-0.5 disabled:opacity-50"
                      />
                      <span className="text-crwn-text-secondary ml-1">/mo</span>
                    </span>
                  )}
                </div>
                <p className="text-xs text-crwn-text-secondary mt-1">{rung.description}</p>
                {buyers !== null && buyers > 0 && !dropped && (
                  <p className="text-xs text-crwn-gold mt-1">
                    {`Your ${toolName || 'calculator'} put about ${buyers.toLocaleString()} fans in range for this tier. Dropping it leaves them with no way to pay you.`}
                  </p>
                )}
              </div>
              {isPaid && (
                <button
                  type="button"
                  onClick={() => patch(rung.key, { include: !r.include })}
                  className="text-xs text-crwn-text-secondary hover:text-crwn-text shrink-0 underline underline-offset-2"
                >
                  {dropped ? 'Add back' : 'Drop this tier'}
                </button>
              )}
            </div>

            {!dropped && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : rung.key)}
                  className="text-xs text-crwn-gold hover:underline"
                >
                  {isOpen ? 'Hide benefits' : `${benefits.length} benefits included`}
                </button>
                {isOpen && (
                  <ul className="mt-2 space-y-1">
                    {benefits.map((b) => (
                      <li key={b} className="text-xs text-crwn-text-secondary">
                        • {b}
                      </li>
                    ))}
                  </ul>
                )}
                {note && (
                  <p className="text-[11px] text-crwn-gold/80 mt-2">{note}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-xs text-crwn-text-secondary">
        Scheduled promises (the monthly Vault unlock, the quarterly Platinum event) land on your Promise Calendar
        automatically. Edit names, prices, and benefits anytime in your dashboard.
      </p>
    </div>
  );
}

// Launch Wizard Stage 4: the in-wizard Stripe connect step. Verification is
// SERVER-side (/api/stripe/connect/status does the live accounts.retrieve and,
// once charges are enabled, backfills the wizard-created tier prices). This
// component only renders the outcome and never gates Continue.
function StripeConnectStep({ connectedAtLoad }: { connectedAtLoad: boolean }) {
  const searchParams = useSearchParams();
  const returned = !!searchParams.get('stripe');
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<{
    chargesEnabled: boolean;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
  }>({ chargesEnabled: connectedAtLoad, payoutsEnabled: false, detailsSubmitted: connectedAtLoad });

  const checkStatus = async () => {
    setChecking(true);
    try {
      const res = await fetch('/api/stripe/connect/status');
      if (res.ok) {
        const d = await res.json();
        setStatus({
          chargesEnabled: !!d.chargesEnabled,
          payoutsEnabled: !!d.payoutsEnabled,
          detailsSubmitted: !!d.detailsSubmitted,
        });
      }
    } catch {
      /* keep whatever we knew */
    } finally {
      setChecking(false);
    }
  };
  // One fresh server check on mount: it is what flips the success state right
  // after Stripe redirects back, and it triggers the tier-price backfill.
  useEffect(() => {
    checkStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goConnect = () => {
    // Full-page redirect into Stripe's hosted onboarding (external URL, so
    // window.location is correct here); it returns to /setup?stripe=success.
    window.location.href = `/api/stripe/connect?returnTo=${encodeURIComponent('/setup')}`;
  };

  if (checking) {
    return (
      <div className="flex items-center gap-3 text-crwn-text-secondary text-sm">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-crwn-gold" />
        Checking your Stripe connection…
      </div>
    );
  }

  if (status.chargesEnabled) {
    return (
      <div className="border border-crwn-gold/40 bg-crwn-gold/5 rounded-xl p-5">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-crwn-gold text-crwn-bg flex items-center justify-center">
            <Check className="w-4 h-4" />
          </span>
          <h4 className="font-semibold text-crwn-text">Stripe is connected</h4>
        </div>
        <p className="text-sm text-crwn-text-secondary mt-2">
          Charges are enabled, so fans can pay you. Your paid tiers get their Stripe prices automatically.
        </p>
        <p className="text-sm text-crwn-text-secondary mt-1">
          {status.payoutsEnabled
            ? 'Payouts are enabled: money moves to your bank on Stripe’s normal schedule.'
            : 'Payouts are still being verified by Stripe. Charges work now; payouts unlock when Stripe finishes, usually within a day.'}
        </p>
        <p className="text-sm text-crwn-text mt-3">Hit Continue.</p>
      </div>
    );
  }

  if (returned && status.detailsSubmitted) {
    return (
      <div className="border border-crwn-elevated rounded-xl p-5">
        <h4 className="font-semibold text-crwn-text">Stripe is reviewing your details</h4>
        <p className="text-sm text-crwn-text-secondary mt-2">
          You finished Stripe’s form; verification usually clears in a few minutes. Your prices are created
          automatically the moment charges are enabled, so you can keep going.
        </p>
        <button
          type="button"
          onClick={checkStatus}
          className="mt-4 px-5 py-2.5 rounded-full border border-crwn-gold text-crwn-gold text-sm font-semibold hover:bg-crwn-gold/10 transition-colors"
        >
          Check again
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={goConnect}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-8 py-3 rounded-full hover:bg-crwn-gold/90 transition-colors"
      >
        <Banknote className="w-5 h-5" />
        Connect Stripe
      </button>
      <p className="text-xs text-crwn-text-secondary mt-4">
        Takes about 5 minutes on Stripe’s secure site, then you land right back here. You can also skip and
        connect later from your dashboard: your paid tiers wait with no prices until you do, which means every
        fan who tries to subscribe before then bounces off.
      </p>
    </div>
  );
}

// Launch Wizard Stage 3: the pre-create review of every recurring commitment the
// confirmed ladder will put on the Promise Calendar. One decision: "can I keep
// this schedule?" Cadence and first date are adjustable per promise; the workload
// line keeps the total honest before anything is created.
function PromisesReview({
  ladderDraft,
  draft,
  setDraft,
}: {
  ladderDraft: LadderDraft;
  draft: PromiseDraft;
  setDraft: React.Dispatch<React.SetStateAction<PromiseDraft>>;
}) {
  const planned = planFromDraft(ladderDraft);
  if (planned.length === 0) {
    return (
      <p className="text-crwn-text-secondary">
        The tiers you confirmed create no scheduled promises, so nothing recurring lands on your calendar. Hit
        Continue to create your ladder.
      </p>
    );
  }

  const minDate = toDateInputValue(new Date());
  const totalMinutes = estimateMonthlyWorkload(
    planned.map((p, i) => ({
      fulfillmentType: p.fulfillmentType,
      recurrence: promiseSettings(p, draft, i).recurrence,
    })),
  );

  const patch = (key: string, p: PlannedPromise, idx: number, over: Partial<PromiseDraft[string]>) =>
    setDraft((d) => ({
      ...d,
      [key]: { ...promiseSettings(p, d, idx), ...over },
    }));

  return (
    <div className="space-y-3">
      {planned.map((p, idx) => {
        const s = promiseSettings(p, draft, idx);
        const serves =
          p.servesTierNames.length > 1
            ? `${p.servesTierNames.slice(0, -1).join(', ')} and ${p.servesTierNames[p.servesTierNames.length - 1]}`
            : p.servesTierNames[0];
        return (
          <div key={p.key} className="border border-crwn-gold/40 bg-crwn-gold/5 rounded-xl p-4">
            <h4 className="font-semibold text-crwn-text">{p.title}</h4>
            <p className="text-xs text-crwn-text-secondary mt-1">
              One promise serving your {serves} members. {p.note ?? ''}
            </p>
            <p className="text-[11px] text-crwn-text-secondary mt-1.5">
              About {WORKLOAD_MINUTES[p.fulfillmentType] ?? 30} minutes each time · Delivered as a{' '}
              {(FULFILLMENT_TYPE_LABEL[p.fulfillmentType] ?? p.fulfillmentType).toLowerCase()} · Reminded at 7, 3,
              and 1 days out
            </p>
            <div className="grid sm:grid-cols-2 gap-3 mt-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-1">How often</p>
                <OptionSelect
                  options={ALLOWED_RECURRENCES.map((r) => ({ value: r, label: RECURRENCE_LABEL[r] }))}
                  value={s.recurrence}
                  onChange={(v) => patch(p.key, p, idx, { recurrence: v as Recurrence })}
                />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-1">First one due</p>
                <input
                  type="date"
                  min={minDate}
                  value={s.firstDueDate}
                  onChange={(e) => patch(p.key, p, idx, { firstDueDate: e.target.value })}
                  className="w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-4 text-crwn-text focus:outline-none focus:border-crwn-gold"
                />
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-xs text-crwn-text-secondary">
        {`Estimated workload: ${workloadLabel(totalMinutes)}. Every promise lands on your Promise Calendar with reminders, so a missed month never costs you a paying fan. Adjust or pause any of it later in your dashboard.`}
      </p>
    </div>
  );
}

function PlanIntro({
  plan,
  onContinue,
}: {
  plan: {
    toolName: string;
    headline: string;
    heroValue: string | null;
    heroSuffix: string | null;
    estimatedMonthlyCents: number | null;
    ladderPrefill?: { key: string; name: string; priceCents: number }[] | null;
  };
  onContinue: () => void;
}) {
  const monthly =
    plan.estimatedMonthlyCents != null && plan.estimatedMonthlyCents > 0
      ? `$${Math.round(plan.estimatedMonthlyCents / 100).toLocaleString()}`
      : null;
  // The plan's substance, from real data only: THEIR ladder (or the stock model),
  // the honest recurring workload it creates, and what happens next.
  const rungs = plan.ladderPrefill ?? RECOMMENDED_LADDER.map((r) => ({ key: r.key, name: r.name, priceCents: r.priceCents }));
  const modelLine = rungs
    .map((r) => (r.priceCents === 0 ? `${r.name} free` : `${r.name} $${Math.round(r.priceCents / 100)}/mo`))
    .join(' · ');
  const workload = workloadLabel(
    estimateMonthlyWorkload(
      planLadderPromises(RECOMMENDED_LADDER.map((def) => ({ def, included: true }))).map((p) => ({
        fulfillmentType: p.fulfillmentType,
        recurrence: p.defaultRecurrence,
      })),
    ),
  );
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg text-center page-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-crwn-gold/15 flex items-center justify-center">
          <span className="text-4xl">👑</span>
        </div>
        <h1 className="text-3xl font-bold text-crwn-text mb-2">Your CRWN plan is saved</h1>
        <p className="text-crwn-text-secondary mb-8">
          This is the plan you just built. Every answer carried over. Now let&apos;s get it ready to launch.
        </p>

        <div className="neu-raised rounded-2xl p-6 mb-8 text-left">
          <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-2">
            From your {plan.toolName}
          </p>
          {(plan.heroValue || monthly) && (
            <p className="text-4xl font-bold text-crwn-gold mb-2">
              {plan.heroValue || monthly}
              {plan.heroValue && plan.heroSuffix ? (
                <span className="text-base font-medium text-crwn-text-secondary"> {plan.heroSuffix}</span>
              ) : null}
            </p>
          )}
          {plan.headline && <p className="text-sm text-crwn-text">{plan.headline}</p>}
          {/* A claimed draft with no number and no summary still deserves substance,
              not a bare label: say what the saved plan actually contains. */}
          {!plan.heroValue && !monthly && !plan.headline && (
            <p className="text-sm text-crwn-text">
              Your tier ladder, your growth systems, and your launch order, saved exactly as you set them. The
              next steps make them real.
            </p>
          )}
          {monthly && plan.heroValue && (
            <p className="text-xs text-crwn-text-secondary mt-2">Projected at {monthly}/mo once your system is live.</p>
          )}
          <div className="mt-4 pt-4 border-t border-crwn-elevated space-y-1.5">
            <p className="text-xs text-crwn-text-secondary">
              <span className="text-crwn-text">Your model:</span> {modelLine}
            </p>
            <p className="text-xs text-crwn-text-secondary">
              <span className="text-crwn-text">Recurring workload:</span> {workload}, from content you already have
            </p>
            <p className="text-xs text-crwn-text-secondary">
              <span className="text-crwn-text">Timeline:</span> launch-ready in about ten minutes, right here
            </p>
          </div>
        </div>

        <button
          onClick={onContinue}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-8 py-3 rounded-full hover:bg-crwn-gold/90 transition-colors"
        >
          Get it launch-ready
          <ArrowRight className="w-4 h-4" />
        </button>
        <p className="text-xs text-crwn-text-secondary mt-4">
          A few quick steps: your name, your link, your photo. Your plan does the rest.
        </p>
      </div>
    </div>
  );
}

// Launch Wizard Stage 9: the pre-launch review. One screen that answers "is my
// system ready?": the completeness checklist (each open item jumps to its
// correction screen), the previews (the public page IS the storefront/checkout
// preview; calendar and roadmap render INLINE because their routes sit behind
// the setup gate until launch), the share block, and the one publish action,
// which stays the existing server-side completion (markComplete + resolver).
// Artist-facing names for the internal plan keys ('starter' stays internal-only).
const PLAN_DISPLAY: Record<'starter' | 'pro' | 'scale', string> = {
  starter: 'Launch',
  pro: 'Pro',
  scale: 'Scale',
};

function LaunchReview({
  slug,
  artistId,
  setup,
  finishing,
  onFinish,
  showToast,
  onFix,
}: {
  slug: string;
  artistId: string | null;
  setup: ArtistSetupState;
  finishing: boolean;
  onFinish: () => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
  onFix: (key: ScreenKey) => void;
}) {
  const shareUrl = `https://thecrwn.app/${slug}`;
  const shareText = `I just launched my page on CRWN. Come support me here: ${shareUrl}`;
  const [promises, setPromises] = useState<{ title: string; due_at: string }[] | null>(null);
  const [contactCount, setContactCount] = useState(0);
  const [campaignCount, setCampaignCount] = useState(0);
  const [roadmapNext, setRoadmapNext] = useState<string | null>(null);
  const [goalCents, setGoalCents] = useState<number | null>(null);
  // The fan import hub, right here in the review: the modal is route-independent,
  // so the audience does not have to wait for the post-launch Fan CRM.
  const [importOpen, setImportOpen] = useState(false);
  // The launch boundary is where the operating plan gets its context: the same
  // deterministic recommendPlan() that seeded recommended_plan at claim, re-derived
  // from the artist's own projected GMV. Advisory only; launching stays free.
  const planRec = useMemo(
    () => recommendPlan({ projectedMonthlyGmvCents: goalCents ?? 0 }),
    [goalCents],
  );

  useEffect(() => {
    if (!artistId) return;
    let active = true;
    const supabase = createBrowserSupabaseClient();
    supabase
      .from('fulfillment_events')
      .select('title, due_at')
      .eq('artist_id', artistId)
      .eq('status', 'pending')
      .order('due_at', { ascending: true })
      .limit(3)
      .then(({ data }) => {
        if (active) setPromises(data ?? []);
      });
    supabase
      .from('fan_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('artist_id', artistId)
      .then(({ count }) => {
        if (active) setContactCount(count ?? 0);
      });
    fetch(`/api/campaigns?artistId=${artistId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (active && Array.isArray(j?.campaigns)) setCampaignCount(j.campaigns.length);
      })
      .catch(() => {});
    fetch('/api/artist/roadmap')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (active && j?.roadmap?.nextStep?.label) setRoadmapNext(j.roadmap.nextStep.label);
        if (active && typeof j?.stats?.goalMonthlyCents === 'number' && j.stats.goalMonthlyCents > 0) {
          setGoalCents(j.stats.goalMonthlyCents);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [artistId]);

  // Manual sharing IS a launch method (the spec allows launching without importing
  // a single contact), but only the campaign sender emitted fan_invited, so an
  // artist who launched by pasting their link produced ZERO funnel signal and
  // looked like they never launched. Metadata marks it manual so it is never
  // mistaken for a real send with recipients.
  const trackShare = (channel: string) => {
    trackFunnel('fan_invited', {
      dedupeKey: `${artistId ?? slug}:manual:${channel}`,
      metadata: { method: 'manual_share', channel },
    });
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      trackShare('copy_link');
      showToast('Link copied!', 'success');
    } catch {
      showToast('Could not copy. Long-press the link to copy it.', 'error');
    }
  };

  const socials = [
    { label: 'Share on X', channel: 'x', href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}` },
    { label: 'Share on Facebook', channel: 'facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}` },
    { label: 'Share on WhatsApp', channel: 'whatsapp', href: `https://wa.me/?text=${encodeURIComponent(shareText)}` },
  ];

  const checklist: { label: string; done: boolean; fix?: ScreenKey; note?: string }[] = [
    { label: 'Offers ready', done: setup.hasTier, fix: 'ladder' },
    { label: 'Stripe connected', done: setup.stripeConnected, fix: 'stripe' },
    { label: 'Content ready', done: setup.hasMusic, fix: 'content-plan' },
    {
      label: 'Promises scheduled',
      done: (promises?.length ?? 0) > 0,
      note: 'Set with your ladder; manage them in the Promise Calendar after launch.',
    },
    { label: 'Audience imported', done: contactCount > 0, note: 'import-now' },
    { label: 'Launch campaign drafted', done: campaignCount > 0, note: 'After launch: the Launch Kit writes it for you.' },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg page-fade-in">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-crwn-gold/15 flex items-center justify-center">
            <PartyPopper className="w-9 h-9 text-crwn-gold" />
          </div>
          <h1 className="text-3xl font-bold text-crwn-text mb-2">Your CRWN launch system</h1>
          <p className="text-crwn-text-secondary mb-8">
            Everything you built, in one place. Review it, then launch.
          </p>
        </div>

        {/* Completeness checklist */}
        <div className="neu-raised rounded-2xl p-4 mb-4">
          <ul className="space-y-2.5">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-start gap-2.5 text-sm">
                <span
                  className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                    item.done ? 'bg-crwn-gold border-crwn-gold text-crwn-bg' : 'border-crwn-elevated'
                  }`}
                >
                  {item.done && <Check className="w-3 h-3" />}
                </span>
                <span className={item.done ? 'text-crwn-text' : 'text-crwn-text-secondary'}>
                  {item.label}
                  {!item.done && item.fix && (
                    <button
                      type="button"
                      onClick={() => onFix(item.fix!)}
                      className="ml-2 text-crwn-gold hover:underline text-xs"
                    >
                      Fix it
                    </button>
                  )}
                  {!item.done && item.note === 'import-now' && (
                    <button
                      type="button"
                      onClick={() => setImportOpen(true)}
                      className="ml-2 text-crwn-gold hover:underline text-xs"
                    >
                      Import now
                    </button>
                  )}
                  {!item.done && !item.fix && item.note && item.note !== 'import-now' && (
                    <span className="block text-xs text-crwn-text-secondary/80">{item.note}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Previews: storefront/checkout is the real public page; calendar and
            roadmap render inline (their routes open after launch). */}
        <a
          href={`/${slug}?preview=visitor`}
          target="_blank"
          rel="noopener noreferrer"
          className="block neu-raised rounded-2xl p-4 mb-4 hover:border-crwn-gold/40 border border-transparent transition-colors"
        >
          <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-0.5">Storefront and checkout</p>
          <p className="text-sm text-crwn-text">
            See your page exactly as a fan sees it: your music, your tiers, your prices. Switch between a visitor and
            each paid tier to check what every fan actually unlocks.
          </p>
          <p className="text-xs text-crwn-gold mt-1">thecrwn.app/{slug} ↗</p>
        </a>

        {promises !== null && promises.length > 0 && (
          <div className="neu-raised rounded-2xl p-4 mb-4">
            <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-2">
              Your promise calendar, first up
            </p>
            <ul className="space-y-1.5">
              {promises.map((p, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <CalendarCheck className="w-4 h-4 text-crwn-gold shrink-0" />
                  <span className="text-crwn-text truncate">{p.title}</span>
                  <span className="text-xs text-crwn-text-secondary ml-auto shrink-0">
                    {new Date(p.due_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {roadmapNext && (
          <div className="neu-raised rounded-2xl p-4 mb-4">
            <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-0.5">
              Your roadmap after launch
            </p>
            <p className="text-sm text-crwn-text">
              First milestone: {roadmapNext}. The full five-stage plan is waiting on your command screen.
            </p>
          </div>
        )}

        {/* Operating plan at the launch boundary (advisory, never blocking).
            Every number comes from TIER_PRICING / TIER_LIMITS / recommendPlan;
            nothing here is hardcoded, so a repricing cannot strand this copy. */}
        <div className="neu-raised rounded-2xl p-4 mb-4">
          <p className="text-[11px] uppercase tracking-wide text-crwn-text-secondary mb-2">Your operating plan</p>
          {goalCents ? (
            <>
              <p className="text-sm text-crwn-text mb-1">
                Recommended: <span className="font-semibold text-crwn-gold">{PLAN_DISPLAY[planRec.plan]}</span>
              </p>
              <p className="text-xs text-crwn-text-secondary mb-3">{planRec.reasons[0]}</p>
              <ul className="space-y-1.5 mb-3">
                {(['starter', 'pro', 'scale'] as const).map((p) => (
                  <li key={p} className="flex items-center justify-between gap-2 text-xs">
                    <span className={p === planRec.plan ? 'text-crwn-text font-medium' : 'text-crwn-text-secondary'}>
                      {`${PLAN_DISPLAY[p]}: ${TIER_LIMITS[p].platformFeePercent}% fee${p === 'starter' ? ', free' : ` + $${TIER_PRICING[p].monthlyDisplay}/mo`}`}
                    </span>
                    <span className={p === planRec.plan ? 'text-crwn-gold font-medium shrink-0' : 'text-crwn-text-secondary shrink-0'}>
                      {`about $${Math.round(monthlyPlanCostCents(p, goalCents) / 100).toLocaleString()}/mo`}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-crwn-text-secondary">
                {`Costs shown at your projected $${Math.round(goalCents / 100).toLocaleString()} a month. You launch on Launch (free) today. Upgrading later in Billing changes your fee, never your work.`}
              </p>
            </>
          ) : (
            <p className="text-xs text-crwn-text-secondary">
              {`You launch on Launch: free, with a ${TIER_LIMITS.starter.platformFeePercent}% platform fee. Pro ($${TIER_PRICING.pro.monthlyDisplay}/mo) drops the fee to ${TIER_LIMITS.pro.platformFeePercent}%. Above $${Math.round(proBreakEvenGmvCents() / 100).toLocaleString()} a month in sales, staying on Launch costs you more than Pro would. Upgrade any time in Billing; nothing you built is ever removed.`}
            </p>
          )}
        </div>

        {/* Share */}
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
              onClick={() => trackShare(s.channel)}
              className="px-4 py-3 rounded-xl border border-crwn-elevated text-sm font-medium text-crwn-text-secondary hover:text-crwn-text hover:border-crwn-gold/50 transition-colors text-center"
            >
              {s.label}
            </a>
          ))}
        </div>

        <div className="text-center">
          <button
            onClick={onFinish}
            disabled={finishing}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-8 py-3 rounded-full hover:bg-crwn-gold/90 disabled:opacity-50 transition-colors"
          >
            {finishing ? 'Launching…' : 'Launch my CRWN'}
            {!finishing && <ArrowRight className="w-4 h-4" />}
          </button>
          <p className="text-xs text-crwn-text-secondary mt-4">
            Launching opens the rest of CRWN and lands you on your command screen: your next move, your promises,
            your numbers.
          </p>
        </div>
      </div>

      {artistId && (
        <FanImportModal
          artistId={artistId}
          isOpen={importOpen}
          onClose={() => setImportOpen(false)}
          onImported={() => setContactCount((c) => Math.max(1, c + 1))}
        />
      )}
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
