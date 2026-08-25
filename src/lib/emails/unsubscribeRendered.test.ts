import { describe, it, expect } from 'vitest';
import { campaignEmail } from './campaignEmail';
import {
  ALL_ARTISTS,
  UNSUBSCRIBE_TOKEN_PARAM,
  contactRecipient,
  fanRecipient,
  verifyUnsubscribeScope,
  type UnsubscribeKind,
} from './unsubscribeToken';

// UNSUB-SIGN-004. The pairing tests prove a token that is minted correctly verifies. They do
// NOT prove the TEMPLATE emits one. A sender that passed a wrong descriptor, or a template
// change that dropped the signing branch, would leave both suites green while every delivered
// unsubscribe link 403s, which is a compliance failure nothing logs and no artist reports.
// So: render the real HTML, pull the real hrefs out of it, and verify those tokens against the
// scope the ROUTE derives for that row.

const FAN = '11111111-1111-1111-1111-111111111111';
const CONTACT = '22222222-2222-2222-2222-222222222222';
const ARTIST = '33333333-3333-3333-3333-333333333333';
const SEND = '44444444-4444-4444-4444-444444444444';
const ENROLLMENT = '55555555-5555-5555-5555-555555555555';

/** Every href in the rendered mail, in document order. */
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

const findLink = (html: string, path: string) =>
  hrefs(html).find((h) => h.includes(path));

const tokenOf = (url: string) =>
  new URL(url).searchParams.get(UNSUBSCRIBE_TOKEN_PARAM);

function verifies(url: string | undefined, kind: UnsubscribeKind, id: string, artistId: string, recipient: string) {
  if (!url) return false;
  return verifyUnsubscribeScope({ kind, id, artistId, recipient }, tokenOf(url));
}

describe('UNSUB-SIGN-004 the rendered email carries links the routes will accept', () => {
  it('campaign to a FAN: both body links are signed and verify', () => {
    const html = campaignEmail({
      body: 'hello',
      artistName: 'Test Artist',
      sendId: SEND,
      unsubscribeUrl: `https://thecrwn.app/api/campaigns/unsubscribe/${SEND}`,
      trackingPixelUrl: 'https://thecrwn.app/pixel',
      platformTier: 'starter',
      unsubscribeSigning: { recipient: fanRecipient(FAN), artistId: ARTIST },
    });

    const perArtist = findLink(html, '/api/campaigns/unsubscribe/');
    const all = findLink(html, '/api/campaigns/unsubscribe-all/');

    expect(perArtist, 'per-artist link missing from rendered mail').toBeTruthy();
    expect(all, 'all-artists link missing from rendered mail').toBeTruthy();
    expect(verifies(perArtist, 'campaign-artist', SEND, ARTIST, fanRecipient(FAN))).toBe(true);
    expect(verifies(all, 'campaign-all', SEND, ALL_ARTISTS, fanRecipient(FAN))).toBe(true);
  });

  it('campaign to an imported CONTACT: one signature satisfies BOTH routes', () => {
    // The two routes derive the contact from contact_id. This is the case that was broken
    // before 2026-08-24, when the all-artists route derived it from the email address.
    const html = campaignEmail({
      body: 'hello',
      artistName: 'Test Artist',
      sendId: SEND,
      unsubscribeUrl: `https://thecrwn.app/api/campaigns/unsubscribe/${SEND}`,
      trackingPixelUrl: 'https://thecrwn.app/pixel',
      platformTier: 'starter',
      unsubscribeSigning: { recipient: contactRecipient(CONTACT), artistId: ARTIST },
    });

    expect(verifies(findLink(html, '/api/campaigns/unsubscribe/'), 'campaign-artist', SEND, ARTIST, contactRecipient(CONTACT))).toBe(true);
    expect(verifies(findLink(html, '/api/campaigns/unsubscribe-all/'), 'campaign-all', SEND, ALL_ARTISTS, contactRecipient(CONTACT))).toBe(true);
  });

  it('sequence rail: the pre-signed body link survives, and gets exactly ONE token', () => {
    // The sequence body link is keyed on the ENROLLMENT, so the caller signs it and sets
    // bodyLinkPreSigned. If the template ever re-signs it, the URL carries two `t=` params and
    // the caller's intent is silently overwritten.
    const preSigned = `https://thecrwn.app/api/sequences/unsubscribe/${ENROLLMENT}?${UNSUBSCRIBE_TOKEN_PARAM}=deadbeef`;
    const html = campaignEmail({
      body: 'hello',
      artistName: 'Test Artist',
      sendId: SEND,
      unsubscribeUrl: preSigned,
      trackingPixelUrl: 'https://thecrwn.app/pixel',
      platformTier: 'starter',
      trackBasePath: '/api/sequences/track',
      unsubscribeSigning: { recipient: fanRecipient(FAN), artistId: ARTIST, bodyLinkPreSigned: true },
    });

    const body = findLink(html, '/api/sequences/unsubscribe/')!;
    expect(body).toBe(preSigned);
    expect((body.match(new RegExp(`${UNSUBSCRIBE_TOKEN_PARAM}=`, 'g')) || []).length).toBe(1);
    // The all-artists link IS keyed on sendId, so the template still signs that one.
    expect(verifies(findLink(html, '/api/campaigns/unsubscribe-all/'), 'campaign-all', SEND, ALL_ARTISTS, fanRecipient(FAN))).toBe(true);
  });

  it('with NO signing descriptor the links are bare, which is what the legacy flag covers', () => {
    const html = campaignEmail({
      body: 'hello',
      artistName: 'Test Artist',
      sendId: SEND,
      unsubscribeUrl: `https://thecrwn.app/api/campaigns/unsubscribe/${SEND}`,
      trackingPixelUrl: 'https://thecrwn.app/pixel',
      platformTier: 'starter',
    });
    expect(tokenOf(findLink(html, '/api/campaigns/unsubscribe/')!)).toBeNull();
  });
});
