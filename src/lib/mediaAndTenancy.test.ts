// Security regressions for three confirmed audit findings (2026-08-12):
//
//   SEC-009  private `audio` bucket IDOR. A DM voice note stored a value the
//            caller supplied, and /api/messages/[id]/voice-urls signed it with
//            the service role after checking conversation MEMBERSHIP but never
//            path OWNERSHIP. Any in-bucket object, including a track master,
//            could be turned into a playable signed URL.
//   SEC-014  cross-artist notification injection. An obligation stored an
//            unvalidated `audienceId`, and the squad branch of the fulfillment
//            notifier read `artist_squad_members` with no artist predicate.
//   SEC-018  /api/crm/actions awarded a badge (and a notification whose title
//            the caller controls) to ANY user uuid, with no audience check and
//            no rate limit.
//
// The pure validator is tested directly. The two route-shaped fixes are pinned
// with source scans, because their logic is a query against Supabase and the
// property that matters is structural: the tenancy predicate is present.

import { describe, it, expect } from 'vitest';
import {
  voiceNotePathForOwner,
  isVoiceNotePath,
  storagePathFromAudioValue,
} from './storage/signedAudio';
import { readStripped, violation } from './architecture/sourceScan';

const OWNER = '11111111-2222-4333-8444-555555555555';
const OTHER = '99999999-8888-4777-8666-555555555555';
const ARTIST_PROFILE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

const MESSAGES_ROUTE = 'src/app/api/messages/route.ts';
const BROADCAST_ROUTE = 'src/app/api/messages/broadcast/route.ts';
const VOICE_URLS_ROUTE = 'src/app/api/messages/[conversationId]/voice-urls/route.ts';
const OBLIGATIONS_ROUTE = 'src/app/api/promise-calendar/obligations/route.ts';
const EVENTS_ROUTE = 'src/app/api/promise-calendar/events/[id]/route.ts';
const CRM_ACTIONS_ROUTE = 'src/app/api/crm/actions/route.ts';

describe('SEC-009 voiceNotePathForOwner: only a path the system wrote for THIS sender', () => {
  it('accepts the recorder\'s own bare storage key', () => {
    expect(voiceNotePathForOwner(`voice/${OWNER}/1754972400000.webm`, OWNER))
      .toBe(`voice/${OWNER}/1754972400000.webm`);
    expect(voiceNotePathForOwner(`voice/${OWNER}/1754972400000.ogg`, OWNER))
      .toBe(`voice/${OWNER}/1754972400000.ogg`);
    // Padding is a transport artifact, not a different object.
    expect(voiceNotePathForOwner(`  voice/${OWNER}/1754972400000.webm  `, OWNER))
      .toBe(`voice/${OWNER}/1754972400000.webm`);
  });

  it('rejects an absolute URL, even one pointing at this sender\'s own object', () => {
    const url = `https://ecpqtuidtsncjfwtkvwc.supabase.co/storage/v1/object/public/audio/voice/${OWNER}/1.webm`;
    expect(voiceNotePathForOwner(url, OWNER)).toBeNull();
    expect(voiceNotePathForOwner('https://evil.example/x.webm', OWNER)).toBeNull();
  });

  it('rejects another user\'s voice folder', () => {
    expect(voiceNotePathForOwner(`voice/${OTHER}/1754972400000.webm`, OWNER)).toBeNull();
  });

  it('rejects a track master key (the SEC-009 payload)', () => {
    expect(voiceNotePathForOwner(`${ARTIST_PROFILE}/1754972400000.mp3`, OWNER)).toBeNull();
    expect(voiceNotePathForOwner(`${ARTIST_PROFILE}/1754972400000.wav`, OWNER)).toBeNull();
    const legacyUrl =
      `https://ecpqtuidtsncjfwtkvwc.supabase.co/storage/v1/object/public/audio/${ARTIST_PROFILE}/1754972400000.wav`;
    expect(voiceNotePathForOwner(legacyUrl, OWNER)).toBeNull();
  });

  it('rejects any folder other than voice/, even under the caller\'s own uuid', () => {
    expect(voiceNotePathForOwner(`stems/${OWNER}/1754972400000.wav`, OWNER)).toBeNull();
    expect(voiceNotePathForOwner(`Voice/${OWNER}/1754972400000.webm`, OWNER)).toBeNull();
  });

  it('rejects a non-uuid folder name, so a shared literal folder cannot be claimed', () => {
    expect(voiceNotePathForOwner('voice/public/1754972400000.webm', 'public')).toBeNull();
    expect(voiceNotePathForOwner('voice/1/1754972400000.webm', '1')).toBeNull();
  });

  it('rejects traversal and path tricks', () => {
    expect(voiceNotePathForOwner(`voice/${OWNER}/../${OTHER}/1.webm`, OWNER)).toBeNull();
    expect(voiceNotePathForOwner(`voice/${OWNER}/..`, OWNER)).toBeNull();
    expect(voiceNotePathForOwner(`/voice/${OWNER}/1.webm`, OWNER)).toBeNull();
    expect(voiceNotePathForOwner(`voice\\${OWNER}\\1.webm`, OWNER)).toBeNull();
    expect(voiceNotePathForOwner(`voice/${OWNER}/sub/1.webm`, OWNER)).toBeNull();
    // A valid-looking head followed by an escape: the shape gate must read the
    // WHOLE key, not just the first three segments.
    expect(voiceNotePathForOwner(
      `voice/${OWNER}/1.webm/../../${ARTIST_PROFILE}/1754972400000.wav`, OWNER,
    )).toBeNull();
    expect(voiceNotePathForOwner(`voice/${OWNER}/1 .webm`, OWNER)).toBeNull();
  });

  it('rejects junk input and a non-uuid owner', () => {
    expect(voiceNotePathForOwner('', OWNER)).toBeNull();
    expect(voiceNotePathForOwner(null, OWNER)).toBeNull();
    expect(voiceNotePathForOwner(undefined, OWNER)).toBeNull();
    expect(voiceNotePathForOwner(42, OWNER)).toBeNull();
    expect(voiceNotePathForOwner(`voice/${OWNER}/1.exe`, OWNER)).toBeNull();
    expect(voiceNotePathForOwner(`voice/${OWNER}/1.webm`, 'not-a-uuid')).toBeNull();
  });
});

