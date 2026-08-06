// Lead-magnet analytics: normalized event names + a best-effort client tracker.
//
// PRIVACY: never send raw email, phone, private text answers, or full result payloads
// into an event. Only slugs, ids, counts, and enum-ish metadata (enforced by the API
// route allowlist too).

import {
  parseCampaignAttribution,
  mergeAttribution,
  hasAttribution,
  sanitizeStoredAttribution,
  type CampaignAttribution,
} from '@/lib/analytics/campaignAttribution';

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
  /**
   * The sub-avatar funnel this visit arrived through (`?from=` on the all-in-one calculator).
   * Captured and persisted automatically by trackLeadMagnet, so every beacon carries it and the
   * server can stamp it onto the canonical funnel row. Validated server-side; a value that is not
   * a declared avatar id is dropped rather than trusted.
   */
  entryContext?: string;
  /**
   * The normalized campaign tag this visit arrived through (which video, which angle, which
   * ManyChat keyword). Captured automatically by trackLeadMagnet from the tagged link, first-touch
   * snapshotted, and RE-VALIDATED server-side before anything is stored.
   */
  attribution?: CampaignAttribution;
}

// The sub-avatar entry context (docs/SUB_AVATARS.md). All four avatars share one calculator, so
// `?from=` is what separates their cohorts, and it has to survive the visit rather than living
// only in the URL of the first page. Same first-touch discipline as the UTM snapshot: the FIRST
// avatar link they arrive through is the one that owns the visit, because that is the content
// that actually brought them.
const ENTRY_AVATAR_KEY = 'crwn_entry_avatar';
// Kept as a plain list rather than importing the taxonomy, so this client-side analytics helper
// stays dependency-free. The server validates against the real taxonomy before storing anything.
const ENTRY_AVATAR_IDS = [
  'highest_priority_empire_builder',
  'established_independent_operator',
  'brand_led_hip_hop_artist',
  'rnb_empire_builder',
];

/** Snapshot the avatar entry context from the current URL, then return the remembered one. */
function captureEntryAvatar(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const from = (new URLSearchParams(window.location.search).get('from') || '').trim().toLowerCase();
    const stored = window.localStorage.getItem(ENTRY_AVATAR_KEY) || '';
    if (ENTRY_AVATAR_IDS.includes(from) && !ENTRY_AVATAR_IDS.includes(stored)) {
      window.localStorage.setItem(ENTRY_AVATAR_KEY, from);
      return from;
    }
    return ENTRY_AVATAR_IDS.includes(stored) ? stored : ENTRY_AVATAR_IDS.includes(from) ? from : undefined;
  } catch {
    return undefined;
  }
}

// The campaign tag on the link that brought this visit (which video, which angle, which ManyChat
// keyword). Same first-touch discipline as the avatar entry context above: the FIRST tagged link
// they arrive through owns the visit, because that is the content that actually brought them. A
// later visit can only ADD dimensions the first one left empty, never replace them, so navigating
// from the calculator to the result to signup on a bare URL cannot erase the video.
const FIRST_TOUCH_ATTR_KEY = 'crwn_first_touch_attr';

/**
 * The merged campaign attribution for this visit. Reads the current URL, folds it into the stored
 * first-touch snapshot (first touch wins per field), persists the result, and returns it.
 * Storage-safe: a private-mode browser that refuses localStorage still gets URL attribution.
 */
export function readCampaignAttribution(): CampaignAttribution {
  const current = parseCampaignAttribution(
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search),
  );
  if (typeof window === 'undefined') return current;
  try {
    const raw = window.localStorage.getItem(FIRST_TOUCH_ATTR_KEY);
    const stored = raw ? sanitizeStoredAttribution(JSON.parse(raw)) : null;
    const merged = mergeAttribution(stored, current);
    if (hasAttribution(merged)) window.localStorage.setItem(FIRST_TOUCH_ATTR_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return current;
  }
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
      // Every beacon carries the avatar funnel, so no call site has to remember to pass it.
      entryContext: meta.entryContext || captureEntryAvatar(),
      // Same for the campaign tag: the video/angle/keyword rides on every stage, so the funnel
      // stays sliceable by content without touching a single call site.
      attribution: meta.attribution || readCampaignAttribution(),
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

// First-touch UTM snapshot. UTMs used to be read from the live URL only, so a visitor who landed
// with campaign params, browsed, and converted on a bare URL lost the attribution of the visit
// that actually brought them. The FIRST visit that carries any utm/ref is snapshotted here, and
// readUtm falls back to it when the current URL has none. Current-URL values always win (a newer
// campaign touch is a real touch); the snapshot only fills silence, so first-touch is preserved
// without erasing last-touch.
const FIRST_TOUCH_KEY = 'crwn_first_touch';

type UtmSnapshot = Pick<LmEventMeta, 'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent' | 'source'>;

function readFirstTouch(): UtmSnapshot {
  try {
    const raw = window.localStorage.getItem(FIRST_TOUCH_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, unknown>;
    const s = (k: string) => (typeof p[k] === 'string' && p[k] ? (p[k] as string) : undefined);
    return { utmSource: s('utmSource'), utmMedium: s('utmMedium'), utmCampaign: s('utmCampaign'), utmContent: s('utmContent'), source: s('source') };
  } catch {
    return {};
  }
}

// Pull UTM params from the current URL (client only), snapshotting the first touch and falling
// back to it when the current URL carries none.
export function readUtm(): UtmSnapshot {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const current: UtmSnapshot = {
    utmSource: q.get('utm_source') || undefined,
    utmMedium: q.get('utm_medium') || undefined,
    utmCampaign: q.get('utm_campaign') || undefined,
    utmContent: q.get('utm_content') || undefined,
    source: q.get('utm_source') || q.get('ref') || undefined,
  };

  const hasCurrent = !!(current.utmSource || current.utmMedium || current.utmCampaign || current.utmContent || q.get('ref'));
  const first = readFirstTouch();
  const hasFirst = !!(first.utmSource || first.utmMedium || first.utmCampaign || first.utmContent || first.source);

  // Snapshot only the FIRST attributed visit; never overwrite it.
  if (hasCurrent && !hasFirst) {
    try {
      window.localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(current));
    } catch {
      /* storage unavailable is fine */
    }
  }

  if (hasCurrent) return { ...current, source: current.source || 'direct' };
  if (hasFirst) return { ...first, source: first.source || 'direct' };
  return { source: 'direct' };
}
