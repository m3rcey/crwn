'use client';

// "Follow up with fans who do not buy yet": the minimum viable nurture as a guided flow.
//
// CRWN drafts five messages from facts it already holds (the gift, the paid tier, its first
// benefits), the artist reads the shape, personalizes each one, and switches it on. CRWN
// configures what the artist should never have to know: trigger = free join, conversion goal
// = the funnel's primary paid tier, and the funnel's nurture pointer. Writes go through the
// existing /api/sequences and the funnel's own PATCH; nothing new is stored anywhere.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/shared/Toast';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { benefitDelivery } from '@/lib/benefitRegistry';
import { deriveOfferTiers } from '@/lib/fanAutomations/offerTiers';
import { buildFreeJoinStarter, FREE_JOIN_STARTER_NAME, type StarterStep } from '@/lib/sequences/freeJoinStarter';
import { FREE_JOIN_TRIGGER } from '@/lib/sequences/triggers';
import { PUBLIC_ORIGIN } from '@/lib/publicOrigin';
import { guidedSetupTelemetry } from '@/lib/guidedSetup/telemetry';
import type { GuidedFlowProps } from '../types';
import { GuidedShell, FIELD, Why } from '../GuidedShell';
import { canContinue, resumeIndex, visibleSteps, type FollowupState } from './followupSteps';
import type { ExistingAutomation } from '@/components/artist/automations/AutomationWizard';

interface SequenceRow {
  id: string;
  name: string;
  trigger_type: string;
  is_active: boolean;
  goal_tier_id: string | null;
  steps: { delay_days: number; subject: string; body: string }[];
}

