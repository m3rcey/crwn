'use client';

import { analyze } from 'web-audio-beat-detector';

export async function detectBpm(file: File): Promise<number | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const OfflineCtor =
      (window as unknown as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext })
        .OfflineAudioContext ||
      (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!OfflineCtor) return null;

    const tmpCtx = new OfflineCtor(1, 44100, 44100);
    const audioBuffer = await tmpCtx.decodeAudioData(arrayBuffer);
    const bpm = await analyze(audioBuffer);
    if (!Number.isFinite(bpm)) return null;
    return Math.round(bpm * 10) / 10;
  } catch {
    return null;
  }
}
