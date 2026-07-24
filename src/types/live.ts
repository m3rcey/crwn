// Livestreaming ("Listening Sessions") types — see schema-phase2-livestreams.sql

export type LiveSessionStatus = 'scheduled' | 'live' | 'ended';
export type LiveParticipantRole = 'broadcaster' | 'viewer' | 'stage';
// Recording lifecycle: none -> recording -> processing -> ready | failed
export type LiveVodStatus = 'none' | 'recording' | 'processing' | 'ready' | 'failed';
// 'live' = real-time LiveKit broadcast; 'prerecorded' = uploaded video (file is the VOD).
export type LiveSourceType = 'live' | 'prerecorded';
// Prerecorded-only: 'public' = fans can watch (tier-gated); 'private' = owner-only.
export type LiveVisibility = 'public' | 'private';

export interface LiveSession {
  id: string;
  artist_id: string;
  title: string;
  description: string | null;
  is_free: boolean;
  allowed_tier_ids: string[];
  max_slots: number;
  status: LiveSessionStatus;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  provider: string;
  room_name: string;
  price: number | null; // cents, reserved for paid tickets (v1: null)
  is_active: boolean;
  // Executive Producer Session — fan submissions. See schema-phase2-producer-sessions.sql.
  accepts_submissions?: boolean;
  submission_prompt?: string | null;
  submission_deadline?: string | null;
  // live vs uploaded video — see schema-phase3-vod.sql
  source_type: LiveSourceType;
  visibility: LiveVisibility;
  // VOD (recorded stream) — see schema-phase3-vod.sql
  vod_status: LiveVodStatus;
  vod_egress_id: string | null;
  vod_key: string | null;
  vod_url: string | null;
  vod_duration_seconds: number | null;
  vod_size_bytes: number | null;
  vod_ready_at: string | null;
  // Cover image for the recording card — a custom upload, or an auto-grabbed
  // frame from a prerecorded upload. Null falls back to a placeholder.
  vod_thumbnail_key: string | null;
  vod_thumbnail_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveSessionParticipant {
  id: string;
  session_id: string;
  user_id: string;
  role: LiveParticipantRole;
  joined_at: string;
  left_at: string | null;
  created_at: string;
}

// Tips + Tip Goals — see schema-phase2-live-tips.sql
export type LiveTipStatus = 'pending' | 'paid' | 'refunded';
// Only 'tips' is computed today. 'viewers'/'shares' are reserved so Live
// Challenges is a row on this table, not a second system.
export type LiveGoalMetric = 'tips' | 'viewers' | 'shares';

export interface LiveTip {
  id: string;
  session_id: string;
  artist_id: string;
  fan_id: string;
  amount: number; // cents
  platform_fee: number; // cents
  message: string | null;
  is_hidden: boolean;
  status: LiveTipStatus;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LiveGoal {
  id: string;
  session_id: string;
  artist_id: string;
  title: string;
  metric: LiveGoalMetric;
  target_amount: number; // cents when metric = 'tips'
  sort_order: number;
  reached_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LiveSessionMessage {
  id: string;
  session_id: string;
  user_id: string;
  body: string;
  is_deleted: boolean;
  created_at: string;
}
