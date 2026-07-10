import type { SupabaseClient } from '@supabase/supabase-js';

export interface TrackAudio {
  audio_url_128: string | null;
  audio_url_320: string | null;
}

/**
 * Audio URLs live on `tracks`, but anon and authenticated hold no SELECT
 * privilege on those two columns (schema-phase2-tracks-audio-column-privs.sql).
 * The only client-readable source is the `tracks_public` view, which returns the
 * URLs when the reader is entitled and NULL when they are not.
 *
 * Components that reach tracks through an embed (`favorites -> tracks`,
 * `purchases -> tracks`) cannot select the audio inline, so they fetch metadata
 * through the embed and the audio through here.
 */
export async function fetchPlayableAudio(
  supabase: SupabaseClient,
  trackIds: string[]
): Promise<Map<string, TrackAudio>> {
  const audio = new Map<string, TrackAudio>();
  const ids = [...new Set(trackIds.filter(Boolean))];
  if (ids.length === 0) return audio;

  const { data } = await supabase
    .from('tracks_public')
    .select('id, audio_url_128, audio_url_320')
    .in('id', ids);

  for (const row of data ?? []) {
    audio.set(row.id, {
      audio_url_128: row.audio_url_128 ?? null,
      audio_url_320: row.audio_url_320 ?? null,
    });
  }
  return audio;
}
