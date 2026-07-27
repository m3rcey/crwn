'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { smartBack } from '@/lib/navigation';
import { FanCaptureBuilder } from '@/components/opportunity/FanCaptureBuilder';
import { JOURNEY_EVENTS, trackOpportunity } from '@/lib/opportunityFunnels/analytics';
import { OYF_TOOL_KEY, sanitizeOwnYourFansDraft, type OwnYourFansDraft } from '@/lib/opportunityDrafts/ownYourFansDraft';

// Authenticated resume of the Own Your Fans fan-capture page the artist started before signup.
// The claimed draft is read through the browser client under RLS (owner_manage_lm_results), so a
// user can only ever see THEIR OWN draft; there is no token here and no cross-user lookup. Auto-claim
// (useAuth) binds the anonymous row to this artist on session load, so we retry briefly if the bind
// has not landed yet. Publishing happens in the real, ownership-gated smart-link surface.
export default function OwnYourFansPlanPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [state, setState] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [draft, setDraft] = useState<OwnYourFansDraft | null>(null);
  const resumedRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    let cancelled = false;
    let tries = 0;

    const load = async () => {
      // RLS scopes this to the caller's own rows. Newest OYF draft wins.
      const { data } = await supabase
        .from('lead_magnet_results')
        .select('input_data, created_at')
        .eq('tool_slug', OYF_TOOL_KEY)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      const builderDraft = (data?.input_data as { builderDraft?: unknown } | null)?.builderDraft;
      if (builderDraft) {
        setDraft(sanitizeOwnYourFansDraft(builderDraft));
        setState('ready');
        if (!resumedRef.current) {
          resumedRef.current = true;
          trackOpportunity(JOURNEY_EVENTS.draftRestored, { opportunityKey: 'own-your-fans', toolKey: OYF_TOOL_KEY });
          trackOpportunity(JOURNEY_EVENTS.authenticatedBuilderResumed, { opportunityKey: 'own-your-fans', toolKey: OYF_TOOL_KEY });
        }
        return;
      }
      // The auto-claim may not have bound the row yet; retry a few times, then show empty.
      if (tries++ < 4) {
        setTimeout(load, 800);
      } else {
        setState('empty');
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [user, isLoading, router]);

  const onPublish = () => {
    // Real publishing lives in the ownership-gated fan surface. This never publishes on its own.
    router.push('/studio/fans');
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      <button onClick={() => smartBack(router, '/studio/fans')} className="flex items-center gap-1.5 text-sm text-crwn-text-secondary mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>

      {state === 'loading' && (
        <div className="min-h-[40vh] flex items-center justify-center text-crwn-text-secondary">Restoring your fan page…</div>
      )}

      {state === 'empty' && (
        <div className="rounded-2xl bg-crwn-surface border border-crwn-elevated p-6 text-center">
          <h1 className="text-lg font-bold text-crwn-text">Let us set up your fan page</h1>
          <p className="text-sm text-crwn-text-secondary mt-1">
            Start a page that turns your rented audience into fans you own.
          </p>
          <button onClick={onPublish} className="mt-4 px-6 py-3 rounded-full bg-crwn-gold text-crwn-bg font-semibold">
            Open my fan tools
          </button>
        </div>
      )}

      {state === 'ready' && draft && (
        <>
          <div className="mb-4">
            <h1 className="text-xl font-bold text-crwn-text">Your fan page is saved</h1>
            <p className="text-sm text-crwn-text-secondary mt-1">
              Pick up exactly where you left off. Publish it when it is ready.
            </p>
          </div>
          <FanCaptureBuilder
            mode="authenticated"
            inputs={{ social_followers: 0 }}
            initialDraft={draft}
            onFinish={onPublish}
            finishLabel="Publish my fan page"
          />
        </>
      )}
    </div>
  );
}
