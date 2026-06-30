import {
  AccessToken,
  RoomServiceClient,
  EgressClient,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from 'livekit-server-sdk';
import type { LiveProvider, MintTokenOpts, LiveRoomParticipant, StartRecordingOpts } from './types';
import type { LiveParticipantRole } from '@/types/live';

const API_KEY = process.env.LIVEKIT_API_KEY || '';
const API_SECRET = process.env.LIVEKIT_API_SECRET || '';
// Client connects to the wss:// URL; the server admin API uses the same host over https.
const WS_URL = process.env.NEXT_PUBLIC_LIVEKIT_URL || '';
const HTTP_URL = WS_URL.replace(/^wss:\/\//, 'https://').replace(/^ws:\/\//, 'http://');

// R2 is S3-compatible; LiveKit Egress uploads the recording directly here (bytes
// never pass through our server). Reuses the same R2 credentials as src/lib/r2.
const R2_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'crwn-media';
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

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

let _egress: EgressClient | null = null;
function egressClient(): EgressClient {
  assertConfigured();
  if (!_egress) {
    _egress = new EgressClient(HTTP_URL, API_KEY, API_SECRET);
  }
  return _egress;
}

function r2Configured(): boolean {
  return Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY && R2_SECRET);
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

  async startRecording({ room, key }: StartRecordingOpts): Promise<{ egressId: string } | null> {
    // Recording is best-effort: if R2 isn't configured, skip rather than fail go-live.
    if (!r2Configured()) {
      return null;
    }
    // Egress needs the room to already exist. At "go live" the broadcaster's
    // browser hasn't connected yet, so the room is absent and egress 404s
    // ("requested room does not exist"). Create it first (idempotent) so the
    // egress compositor can attach and wait for the publisher to join.
    try {
      await roomService().createRoom({ name: room, emptyTimeout: 300 });
    } catch (e) {
      // Already exists (e.g. the broadcaster connected first) — safe to ignore.
      console.warn('createRoom before egress (continuing):', e);
    }
    const output = new EncodedFileOutput({
      fileType: EncodedFileType.MP4,
      filepath: key,
      output: {
        case: 's3',
        value: new S3Upload({
          accessKey: R2_ACCESS_KEY,
          secret: R2_SECRET,
          bucket: R2_BUCKET,
          region: 'auto',
          endpoint: R2_ENDPOINT,
          forcePathStyle: true,
        }),
      },
    });
    // Composite egress = the mixed room (artist video + audio) as a single MP4.
    const info = await egressClient().startRoomCompositeEgress(room, output, { layout: 'speaker' });
    return { egressId: info.egressId };
  },

  async stopRecording(egressId: string): Promise<void> {
    try {
      await egressClient().stopEgress(egressId);
    } catch {
      // Egress already stopped/finished — idempotent no-op.
    }
  },
};
