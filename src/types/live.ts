// Livestreaming ("Listening Sessions") types — see schema-phase2-livestreams.sql

export type LiveSessionStatus = 'scheduled' | 'live' | 'ended';
export type LiveParticipantRole = 'broadcaster' | 'viewer' | 'stage';

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

export interface LiveSessionMessage {
  id: string;
  session_id: string;
  user_id: string;
  body: string;
  is_deleted: boolean;
  created_at: string;
}
