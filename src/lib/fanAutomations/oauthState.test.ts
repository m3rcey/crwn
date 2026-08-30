import { describe, it, expect } from 'vitest';
import { mintOAuthState, verifyOAuthState } from './oauthState';

const SECRET = 'test-signing-secret';
const INPUT = { artistId: 'artist-1', userId: 'user-1', provider: 'instagram' as const };

describe('oauthState', () => {
  it('round-trips and binds artist, user, and provider', () => {
    const state = mintOAuthState(INPUT, Date.now(), SECRET)!;
    const payload = verifyOAuthState(state, Date.now(), SECRET);
    expect(payload).toMatchObject(INPUT);
  });

  it('fails CLOSED without a secret on both ends', () => {
    expect(mintOAuthState(INPUT, Date.now(), '')).toBeNull();
    const state = mintOAuthState(INPUT, Date.now(), SECRET)!;
    expect(verifyOAuthState(state, Date.now(), '')).toBeNull();
  });

  it('a tampered payload is refused', () => {
    const state = mintOAuthState(INPUT, Date.now(), SECRET)!;
    const [payload, sig] = state.split('.');
    const forged = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    forged.artistId = 'victim-artist';
    const forgedEncoded = Buffer.from(JSON.stringify(forged)).toString('base64url');
    expect(verifyOAuthState(`${forgedEncoded}.${sig}`, Date.now(), SECRET)).toBeNull();
  });

  it('a signature under a different secret is refused', () => {
    const state = mintOAuthState(INPUT, Date.now(), 'other-secret')!;
    expect(verifyOAuthState(state, Date.now(), SECRET)).toBeNull();
  });

  it('an expired state is refused (16 minutes old)', () => {
    const then = Date.now() - 16 * 60 * 1000;
    const state = mintOAuthState(INPUT, then, SECRET)!;
    expect(verifyOAuthState(state, Date.now(), SECRET)).toBeNull();
  });

  it('garbage shapes are refused', () => {
    expect(verifyOAuthState(null, Date.now(), SECRET)).toBeNull();
    expect(verifyOAuthState('a.b.c', Date.now(), SECRET)).toBeNull();
    expect(verifyOAuthState('justonepart', Date.now(), SECRET)).toBeNull();
  });
});