describe('SEC-009 isVoiceNotePath: the read-side shape gate', () => {
  it('accepts any user\'s well-formed voice key (the other party owns theirs)', () => {
    expect(isVoiceNotePath(`voice/${OTHER}/1754972400000.webm`)).toBe(true);
  });

  it('refuses a track master, a deeper path and a non-path', () => {
    expect(isVoiceNotePath(`${ARTIST_PROFILE}/1754972400000.mp3`)).toBe(false);
    expect(isVoiceNotePath(`voice/${OWNER}/nested/1.webm`)).toBe(false);
    expect(isVoiceNotePath('voice/not-a-uuid/1.webm')).toBe(false);
    expect(isVoiceNotePath(`stems/${OWNER}/1.wav`)).toBe(false);
    expect(isVoiceNotePath(`voice/${OWNER}/1.exe`)).toBe(false);
    expect(isVoiceNotePath(
      `https://ecpqtuidtsncjfwtkvwc.supabase.co/storage/v1/object/public/audio/voice/${OWNER}/1.webm`,
    )).toBe(false);
    expect(isVoiceNotePath(null)).toBe(false);
  });
});

describe('storagePathFromAudioValue: legacy track URLs still resolve, embedded ones do not', () => {
  it('still normalizes the public URL the track uploaders write (playback must not break)', () => {
    const url =
      `https://ecpqtuidtsncjfwtkvwc.supabase.co/storage/v1/object/public/audio/${ARTIST_PROFILE}/1754972400000.mp3`;
    expect(storagePathFromAudioValue(url)).toBe(`${ARTIST_PROFILE}/1754972400000.mp3`);
    expect(storagePathFromAudioValue(`${ARTIST_PROFILE}/1754972400000.mp3`))
      .toBe(`${ARTIST_PROFILE}/1754972400000.mp3`);
  });

  it('refuses a value that merely CONTAINS the public prefix', () => {
    expect(storagePathFromAudioValue(
      `https://evil.example/x?u=/storage/v1/object/public/audio/${ARTIST_PROFILE}/1.mp3`,
    )).toBeNull();
    expect(storagePathFromAudioValue('https://evil.example/storage/v1/object/public/other/1.mp3')).toBeNull();
  });

  it('refuses traversal and backslashes', () => {
    expect(storagePathFromAudioValue('../secrets/1.mp3')).toBeNull();
    expect(storagePathFromAudioValue('voice\\x\\1.webm')).toBeNull();
  });
});

