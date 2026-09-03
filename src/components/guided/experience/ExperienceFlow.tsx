'use client';

// "Show fans why the paid tier is worth it": the V1 Offer Builder as a guided flow.
//
// A structured writer over the existing Tier Offer Experience contract. CRWN owns the layout
// (the one renderer every artist shares); the artist supplies truthful content one decision at
// a time. Everything CRWN already knows is pre-filled: the tier from the funnel, the promise
// from the tier, the benefits and their readiness from the registry, the artwork the artist
// already publishes. Publish writes through /api/tier-offer-experiences, which validates with
// the same normalizer the drop page reads through. In-flight text lives in the browser; the
// published row is the only canonical state.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/shared/Toast';
import { useAuth } from '@/hooks/useAuth';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { TierOfferExperience } from '@/components/offer/TierOfferExperience';
import { normalizeOfferExperience } from '@/lib/offerExperience/normalize';
import { refusalReason } from '@/lib/offerExperience/refusal';
import { OFFER_LIMITS, type TierOfferExperience as OfferConfig } from '@/lib/offerExperience/types';
import { benefitDelivery, type BenefitType } from '@/lib/benefitRegistry';
import { STATE_COPY, type DeliveryRow } from '@/lib/benefitReadiness';
import { deriveOfferTiers } from '@/lib/fanAutomations/offerTiers';
import { guidedSetupTelemetry } from '@/lib/guidedSetup/telemetry';
import type { GuidedFlowProps } from '../types';
import { GuidedShell, FIELD, Why } from '../GuidedShell';
import {
  buildConfig,
  canContinue,
  canUseReal,
  defaultDecision,
  draftFaqs,
  mediaCandidates,
  previewableBenefits,
  resumeIndex,
  suggestCtas,
  suggestDescription,
  suggestPromise,
  visibleSteps,
  type BenefitFacts,
  type ExperienceState,
  type MediaCandidate,
  type PreviewChoice,
} from './experienceSteps';

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
const draftKey = (tierId: string) => `crwn_experience_draft_${tierId}`;

type Draft = Pick<ExperienceState, 'promise' | 'description' | 'cta' | 'decisions' | 'vslUrl' | 'faqs'> & { index: number };

