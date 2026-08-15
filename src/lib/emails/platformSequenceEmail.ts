// The ONE renderer for platform-sequence emails (the post-signup lifecycle and activation nudges).
//
// Extracted from the cron on 2026-08-15 so that what a preview shows and what an artist receives
// cannot drift. It was inline in `/api/cron/platform-sequences`, which meant the only way to see
// one of these 27 emails was to receive it.
//
// Pure: tokens in, subject and HTML out. No database, no mail provider, no side effects.

/** Everything the sequence copy may interpolate. A missing token is left as its literal
 *  `{{name}}`, which is deliberate: a visible placeholder in a test send is a bug report, whereas
 *  an empty string silently ships a sentence with a hole in it. */
export interface PlatformSequenceTokens {
  first_name?: string | null;
  artist_slug?: string | null;
  platform_tier?: string | null;
  dashboard_url?: string | null;
  upgrade_url?: string | null;
  [key: string]: string | null | undefined;
}

export function resolvePlatformTokens(text: string, tokens: PlatformSequenceTokens): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => tokens[key] ?? match);
}

/**
 * Escape before interpolating into HTML.
 *
 * This is not theoretical. `first_name` comes from the artist's own display name, which is
 * user-controlled, and the previous inline template interpolated the resolved body straight into
 * the markup. An artist called `<b>x` reshaped the email; a worse name did worse. The copy itself
 * is admin-authored, but the TOKENS are not, so the whole resolved string is escaped.
 */
function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

export interface RenderedPlatformEmail {
  subject: string;
  html: string;
  /** Plain-text alternative. Sent alongside the HTML so the message is multipart. */
  text: string;
}

/**
 * Turn a stored step into a sendable email.
 *
 * Bodies are stored as plain text with blank-line paragraphs and `- ` bullet lines. Lines that look
 * like bullets become a real list rather than a run of paragraphs: rendering each line as its own
 * `<p style="margin:0 0 16px">` put a full paragraph gap between every bullet, so a five-item
 * feature list read as five unrelated sentences.
 */
export function renderPlatformSequenceEmail(
  rawSubject: string,
  rawBody: string,
  tokens: PlatformSequenceTokens,
  /**
   * Signed one-click unsubscribe URL. Optional ONLY so the preview can render without minting a
   * real signature; every actual send passes it, which `platformSequenceEmail.test.ts` asserts
   * against the cron source. Four of the nine sequences sell a plan upgrade, so this is commercial
   * email and the link is not decoration.
   */
  unsubscribeUrl?: string,
): RenderedPlatformEmail {
  const subject = resolvePlatformTokens(rawSubject, tokens);
  const body = resolvePlatformTokens(rawBody, tokens);

  const lines = body.split('\n');
  const blocks: string[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (!bullets.length) return;
    blocks.push(
      `<ul style="margin:0 0 16px;padding-left:20px;color:#E0E0E0;">${bullets
        .map((b) => `<li style="margin:0 0 6px;">${escapeHtml(b)}</li>`)
        .join('')}</ul>`,
    );
    bullets = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ''));
      continue;
    }
    flushBullets();
    // A bare URL on its own line becomes a real link. The copy uses plain URLs, and an unlinked
    // https:// in an HTML email is a dead end on a phone.
    const linked = /^https?:\/\/\S+$/.test(line)
      ? `<a href="${escapeHtml(line)}" style="color:#D4AF37;">${escapeHtml(line)}</a>`
      : escapeHtml(line);
    blocks.push(`<p style="margin:0 0 16px;">${linked}</p>`);
  }
  flushBullets();

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0D0D0D;font-family:Inter,system-ui,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <span style="color:#D4AF37;font-size:24px;font-weight:bold;letter-spacing:2px;">CRWN</span>
    </div>
    <div style="color:#E0E0E0;font-size:15px;line-height:1.7;">
      ${blocks.join('')}
    </div>
    <div style="margin-top:32px;padding-top:24px;border-top:1px solid #2A2A2A;text-align:center;">
      <a href="https://thecrwn.app" style="color:#D4AF37;text-decoration:none;font-size:12px;">CRWN</a>
      <span style="color:#555;font-size:12px;margin:0 8px;">|</span>
      <span style="color:#555;font-size:12px;">Music Monetization Platform</span>
      ${
        unsubscribeUrl
          ? `<div style="margin-top:12px;color:#555;font-size:11px;line-height:1.6;">
        You are getting this because you have a CRWN artist account.
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8a8a9a;text-decoration:underline;">Unsubscribe from onboarding emails</a>.
        Account, payout and fan notifications are not affected.
      </div>`
          : ''
      }
    </div>
  </div>
</body>
</html>`;

  const text = unsubscribeUrl ? `${body}\n\nUnsubscribe from onboarding emails: ${unsubscribeUrl}` : body;
  return { subject, html, text };
}
