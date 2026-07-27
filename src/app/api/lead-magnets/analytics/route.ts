import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recordLmEvent } from '@/lib/leadMagnets/server';
import { recordFunnelEvent, LM_EVENT_TO_STAGE } from '@/lib/analytics/funnelEvents';

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
  // Shared Opportunity Funnel events (parallel normalized layer; NOT mirrored into funnel_events,
  // so they never double-count the lead-magnet stages that already are).
  'opportunity_funnel_viewed',
  'opportunity_funnel_started',
  'opportunity_funnel_completed',
  'opportunity_result_viewed',
  'opportunity_recommendation_viewed',
  'opportunity_cta_clicked',
  'opportunity_builder_started',
  // Value-before-signup journey events (anonymous -> build -> save -> signup -> claim -> resume).
  // Same append-only sink; never mirrored into funnel_events, never carry a claim token or PII.
  'anonymous_value_started',
  'anonymous_value_completed',
  'recommended_solution_viewed',
  'pre_signup_builder_started',
  'pre_signup_builder_step_completed',
  'pre_signup_preview_viewed',
  'signup_boundary_reached',
  'signup_prompt_viewed',
  'signup_started_from_opportunity',
  'signup_completed_from_opportunity',
  'draft_claim_started',
  'draft_claim_completed',
  'draft_claim_failed',
  'draft_restored',
  'authenticated_builder_resumed',
  'feature_published',
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
      metadata: { context: meta.context, authed: meta.authed },
    });
  }

  return NextResponse.json({ ok: true });
}
