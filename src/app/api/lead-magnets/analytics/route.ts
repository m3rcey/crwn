import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordLmEvent } from '@/lib/leadMagnets/server';
import { recordFunnelEvent, LM_EVENT_TO_STAGE } from '@/lib/analytics/funnelEvents';
import { ALL_OPPORTUNITY_EVENT_NAMES } from '@/lib/opportunityFunnels/analytics';
import { isSubAvatarId } from '@/lib/avatars/taxonomy';

// PUBLIC analytics sink. Append-only. The server allowlists fields (recordLmEvent),
// so no raw email/phone/answers/payloads can land here even if a client sends them.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build',
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ALLOWED_EVENTS = new Set([
  'lead_magnet_directory_viewed',
  'lead_magnet_viewed',
  'lead_magnet_started',
  'lead_magnet_step_completed',
  'lead_magnet_step_back',
  'lead_magnet_abandoned',
  'lead_magnet_preview_viewed',
  'lead_magnet_lead_capture_viewed',
  'lead_magnet_lead_submitted',
  'lead_magnet_result_generated',
  'lead_magnet_result_unlocked',
  'lead_magnet_result_saved',
  'lead_magnet_result_emailed',
  'lead_magnet_result_shared',
  'lead_magnet_signup_clicked',
  'lead_magnet_login_clicked',
  'lead_magnet_conversion_started',
  'lead_magnet_conversion_completed',
  'lead_magnet_conversion_failed',
  'lead_magnet_result_archived',
  // The Opportunity Funnel layer: shared funnel events, the value-before-signup journey, and the
  // personalized post-signup journey. DERIVED from the client's own constant rather than
  // hand-copied. The two lists were duplicated by hand, so adding an event on the client left the
  // server silently dropping it (a 200 with the row never written, the worst kind of analytics
  // bug). None of these are mirrored into funnel_events, so they never double-count the
  // lead-magnet stages that already are, and none may carry a claim token or PII.
  ...ALL_OPPORTUNITY_EVENT_NAMES,
]);

export async function POST(req: NextRequest) {
  let body: { event?: string; meta?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const event = String(body.event || '');
  if (!ALLOWED_EVENTS.has(event)) return NextResponse.json({ ok: false }, { status: 400 });

  const meta = (body.meta || {}) as Record<string, unknown>;
  await recordLmEvent(supabaseAdmin, event, meta);

  // Mirror the top-of-funnel beacons into the canonical funnel table, so the whole funnel lives
  // in one deduped, dimensioned place. Only the events that ARE funnel stages are mirrored; the
  // per-occurrence eventId is the dedup key so a retried/double-fired beacon collapses.
  const stage = LM_EVENT_TO_STAGE[event];
  if (stage) {
    const eventId = typeof meta.eventId === 'string' ? meta.eventId : undefined;
    await recordFunnelEvent(supabaseAdmin, {
      stage,
      calculator: typeof meta.toolSlug === 'string' ? meta.toolSlug : null,
      campaign: typeof meta.utmCampaign === 'string' ? meta.utmCampaign : null,
      referrer:
        (typeof meta.referrer === 'string' && meta.referrer) ||
        (typeof meta.source === 'string' && meta.source) ||
        (typeof meta.utmSource === 'string' && meta.utmSource) ||
        null,
      video: typeof meta.utmContent === 'string' ? meta.utmContent : null,
      resultId: typeof meta.resultId === 'string' ? meta.resultId : null,
      anonId: eventId ?? null,
      dedupeKey: eventId ?? null,
      // The sub-avatar funnel this visit arrived through. All four avatars share one calculator
      // (docs/SUB_AVATARS.md), so the `calculator` dimension can no longer separate their cohorts
      // and this stamp is what does. VALIDATED against the real taxonomy: a client-sent value
      // that is not a declared avatar id is dropped, never stored.
      metadata: {
        context: meta.context,
        authed: meta.authed,
        ...(isSubAvatarId(meta.entryContext) ? { subAvatar: meta.entryContext } : {}),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
