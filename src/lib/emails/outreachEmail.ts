const BASE_URL = 'https://thecrwn.app';

interface OutreachEmailParams {
  body: string;
  sendId: string;
  unsubscribeUrl: string;
  trackingPixelUrl: string;
}

/**
 * Resolve personalization tokens in outreach body.
 * Supports: {{name}}, {{first_name}}, {{email}}
 */
export function resolveOutreachTokens(
  body: string,
  data: Record<string, string | null | undefined>
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = data[key];
    return value != null && value !== '' ? String(value) : '';
  });
}

/**
 * Convert plain text body to HTML paragraphs.
 */
function bodyToHtml(body: string): string {
  if (/<(div|p|h[1-6]|ul|ol|table|br)\b/i.test(body)) {
    return body;
  }
  return body.split('\n').map(line =>
    line.trim() === '' ? '<br>' : `<p style="color:#FFFFFF;font-size:16px;line-height:1.6;margin:0 0 12px;">${line}</p>`
  ).join('\n');
}

/**
 * Wrap links for click tracking via the outreach track endpoint.
 */
function wrapLinks(html: string, sendId: string): string {
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (_match, url: string) => {
      const trackUrl = `${BASE_URL}/api/admin/crm/outreach/track/${sendId}?url=${encodeURIComponent(url)}`;
      return `href="${trackUrl}"`;
    }
  );
}

export function outreachEmail({
  body,
  sendId,
  unsubscribeUrl,
  trackingPixelUrl,
}: OutreachEmailParams): string {
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
      <h1 style="color:#D4AF37;font-size:28px;margin:0;">CRWN</h1>
    </div>
    <div style="background-color:#242424;border-radius:16px;padding:32px;border:1px solid #333;">
      ${wrappedBody}
    </div>
    <div style="text-align:center;margin-top:32px;">
      <p style="color:#666;font-size:12px;margin:0 0 8px;">
        <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">Unsubscribe</a>
      </p>
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
