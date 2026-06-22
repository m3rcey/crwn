import type { LiveProvider } from './types';
import { livekitProvider } from './livekit';

// Swap the video backend here without touching API/UI contracts.
const PROVIDER = process.env.LIVE_PROVIDER || 'livekit';

function selectProvider(): LiveProvider {
  switch (PROVIDER) {
    case 'livekit':
    default:
      return livekitProvider;
  }
}

export const liveProvider: LiveProvider = selectProvider();
export type { LiveProvider, MintTokenOpts } from './types';
