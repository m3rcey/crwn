// Branded result email for lead-magnet tools. Returns an HTML string (repo pattern:
// plain function, dark theme, gold accent, no raw JSON). No em dashes in copy.

interface LeadMagnetResultEmailArgs {
  toolName: string;
  headline: string;
  summary: string;
  topRecommendations: string[];
  insights?: { title: string; body: string }[]; // email-only bonus analysis
  resultUrl?: string; // secure resume link (optional)
  ctaUrl: string; // signup or feature CTA
  ctaLabel: string;
  // Absolute URL of the banner. Day 0 is the first email in the nurture journey, so it wears the
  // same image-led treatment as the rest of the sequence. Optional so a caller without an origin
  // still renders a valid email rather than a broken image.
  bannerUrl?: string;
  bannerAlt?: string;
}

export function leadMagnetResultEmail({
  toolName,
  headline,
  summary,
  topRecommendations,
  insights,
  resultUrl,
  ctaUrl,
  ctaLabel,
  bannerUrl,
  bannerAlt,
}: LeadMagnetResultEmailArgs): string {
  const recs = topRecommendations
    .slice(0, 5)
    .map(
      (r) =>
        `<tr><td style="padding:8px 0;color:#f0f0f0;font-size:15px;line-height:1.5;"><span style="color:#D4AF37;">•</span>&nbsp;&nbsp;${escapeHtml(
          r,
        )}</td></tr>`,
    )
    .join('');

  const insightsBlock =
    insights && insights.length
      ? `<tr><td style="padding:8px 28px 8px;">
          <div style="border:1px solid #D4AF37;border-radius:12px;padding:16px 18px;background:#20200f;">
            <div style="color:#D4AF37;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:10px;">Only in this email</div>
            ${insights
              .slice(0, 4)
              .map(
                (i) =>
                  `<div style="margin-bottom:12px;"><div style="color:#f0f0f0;font-size:14px;font-weight:600;margin-bottom:3px;">${escapeHtml(
                    i.title,
                  )}</div><div style="color:#b8b8c2;font-size:14px;line-height:1.55;">${escapeHtml(i.body)}</div></div>`,
              )
              .join('')}
          </div>
        </td></tr>`
      : '';

  return `<!doctype html>
<html>
<body style="margin:0;background:#0f0f0f;font-family:Inter,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1a1a1a;border-radius:16px;overflow:hidden;">
        ${
          bannerUrl
            ? `<tr><td style="padding:0;font-size:0;line-height:0;">
          <img src="${escapeAttr(bannerUrl)}" alt="${escapeAttr(bannerAlt || '')}" width="520" height="293"
               style="display:block;width:100%;max-width:520px;height:auto;border:0;outline:none;text-decoration:none;" />
        </td></tr>`
            : ''
        }
        <tr><td style="padding:28px 28px 8px;">
          <div style="color:#D4AF37;font-size:13px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">${escapeHtml(toolName)}</div>
          <h1 style="margin:8px 0 0;color:#f0f0f0;font-size:22px;line-height:1.3;">${escapeHtml(headline)}</h1>
          <p style="margin:12px 0 0;color:#8a8a9a;font-size:15px;line-height:1.6;">${escapeHtml(summary)}</p>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;">
          <div style="color:#f0f0f0;font-size:14px;font-weight:600;margin-bottom:6px;">Your top moves</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${recs}</table>
        </td></tr>
        ${insightsBlock}
        <tr><td style="padding:20px 28px 28px;" align="center">
          <a href="${escapeAttr(ctaUrl)}" style="display:inline-block;background:#D4AF37;color:#0f0f0f;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:999px;">${escapeHtml(
            ctaLabel,
          )}</a>
          ${
            resultUrl
              ? `<div style="margin-top:14px;"><a href="${escapeAttr(
                  resultUrl,
                )}" style="color:#8a8a9a;font-size:13px;text-decoration:underline;">Reopen your full result</a></div>`
              : ''
          }
        </td></tr>
      </table>
      <p style="max-width:520px;margin:16px auto 0;color:#5a5a6a;font-size:11px;line-height:1.5;text-align:center;">
        These results are planning estimates based on what you entered. They are not guarantees. CRWN does not provide legal, tax, or financial advice.
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, '&#96;');
}
