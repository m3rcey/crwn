const BASE_URL = 'https://thecrwn.app';

interface CampaignEmailParams {
  body: string;
  artistName: string;
  sendId: string;
  unsubscribeUrl: string;
  trackingPixelUrl: string;
  platformTier: string; // artist's platform tier
}

/**
 * Resolve personalization tokens in campaign body text.
 * Supports fallback syntax: {{city|"your area"}}
 */
export function resolveTokens(
  body: string,
  data: Record<string, string | number | null | undefined>
): string {
  return body.replace(/\{\{(\w+)(?:\|"([^"]*)")?\}\}/g, (_match, key: string, fallback?: string) => {
    const value = data[key];
    if (value != null && value !== '') return String(value);
    return fallback ?? '';
  });
}

/**
 * Wrap links in the body for click tracking.
 * Replaces href="https://..." with href="/api/campaigns/track/[sendId]?url=..."
 */
function wrapLinks(html: string, sendId: string): string {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_match, url: string) => {
      const trackUrl = `${BASE_URL}/api/campaigns/track/${sendId}?url=${encodeURIComponent(url)}`;
      return `href="${trackUrl}"`;
    }
  );
}

/**
 * Convert plain text body (with newlines) to HTML paragraphs.
 * Preserves any existing HTML tags.
 */
function bodyToHtml(body: string): string {
  // If body already contains HTML block elements, return as-is
  if (/<(div|p|h[1-6]|ul|ol|table|br)\b/i.test(body)) {
    return body;
  }
  // Convert newlines to <br> tags
  return body.split('\n').map(line =>
    line.trim() === '' ? '<br>' : `<p style="color:#FFFFFF;font-size:16px;line-height:1.6;margin:0 0 12px;">${line}</p>`
  ).join('\n');
}

export function campaignEmail({
  body,
  artistName,
  sendId,
  unsubscribeUrl,
  trackingPixelUrl,
  platformTier,
}: CampaignEmailParams): string {
  const showCrwnBranding = platformTier !== 'label' && platformTier !== 'empire';
  const wrappedBody = wrapLinks(bodyToHtml(body), sendId);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#1A1A1A;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <h1 style="color:#D4AF37;font-size:28px;margin:0;">${artistName}</h1>
    </div>
    <div style="background-color:#242424;border-radius:16px;padding:32px;border:1px solid #333;">
      ${wrappedBody}
    </div>
    <div style="text-align:center;margin-top:32px;">
      <p style="color:#666;font-size:12px;margin:0 0 8px;">
        You're receiving this because you subscribed to ${artistName} on CRWN.
      </p>
      <p style="color:#666;font-size:12px;margin:0 0 8px;">
        <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">Unsubscribe</a> from marketing emails
      </p>
      ${showCrwnBranding ? `
      <p style="color:#555;font-size:11px;margin:16px 0 0;">
        Powered by <a href="https://thecrwn.app" style="color:#D4AF37;text-decoration:none;">CRWN</a>
      </p>` : ''}
      <p style="color:#666;font-size:12px;margin:8px 0 0;">
        &copy; ${new Date().getFullYear()} JNW Creative Enterprises, Inc.
        <a href="https://thecrwn.app/terms" style="color:#666;text-decoration:underline;">Terms</a> &middot;
        <a href="https://thecrwn.app/privacy" style="color:#666;text-decoration:underline;">Privacy</a>
      </p>
    </div>
    <img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" alt="" />
  </div>
</body>
</html>`;
}
