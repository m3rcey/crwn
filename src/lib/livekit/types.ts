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

// Provider-agnostic interface so the video backend (LiveKit today) is swappable.
// UI/API only ever see { token, url } and a role — never provider internals.
export interface LiveProvider {
  // Mint a join token with grants derived from `role`.
  mintToken(opts: MintTokenOpts): Promise<string>;
  // List currently-connected participants in a room (server-side admin API).
  listParticipants(room: string): Promise<LiveRoomParticipant[]>;
  // Forcibly end a room (called when the artist ends a session).
  endRoom(room: string): Promise<void>;
}
