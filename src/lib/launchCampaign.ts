// launchCampaign.ts — the launch campaign composer's PURE generator (Launch
// Wizard Stage 8, docs/ARTIST_LAUNCH_WIZARD.md; spec Phase 8).
//
// Turns what the artist actually built (their page, their free front door,
// their entry paid tier, their imported audience) into a ready launch kit:
// announcement email, follow-up email, social caption, story copy, DM copy,
// share link, a suggested audience order, and a suggested send date.
//
// DRAFTS ONLY by design: the emails become `campaigns` rows with status
// 'draft' through the existing /api/campaigns route, the artist reviews them
// in the existing composer, and sending stays behind the compliant contacts
// sender (attested + subscribed + suppression). Nothing here sends anything.
//
// Copy notes: fan-facing, written in the artist's voice, warm not corporate.
// Personalization tokens ({{first_name}}) are the ones the campaign sender
// already resolves. No em dashes anywhere.

export interface LaunchKitInput {
  artistName: string;
  /** Full share URL, e.g. https://thecrwn.app/m3rcey */
  shareUrl: string;
  /** The $0 front-door tier name, null if none exists yet. */
  freeTierName: string | null;
  /** The cheapest paid tier, null if none exists yet. */
  paidTierName: string | null;
  /** e.g. "$10/mo", matching the paid tier. Null when no paid tier. */
  paidPriceLabel: string | null;
  /** Imported, emailable contacts. */
  contactCount: number;
  /** Contacts tagged 'patreon' (the warmest segment). */
  patreonCount: number;
}

export interface LaunchEmailDraft {
  name: string;
  subject: string;
  body: string;
}

export interface LaunchKit {
  announcement: LaunchEmailDraft;
  followUp: LaunchEmailDraft;
  socialCaption: string;
  storyCopy: string;
  dmCopy: string;
  shareUrl: string;
  /** The spec's "test launch to 10 to 25 fans" default. */
  suggestedTestCount: number;
  /** One sentence: who to send to first and why. */
  segmentSuggestion: string;
}

/**
 * Suggested send date: the coming Friday, at least two full days out, at noon
 * local time (launch emails land best late-week, and two days leaves room to
 * review the draft instead of firing it hot).
 */
export function suggestLaunchDate(now: Date): Date {
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 2);
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1);
  return d;
}

const joinLine = (freeTierName: string | null): string =>
  freeTierName
    ? `Joining is free: the ${freeTierName} tier gets you in the door.`
    : 'Joining is free.';

export function buildLaunchKit(input: LaunchKitInput): LaunchKit {
  const { artistName, shareUrl, freeTierName, paidTierName, paidPriceLabel, contactCount, patreonCount } = input;

  const paidLine =
    paidTierName && paidPriceLabel
      ? `And if you want everything, ${paidTierName} (${paidPriceLabel}) is where the exclusives live.`
      : '';

  const announcement: LaunchEmailDraft = {
    name: 'Launch announcement',
    subject: `{{first_name}}, I built us a home`,
    body: [
      `Hey {{first_name}},`,
      ``,
      `I just opened my own page. Not another social profile: a home for my music that no algorithm sits between us on.`,
      ``,
      `${joinLine(freeTierName)} ${paidLine}`.trim(),
      ``,
      `You are getting this because you have supported me before, and I wanted you in first.`,
      ``,
      `Claim your place here: ${shareUrl}`,
      ``,
      `${artistName}`,
    ].join('\n'),
  };

  const followUp: LaunchEmailDraft = {
    name: 'Launch follow-up',
    subject: `Before it gets buried, {{first_name}}`,
    body: [
      `Hey {{first_name}},`,
      ``,
      `Quick one. A few days ago I sent you the link to my new home. If it got buried, here it is again: ${shareUrl}`,
      ``,
      `The people joining now are the ones I will be building this with. I would love your name on that list.`,
      ``,
      `${artistName}`,
    ].join('\n'),
  };

  const socialCaption = [
    `My music has a home now. Mine, not an algorithm's.`,
    `First listens, exclusives, and the inner circle all live here:`,
    shareUrl,
  ].join('\n');

  const storyCopy = `I built us a home. Free to join, first supporters get in first. Link in bio.`;

  const dmCopy = `Yo, you have supported me since before anyone cared, so you are hearing this first: I opened my own page. Free to join. ${shareUrl}`;

  const segmentSuggestion =
    patreonCount > 0
      ? `Start with your ${patreonCount} Patreon members (they already paid you monthly), then the rest of your ${contactCount} imported contacts.`
      : contactCount > 0
        ? `Start with a small test group from your ${contactCount} imported contacts, read the replies, then send to the rest.`
        : `Import your fan contacts first, or launch manually by sharing the link yourself.`;

  return {
    announcement,
    followUp,
    socialCaption,
    storyCopy,
    dmCopy,
    shareUrl,
    suggestedTestCount: 20,
    segmentSuggestion,
  };
}
