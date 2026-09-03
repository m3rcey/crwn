'use client';

// "Turn it on": the automation wizard in funnel mode. Everything is pre-filled from the row and
// the ladder; the artist confirms the path, optionally names the cheaper option and the
// follow-up, and switches it on. No magnet yet means the gift comes first, so the flow forwards
// to it rather than asking the artist to know that.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AutomationWizard } from '@/components/artist/automations/AutomationWizard';
import { guidedFlowHref } from '@/lib/guidedSetup/flows';
import { guidedSetupTelemetry } from '@/lib/guidedSetup/telemetry';
import type { GuidedFlowProps } from '../types';
import { GuidedFrame } from '../GuidedShell';
import { useFunnelRow } from './useFunnelRow';

export default function FunnelFlow({ context, entry }: GuidedFlowProps) {
  const router = useRouter();
  const state = useFunnelRow(context.artistId, entry.funnelId);
  const needsMagnet = !!state && (!state.existing || !state.existing.magnet_kind);

  useEffect(() => {
    if (!needsMagnet) return;
    router.replace(`${guidedFlowHref('magnet')}?returnTo=${encodeURIComponent(entry.returnTo)}`);
  }, [needsMagnet, router, entry.returnTo]);

  if (!state || needsMagnet) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-crwn-gold border-t-transparent rounded-full animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <GuidedFrame returnTo={entry.returnTo}>
      <AutomationWizard
        ctx={context}
        connections={state.connections}
        existing={state.existing}
        mode="funnel"
        flow="funnel"
        onClose={() => router.push(entry.returnTo)}
        onSaved={(r) => {
          if (!r.activated) return; // the blocker toast already named what is missing
          guidedSetupTelemetry.completed({ flow: 'funnel', artistId: context.artistId, step: 1, totalSteps: 1 });
          router.push(entry.returnTo);
        }}
      />
    </GuidedFrame>
  );
}
