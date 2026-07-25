'use client';

import { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Lock,
  Megaphone,
  Package,
  PartyPopper,
  Scissors,
  Sparkles,
  Target,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { withTimeout } from '@/lib/promiseTimeout';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { createOnboardingTier, createOnboardingProduct } from '@/lib/onboardingItems';
import { CLIPPER_RAMP_PRESETS, sanitizeClipperSchedule } from '@/lib/clipperRate';
import { CalculatorPrefillBanner } from '@/components/lead-magnets/CalculatorPrefillBanner';
import { CalculatorSuggestions } from '@/components/lead-magnets/CalculatorSuggestions';
import type { ProductType } from '@/types';

/**
 * Offer Builder — a guided, one-decision-per-screen wizard that packages a fan
 * offer and turns on promotion. REUSES existing rails end to end:
 *  - a subscription offer IS a subscription_tiers row (createOnboardingTier;
 *    Stripe prices are backfilled when the artist connects Stripe)
 *  - a one-time offer IS a products row (createOnboardingProduct)
 *  - Share-to-Earn = the artist-wide fan referral commission
 *    (/api/referrals/artist/commission)
 *  - Clip-to-Earn = the artist-wide clipper rev-share ramp
 *    (/api/referrals/artist/clipper)
 * No new tables, no new money logic. Promotion rates are GLOBAL per artist for
 * now — the copy says so explicitly; per-offer rates come later.
 */

type OfferType = 'subscription' | 'onetime';

type StepKey = 'goal' | 'price' | 'tier-details' | 'product-details' | 'upload' | 'share' | 'clip' | 'review';

interface StepDef {
  key: StepKey;
  title: string;
  subtitle: string;
  icon: typeof Target;
}

interface GoalDef {
  id: string;
  label: string;
  hint: string;
  // Presets only — the goal itself is NOT persisted anywhere.
  offerType: OfferType;
  price: string;
  tierName: string;
  benefits: string[];
  productTitle: string;
  productType: Exclude<ProductType, 'experience' | 'bundle'>;
  // One-time only: whether to ask the digital/physical delivery kind. Funding /
  // backer-pack goals skip it — "digital download vs physical merch" doesn't fit them
  // (the type is preset and delivery is refined later in the Shop tab).
  askKind?: boolean;
  // One-time only: a backer/funding contribution — fans buy it to SUPPORT, not to
  // download something. Contributions never require a delivered file, even when
  // their productType is 'digital'.
  isContribution?: boolean;
  // Optional per-goal copy so each goal's steps read coherently for that goal.
  priceHint?: string;
  detailsTitle?: string;
  detailsHint?: string;
}

const GOALS: GoalDef[] = [
  {
    id: 'grow-supporters',
    label: 'Grow Supporters',
    hint: 'A monthly membership your core fans join',
    offerType: 'subscription',
    price: '10',
    tierName: 'Inner Circle',
    benefits: ['Exclusive tracks', 'Members-only posts', 'Shout-outs from me'],
    productTitle: '',
    productType: 'digital',
  },
  {
    id: 'fund-video',
    label: 'Fund a Video',
    hint: 'A one-time backer pack fans buy to help fund the shoot',
    offerType: 'onetime',
    price: '25',
    tierName: 'Inner Circle',
    benefits: [],
    productTitle: 'Music Video Backer Pack',
    productType: 'digital',
    askKind: false,
    isContribution: true,
    priceHint: 'What each backer pays to help fund it.',
    detailsTitle: 'Name your backer pack',
    detailsHint: 'Fans buy this once to support the video. Add perks and delivery details later in the Shop tab.',
  },
  {
    id: 'vault-access',
    label: 'Vault Access',
    hint: 'Unreleased music behind a monthly sub',
    offerType: 'subscription',
    price: '5',
    tierName: 'The Vault',
    benefits: ['Unreleased vault tracks', 'Early access to new releases', 'Behind-the-scenes content'],
    productTitle: '',
    productType: 'digital',
  },
  {
    id: 'unlock-drop',
    label: 'Unlock a Drop',
    hint: 'Sell one exclusive drop, one time',
    offerType: 'onetime',
    price: '15',
    tierName: 'Inner Circle',
    benefits: [],
    productTitle: 'Exclusive Drop',
    productType: 'digital',
    askKind: true,
    priceHint: 'What fans pay to unlock it.',
    detailsTitle: 'Name the drop and pick the kind',
    detailsHint: 'The exclusive thing fans get when they buy.',
  },
  {
    id: 'reward-day-ones',
    label: 'Reward Day Ones',
    hint: 'A one-time pack for the fans who were here first',
    offerType: 'onetime',
    price: '30',
    tierName: 'Inner Circle',
    benefits: [],
    productTitle: 'Day One Backer Pack',
    productType: 'digital',
    askKind: true,
    priceHint: 'What the pack costs.',
    detailsTitle: 'Name the pack and pick the kind',
    detailsHint: 'A one-time reward for your earliest fans.',
  },
];

const BENEFIT_SUGGESTIONS = [
  'Exclusive tracks',
  'Early access to new releases',
  'Members-only posts',
  'Shout-outs from me',
  'Behind-the-scenes content',
  'Unreleased vault tracks',
];

// Experiences require Pro-only scheduling, so the builder offers digital/physical only.
const PRODUCT_TYPES: { value: Exclude<ProductType, 'experience' | 'bundle'>; label: string; hint: string }[] = [
  { value: 'digital', label: 'Digital download', hint: 'Unreleased tracks, videos, art' },
  { value: 'physical', label: 'Physical / merch', hint: 'Vinyl, shirts, CDs' },
];

const ARTIST_WIDE_NOTE =
  'This is your artist-wide rate. It applies to everyone promoting your page, not just this offer (per-offer rates come later).';

const isValidPrice = (v: string) => v.trim() !== '' && !isNaN(parseFloat(v)) && parseFloat(v) >= 0;

const INPUT =
  'w-full bg-crwn-surface border border-crwn-elevated rounded-xl px-4 py-4 text-lg text-crwn-text placeholder-crwn-text-secondary/50 focus:outline-none focus:border-crwn-gold';

// A "digital deliverable" — the fan downloads a file after buying. Only these
// offers get the upload step: one-time + digital + not a backer contribution.
// Subscriptions, physical/merch, and Fund-a-Video style contributions don't.
function offerDeliversFile(
  offerType: OfferType,
  goal: GoalDef | null,
  productType: Exclude<ProductType, 'experience' | 'bundle'>
): boolean {
  return offerType === 'onetime' && productType === 'digital' && !goal?.isContribution;
}

function stepList(
  offerType: OfferType,
  goal: GoalDef | null,
  productType: Exclude<ProductType, 'experience' | 'bundle'>
): StepDef[] {
  // The goal (screen 1) already determines the offer type, so we don't re-ask it.
  const steps: StepDef[] = [
    { key: 'goal', title: 'What do you want to create?', subtitle: 'Pick one. This sets up the right kind of offer with smart defaults you can change next.', icon: Target },
    {
      key: 'price',
      title: offerType === 'subscription' ? 'Set the monthly price' : 'Set the price',
      subtitle: offerType === 'subscription' ? 'What fans pay each month.' : (goal?.priceHint ?? 'What fans pay, once.'),
      icon: CreditCard,
    },
    offerType === 'subscription'
      ? { key: 'tier-details' as const, title: 'Name it and load the perks', subtitle: 'The tier name fans join, and what they get. Edit anytime later.', icon: Sparkles }
      : {
          key: 'product-details' as const,
          // Goal-aware: funding/backer goals skip the delivery "kind" question, so the
          // title doesn't promise a choice the screen won't show.
          title: goal?.detailsTitle ?? (goal?.askKind ? 'Name it and pick the kind' : 'Name your offer'),
          subtitle: goal?.detailsHint ?? 'What fans buy from you, once.',
          icon: Package,
        },
  ];

  // A digital deliverable must ship WITH its file — otherwise the product is
  // purchasable but delivers nothing. Always directly after product-details, so
  // switching digital/physical on that screen can't desync the current step index.
  if (offerDeliversFile(offerType, goal, productType)) {
    steps.push({
      key: 'upload',
      title: 'Upload what fans get',
      subtitle: 'The file fans download after buying: the track, video, art, or zip.',
      icon: Upload,
    });
  }

  // Share-to-Earn / Clip-to-Earn pay commission on SUBSCRIPTIONS only, so promotion
  // only makes sense for a membership offer — skip both screens for one-time offers.
  if (offerType === 'subscription') {
    steps.push(
      { key: 'share', title: 'Share-to-Earn', subtitle: 'Pay fans a cut for referring subscribers with their share link.', icon: Megaphone },
      { key: 'clip', title: 'Clip-to-Earn', subtitle: 'Pay clippers a cut of every subscription their clips bring in.', icon: Scissors },
    );
  }

  steps.push({ key: 'review', title: 'Review your offer', subtitle: 'Check everything, then publish.', icon: Check });
  return steps;
}

function OfferBuilder() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const { showToast } = useToast();
  const supabase = createBrowserSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [artistId, setArtistId] = useState<string | null>(null);

  const [stepIndex, setStepIndex] = useState(0);
  const [phase, setPhase] = useState<'steps' | 'done'>('steps');
  const [publishing, setPublishing] = useState(false);

  // ---- Draft state (nothing persists until Publish) -----------------------
  const [goalId, setGoalId] = useState<string | null>(null);
  const [offerType, setOfferType] = useState<OfferType>('subscription');
  const [price, setPrice] = useState('10');
  const [tierName, setTierName] = useState('Inner Circle');
  const [benefits, setBenefits] = useState<string[]>(GOALS[0].benefits);
  const [productTitle, setProductTitle] = useState('');
  const [productType, setProductType] = useState<Exclude<ProductType, 'experience' | 'bundle'>>('digital');
  // Digital deliverable file — uploaded on the 'upload' step, attached at publish.
  const [productFileUrl, setProductFileUrl] = useState<string | null>(null);
  const [productFileName, setProductFileName] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [shareOn, setShareOn] = useState(false);
  const [sharePercent, setSharePercent] = useState('20');
  const [clipOn, setClipOn] = useState(false);
  const [clipPresetId, setClipPresetId] = useState('balanced');
  const [clipStandardRate, setClipStandardRate] = useState('10');

  // ---- Resolve the artist (artist_profiles.id via user_id — same as useArtistSetup)
  const loadArtist = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('artist_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    setArtistId(data?.id ?? null);
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

  // If launched from a Rise Mode quest, bounce back on completion so the
  // celebration fires there instead of stranding the artist on the done screen.
  useEffect(() => {
    if (phase !== 'done') return;
    const returnTo =
      typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null;
    if (returnTo) router.replace(returnTo);
  }, [phase, router]);

  // One-shot prefill when routed here straight from a calculator (post-onboarding). Presets the
  // matching goal, then overrides with the calculator's own numbers, and jumps past the goal
  // picker so the artist lands on already-filled fields. lm_prefill=1 also shows the banner.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('lm_prefill') !== '1') return;
    prefilled.current = true;

    const g = GOALS.find((x) => x.id === q.get('lm_goal'));
    if (g) {
      setGoalId(g.id);
      setOfferType(g.offerType);
      setPrice(g.price);
      if (g.offerType === 'subscription') {
        setTierName(g.tierName);
        setBenefits(g.benefits);
      } else {
        setProductTitle(g.productTitle);
        setProductType(g.productType);
      }
      setStepIndex(1); // skip the "what do you want to create?" screen; it is already chosen
    }

    const name = q.get('lm_tier_name');
    if (name) setTierName(name);
    const p = q.get('lm_price');
    if (p) setPrice(p);
    if (q.get('lm_share_on') === '1') setShareOn(true);
    const sp = q.get('lm_share_percent');
    if (sp) setSharePercent(sp);
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
        <p className="text-crwn-text mb-4">The Offer Builder is for artists. Publish your artist page first.</p>
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
    return <DoneScreen offerType={offerType} onOffers={() => router.push('/offers')} onDashboard={() => router.push('/profile/artist')} />;
  }

  const selectedGoal = GOALS.find((g) => g.id === goalId) ?? null;
  const steps = stepList(offerType, selectedGoal, productType);
  const deliversFile = offerDeliversFile(offerType, selectedGoal, productType);
  const current = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;
  const progressPct = Math.round((stepIndex / steps.length) * 100);
  const clipPreset = CLIPPER_RAMP_PRESETS.find((p) => p.id === clipPresetId) ?? CLIPPER_RAMP_PRESETS[1];

  const applyGoal = (g: GoalDef) => {
    setGoalId(g.id);
    // Goal only presets defaults + type — it is never persisted.
    setOfferType(g.offerType);
    setPrice(g.price);
    if (g.offerType === 'subscription') {
      setTierName(g.tierName);
      setBenefits(g.benefits);
    } else {
      setProductTitle(g.productTitle);
      setProductType(g.productType);
    }
    // A file uploaded for a previous goal must not ride along to the new one.
    setProductFileUrl(null);
    setProductFileName('');
  };

  const pickProductType = (t: Exclude<ProductType, 'experience' | 'bundle'>) => {
    setProductType(t);
    // Physical ships — never attach a previously uploaded digital file to it.
    if (t === 'physical') {
      setProductFileUrl(null);
      setProductFileName('');
    }
  };

  // Same bucket + path convention + public-URL derivation as ShopManager's
  // digital product file upload, so wizard files deliver identically to
  // Shop-tab files (album-art bucket, {artistId}/product-files/).
  const handleFileSelect = async (file: File | null) => {
    if (!file || !artistId || uploadingFile) return;
    setUploadingFile(true);
    try {
      const ext = file.name.split('.').pop();
      const fileName = `${Date.now()}-product.${ext}`;
      const path = `${artistId}/product-files/${fileName}`;
      const { error: uploadError } = await supabase.storage.from('album-art').upload(path, file);
      if (uploadError) {
        showToast(`Upload failed: ${uploadError.message}`, 'error');
        return;
      }
      const {
        data: { publicUrl },
      } = supabase.storage.from('album-art').getPublicUrl(path);
      setProductFileUrl(publicUrl);
      setProductFileName(file.name);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Upload failed. Please try again.', 'error');
    } finally {
      setUploadingFile(false);
    }
  };

  const canContinue = (): boolean => {
    switch (current.key) {
      case 'goal':
        return goalId !== null;
      case 'price':
        return isValidPrice(price);
      case 'tier-details':
        return tierName.trim() !== '';
      case 'product-details':
        return productTitle.trim() !== '';
      case 'upload':
        // The file IS the product for a digital deliverable — required.
        return productFileUrl !== null;
      case 'share':
        return !shareOn || (sharePercent.trim() !== '' && Number(sharePercent) >= 0 && Number(sharePercent) <= 50);
      case 'clip':
        return !clipOn || (clipStandardRate.trim() !== '' && Number(clipStandardRate) >= 0 && Number(clipStandardRate) <= 100);
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
      const priceCents = Math.round(parseFloat(price) * 100);

      // Plan cap: enforce the fan-tier limit the same way TierManager does —
      // /api/platform/limits (getTierLimitsV2(platform_tier).fanTiers) vs the
      // live count of ACTIVE subscription_tiers. Fail-open on fetch errors.
      if (offerType === 'subscription') {
        try {
          const limitsRes = await fetch(`/api/platform/limits?artistId=${artistId}`);
          if (limitsRes.ok) {
            const { limits, usage } = await limitsRes.json();
            const maxFanTiers = limits?.fanTiers;
            if (
              typeof maxFanTiers === 'number' &&
              maxFanTiers !== -1 &&
              (usage?.fanTiers ?? 0) >= maxFanTiers
            ) {
              showToast(
                `Your plan allows ${maxFanTiers} fan tier${maxFanTiers === 1 ? '' : 's'}. Upgrade to add more.`,
                'error'
              );
              return; // stay on Review
            }
          }
        } catch {
          // Limits check is best-effort — don't block publish on a fetch failure.
        }
      }

      // 1) Create the offer on the existing entity (tier row or product row).
      let err: string | undefined;
      if (offerType === 'subscription') {
        err = (
          await withTimeout(
            createOnboardingTier(supabase, artistId, { name: tierName, priceCents, benefits })
          )
        ).error;
      } else {
        err = (
          await withTimeout(
            createOnboardingProduct(supabase, artistId, {
              type: productType,
              title: productTitle,
              priceCents,
              // Digital deliverables ship complete: the file uploaded on the
              // upload step is attached now, not "added later in the Shop tab".
              fileUrl: deliversFile ? productFileUrl : null,
            })
          )
        ).error;
      }
      if (err) {
        showToast(err, 'error');
        return; // stay on Review so they can retry
      }

      // Subscription tiers are inserted with stripe_price_id: null; the connect
      // status endpoint idempotently backfills Stripe prices for connected
      // artists, making the tier purchasable now instead of at next dashboard
      // visit. Best-effort — never block the success screen on it.
      if (offerType === 'subscription') {
        await fetch('/api/stripe/connect/status').catch(() => {});
      }

      // 2) Promotion — artist-wide rails. The offer already exists at this point,
      // so a promo failure warns (fix later in the dashboard) instead of blocking.
      let promoWarned = false;
      if (shareOn) {
        try {
          const res = await fetch('/api/referrals/artist/commission', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ artistId, commissionRate: Math.round(Number(sharePercent)) }),
          });
          if (!res.ok) promoWarned = true;
        } catch {
          promoWarned = true;
        }
      }
      if (clipOn) {
        try {
          const schedule = sanitizeClipperSchedule(clipPreset.steps) ?? [];
          const res = await fetch('/api/referrals/artist/clipper', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              artistId,
              standardRate: Math.round(Number(clipStandardRate)),
              schedule,
              // Only (re)start the campaign clock when there's an actual ramp.
              ...(schedule.length > 0 ? { startCampaign: true } : {}),
            }),
          });
          if (!res.ok) promoWarned = true;
        } catch {
          promoWarned = true;
        }
      }

      if (promoWarned) {
        showToast('Offer created, but promotion settings didn’t save. Set them from your dashboard.', 'error');
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

  return (
    <div className="min-h-screen flex flex-col">
      {/* Progress header */}
      <header className="sticky top-0 z-20 bg-crwn-bg/80 backdrop-blur-md border-b border-crwn-elevated">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 pb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-crwn-gold font-bold tracking-tight">Offer Builder</span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-crwn-text-secondary">
                Step {stepIndex + 1} of {steps.length}
              </span>
              <button
                onClick={() => {
                  // Return to wherever this was launched from (Rise Mode carries ?returnTo).
                  const rt =
                    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('returnTo') : null;
                  router.push(rt || '/studio');
                }}
                aria-label="Exit"
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
          <CalculatorPrefillBanner />
          <CalculatorSuggestions />
          <div className="flex items-start gap-3 mb-8">
            <div className="w-11 h-11 rounded-full bg-crwn-gold/10 flex items-center justify-center flex-shrink-0">
              <Icon className="w-5 h-5 text-crwn-gold" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-crwn-text">{current.title}</h1>
              <p className="text-crwn-text-secondary text-sm mt-1">{current.subtitle}</p>
            </div>
          </div>

          {current.key === 'goal' && (
            <OptionSelect
              value={goalId}
              onChange={(v) => { const g = GOALS.find((x) => x.id === v); if (g) applyGoal(g); }}
              placeholder="Pick what to create"
              options={GOALS.map((g) => ({
                value: g.id,
                label: g.label,
                hint: `${g.offerType === 'subscription' ? 'Monthly membership' : 'One-time'} · ${g.hint}`,
              }))}
            />
          )}

          {current.key === 'price' && (
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
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              {offerType === 'subscription' && <span className="text-crwn-text-secondary">/mo</span>}
            </div>
          )}

          {current.key === 'tier-details' && (
            <div className="space-y-6">
              <input
                autoFocus
                className={INPUT}
                maxLength={40}
                placeholder="Inner Circle"
                value={tierName}
                onChange={(e) => setTierName(e.target.value)}
              />
              <BenefitPicker selected={benefits} onChange={setBenefits} />
            </div>
          )}

          {current.key === 'product-details' && (
            <div className="space-y-6">
              <input
                autoFocus
                className={INPUT}
                maxLength={120}
                placeholder="Product name"
                value={productTitle}
                onChange={(e) => setProductTitle(e.target.value)}
              />
              {/* The digital/physical delivery kind only shows for goals where it
                  actually applies (e.g. a drop or a merch pack) — funding/backer
                  goals skip it (type is preset, delivery is set later in the Shop tab). */}
              {selectedGoal?.askKind && (
                <div>
                  <label className="block text-sm font-medium text-crwn-text mb-2">What kind is it?</label>
                  <div className="grid gap-3">
                    {PRODUCT_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => pickProductType(t.value)}
                        className={`text-left px-4 py-4 rounded-xl border transition-colors ${
                          productType === t.value ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                        }`}
                      >
                        <p className="font-medium text-crwn-text">{t.label}</p>
                        <p className="text-xs text-crwn-text-secondary mt-0.5">{t.hint}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {current.key === 'upload' && (
            <div className="space-y-4">
              <label
                className={`block cursor-pointer rounded-xl border px-4 py-8 text-center transition-colors ${
                  productFileUrl ? 'border-crwn-gold bg-crwn-gold/10' : 'border-crwn-elevated hover:border-crwn-gold/40'
                } ${uploadingFile ? 'opacity-60 pointer-events-none' : ''}`}
              >
                {uploadingFile ? (
                  <span className="inline-flex items-center gap-3 text-crwn-text">
                    <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-crwn-gold" />
                    Uploading…
                  </span>
                ) : productFileUrl ? (
                  <span className="flex flex-col items-center gap-1">
                    <span className="inline-flex items-center gap-2 text-crwn-text font-medium">
                      <Check className="w-5 h-5 text-crwn-gold" />
                      <span className="truncate max-w-full">{productFileName}</span>
                    </span>
                    <span className="text-sm text-crwn-gold">Replace file</span>
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-2">
                    <Upload className="w-6 h-6 text-crwn-gold" />
                    <span className="text-crwn-text font-medium">Choose the file</span>
                    <span className="text-xs text-crwn-text-secondary">ZIP, PDF, WAV, MP3, etc.</span>
                  </span>
                )}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploadingFile}
                  onChange={(e) => {
                    handleFileSelect(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
              </label>
              <p className="text-xs text-crwn-text-secondary">
                Fans get this file instantly after buying. You can swap it anytime from the Shop tab.
              </p>
            </div>
          )}

          {current.key === 'share' && (
            <div className="space-y-5">
              <ToggleRow
                on={shareOn}
                onToggle={() => setShareOn((v) => !v)}
                label="Turn on Share-to-Earn"
                hint="Fans grab a share link on your page; you pay them a % of subscriptions they refer."
              />
              {shareOn && (
                <div>
                  <label className="block text-sm font-medium text-crwn-text mb-2">Referral commission</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      inputMode="numeric"
                      value={sharePercent}
                      onChange={(e) => setSharePercent(e.target.value)}
                      className="w-24 bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-3 text-lg text-crwn-text focus:outline-none focus:border-crwn-gold"
                    />
                    <span className="text-crwn-text-secondary">%</span>
                  </div>
                  <p className="text-xs text-crwn-text-secondary mt-2">We suggest 20%. Max 50%.</p>
                </div>
              )}
              <p className="text-xs text-crwn-text-secondary">{ARTIST_WIDE_NOTE}</p>
            </div>
          )}

          {current.key === 'clip' && (
            <div className="space-y-5">
              <ToggleRow
                on={clipOn}
                onToggle={() => setClipOn((v) => !v)}
                label="Turn on Clip-to-Earn"
                hint="Clippers post clips of your content with tracked links and earn a cut of the subs they convert."
              />
              {clipOn && (
                <>
                  <OptionSelect
                    value={clipPresetId}
                    onChange={(v) => setClipPresetId(v)}
                    options={CLIPPER_RAMP_PRESETS.map((p) => ({
                      value: p.id,
                      label: p.label,
                      hint:
                        p.steps.length > 0
                          ? `${p.steps.map((s) => `${s.percent}% for ${s.days} days`).join(' → ')} → your standard rate`
                          : p.description,
                    }))}
                  />
                  <div>
                    <label className="block text-sm font-medium text-crwn-text mb-2">Standard rate (after the ramp ends)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        inputMode="numeric"
                        value={clipStandardRate}
                        onChange={(e) => setClipStandardRate(e.target.value)}
                        className="w-24 bg-crwn-surface border border-crwn-elevated rounded-xl px-3 py-3 text-lg text-crwn-text focus:outline-none focus:border-crwn-gold"
                      />
                      <span className="text-crwn-text-secondary">%</span>
                    </div>
                    <p className="text-xs text-crwn-text-secondary mt-2">We suggest 10%.</p>
                  </div>
                  <p className="text-xs text-crwn-gold/80">Publishing with a ramp (re)starts your clipper campaign clock from today.</p>
                </>
              )}
              <p className="text-xs text-crwn-text-secondary">{ARTIST_WIDE_NOTE}</p>
            </div>
          )}

          {current.key === 'review' && (
            <div className="space-y-6">
              <div className="border border-crwn-elevated rounded-2xl divide-y divide-crwn-elevated">
                <ReviewRow label="Offer" value={offerType === 'subscription' ? 'Subscription (recurring)' : 'One-time'} />
                <ReviewRow
                  label={offerType === 'subscription' ? 'Tier name' : 'Title'}
                  value={offerType === 'subscription' ? tierName : productTitle}
                />
                <ReviewRow
                  label="Price"
                  value={`$${(Math.round(parseFloat(price || '0') * 100) / 100).toFixed(2)}${offerType === 'subscription' ? '/mo' : ''}`}
                />
                {offerType === 'subscription' ? (
                  <ReviewRow label="Benefits" value={benefits.length > 0 ? benefits.join(' · ') : 'None yet'} />
                ) : selectedGoal?.askKind ? (
                  <ReviewRow label="Kind" value={productType === 'digital' ? 'Digital download' : 'Physical / merch'} />
                ) : null}
                {deliversFile && <ReviewRow label="File" value={productFileName || 'No file'} />}
                {offerType === 'subscription' && (
                  <>
                    <ReviewRow
                      label="Share-to-Earn"
                      value={shareOn ? `On: ${Math.round(Number(sharePercent))}% referral commission` : 'Off'}
                    />
                    <ReviewRow
                      label="Clip-to-Earn"
                      value={
                        clipOn
                          ? clipPreset.steps.length > 0
                            ? `On: ${clipPreset.steps.map((s) => `${s.percent}%`).join(' → ')} → ${Math.round(Number(clipStandardRate))}% standard`
                            : `On: flat ${Math.round(Number(clipStandardRate))}%`
                          : 'Off'
                      }
                    />
                  </>
                )}
              </div>

              {(shareOn || clipOn) && <p className="text-xs text-crwn-text-secondary">{ARTIST_WIDE_NOTE}</p>}

              <div className="bg-crwn-gold/5 border border-crwn-gold/20 rounded-2xl p-4">
                <p className="text-sm font-semibold text-crwn-gold mb-2">What CRWN sets up</p>
                <ul className="space-y-1.5 text-sm text-crwn-text-secondary">
                  <li className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                    {offerType === 'subscription'
                      ? 'Your membership tier, live on your page (Stripe prices are added automatically when you connect Stripe)'
                      : deliversFile
                        ? 'Your product, live in your shop. The file is attached and ready to sell'
                        : 'Your product, live in your shop (add the file or shipping details from the Shop tab)'}
                  </li>
                  {shareOn && (
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                      Auto share links for fans, paying {Math.round(Number(sharePercent))}% on referred subs
                    </li>
                  )}
                  {clipOn && (
                    <li className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-crwn-gold mt-0.5 flex-shrink-0" />
                      The clipper commission ladder + tracked Clip &amp; Earn links on your page
                    </li>
                  )}
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
              {publishing ? 'Publishing…' : isLast ? 'Publish offer' : 'Continue'}
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

function BenefitPicker({ selected, onChange }: { selected: string[]; onChange: (v: string[]) => void }) {
  const [custom, setCustom] = useState('');
  const toggle = (b: string) => onChange(selected.includes(b) ? selected.filter((x) => x !== b) : [...selected, b]);
  const addCustom = () => {
    const v = custom.trim();
    if (v && !selected.includes(v)) onChange([...selected, v]);
    setCustom('');
  };
  const extras = selected.filter((b) => !BENEFIT_SUGGESTIONS.includes(b));
  const chips = [...BENEFIT_SUGGESTIONS, ...extras];
  return (
    <div>
      <p className="text-sm font-medium text-crwn-text mb-2">What do members get?</p>
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

function DoneScreen({
  offerType,
  onOffers,
  onDashboard,
}: {
  offerType: OfferType;
  onOffers: () => void;
  onDashboard: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg text-center page-fade-in">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-crwn-gold/15 flex items-center justify-center">
          <PartyPopper className="w-9 h-9 text-crwn-gold" />
        </div>
        <h1 className="text-3xl font-bold text-crwn-text mb-2">Your offer is live 🎉</h1>
        <p className="text-crwn-text-secondary mb-8">
          {offerType === 'subscription'
            ? 'Your membership tier is on your page. Now put the link everywhere fans already watch you.'
            : 'Your offer is in your shop. Now put the link everywhere fans already watch you.'}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onOffers}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-crwn-gold text-crwn-bg font-semibold px-8 py-3 rounded-full hover:bg-crwn-gold/90 transition-colors"
          >
            View My Offers
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

export default function NewOfferPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-crwn-gold" />
        </div>
      }
    >
      <OfferBuilder />
    </Suspense>
  );
}
