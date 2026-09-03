'use client';

// "Build your offer": the guided flow behind Rise Mode's first revenue move.
//
// The artist decides what kind of experience paying fans get, what they actually get, whether
// they can keep it up, the one-line promise, and whether there is a cheaper way in. CRWN
// pre-fills the tier from the pointer or the ladder, the benefit rows and promise from the tier
// itself, and the downsell from the recommended ladder. Everything written goes through the
// rows TierManager already owns: subscription_tiers.description, tier_benefits through
// /api/tier-benefits (which syncs the Promise Calendar), and applyTemplateTier for a new rung.
// No draft table: the tier is the draft, and resume reads it back (offerSteps.resumeIndex).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { usePlatformLimits } from '@/hooks/usePlatformLimits';
import { OptionSelect } from '@/components/ui/OptionSelect';
import { TierBenefitsSelector, type InheritedBenefit, type SelectedBenefit } from '@/components/artist/TierBenefitsSelector';
import { applyTemplateTier } from '@/lib/applyTierTemplate';
import { TIER_TEMPLATE_MAP, benefitLabels } from '@/lib/tierTemplate';
import { benefitDelivery, PILLAR_COPY, PILLAR_ORDER, type BenefitPillar } from '@/lib/benefitRegistry';
import { getBenefitDisplayText } from '@/lib/benefitCatalog';
import { guidedSetupTelemetry } from '@/lib/guidedSetup/telemetry';
import type { GuidedFlowProps } from '../types';
import { GuidedShell, FIELD, Why } from '../GuidedShell';
import {
  canContinue,
  defaultDownsell,
  defaultTierId,
  NAME_MAX,
  priceCentsOf,
  PROMISE_MAX,
  resumeIndex,
  selectedTier,
  suggestPromise,
  visibleSteps,
  workloadFor,
  type DraftBenefit,
  type OfferState,
  type OfferTierRow,
} from './offerSteps';

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

async function syncTierProduct(tierId: string) {
  try {
    await fetch('/api/stripe/sync-tier-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tierId }),
    });
  } catch {
    /* the tier is saved; Stripe copy can lag */
  }
}

