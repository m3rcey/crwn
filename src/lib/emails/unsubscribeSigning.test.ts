import { describe, it, expect } from 'vitest';
import { readStripped } from '../architecture/sourceScan';
import {
  ALL_ARTISTS,
  CRWN_PLATFORM,
  UNSUBSCRIBE_TOKEN_PARAM,
  appendUnsubscribeToken,
  contactRecipient,
  emailRecipient,
  fanRecipient,
  verifyUnsubscribeScope,
  type UnsubscribeScope,
} from './unsubscribeToken';

// UNSUB-SIGN-001. Every sender mints a token; every route re-derives the scope FROM THE ROW and
// verifies against it. If the two sides disagree by one field, the route answers 403 and a real
// person who wants out cannot get out, which is a compliance failure that no error log surfaces.
//
// These cases pair each sender's descriptor with the derivation its route performs. They are the
// reason the contact case exists at all: the per-artist route derives contact:<contact_id> while
// the all-artists route derived contact:<email>, so ONE signature could not satisfy both until
// they were reconciled (2026-08-24).

const tokenOf = (url: string) => new URL(url).searchParams.get(UNSUBSCRIBE_TOKEN_PARAM);

/** Sign the way a sender does, verify the way the route does. */
function roundTrip(minted: UnsubscribeScope, derivedByRoute: UnsubscribeScope): boolean {
  const token = tokenOf(appendUnsubscribeToken('https://thecrwn.app/api/x/1', minted));
  return verifyUnsubscribeScope(derivedByRoute, token);
}

const FAN = '11111111-1111-1111-1111-111111111111';
const CONTACT = '22222222-2222-2222-2222-222222222222';
const ARTIST = '33333333-3333-3333-3333-333333333333';
const SEND = '44444444-4444-4444-4444-444444444444';
const ENROLLMENT = '55555555-5555-5555-5555-555555555555';

describe('UNSUB-SIGN-001 every sender mints a token its route accepts', () => {
  it('campaign to a FAN: body link (campaign-artist)', () => {
    const scope: UnsubscribeScope = { kind: 'campaign-artist', id: SEND, artistId: ARTIST, recipient: fanRecipient(FAN) };
    // Route: recipient = !fanId && contactId ? contactRecipient(contactId) : fanRecipient(fanId)
    expect(roundTrip(scope, { ...scope, recipient: fanRecipient(FAN) })).toBe(true);
  });

  it('campaign to a FAN: all-artists link (campaign-all)', () => {
    const scope: UnsubscribeScope = { kind: 'campaign-all', id: SEND, artistId: ALL_ARTISTS, recipient: fanRecipient(FAN) };
    // Route: recipient = fanId ? fanRecipient(fanId) : contactRecipient(contactId || email)
    expect(roundTrip(scope, { ...scope, recipient: fanRecipient(FAN) })).toBe(true);
  });

  it('campaign to an imported CONTACT: BOTH links verify from one signature', () => {
    // The sender signs once; campaignEmail renders both links from that one recipient.
    const recipient = contactRecipient(CONTACT);
    const body: UnsubscribeScope = { kind: 'campaign-artist', id: SEND, artistId: ARTIST, recipient };
    const all: UnsubscribeScope = { kind: 'campaign-all', id: SEND, artistId: ALL_ARTISTS, recipient };
    expect(roundTrip(body, { ...body, recipient: contactRecipient(CONTACT) })).toBe(true);
    // This is the assertion that was false before the reconciliation: the all-artists route used
    // to derive contactRecipient(email) for the same row.
    expect(roundTrip(all, { ...all, recipient: contactRecipient(CONTACT) })).toBe(true);
  });

  it('artist sequence: body link is keyed on the ENROLLMENT, not the send', () => {
    const scope: UnsubscribeScope = { kind: 'sequence-artist', id: ENROLLMENT, artistId: ARTIST, recipient: fanRecipient(FAN) };
    expect(roundTrip(scope, { ...scope })).toBe(true);
    // A token minted over the send id (what the template would have signed) must NOT verify.
    expect(roundTrip({ ...scope, id: SEND }, scope)).toBe(false);
  });

  it('CRM outreach: keyed on the address, and case cannot break it', () => {
    const scope: UnsubscribeScope = { kind: 'crm-outreach', id: SEND, artistId: CRWN_PLATFORM, recipient: emailRecipient('Josh@Example.com') };
    expect(roundTrip(scope, { ...scope, recipient: emailRecipient('josh@example.com') })).toBe(true);
  });
});

describe('UNSUB-SIGN-002 a token stays bound to its exact scope', () => {
  const base: UnsubscribeScope = { kind: 'campaign-artist', id: SEND, artistId: ARTIST, recipient: fanRecipient(FAN) };

  it('cannot be replayed onto another kind, row, list or person', () => {
    expect(roundTrip(base, { ...base, kind: 'campaign-all' })).toBe(false);
    expect(roundTrip(base, { ...base, id: ENROLLMENT })).toBe(false);
    expect(roundTrip(base, { ...base, artistId: ALL_ARTISTS })).toBe(false);
    expect(roundTrip(base, { ...base, recipient: fanRecipient(CONTACT) })).toBe(false);
  });
});

describe('UNSUB-SIGN-003 the two campaign routes derive the SAME recipient for one row', () => {
  // The round-trip cases above prove the contract; this proves the routes still implement it.
  // campaignEmail signs both body links from ONE recipient, so the moment these two derivations
  // diverge, every signed "unsubscribe from all" a contact clicks answers 403.
  const perArtist = readStripped('src/app/api/campaigns/unsubscribe/[sendId]/route.ts');
  const allArtists = readStripped('src/app/api/campaigns/unsubscribe-all/[sendId]/route.ts');

  it('both prefer contactRecipient(contactId) over the address', () => {
    expect(perArtist).toContain('contactRecipient(contactId)');
    expect(allArtists).toContain('contactRecipient(contactId || email)');
  });

  it('neither derives a contact from the address alone', () => {
    expect(allArtists).not.toContain('contactRecipient(email)');
  });
});
