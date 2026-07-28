'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { smartBack } from '@/lib/navigation';
import { DeliverableBuilder } from '@/components/opportunity/DeliverableBuilder';
import { PERSONALIZED_JOURNEY_EVENTS, JOURNEY_EVENTS, trackOpportunity } from '@/lib/opportunityFunnels/analytics';
import {
  getDeliverableSpec,
  sanitizeDeliverableValues,
  type DraftValues,
} from '@/lib/opportunityDrafts/deliverableSpecs';

// Authenticated resume of the deliverable an artist built BEFORE signup, for any tool.
//
// The claimed draft is read through the browser client under RLS (owner_manage_lm_results), so a user
// can only ever see THEIR OWN draft: no token, no cross-user lookup. Auto-claim (useAuth) binds the
// anonymous row on session load, so we retry briefly if the bind has not landed yet. Publishing still
// happens in the real, ownership-gated builder, carrying the artist's edits via its lm_* params.
export default function DeliverablePlanPage() {
  const router = useRouter();
  const params = useParams<{ tool: string }>();
  const toolSlug = typeof params?.tool === 'string' ? params.tool : '';
  const spec = getDeliverableSpec(toolSlug);
  const { user, isLoading } = useAuth();
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [values, setValues] = useState<DraftValues | null>(null);
  const resumedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !spec) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    let tries = 0;

    const load = async () => {
      // RLS scopes this to the caller's own rows. Newest draft for this tool wins.
      const { data } = await supabase
        .from('lead_magnet_results')
        .select('input_data, created_at')
        .eq('tool_slug', toolSlug)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      const stored = (data?.input_data as { deliverableValues?: unknown } | null)?.deliverableValues;
      if (stored) {
        setValues(sanitizeDeliverableValues(spec, stored));
        setState('ready');
        if (!resumedRef.current) {
          resumedRef.current = true;
          const ctx = { toolKey: toolSlug, opportunityKey: toolSlug };
          trackOpportunity(JOURNEY_EVENTS.draftRestored, ctx);
          trackOpportunity(PERSONALIZED_JOURNEY_EVENTS.contextRestoredAfterSignup, ctx);
          trackOpportunity(PERSONALIZED_JOURNEY_EVENTS.recommendedActionViewed, ctx);
        }
        return;
      }
      if (tries++ < 4) setTimeout(load, 800);
      else setState('empty');
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, router, spec, toolSlug]);

  if (!spec) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 text-center text-crwn-text-secondary">
        That plan does not exist.
      </div>
    );
  }

  const onContinue = (_t: string | null, v: DraftValues) => {
    trackOpportunity(PERSONALIZED_JOURNEY_EVENTS.recommendedActionStarted, { toolKey: toolSlug, opportunityKey: toolSlug });
    const extra = spec.continueParams ? spec.continueParams(v) : null;
    const qs = extra ? `?${new URLSearchParams(extra).toString()}` : '';
    router.push(`${spec.continueRoute}${qs}`);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button
        onClick={() => smartBack(router, spec.continueRoute)}
        className="flex items-center gap-1.5 text-sm text-crwn-text-secondary mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {state === 'loading' && (
        <div className="min-h-[40vh] flex items-center justify-center text-crwn-text-secondary">
          Restoring your plan…
        </div>
      )}

      {state === 'empty' && (
        <div className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-6 text-center">
          <h1 className="text-lg font-bold text-crwn-text">Let us build this properly</h1>
          <p className="text-sm text-crwn-text-secondary mt-1">
            We could not find a saved draft on this account. You can build it directly instead.
          </p>
          <button
            onClick={() => router.push(spec.continueRoute)}
            className="mt-4 px-6 py-3 rounded-full bg-crwn-gold text-crwn-bg font-semibold"
          >
            Open the builder
          </button>
        </div>
      )}

      {state === 'ready' && values && (
        <>
          <div className="mb-4">
            <h1 className="text-xl font-bold text-crwn-text">Your draft is saved</h1>
            <p className="text-sm text-crwn-text-secondary mt-1">
              Pick up exactly where you left off. Publishing happens in the next step.
            </p>
          </div>
          <DeliverableBuilder
            toolSlug={toolSlug}
            mode="authenticated"
            initialValues={values}
            onSave={onContinue}
            saveLabel="Continue to publish"
          />
        </>
      )}
    </div>
  );
}