export default function OfferFlow({ context, entry }: GuidedFlowProps) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { showToast } = useToast();
  const { limits, usage, loading: limitsLoading } = usePlatformLimits(context.artistId);

  const [loaded, setLoaded] = useState(false);
  const [tiers, setTiers] = useState<OfferTierRow[]>([]);
  const [allBenefits, setAllBenefits] = useState<(DraftBenefit & { tier_id: string })[]>([]);
  const [stripeConnected, setStripeConnected] = useState(false);

  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [tierPreselected, setTierPreselected] = useState(false);
  const [creating, setCreating] = useState<{ name: string; priceDollars: string } | null>(null);
  const [pillar, setPillar] = useState<BenefitPillar | null>(null);
  const [benefits, setBenefits] = useState<DraftBenefit[]>([]);
  const [promise, setPromise] = useState('');
  const [wantsDownsell, setWantsDownsell] = useState<boolean | null>(null);
  const [downsell, setDownsell] = useState({ name: 'Silver', priceDollars: '10' });
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  // ---- Load the canonical rows once. The tier is the draft. ----
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: rows } = await supabase
        .from('subscription_tiers')
        .select('id, name, price, description')
        .eq('artist_id', context.artistId)
        .eq('is_active', true)
        .order('price', { ascending: true });
      const list: OfferTierRow[] = (rows || []).map((t) => ({ id: t.id, name: t.name, price: Number(t.price) || 0, description: t.description }));
      const ids = list.map((t) => t.id);
      let brows: (DraftBenefit & { tier_id: string })[] = [];
      if (ids.length) {
        const { data } = await supabase
          .from('tier_benefits')
          .select('tier_id, benefit_type, config, sort_order')
          .in('tier_id', ids)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        brows = (data || []).map((b) => ({ tier_id: b.tier_id, benefit_type: b.benefit_type, config: (b.config as Record<string, unknown>) || {}, sort_order: b.sort_order ?? 0 }));
      }
      let stripe = false;
      try {
        const res = await fetch('/api/stripe/connect/status');
        if (res.ok) stripe = !!(await res.json()).chargesEnabled;
      } catch {
        /* cosmetic here: only decides whether a new rung gets a price now or on connect */
      }
      if (!active) return;
      setTiers(list);
      setAllBenefits(brows);
      setStripeConnected(stripe);

      const chosen = defaultTierId(list, entry.tierId);
      const paid = list.filter((t) => t.price > 0);
      setSelectedTierId(chosen);
      setTierPreselected(!!chosen && (paid.length === 1 || !!entry.tierId));
      if (paid.length === 0) {
        // A claimed calculator's suggestion wins over the template default, exactly as the
        // legacy builder honoured it. Suggestions only; the artist edits both on the screen.
        const vault = TIER_TEMPLATE_MAP.vault;
        setCreating({
          name: entry.prefill.tierName ?? vault.name,
          priceDollars: entry.prefill.priceDollars ?? String(vault.priceCents / 100),
        });
      }
      const mine = chosen ? brows.filter((b) => b.tier_id === chosen).map(({ tier_id: _t, ...b }) => b) : [];
      setBenefits(mine);
      const sel = list.find((t) => t.id === chosen);
      setPromise((sel?.description || '').trim().slice(0, PROMISE_MAX));
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [supabase, context.artistId, entry.tierId, entry.prefill.tierName, entry.prefill.priceDollars]);

  const canAddPaidTier = !limitsLoading && (limits.fanTiers === -1 || usage.fanTiers < limits.fanTiers);

  const state: OfferState = useMemo(
    () => ({ tiers, selectedTierId, tierPreselected, creating, pillar, benefits, promise, wantsDownsell, downsell, canAddPaidTier }),
    [tiers, selectedTierId, tierPreselected, creating, pillar, benefits, promise, wantsDownsell, downsell, canAddPaidTier],
  );
  const steps = useMemo(() => visibleSteps(state), [state]);
  const safeIndex = Math.min(index, steps.length - 1);
  const step = steps[safeIndex];

  // Resume at the first open decision, once, after the rows arrive.
  const resumed = useRef(false);
  useEffect(() => {
    if (!loaded || resumed.current) return;
    resumed.current = true;
    setIndex(resumeIndex(steps, state));
    setDownsell(defaultDownsell(state));
  }, [loaded, steps, state]);

  // When the artist changes the tier on the first screen, the benefits and promise follow it.
  const pickTier = useCallback(
    (id: string) => {
      setSelectedTierId(id);
      const mine = allBenefits.filter((b) => b.tier_id === id).map(({ tier_id: _t, ...b }) => b);
      setBenefits(mine);
      setPromise((tiers.find((t) => t.id === id)?.description || '').trim().slice(0, PROMISE_MAX));
    },
    [allBenefits, tiers],
  );

  const inherited: InheritedBenefit[] = useMemo(() => {
    const sel = selectedTier(state);
    const primaryCents = sel ? sel.price : creating ? priceCentsOf(creating.priceDollars) : 0;
    const cheaper = tiers.filter((t) => (sel ? t.id !== sel.id : true) && t.price < primaryCents).sort((a, b) => a.price - b.price);
    const seen = new Map<string, string>();
    for (const t of cheaper) {
      for (const b of allBenefits.filter((x) => x.tier_id === t.id)) if (!seen.has(b.benefit_type)) seen.set(b.benefit_type, t.name);
    }
    return [...seen.entries()].map(([benefit_type, fromTierName]) => ({ benefit_type, fromTierName }));
  }, [state, creating, tiers, allBenefits]);

  const goBack = () => setIndex((i) => Math.max(0, i - 1));

  const advance = async () => {
    if (!step) return;
    if (step.key === 'promise' && !promise.trim()) setPromise(suggestPromise(state));
    if (step.key !== 'review') {
      setIndex((i) => Math.min(steps.length - 1, i + 1));
      return;
    }
    await save();
  };

  const save = async () => {
    setSaving(true);
    try {
      let tierId = selectedTierId;
      const promiseLine = (promise.trim() || suggestPromise(state)).slice(0, PROMISE_MAX);
      const rows = benefits.map((b, i) => ({ benefit_type: b.benefit_type, config: b.config || {}, sort_order: i }));

      if (!tierId && creating) {
        const res = await applyTemplateTier(supabase, {
          artistId: context.artistId,
          stripeConnected,
          def: TIER_TEMPLATE_MAP.vault,
          name: creating.name.trim().slice(0, NAME_MAX),
          priceCents: priceCentsOf(creating.priceDollars),
          description: promiseLine,
          benefits: [],
          structuredOverride: rows,
        });
        if (res.error || !res.tierId) throw new Error(res.error || 'Could not create the tier.');
        tierId = res.tierId;
      } else if (tierId) {
        const { error } = await supabase.from('subscription_tiers').update({ description: promiseLine }).eq('id', tierId);
        if (error) throw error;
        const res = await fetch('/api/tier-benefits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier_id: tierId, benefits: rows }),
        });
        if (!res.ok) throw new Error('Could not save what fans get.');
        void syncTierProduct(tierId);
      }

      if (wantsDownsell === true && steps.some((s) => s.key === 'downsell-price')) {
        const def = TIER_TEMPLATE_MAP.inner_circle;
        const res = await applyTemplateTier(supabase, {
          artistId: context.artistId,
          stripeConnected,
          def,
          name: downsell.name.trim().slice(0, NAME_MAX),
          priceCents: priceCentsOf(downsell.priceDollars),
          description: def.description,
          benefits: benefitLabels(def),
        });
        if (res.error) throw new Error(res.error);
      }

      guidedSetupTelemetry.completed({ flow: 'offer', artistId: context.artistId, step: steps.length, totalSteps: steps.length });
      showToast('Your offer is saved.', 'success');
      router.push(entry.returnTo);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save. Try again.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded || !step) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-crwn-gold border-t-transparent rounded-full animate-spin" aria-label="Loading" />
      </div>
    );
  }

  const sel = selectedTier(state);
  const workload = workloadFor(benefits);
  const paidTiers = tiers.filter((t) => t.price > 0);

  return (
    <GuidedShell
      flow="offer"
      artistId={context.artistId}
      returnTo={entry.returnTo}
      steps={steps.map((s) => ({ id: s.key, group: s.group }))}
      index={safeIndex}
      title={step.title}
      subtitle={step.subtitle}
      onBack={safeIndex > 0 ? goBack : undefined}
      onContinue={advance}
      continueLabel={step.key === 'review' ? 'Save my offer' : step.key === 'workload' ? 'I can keep this up' : 'Continue'}
      continueDisabled={!canContinue(step.key, state)}
      continueLoading={saving}
      onSkip={step.key === 'downsell' ? () => { setWantsDownsell(false); setIndex((i) => i + 1); } : undefined}
      skipLabel="Not now"
    >
      {step.key === 'tier' && (
        <div>
          <OptionSelect
            options={paidTiers.map((t) => ({ value: t.id, label: t.name, hint: `${money(t.price)} a month` }))}
            value={selectedTierId}
            onChange={pickTier}
            placeholder="Choose the paid tier"
          />
          <Why>Your link leads with this one. The others stay exactly as they are.</Why>
        </div>
      )}

      {step.key === 'create' && creating && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1">Tier name</label>
            <input className={FIELD} maxLength={NAME_MAX} value={creating.name} onChange={(e) => setCreating({ ...creating, name: e.target.value })} placeholder="Gold" />
          </div>
          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1">Price per month, in dollars</label>
            <input className={FIELD} inputMode="decimal" value={creating.priceDollars} onChange={(e) => setCreating({ ...creating, priceDollars: e.target.value })} placeholder="25" />
          </div>
          <Why>{stripeConnected ? 'CRWN creates the Stripe price now.' : 'CRWN creates the Stripe price the moment you connect Stripe. Nothing to do here.'}</Why>
        </div>
      )}

      {step.key === 'pillar' && (
        <div>
          <OptionSelect
            options={PILLAR_ORDER.map((p) => ({ value: p, label: PILLAR_COPY[p].title, hint: PILLAR_COPY[p].line }))}
            value={pillar}
            onChange={(v) => setPillar(v as BenefitPillar)}
            placeholder="Choose the kind of experience"
          />
          <Why>CRWN puts that kind first on the next screen. Every option stays available.</Why>
        </div>
      )}

      {step.key === 'benefits' && (
        <div>
          <TierBenefitsSelector
            // The parent's draft is the selector's initial state, so leaving this screen and
            // coming back (or resuming) shows what was chosen, not what the row held on load.
            initialBenefits={benefits as SelectedBenefit[]}
            onChange={(next) => setBenefits(next.map((b) => ({ benefit_type: b.benefit_type, config: b.config || {}, sort_order: b.sort_order })))}
            inherited={inherited}
            pillarFirst={pillar}
          />
        </div>
      )}

      {step.key === 'workload' && (
        <div className="space-y-4">
          {workload.recurring.length > 0 && (
            <div className="rounded-xl border border-crwn-elevated p-4">
              <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-2">On a schedule</p>
              <ul className="space-y-1.5">
                {workload.recurring.map((r) => (
                  <li key={r.label} className="text-sm text-crwn-text flex justify-between gap-3">
                    <span>{r.label}</span>
                    <span className="text-crwn-text-secondary">{r.cadence}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-crwn-text mt-3">That is {workload.label}. CRWN puts each one on your Promise Calendar and reminds you before it is due.</p>
            </div>
          )}
          {workload.manual.length > 0 && (
            <div className="rounded-xl border border-crwn-elevated p-4">
              <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-2">You deliver by hand</p>
              <ul className="space-y-1.5">
                {workload.manual.map((m) => (
                  <li key={m} className="text-sm text-crwn-text">{m}</li>
                ))}
              </ul>
              <p className="text-sm text-crwn-text-secondary mt-3">CRWN prints these on your card and cannot check them. Only promise what you can keep.</p>
            </div>
          )}
          <Why>Go back to change a cadence or drop a promise. Fans renew for what arrives, not for what was listed.</Why>
        </div>
      )}

      {step.key === 'promise' && (
        <div>
          <textarea
            className={`${FIELD} min-h-[110px] text-base`}
            maxLength={PROMISE_MAX}
            value={promise}
            onChange={(e) => setPromise(e.target.value)}
            placeholder={suggestPromise(state) || 'Hear the songs before anyone else and help pick the next single'}
          />
          <p className="text-xs text-crwn-text-secondary mt-1 text-right">{promise.length}/{PROMISE_MAX}</p>
          <Why>Say the outcome, not the tier name. This line becomes your sales page promise, so you write it once.</Why>
        </div>
      )}

      {step.key === 'downsell' && (
        <div>
          <OptionSelect
            options={[
              { value: 'yes', label: 'Yes, add a cheaper tier', hint: 'Fans who say no to the main offer see this one' },
              { value: 'no', label: 'Not now', hint: 'One paid tier is a complete offer' },
            ]}
            value={wantsDownsell === null ? null : wantsDownsell ? 'yes' : 'no'}
            onChange={(v) => setWantsDownsell(v === 'yes')}
            placeholder="Choose one"
          />
          <Why>A cheaper way in catches fans who want in but not at the main price. You can add one later from Tiers.</Why>
        </div>
      )}

      {step.key === 'downsell-price' && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1">Tier name</label>
            <input className={FIELD} maxLength={NAME_MAX} value={downsell.name} onChange={(e) => setDownsell({ ...downsell, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1">Price per month, in dollars</label>
            <input className={FIELD} inputMode="decimal" value={downsell.priceDollars} onChange={(e) => setDownsell({ ...downsell, priceDollars: e.target.value })} />
          </div>
          <Why>
            It has to cost less than {sel ? `${sel.name} at ${money(sel.price)}` : 'the main offer'}. CRWN fills it with the recommended Silver benefits; edit them any time in Tiers.
          </Why>
        </div>
      )}

      {step.key === 'review' && (
        <div className="space-y-3">
          <Row label="Paid tier" value={sel ? `${sel.name}, ${money(sel.price)} a month` : creating ? `${creating.name}, $${creating.priceDollars} a month (new)` : ''} />
          <Row label="The promise" value={promise.trim() || suggestPromise(state)} />
          <div className="rounded-xl border border-crwn-elevated p-4">
            <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-2">What fans get</p>
            <ul className="space-y-1.5">
              {benefits.map((b) => {
                const def = benefitDelivery(b.benefit_type);
                if (!def) return null;
                return (
                  <li key={b.benefit_type} className="text-sm text-crwn-text flex justify-between gap-3">
                    <span>{getBenefitDisplayText(def.key, b.config)}</span>
                    <span className="text-crwn-text-secondary shrink-0">{def.support === 'manual' ? 'you deliver' : 'CRWN delivers'}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          {wantsDownsell === true && steps.some((s) => s.key === 'downsell-price') && (
            <Row label="Cheaper way in" value={`${downsell.name}, $${downsell.priceDollars} a month (new)`} />
          )}
          <Why>Saving writes your tier and its promises. Your fans see the card on your page now; the funnel link stays off until you turn it on.</Why>
        </div>
      )}
    </GuidedShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-crwn-elevated p-4">
      <p className="text-xs uppercase tracking-wide text-crwn-text-secondary mb-1">{label}</p>
      <p className="text-sm text-crwn-text">{value}</p>
    </div>
  );
}