export default function FollowupFlow({ context, entry }: GuidedFlowProps) {
  const router = useRouter();
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { showToast } = useToast();

  const [loaded, setLoaded] = useState(false);
  const [messages, setMessages] = useState<StarterStep[]>([]);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [existingWhole, setExistingWhole] = useState(false);
  const [primary, setPrimary] = useState<{ id: string; name: string } | null>(null);
  const [funnel, setFunnel] = useState<ExistingAutomation | null>(null);
  const [index, setIndex] = useState(-1);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const paid = context.tiers.filter((t) => t.price > 0);
      const [list, seqs] = await Promise.all([
        fetch(`/api/fan-automations?artistId=${context.artistId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch(`/api/sequences?artistId=${context.artistId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!active) return;
      const rows: ExistingAutomation[] = list?.automations ?? [];
      const row = rows.find((r) => r.id === entry.funnelId) ?? rows.find((r) => r.status === 'active') ?? rows[0] ?? null;
      setFunnel(row);

      const goldId = row?.gold_tier_id && paid.some((t) => t.id === row.gold_tier_id) ? row.gold_tier_id : deriveOfferTiers(paid.map((t) => ({ id: t.id, name: t.name, price: t.price }))).gold?.id ?? null;
      const gold = paid.find((t) => t.id === goldId) ?? null;
      setPrimary(gold ? { id: gold.id, name: gold.name } : null);

      // The funnel's own pointer first, else the active free-join sequence, else a fresh draft.
      const sequences: SequenceRow[] = seqs?.sequences ?? [];
      const pointed = row?.nurture_sequence_id ? sequences.find((s) => s.id === row.nurture_sequence_id) : null;
      const existing = pointed ?? sequences.find((s) => s.trigger_type === FREE_JOIN_TRIGGER && s.is_active) ?? null;

      let firstBenefit: string | null = null;
      let secondBenefit: string | null = null;
      if (gold) {
        const { data } = await supabase.from('tier_benefits').select('benefit_type, sort_order').eq('tier_id', gold.id).eq('is_active', true).order('sort_order');
        const labels = (data || []).map((b) => benefitDelivery(b.benefit_type)).filter((d) => !!d && d.support !== 'retired').map((d) => d!.label);
        firstBenefit = labels[0] ?? null;
        secondBenefit = labels[1] ?? null;
      }
      if (!active) return;

      if (existing && existing.steps.length) {
        setExistingId(existing.id);
        setExistingWhole(true);
        setMessages(existing.steps.map((s) => ({ delay_days: s.delay_days, subject: s.subject, body: s.body })));
      } else {
        setExistingId(existing?.id ?? null);
        setMessages(
          buildFreeJoinStarter({
            magnetTitle: row?.magnet_title ?? '',
            tierName: gold?.name ?? '',
            priceCents: gold?.price ?? 0,
            firstBenefit,
            secondBenefit,
            pageUrl: `${PUBLIC_ORIGIN}/${context.slug}`,
          }),
        );
      }
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, [context.artistId, context.tiers, context.slug, entry.funnelId, supabase]);

  const state: FollowupState = useMemo(
    () => ({ steps: messages, primaryTierName: primary?.name ?? 'the paid tier', existing: existingWhole }),
    [messages, primary, existingWhole],
  );
  const steps = useMemo(() => visibleSteps(state), [state]);
  const resolved = index < 0 ? resumeIndex(steps, state) : Math.min(index, steps.length - 1);
  const step = steps[resolved];
  const started = useRef(false);
  useEffect(() => {
    if (loaded && !started.current) started.current = true;
  }, [loaded]);

  const save = async () => {
    if (!primary) {
      showToast('Build your paid offer first, so the follow-up knows what it is selling.', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: existingId ?? undefined,
          artistId: context.artistId,
          name: FREE_JOIN_STARTER_NAME,
          triggerType: FREE_JOIN_TRIGGER,
          steps: messages.map((m) => ({ delay_days: m.delay_days, subject: m.subject.trim(), body: m.body.trim() })),
          activate: true,
          goalTierId: primary.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || 'Could not save the follow-up.', 'error');
        return;
      }
      const sequenceId: string = data.id;
      // An updated sequence keeps whatever active state it had; a new one was created active.
      // Make sure it is on either way, through the existing toggle (which refuses an empty one).
      if (existingId) {
        const seqs = await fetch(`/api/sequences?artistId=${context.artistId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        const row: SequenceRow | undefined = (seqs?.sequences ?? []).find((s: SequenceRow) => s.id === sequenceId);
        if (row && !row.is_active) await fetch(`/api/sequences/${sequenceId}/toggle`, { method: 'POST' });
      }
      // Point the funnel at it, through the funnel's own validated PATCH (every field rides
      // along, unchanged, because the validator outputs the whole set).
      if (funnel) {
        await fetch(`/api/fan-automations/${funnel.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            artistId: context.artistId,
            fields: {
              triggerMediaIds: funnel.trigger_media_ids,
              triggerKeywords: funnel.trigger_keywords,
              publicReply: funnel.public_reply,
              dmMessage: funnel.dm_message,
              magnetKind: funnel.magnet_kind,
              magnetTitle: funnel.magnet_title,
              magnetDescription: funnel.magnet_description,
              magnetFileKey: funnel.magnet_file_key,
              magnetFileName: funnel.magnet_file_name,
              magnetTrackId: funnel.magnet_track_id,
              goldTierId: funnel.gold_tier_id,
              goldItemTitle: funnel.gold_item_title,
              goldItemDescription: funnel.gold_item_description,
              silverTierId: funnel.silver_tier_id,
              nurtureSequenceId: sequenceId,
            },
          }),
        }).catch(() => {});
      }
      guidedSetupTelemetry.completed({ flow: 'followup', artistId: context.artistId, step: steps.length, totalSteps: steps.length });
      showToast('Your follow-up is on.', 'success');
      router.push(entry.returnTo);
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

  const m = typeof step.messageIndex === 'number' ? messages[step.messageIndex] : null;
  const setMessage = (i: number, patch: Partial<StarterStep>) => setMessages((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <GuidedShell
      flow="followup"
      artistId={context.artistId}
      returnTo={entry.returnTo}
      steps={steps.map((s, i) => ({ id: `${s.key}-${i}`, group: s.group }))}
      index={resolved}
      title={step.title}
      subtitle={step.subtitle}
      onBack={resolved > 0 ? () => setIndex(resolved - 1) : undefined}
      onContinue={() => (step.key === 'review' ? void save() : setIndex(Math.min(steps.length - 1, resolved + 1)))}
      continueLabel={step.key === 'review' ? (existingWhole ? 'Save and keep it on' : 'Turn it on') : 'Continue'}
      continueDisabled={!canContinue(step, state)}
      continueLoading={saving}
    >
      {step.key === 'shape' && (
        <div className="space-y-3">
          <ol className="space-y-2">
            {messages.map((x, i) => (
              <li key={i} className="rounded-xl border border-crwn-elevated p-3 flex items-baseline gap-3">
                <span className="text-xs text-crwn-text-secondary shrink-0 w-12">Day {x.delay_days}</span>
                <span className="text-sm text-crwn-text">{x.subject}</span>
              </li>
            ))}
          </ol>
          <Why>Deliver the gift, say what the paid experience is, show one thing, answer the common objection, come back to the offer. Every message stops for a fan who buys.</Why>
        </div>
      )}

      {step.key === 'message' && m && typeof step.messageIndex === 'number' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1">Subject</label>
            <input className={FIELD} maxLength={120} value={m.subject} onChange={(e) => setMessage(step.messageIndex!, { subject: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs text-crwn-text-secondary mb-1">Message</label>
            <textarea className={`${FIELD} min-h-[220px] text-base`} maxLength={3000} value={m.body} onChange={(e) => setMessage(step.messageIndex!, { body: e.target.value })} />
          </div>
          <Why>The fan&apos;s first name and your artist name fill in when it sends. Keep it short; one idea per message.</Why>
        </div>
      )}

      {step.key === 'review' && (
        <div className="space-y-3">
          <div className="rounded-xl border border-crwn-elevated p-4 space-y-1.5 text-sm text-crwn-text">
            <p>Goes to everyone who joins free through your funnel.</p>
            <p>{messages.length} messages over {messages[messages.length - 1]?.delay_days ?? 0} days.</p>
            <p>Stops the moment a fan buys {primary?.name ?? 'the paid tier'} or anything above it.</p>
          </div>
          <Why>CRWN sets the trigger, the stop rule and the link to your funnel. Nothing else to configure.</Why>
        </div>
      )}
    </GuidedShell>
  );
}
