// guidedSetup/telemetry.ts: how a guided flow reports itself, without a new table.
//
// Three events, riding the EXISTING journey event sink (lead_magnet_events through
// trackOpportunity): started, step reached, completed. Abandonment is DERIVED at query time
// (started with no completion after seven days), never emitted, because a browser cannot know it
// abandoned. Time to completion is the gap between the first started and the completed row for
// the same flow and artist. The sink already carries step and total_steps columns and the
// server allowlist derives from the client constant, so this adds no migration.
//
// Founder devices are never counted: clientHasDnt short-circuits before any beacon, and the
// route checks the same cookie again.

import { clientHasDnt } from '@/lib/analytics/doNotTrack';
import { GUIDED_SETUP_EVENTS, trackOpportunity } from '@/lib/opportunityFunnels/analytics';
import type { GuidedFlowKey } from './flows';

export interface GuidedSetupTelemetry {
  flow: GuidedFlowKey;
  artistId: string | null;
  step: number;
  totalSteps: number;
}

function send(event: (typeof GUIDED_SETUP_EVENTS)[keyof typeof GUIDED_SETUP_EVENTS], t: GuidedSetupTelemetry) {
  try {
    if (clientHasDnt()) return;
    trackOpportunity(event, {
      context: 'artist',
      authed: true,
      flow: t.flow,
      step: t.step,
      totalSteps: t.totalSteps,
      artistId: t.artistId ?? undefined,
    });
  } catch {
    /* analytics never breaks a flow */
  }
}

export const guidedSetupTelemetry = {
  started: (t: GuidedSetupTelemetry) => send(GUIDED_SETUP_EVENTS.started, t),
  stepReached: (t: GuidedSetupTelemetry) => send(GUIDED_SETUP_EVENTS.stepReached, t),
  completed: (t: GuidedSetupTelemetry) => send(GUIDED_SETUP_EVENTS.completed, t),
};
