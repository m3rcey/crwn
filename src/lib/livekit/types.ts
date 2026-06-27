import type { LiveParticipantRole } from '@/types/live';

export interface MintTokenOpts {
  room: string;
  identity: string; // unique per user (use auth user id)
  name: string; // display name shown in the room
  role: LiveParticipantRole;
}

export interface LiveRoomParticipant {
  identity: string;
}

export interface StartRecordingOpts {
  room: string;
  key: string; // destination object key in storage (R2)
}

// Provider-agnostic interface so the video backend (LiveKit today) is swappable.
// UI/API only ever see { token, url } and a role — never provider internals.
export interface LiveProvider {
  // Mint a join token with grants derived from `role`.
  mintToken(opts: MintTokenOpts): Promise<string>;
  // List currently-connected participants in a room (server-side admin API).
  listParticipants(room: string): Promise<LiveRoomParticipant[]>;
  // Forcibly end a room (called when the artist ends a session).
  endRoom(room: string): Promise<void>;
  // Start recording a room to storage. Returns the egress id (to correlate the
  // async completion webhook), or null if recording is unavailable/unconfigured
  // — callers must treat recording as best-effort and never block go-live on it.
  startRecording(opts: StartRecordingOpts): Promise<{ egressId: string } | null>;
  // Stop an in-progress recording (called when the artist ends a session).
  stopRecording(egressId: string): Promise<void>;
}
