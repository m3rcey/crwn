import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import type { LiveProvider, MintTokenOpts, LiveRoomParticipant } from './types';
import type { LiveParticipantRole } from '@/types/live';

const API_KEY = process.env.LIVEKIT_API_KEY || '';
const API_SECRET = process.env.LIVEKIT_API_SECRET || '';
// Client connects to the wss:// URL; the server admin API uses the same host over https.
const WS_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';
const HTTP_URL = WS_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

function assertConfigured() {
  if (!API_KEY || !API_SECRET || !WS_URL) {
    throw new Error(
      'LiveKit not configured: set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL.'
    );
  }
}

function grantsForRole(room: string, role: LiveParticipantRole) {
  switch (role) {
    case 'broadcaster':
      return { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true, roomAdmin: true };
    case 'stage': // v2 on-stage fan
      return { roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: true };
    case 'viewer':
    default:
      // v1 viewers receive media only; chat is via Supabase Realtime, not LiveKit data.
      return { roomJoin: true, room, canPublish: false, canSubscribe: true, canPublishData: false };
  }
}

let _roomService: RoomServiceClient | null = null;
function roomService(): RoomServiceClient {
  assertConfigured();
  if (!_roomService) {
    _roomService = new RoomServiceClient(HTTP_URL, API_KEY, API_SECRET);
  }
  return _roomService;
}

export const livekitProvider: LiveProvider = {
  async mintToken({ room, identity, name, role }: MintTokenOpts): Promise<string> {
    assertConfigured();
    const at = new AccessToken(API_KEY, API_SECRET, { identity, name });
    at.addGrant(grantsForRole(room, role));
    return at.toJwt();
  },

  async listParticipants(room: string): Promise<LiveRoomParticipant[]> {
    try {
      const participants = await roomService().listParticipants(room);
      return participants.map((p) => ({ identity: p.identity }));
    } catch {
      // Room may not exist yet (no one has joined) — treat as empty.
      return [];
    }
  },

  async endRoom(room: string): Promise<void> {
    try {
      await roomService().deleteRoom(room);
    } catch {
      // Room already gone — idempotent no-op.
    }
  },
};
