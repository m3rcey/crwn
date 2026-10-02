// memberWelcome.ts: PURE. The one email a fan gets the moment they join an artist, free or paid.
//
// WHAT IT REPLACED (audited 2026-10-02):
//   • Paid joins got "You're in 🎉" listing three HARD-CODED perks ("Exclusive Music", "Community",
//     "Shop") that had nothing to do with the tier they bought, and a button to CRWN's /home feed
//     instead of the artist they had just paid.
//   • Free joins through the artist page got NOTHING: no email, no first step.
//
// THE SHAPE, and why (docs/crwn-brain/35-LIFECYCLE-EMAIL-STRATEGY.md):
//   1. One thing to play NOW. People buy the dream and stay for the early win; the first email
//      after a join should be something to consume, not a feature list. One button, to the
//      artist, never to a CRWN hub.
//   2. What this rung includes, in the SAME words the tier card showed them (tierCardBenefitLines),
//      so the email can never promise something the card did not.
//   3. Free only: ONE concrete thing the next rung adds, named as the thing, not as "upgrade".
//      No deadline, no scarcity: the only real cap is a Founder Window and this email does not
//      claim one.
// From "<Artist> via CRWN": it is the artist's relationship, CRWN is only the sender of record.
// TRANSACTIONAL: it answers the fan's own join, once, so it carries no unsubscribe.

export interface MemberWelcomeInput {
  fanName: string | null;
  artistName: string;
  artistSlug: string | null;
  tierName: string;
  isPaid: boolean;
  /** The tier card's own lines (tierCardBenefitLines). May be empty. */
  benefitLines: string[];
  /** The one thing to play first, or null when the artist has nothing the fan can play yet. */
  startHere: { title: string; trackId: string } | null;
  /** Free joins only: the next rung up and the one thing it adds. */
  nextRung: { name: string; priceCents: number; headline: string | null } | null;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const BASE = 'https://thecrwn.app';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A display name made safe for an RFC 5322 From header: no angle brackets, quotes or newlines. */
export function senderName(artistName: string): string {
  const clean = artistName.replace(/[<>"\r\n]/g, '').trim().slice(0, 60);
  return clean || 'Your artist';
}

export function memberWelcomeFrom(artistName: string): string {
  return `${senderName(artistName)} via CRWN <hello@thecrwn.app>`;
}

function firstName(name: string | null): string {
  const n = (name || '').trim().split(/\s+/)[0];
  // An email-shaped display name is the signup seed, never a name to greet someone by.
  if (!n || n.includes('@')) return '';
  return n;
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

/** Strip a leading emoji/icon the card prints, for the plain-text part. */
function plainLine(line: string): string {
  return line.replace(/^[^\p{L}\p{N}$"'(]+/u, '').trim();
}

export function memberWelcomeEmail(input: MemberWelcomeInput): RenderedEmail {
  const name = firstName(input.fanName);
  const artist = input.artistName.trim() || 'this artist';
  const pageUrl = input.artistSlug ? `${BASE}/${input.artistSlug}` : `${BASE}/home`;
  const playUrl =
    input.startHere && input.artistSlug ? `${BASE}/${input.artistSlug}/track/${input.startHere.trackId}` : pageUrl;
  const ctaLabel = input.startHere ? `Play ${input.startHere.title}` : `Open ${artist}'s page`;

  const subject = input.isPaid
    ? `You're in ${input.tierName}. Start here.`
    : `You're in. Here's where to start with ${artist}.`;

  const opener = input.isPaid
    ? `You just joined ${input.tierName}. Here is the first thing to hear.`
    : `You just joined ${artist} on CRWN. Here is the first thing to hear.`;

  const startLine = input.startHere
    ? `Start with "${input.startHere.title}".`
    : `New music lands on ${artist}'s page first, and you will hear about it.`;

  const benefits = input.benefitLines.slice(0, 6);
  const next = !input.isPaid ? input.nextRung : null;
  const nextLine = next
    ? next.headline
      ? `${next.name} (${dollars(next.priceCents)}/mo) adds: ${plainLine(next.headline)}.`
      : `${next.name} is ${dollars(next.priceCents)}/mo when you want more.`
    : null;

  const greeting = name ? `${name},` : 'Hey,';

  const text = [
    greeting,
    '',
    opener,
    startLine,
    `${ctaLabel}: ${playUrl}`,
    ...(benefits.length ? ['', `What ${input.tierName} includes:`, ...benefits.map((b) => `- ${plainLine(b)}`)] : []),
    ...(nextLine ? ['', nextLine, `See it on ${artist}'s page: ${pageUrl}`] : []),
    '',
    `${artist}`,
    '',
    `Manage your membership any time from your CRWN account: ${BASE}/profile`,
  ].join('\n');

  const e = escapeHtml;
  const benefitHtml = benefits.length
    ? `<p style="color:#FFFFFF;font-size:15px;font-weight:600;margin:28px 0 8px;">What ${e(input.tierName)} includes</p>
      ${benefits
        .map((b) => `<div style="padding:8px 0;border-bottom:1px solid #2A2A2A;color:#C8C8C8;font-size:15px;line-height:1.5;">${e(b)}</div>`)
        .join('')}`
    : '';
  const nextHtml = nextLine
    ? `<p style="color:#A0A0A0;font-size:15px;line-height:1.6;margin:24px 0 0;">${e(nextLine)} <a href="${e(pageUrl)}" style="color:#D4AF37;">See it on ${e(artist)}'s page</a>.</p>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0D0D0D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background-color:#1A1A1A;border-radius:16px;padding:28px;">
      <p style="color:#FFFFFF;font-size:16px;margin:0 0 12px;">${e(greeting)}</p>
      <p style="color:#C8C8C8;font-size:16px;line-height:1.6;margin:0 0 8px;">${e(opener)}</p>
      <p style="color:#C8C8C8;font-size:16px;line-height:1.6;margin:0 0 24px;">${e(startLine)}</p>
      <div style="text-align:center;margin:0 0 8px;">
        <a href="${e(playUrl)}" style="display:inline-block;background:#D4AF37;color:#0D0D0D;font-weight:700;font-size:16px;padding:14px 28px;border-radius:999px;text-decoration:none;">${e(ctaLabel)}</a>
      </div>
      ${benefitHtml}
      ${nextHtml}
      <p style="color:#FFFFFF;font-size:15px;margin:28px 0 0;">${e(artist)}</p>
    </div>
    <p style="color:#666;font-size:12px;line-height:1.5;text-align:center;margin:20px 0 0;">
      Sent by CRWN for ${e(artist)}. Manage your membership from <a href="${BASE}/profile" style="color:#666;">your account</a>.
    </p>
  </div>
</body>
</html>`;

  return { subject, html, text };
}
