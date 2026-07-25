// Lead-magnet analytics: normalized event names + a best-effort client tracker.
//
// PRIVACY: never send raw email, phone, private text answers, or full result payloads
// into an event. Only slugs, ids, counts, and enum-ish metadata (enforced by the API
// route allowlist too).

export const LM_EVENTS = {
  directoryViewed: 'lead_magnet_directory_viewed',
  viewed: 'lead_magnet_viewed',
  started: 'lead_magnet_started',
  stepCompleted: 'lead_magnet_step_completed',
  stepBack: 'lead_magnet_step_back',
  abandoned: 'lead_magnet_abandoned',
  previewViewed: 'lead_magnet_preview_viewed',
  leadCaptureViewed: 'lead_magnet_lead_capture_viewed',
  leadSubmitted: 'lead_magnet_lead_submitted',
  resultGenerated: 'lead_magnet_result_generated',
  resultUnlocked: 'lead_magnet_result_unlocked',
  resultSaved: 'lead_magnet_result_saved',
  resultEmailed: 'lead_magnet_result_emailed',
  resultShared: 'lead_magnet_result_shared',
  signupClicked: 'lead_magnet_signup_clicked',
  loginClicked: 'lead_magnet_login_clicked',
  conversionStarted: 'lead_magnet_conversion_started',
  conversionCompleted: 'lead_magnet_conversion_completed',
  conversionFailed: 'lead_magnet_conversion_failed',
  resultArchived: 'lead_magnet_result_archived',
} as const;

export type LmEvent = (typeof LM_EVENTS)[keyof typeof LM_EVENTS];

export interface LmEventMeta {
  toolSlug: string;
  featureName?: string;
  context?: 'public' | 'artist';
  authed?: boolean;
  step?: number;
  totalSteps?: number;
  source?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  resultId?: string;
  conversionTarget?: string;
  generatorVersion?: string;
  reasonCode?: string;
  /** Per-occurrence id, set automatically by trackLeadMagnet. Dedups a retried/double-fired beacon
   *  of the SAME occurrence in the funnel table; two genuine events get two ids. */
  eventId?: string;
  /** document.referrer, captured automatically. The funnel's referrer dimension. */
  referrer?: string;
}

// Fire-and-forget. Uses sendBeacon when available so it survives navigation.
export function trackLeadMagnet(event: LmEvent, meta: LmEventMeta): void {
  if (typeof window === 'undefined') return;
  try {
    // Stamp a per-occurrence id (for funnel dedup) and the referrer, unless already provided.
    const enriched: LmEventMeta = {
      ...meta,
      eventId: meta.eventId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
      referrer: meta.referrer || (typeof document !== 'undefined' && document.referrer ? document.referrer : undefined),
    };
    const body = JSON.stringify({ event, meta: enriched });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/lead-magnets/analytics', new Blob([body], { type: 'application/json' }));
    } else {
      void fetch('/api/lead-magnets/analytics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    }
  } catch {
    // analytics must never break the UX
  }
}

// Pull UTM params from the current URL (client only).
export function readUtm(): Pick<LmEventMeta, 'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent' | 'source'> {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  return {
    utmSource: q.get('utm_source') || undefined,
    utmMedium: q.get('utm_medium') || undefined,
    utmCampaign: q.get('utm_campaign') || undefined,
    utmContent: q.get('utm_content') || undefined,
    source: q.get('utm_source') || q.get('ref') || 'direct',
  };
}
