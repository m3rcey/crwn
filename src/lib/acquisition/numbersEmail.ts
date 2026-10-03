// "Email their numbers": the one email Josh sends a lead by hand from /admin (Acquisition, Leads).
//
// Founder ask, 2026-10-03: "email people a link that shows their numbers with the VSL right up
// under the link." So the shape is fixed and pinned by numbersEmail.test.ts: a greeting, one line,
// the link to their saved result, and DIRECTLY under it the calculator VSL. Nothing sits between
// the two, and both sit above anything else, so the first screen of the email is the link and the
// video (the CTA-above-the-fold rule, applied to an inbox).
//
// Pure. No client, no network, no clock. The server half (numbersEmailServer.ts) resolves the lead
// from the result row, mints the link, and sends through channels.send(), which owns consent,
// suppression, caps, dedupe and the unsubscribe footer.
//
// What it may say: nothing computed. It never quotes the stored headline either, because real
// headlines include "About $0 a month is sitting on the table", and an email leading with $0 is
// worse than one that lets the page show the number with its assumptions beside it.
//
// The video is a linked POSTER, never a <video>: Gmail and Outlook render no video element, and a
// broken embed costs the click a poster reliably earns (same rule as the nurture video block).

export interface NumbersEmailInput {
  /** Greeting name, already filtered by firstNameOf (never an email or a handle). */
  firstName: string | null;
  /** The calculator they ran, e.g. "Own Your Fans Calculator". null = say "your numbers". */
  toolName: string | null;
  /** Absolute, freshly minted link to their saved result. */
  resultUrl: string;
  /** The VSL, or null when it has no hosted video (then the email simply has no video block). */
  video: { watchUrl: string; posterUrl: string; title: string; minutes: number } | null;
}

export interface NumbersEmail {
  subject: string;
  html: string;
  text: string;
}

export const NUMBERS_CTA_LABEL = 'See my numbers';

export function renderNumbersEmail(input: NumbersEmailInput): NumbersEmail {
  const { firstName, toolName, resultUrl, video } = input;
  const hi = firstName ? `Hey ${firstName},` : 'Hey,';
  const subject = firstName ? `${firstName}, your numbers` : 'Your numbers from CRWN';
  const ran = toolName ? `the ${toolName}` : 'your numbers with CRWN';
  const lead = `Josh here. I built CRWN. You ran ${ran}, and your result is saved exactly as you answered it, so there is nothing to fill in again.`;
  const after = 'If a number looks off for you, reply and tell me why. I read these myself.';
  const mins = video && video.minutes > 0 ? `${video.minutes} min` : '';
  const videoLine = 'Not sure the number is real? Watch how it is built.';

  const p = (t: string) => `<p style="margin:0 0 16px;">${esc(t)}</p>`;

  const button = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;"><tr><td style="border-radius:999px;background:#D4AF37;">
      <a href="${esc(resultUrl)}" style="display:inline-block;padding:14px 28px;color:#0f0f0f;font-weight:700;font-size:15px;text-decoration:none;border-radius:999px;">${esc(NUMBERS_CTA_LABEL)}</a>
    </td></tr></table>`;

  const videoBlock = video
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;"><tr><td>
      <a href="${esc(video.watchUrl)}" style="text-decoration:none;display:block;color:#222;">
        <img src="${esc(video.posterUrl)}" width="560" alt="${esc(video.title)}" style="display:block;width:100%;max-width:560px;height:auto;border-radius:12px;border:1px solid #e3e3e3;" />
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;"><tr>
          <td style="color:#222;font-size:15px;font-weight:700;line-height:1.4;">&#9654;&nbsp; ${esc(videoLine)}</td>
          ${mins ? `<td align="right" style="color:#777;font-size:13px;white-space:nowrap;padding-left:12px;">${esc(mins)}</td>` : ''}
        </tr></table>
      </a>
    </td></tr></table>`
    : '';

  const html = `<div style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#222;">${p(hi)}${p(lead)}${button}${videoBlock}${p(after)}${p('Josh')}</div>`;

  const text = [
    hi,
    lead,
    `${NUMBERS_CTA_LABEL}: ${resultUrl}`,
    video ? `${videoLine.replace(/\.$/, '')}${mins ? ` (${mins})` : ''}: ${video.watchUrl}` : '',
    after,
    'Josh',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject, html, text };
}

function esc(s: string): string {
  return String(s).replace(
    /[&<>"'`]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' })[c] as string,
  );
}
