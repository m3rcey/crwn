import { describe, it, expect } from 'vitest';
import { freshStreamUrl, STREAM_URL_FRESH_MARGIN_MS } from './streamUrl';

const HOUR = 3600 * 1000;

describe('freshStreamUrl: a pre-signed url is used only while it cannot rot mid-song', () => {
  const now = 1_800_000_000_000;

  it('returns the url when comfortably inside the window', () => {
    expect(freshStreamUrl({ stream_url: 'https://x/a.wav?token=t', stream_url_expires_at: now + HOUR }, now))
      .toBe('https://x/a.wav?token=t');
  });

  it('refuses a url inside the safety margin, so a long listen never starts on an expiring url', () => {
    const expiresAt = now + STREAM_URL_FRESH_MARGIN_MS - 1;
    expect(freshStreamUrl({ stream_url: 'https://x/a.wav', stream_url_expires_at: expiresAt }, now)).toBeNull();
  });

  it('refuses an expired url', () => {
    expect(freshStreamUrl({ stream_url: 'https://x/a.wav', stream_url_expires_at: now - 1 }, now)).toBeNull();
  });

  it('refuses a url with no expiry, an empty url, and a row with nothing attached', () => {
    expect(freshStreamUrl({ stream_url: 'https://x/a.wav' }, now)).toBeNull();
    expect(freshStreamUrl({ stream_url: 'https://x/a.wav', stream_url_expires_at: null }, now)).toBeNull();
    expect(freshStreamUrl({ stream_url: '', stream_url_expires_at: now + HOUR }, now)).toBeNull();
    expect(freshStreamUrl({}, now)).toBeNull();
  });
});