describe('SEC-009 the DM routes store a validated key, never a caller-supplied URL', () => {
  for (const route of [MESSAGES_ROUTE, BROADCAST_ROUTE]) {
    it(`${route} validates the voice path against the authenticated sender`, () => {
      const src = readStripped(route);
      expect(src, violation('SEC-009', `${route} must validate audioUrl through voiceNotePathForOwner`, {
        file: route, owner: 'src/lib/storage/signedAudio.ts',
      })).toContain('voiceNotePathForOwner(');
      expect(src, violation('SEC-009', `${route} must bind the voice path to the authenticated user id`, {
        file: route,
      })).toMatch(/voiceNotePathForOwner\(\s*(raw\.)?audioUrl,\s*user\.id\s*\)/);
      expect(src, violation('SEC-009', `${route} must store the validated path, not the raw request value`, {
        file: route,
      })).toMatch(/audio_url:\s*voicePath/);
      expect(src, violation('SEC-009', `${route} must not resurrect the "any absolute URL" voice check`, {
        file: route,
      })).not.toMatch(/audio_url:\s*isVoice\s*\?/);
    });
  }

  it(`${VOICE_URLS_ROUTE} signs only voice-note shaped keys`, () => {
    const src = readStripped(VOICE_URLS_ROUTE);
    expect(src, violation('SEC-009', 'voice-urls must shape-check every value before signing it', {
      file: VOICE_URLS_ROUTE, owner: 'src/lib/storage/signedAudio.ts',
    })).toContain('isVoiceNotePath(');
    expect(src, violation('SEC-009', 'voice-urls must filter on the shape check before calling signAudioValue', {
      file: VOICE_URLS_ROUTE,
    })).toMatch(/isVoiceNotePath\([\s\S]*signAudioValue\(/);
  });
});

describe('SEC-014 promise calendar: an audience id is validated on write and scoped on read', () => {
  it(`${OBLIGATIONS_ROUTE} proves every caller-supplied id belongs to the caller`, () => {
    const src = readStripped(OBLIGATIONS_ROUTE);
    expect(src, violation('SEC-014', 'the obligations POST must ownership-check audienceId', {
      file: OBLIGATIONS_ROUTE,
    })).toMatch(/belongsToArtist\([\s\S]{0,80}audienceId,\s*artistId\)/);
    expect(src, violation('SEC-014', 'the ownership check must filter by artist_id', {
      file: OBLIGATIONS_ROUTE,
    })).toMatch(/\.eq\('artist_id',\s*artistId\)/);
    expect(src, violation('SEC-014', 'sourceTierId must be ownership-checked', {
      file: OBLIGATIONS_ROUTE,
    })).toMatch(/belongsToArtist\('subscription_tiers',\s*sourceTierId,\s*artistId\)/);
    expect(src, violation('SEC-014', 'sourceProductId must be ownership-checked', {
      file: OBLIGATIONS_ROUTE,
    })).toMatch(/belongsToArtist\('products',\s*sourceProductId,\s*artistId\)/);
    expect(src, violation('SEC-014', 'the insert must use the validated ids, never the raw body values', {
      file: OBLIGATIONS_ROUTE,
    })).not.toMatch(/audience_id:\s*b\.audienceId/);
  });

  it(`${EVENTS_ROUTE} scopes the squad lookup by artist, like the tier branch`, () => {
    const src = readStripped(EVENTS_ROUTE);
    const squadBranch = src.slice(src.indexOf("audience_kind === 'squad'"));
    expect(squadBranch.length, 'the squad branch must still exist in the fulfillment notifier').toBeGreaterThan(100);
    expect(squadBranch, violation('SEC-014', 'the squad branch must prove the squad belongs to this artist', {
      file: EVENTS_ROUTE,
    })).toMatch(/from\('artist_squads'\)[\s\S]{0,200}\.eq\('artist_id',\s*artistId\)/);
    expect(squadBranch, violation('SEC-014', 'the artist_id predicate must come BEFORE the members read', {
      file: EVENTS_ROUTE,
    })).toMatch(/\.eq\('artist_id',\s*artistId\)[\s\S]*from\('artist_squad_members'\)/);
  });
});

describe('SEC-018 crm/actions: a badge may only reach the caller\'s own audience', () => {
  it('checks audience membership before awarding, and caps the rate', () => {
    const src = readStripped(CRM_ACTIONS_ROUTE);
    expect(src, violation('SEC-018', 'crm/actions must verify fanId is in the caller artist\'s audience', {
      file: CRM_ACTIONS_ROUTE,
    })).toMatch(/fanIsInArtistAudience\(caller\.artistId,\s*fanId\)/);
    expect(src, violation('SEC-018', 'the audience check must run BEFORE awardFanBadge', {
      file: CRM_ACTIONS_ROUTE,
    })).toMatch(/fanIsInArtistAudience\([\s\S]*awardFanBadge\(/);
    expect(src, violation('SEC-018', 'the membership query must be scoped to the caller artist', {
      file: CRM_ACTIONS_ROUTE,
    })).toMatch(/\.eq\('artist_id',\s*artistId\)/);
    expect(src, violation('SEC-018', 'crm/actions must be rate limited like every other interruption path', {
      file: CRM_ACTIONS_ROUTE,
    })).toMatch(/checkRateLimit\(caller\.userId,/);
    expect(src, violation('SEC-018', 'the caller-supplied badge label and icon must be length bounded', {
      file: CRM_ACTIONS_ROUTE,
    })).toMatch(/label:\s*bounded\(metadata\.label,\s*\d+\)/);
  });
});

// Positive control. Every assertion above is a substring search over a file
// read from disk: if a path went stale the searches would pass vacuously by
// finding nothing in an empty string. readStripped throws on a missing file,
// and this proves the content it returns is the route it claims to be.
describe('positive control: the scanned files are real routes', () => {
  for (const route of [
    MESSAGES_ROUTE, BROADCAST_ROUTE, VOICE_URLS_ROUTE,
    OBLIGATIONS_ROUTE, EVENTS_ROUTE, CRM_ACTIONS_ROUTE,
  ]) {
    it(`${route} is present and exports a handler`, () => {
      const src = readStripped(route);
      expect(src.length).toBeGreaterThan(500);
      expect(src).toMatch(/export async function (POST|PATCH)\(/);
    });
  }
});
