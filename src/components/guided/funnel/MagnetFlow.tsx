'use client';

// "Give fans something worth joining for": the existing automation wizard, entered from Rise
// Mode in magnet mode. It reopens the artist's funnel row if one exists, runs the gift screens,
// and saves a DRAFT. Turning the funnel on is its own move.

import { useRouter } from 'next/navigation';
import { AutomationWizard } from '@/components/artist/automations/AutomationWizard';
import { guidedSetupTelemetry } from '@/lib/guidedSetup/telemetry';
import type { GuidedFlowProps } from '../types';
import { GuidedFrame } from '../GuidedShell';
import { useFunnelRow } from './useFunnelRow';

export default function MagnetFlow({ context, entry }: GuidedFlowProps) {
  const router = useRouter();
  const state = useFunnelRow(context.artistId, entry.funnelId);

  if (!state) {
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
        mode="magnet"
        flow="magnet"
        onClose={() => router.push(entry.returnTo)}
        onSaved={() => {
          guidedSetupTelemetry.completed({ flow: 'magnet', artistId: context.artistId, step: 1, totalSteps: 1 });
          router.push(entry.returnTo);
        }}
      />
    </GuidedFrame>
  );
}
