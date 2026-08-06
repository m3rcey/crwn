// Bridge the Instagram/ManyChat funnel into funnel_events.
//
// Web visitors mirror into funnel_events from the client beacon (utm_content -> video). But the real
// acquisition path is IG comment -> ManyChat -> CRWN, which is handled SERVER-side and never loads
// that beacon. Its "which video" signal is `lead_sessions.source_post_id` (the IG post/Reel the
// comment was on) plus `creator_account`. This records the same funnel stages for that path, using
// the post as the video dimension, so the dashboard's funnel + "Highest Converting Video" reflect
// ManyChat, not just web. Fail-safe (recordFunnelEvent never throws).

import type { Db } from '@/lib/leadResults/handoffSeed';
import { recordFunnelEvent, type FunnelStage } from './funnelEvents';
import { normalizeTag } from './campaignAttribution';

export interface Attribution {
  calculator?: string | null; // lead_magnet_id
  video?: string | null; // source_post_id (the IG post/Reel)
  creatorAccount?: string | null;
  keyword?: string | null;
  campaign?: string | null; // utm_campaign, if any
}

/** Map IG/ManyChat attribution onto the funnel's dimensions. Pure and exported for tests: the
 *  post is the video, the creator is the source, the keyword stands in for campaign.
 *
 *  campaign and video run through the SAME normalizer the web path uses. The DM funnel gets its
 *  tags typed by hand into a ManyChat External Request body, so without this a flow typed
 *  `KCamp_V1` and a video link carrying `kcamp_v1` would be two rows for one piece of content. */
export function igFunnelDims(a: Attribution): {
  calculator: string | null;
  campaign: string | null;
  referrer: string;
  video: string | null;
} {
  return {
    calculator: a.calculator ?? null,
    // IG has no utm_campaign of its own; the trigger keyword is the closest tag.
    campaign: normalizeTag(a.campaign) ?? normalizeTag(a.keyword),
    referrer: a.creatorAccount ? `ig:${a.creatorAccount}` : 'instagram',
    video: normalizeTag(a.video),
  };
}

/** Record an IG funnel stage from explicit attribution (no query). */
export async function mirrorFunnelDirect(
  db: Db,
  stage: FunnelStage,
  dedupeKey: string,
  a: Attribution,
  extra?: { resultId?: string | null },
): Promise<void> {
  await recordFunnelEvent(db, {
    stage,
    dedupeKey,
    resultId: extra?.resultId ?? null,
    // `platform` and `keyword` mirror the web path's metadata tags, so the admin scorecard can
    // group ManyChat traffic by platform or by trigger keyword alongside tagged link traffic.
    // There is no `angle` on this path: encode it in the campaign name instead.
    metadata: {
      channel: 'instagram',
      platform: 'instagram',
      ...(normalizeTag(a.keyword) ? { keyword: normalizeTag(a.keyword)! } : {}),
    },
    ...igFunnelDims(a),
  });
}

/** Record an IG funnel stage, fetching the attribution from lead_sessions by id. */
export async function mirrorFunnelForSession(
  db: Db,
  sessionId: string | null | undefined,
  stage: FunnelStage,
  dedupeKey: string,
  extra?: { resultId?: string | null },
): Promise<void> {
  if (!sessionId) return;
  try {
    const { data: s } = await db
      .from('lead_sessions')
      .select('lead_magnet_id, source_post_id, creator_account, keyword, utm_campaign, utm_content')
      .eq('id', sessionId)
      .maybeSingle();
    if (!s) return;
    await mirrorFunnelDirect(
      db,
      stage,
      dedupeKey,
      {
        calculator: s.lead_magnet_id,
        video: s.source_post_id ?? s.utm_content,
        creatorAccount: s.creator_account,
        keyword: s.keyword,
        campaign: s.utm_campaign,
      },
      extra,
    );
  } catch {
    /* fail-safe */
  }
}