export default function ExperienceFlow({ context, entry }: GuidedFlowProps) {
  const router = useRouter();
  const { user } = useAuth();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { showToast } = useToast();

  const [loaded, setLoaded] = useState(false);
  const [tier, setTier] = useState<ExperienceState['tier']>(null);
  const [benefits, setBenefits] = useState<BenefitFacts[]>([]);
  const [media, setMedia] = useState<MediaCandidate[]>([]);
  const [artistName, setArtistName] = useState('This artist');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasPublished, setHasPublished] = useState(false);
  const [inheritedFrom, setInheritedFrom] = useState<ExperienceState['inheritedFrom']>(null);

  const [promise, setPromise] = useState('');
  const [description, setDescription] = useState('');
  const [cta, setCta] = useState('');
  const [decisions, setDecisions] = useState<ExperienceState['decisions']>({});
  const [vslUrl, setVslUrl] = useState('');
  const [faqs, setFaqs] = useState<ExperienceState['faqs']>([]);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // ---- Load everything CRWN already knows, once. ----
  useEffect(() => {
    let active = true;
    (async () => {
      const paid = context.tiers.filter((t) => t.price > 0);
      // The tier: the pointer, else the funnel's primary, else the ladder derivation.
      let tierId = entry.tierId && paid.some((t) => t.id === entry.tierId) ? entry.tierId : null;
      if (!tierId) {
        try {
          const list = await fetch(`/api/fan-automations?artistId=${context.artistId}`).then((r) => (r.ok ? r.json() : null));
          const rows: { status: string; gold_tier_id: string | null }[] = list?.automations ?? [];
          const live = rows.find((r) => r.status === 'active') ?? rows[0];
          if (live?.gold_tier_id && paid.some((t) => t.id === live.gold_tier_id)) tierId = live.gold_tier_id;
        } catch {
          /* derivation below */
        }
      }
      if (!tierId) tierId = deriveOfferTiers(paid.map((t) => ({ id: t.id, name: t.name, price: t.price }))).gold?.id ?? null;

      const [readiness, existing, tierRow, profile, artistRow, tracks] = await Promise.all([
        fetch('/api/tier-benefits/readiness').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch('/api/tier-offer-experiences').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        tierId ? supabase.from('subscription_tiers').select('id, name, price, description').eq('id', tierId).maybeSingle() : Promise.resolve({ data: null }),
        user ? supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from('artist_profiles').select('banner_url').eq('id', context.artistId).maybeSingle(),
        supabase.from('tracks').select('id, title, album_art_url, is_free, allowed_tier_ids, is_active').eq('artist_id', context.artistId),
      ]);
      if (!active) return;

      const t = tierRow.data ? { id: tierRow.data.id, name: tierRow.data.name, price: Number(tierRow.data.price) || 0, description: tierRow.data.description } : null;
      setTier(t);
      const trackRows = (tracks.data || []) as { id: string; title: string; album_art_url: string | null; is_free: boolean | null; allowed_tier_ids: string[] | null; is_active: boolean | null }[];
      const gatedTitles = t
        ? trackRows.filter((x) => x.is_active !== false && x.is_free === false && Array.isArray(x.allowed_tier_ids) && x.allowed_tier_ids.includes(t.id)).map((x) => x.title)
        : [];
      const rows: DeliveryRow[] = readiness?.rows ?? [];
      const mine = t ? rows.filter((r) => r.tierId === t.id) : [];
      setBenefits(mine.map((r) => ({ benefit: r.benefit as BenefitType, state: r.state, fact: r.fact, gatedTrackTitles: gatedTitles })));
      // Cheaper tiers' benefits, merchandised as the inherited-value strip.
      const below = t ? rows.filter((r) => r.tierId !== t.id && (readiness?.tiers ?? []).some((x: { id: string; price: number }) => x.id === r.tierId && x.price < t.price)) : [];
      const items = [...new Set(below.map((r) => r.label))].slice(0, OFFER_LIMITS.maxInherited);
      setInheritedFrom(items.length ? { heading: 'Also included from the tiers below', items } : null);

      setArtistName((profile.data?.display_name as string) || 'This artist');
      setAvatarUrl((profile.data?.avatar_url as string) || null);
      setMedia(mediaCandidates({
        avatarUrl: (profile.data?.avatar_url as string) || null,
        bannerUrl: (artistRow.data?.banner_url as string) || null,
        albumArt: trackRows.map((x) => ({ title: x.title, url: x.album_art_url })),
      }));

      // Published row: prefill from it. Browser draft: wins over both (in-flight text).
      const published = t ? (existing?.experiences ?? []).find((e: { tier_id: string; is_active: boolean }) => e.tier_id === t.id && e.is_active !== false) : null;
      const cfg = published ? normalizeOfferExperience(published.config, t?.name) : null;
      setHasPublished(!!cfg);
      let draft: Draft | null = null;
      try {
        const raw = t ? localStorage.getItem(draftKey(t.id)) : null;
        draft = raw ? (JSON.parse(raw) as Draft) : null;
      } catch {
        draft = null;
      }
      const base: ExperienceState = { tier: t, benefits: mine.map((r) => ({ benefit: r.benefit as BenefitType, state: r.state, fact: r.fact, gatedTrackTitles: gatedTitles })), promise: '', description: '', cta: '', decisions: {}, vslUrl: '', faqs: [], inheritedFrom: null };
      setPromise(draft?.promise ?? cfg?.promise ?? suggestPromise(base));
      setDescription(draft?.description ?? cfg?.description ?? suggestDescription(base));
      setCta(draft?.cta ?? cfg?.cta ?? '');
      setVslUrl(draft?.vslUrl ?? cfg?.vsl?.url ?? '');
      setFaqs(draft?.faqs ?? cfg?.faqs ?? draftFaqs(base));
      const initial: ExperienceState['decisions'] = {};
      for (const b of previewableBenefits(base.benefits)) initial[b.benefit] = draft?.decisions?.[b.benefit] ?? defaultDecision(b);
      setDecisions(initial);
      setLoaded(true);
      if (draft && Number.isFinite(draft.index)) setIndex(Math.max(0, draft.index));
      else setIndex(-1); // resolved below once steps exist
    })();
    return () => {
      active = false;
    };
  }, [context.artistId, context.tiers, entry.tierId, supabase, user]);

  const state: ExperienceState = useMemo(
    () => ({ tier, benefits, promise, description, cta, decisions, vslUrl, faqs, inheritedFrom }),
    [tier, benefits, promise, description, cta, decisions, vslUrl, faqs, inheritedFrom],
  );
  const steps = useMemo(() => visibleSteps(state), [state]);
  const resolvedIndex = index < 0 ? resumeIndex(steps, state, hasPublished) : Math.min(index, steps.length - 1);
  const step = steps[resolvedIndex];

  // In-flight text lives in the browser; the published row is the only canonical state.
  const persist = useCallback(
    (i: number) => {
      if (!tier) return;
      try {
        const d: Draft = { promise, description, cta, decisions, vslUrl, faqs, index: i };
        localStorage.setItem(draftKey(tier.id), JSON.stringify(d));
      } catch {
        /* private mode */
      }
    },
    [tier, promise, description, cta, decisions, vslUrl, faqs],
  );

  const go = (i: number) => {
    setIndex(i);
    persist(i);
  };

  const publish = async () => {
    if (!tier) return;
    const config = buildConfig(state);
    const reason = refusalReason(config, tier.name);
    if (reason) {
      showToast(reason, 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/tier-offer-experiences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tierId: tier.id, config }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not publish. Try again.', 'error');
        return;
      }
      try {
        localStorage.removeItem(draftKey(tier.id));
      } catch {
        /* ignore */
      }
      guidedSetupTelemetry.completed({ flow: 'experience', artistId: context.artistId, step: steps.length, totalSteps: steps.length });
      showToast('Your sales page is live on your funnel link.', 'success');
      router.push(entry.returnTo);
    } finally {
      setSaving(false);
    }
  };

  const setDecision = (benefit: BenefitType, patch: Partial<ExperienceState['decisions'][string]>) =>
    setDecisions((d) => ({ ...d, [benefit]: { ...(d[benefit] ?? { benefit, choice: 'example', title: '', description: '', mediaUrl: null }), ...patch } }));

  if (!loaded || !step) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-crwn-gold border-t-transparent rounded-full animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!tier) {
    return (
      <GuidedShell flow="experience" artistId={context.artistId} returnTo={entry.returnTo} steps={[{ id: 'none' }]} index={0} title="Build your offer first" subtitle="A sales page sells a paid tier, and there is none yet." onContinue={() => router.push(`/build/offer?returnTo=${encodeURIComponent(entry.returnTo)}`)} continueLabel="Build my offer">
        <Why>The page CRWN builds here shows fans what a paid tier gets them. Once the tier exists, this flow fills itself in from it.</Why>
      </GuidedShell>
    );
  }

  const previewConfig: OfferConfig | null = normalizeOfferExperience(buildConfig(state), tier.name);
  const facts = step.benefit ? benefits.find((b) => b.benefit === step.benefit) : undefined;
  const def = step.benefit ? benefitDelivery(step.benefit) : undefined;
  const decision = step.benefit ? decisions[step.benefit] : undefined;

  return (
    <GuidedShell
      flow="experience"
      artistId={context.artistId}
      returnTo={entry.returnTo}
      steps={steps.map((s, i) => ({ id: `${s.key}-${i}`, group: s.group }))}
      index={resolvedIndex}
      title={step.title}
      subtitle={step.subtitle}
      onBack={resolvedIndex > 0 ? () => go(resolvedIndex - 1) : undefined}
      onContinue={() => (step.key === 'publish' ? void publish() : go(Math.min(steps.length - 1, resolvedIndex + 1)))}
      continueLabel={step.key === 'publish' ? 'Publish my sales page' : 'Continue'}
      continueDisabled={!canContinue(step, state)}
      continueLoading={saving}
      onSkip={step.key === 'vsl' || step.key === 'faq' ? () => { if (step.key === 'faq') setFaqs([]); if (step.key === 'vsl') setVslUrl(''); go(resolvedIndex + 1); } : undefined}
      skipLabel={step.key === 'faq' ? 'No FAQ' : 'No video'}
    >
      {step.key === 'promise' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1">The promise</label>
            <input className={FIELD} maxLength={OFFER_LIMITS.promise} value={promise} onChange={(e) => setPromise(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1">A line or two under it</label>
            <textarea className={`${FIELD} min-h-[90px] text-base`} maxLength={OFFER_LIMITS.description} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <Why>Pre-filled from your offer. Fans read this above the price, before anything else.</Why>
        </div>
      )}

      {step.key === 'cta' && (
        <div className="space-y-3">
          <OptionSelect
            options={[...suggestCtas(benefits, tier.name).map((c) => ({ value: c, label: c })), { value: '__own', label: 'Write my own' }]}
            value={cta && suggestCtas(benefits, tier.name).includes(cta) ? cta : cta ? '__own' : null}
            onChange={(v) => setCta(v === '__own' ? '' : v)}
            placeholder="Pick a button"
          />
          <input className={FIELD} maxLength={OFFER_LIMITS.cta} value={cta} onChange={(e) => setCta(e.target.value)} placeholder="What the fan gets by pressing it" />
          {cta.trim() && !canContinue(step, state) && (
            <p className="text-sm text-crwn-gold">Say what they get. Join, Subscribe, Upgrade and the tier name are refused.</p>
          )}
          <Why>The tier and the price sit beside the button. The button answers one question: what do I get?</Why>
        </div>
      )}

      {step.key === 'benefits' && (
        <div className="space-y-2">
          {benefits.length === 0 && <p className="text-sm text-crwn-text-secondary">This tier promises nothing yet. Go back to Build your offer and pick what fans get.</p>}
          {benefits.map((b) => {
            const d = benefitDelivery(b.benefit);
            if (!d) return null;
            return (
              <div key={b.benefit} className="rounded-xl border border-crwn-elevated p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-crwn-text">{d.label}</p>
                  <p className="text-xs text-crwn-text-secondary mt-0.5">{b.fact}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-full shrink-0 ${canUseReal(b.state) ? 'bg-crwn-gold/15 text-crwn-gold' : 'bg-crwn-elevated text-crwn-text-secondary'}`}>{STATE_COPY[b.state]}</span>
              </div>
            );
          })}
          <Why>Each CRWN-delivered benefit gets its own screen next: a real thing, your artwork, or a labelled example.</Why>
        </div>
      )}

      {step.key === 'preview-benefit' && def && decision && facts && (
        <div className="space-y-4">
          <OptionSelect
            options={[
              ...(canUseReal(facts.state) ? [{ value: 'real', label: 'Show the real thing', hint: facts.fact }] : []),
              ...(media.length ? [{ value: 'media', label: 'Use my artwork', hint: 'A photo or cover you already publish' }] : []),
              { value: 'example', label: 'Show a labelled example', hint: 'Fans see an "Example experience" chip on it' },
              { value: 'skip', label: 'Leave it as words', hint: 'It stays in the list, with no preview' },
            ]}
            value={decision.choice}
            onChange={(v) => setDecision(def.key, { choice: v as PreviewChoice })}
            placeholder="How should fans see it?"
          />
          {decision.choice === 'media' && (
            <OptionSelect
              options={media.map((m) => ({ value: m.url, label: m.label }))}
              value={decision.mediaUrl}
              onChange={(v) => setDecision(def.key, { mediaUrl: v })}
              placeholder="Pick the artwork"
            />
          )}
          {decision.choice !== 'skip' && (
            <>
              <input className={FIELD} maxLength={OFFER_LIMITS.previewTitle} value={decision.title} onChange={(e) => setDecision(def.key, { title: e.target.value })} placeholder={def.label} />
              <textarea className={`${FIELD} min-h-[80px] text-base`} maxLength={OFFER_LIMITS.previewDescription} value={decision.description} onChange={(e) => setDecision(def.key, { description: e.target.value })} placeholder={decision.choice === 'real' ? facts.fact : def.fanMeaning} />
            </>
          )}
          <Why>
            {canUseReal(facts.state)
              ? 'The real thing exists, so showing it is the strongest option. An example is honest too; it just says so.'
              : 'Nothing real exists for this yet, so an example is the honest choice. Fans see the chip, and you can switch it to the real thing later.'}
          </Why>
        </div>
      )}

      {step.key === 'vsl' && (
        <div>
          <input className={FIELD} value={vslUrl} onChange={(e) => setVslUrl(e.target.value)} placeholder="https://" inputMode="url" />
          <Why>A public link to a video you already host. Anything private or signed is dropped, and no video shows nothing, which is honest.</Why>
        </div>
      )}

      {step.key === 'faq' && (
        <div className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="rounded-xl border border-crwn-elevated p-3 space-y-2">
              <input className={`${FIELD} text-base py-3`} maxLength={OFFER_LIMITS.faqQ} value={f.q} onChange={(e) => setFaqs((all) => all.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))} />
              <textarea className={`${FIELD} min-h-[70px] text-base py-3`} maxLength={OFFER_LIMITS.faqA} value={f.a} onChange={(e) => setFaqs((all) => all.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))} />
              <button type="button" onClick={() => setFaqs((all) => all.filter((_, j) => j !== i))} className="text-xs text-crwn-text-secondary press-scale">Remove</button>
            </div>
          ))}
          {faqs.length < OFFER_LIMITS.maxFaqs && (
            <button type="button" onClick={() => setFaqs((all) => [...all, { q: '', a: '' }])} className="text-sm text-crwn-gold press-scale">Add a question</button>
          )}
          <Why>Drafted from facts CRWN can stand behind: nothing promises a cadence or a result. Edit freely; the honesty rules stay.</Why>
        </div>
      )}

      {step.key === 'preview' && (
        <div className="-mx-4 sm:mx-0">
          {previewConfig ? (
            <div className="rounded-2xl overflow-hidden border border-crwn-elevated">
              <TierOfferExperience
                artist={{ name: artistName, avatarUrl }}
                tier={{ id: tier.id, name: tier.name, priceCents: tier.price }}
                config={previewConfig}
                price={money}
                actionSlot={
                  <div className="w-full py-3 rounded-full text-sm font-semibold bg-crwn-gold text-crwn-bg text-center opacity-80" aria-disabled="true">
                    {previewConfig.cta}
                  </div>
                }
              />
            </div>
          ) : (
            <p className="text-sm text-crwn-gold">{refusalReason(buildConfig(state), tier.name)}</p>
          )}
        </div>
      )}

      {step.key === 'publish' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-crwn-elevated p-4">
            <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-1">Selling</p>
            <p className="text-sm text-crwn-text">{tier.name}, {money(tier.price)} a month</p>
          </div>
          <div className="rounded-xl border border-crwn-elevated p-4">
            <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-1">Previews</p>
            <p className="text-sm text-crwn-text">
              {buildConfig(state).previews.length} shown, {buildConfig(state).previews.filter((p) => p.truth === 'example').length} labelled as examples
            </p>
          </div>
          <Why>Publishing replaces the compact card on your funnel link with this page. You can come back and change any decision; the page updates the moment you publish again.</Why>
        </div>
      )}
    </GuidedShell>
  );
}
