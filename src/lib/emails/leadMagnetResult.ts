// Branded result email for lead-magnet tools. Returns an HTML string (repo pattern:
// plain function, dark theme, gold accent, no raw JSON). No em dashes in copy.

interface LeadMagnetResultEmailArgs {
  toolName: string;
  headline: string;
  summary: string;
  topRecommendations: string[];
  resultUrl?: string; // secure resume link (optional)
  ctaUrl: string; // signup or feature CTA
  ctaLabel: string;
}

export function leadMagnetResultEmail({
  toolName,
  headline,
  summary,
  topRecommendations,
  resultUrl,
  ctaUrl,
  ctaLabel,
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

  return `<!doctype html>
<html>
<body style="margin:0;background:#0f0f0f;font-family:Inter,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1a1a1a;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;">
          <div style="color:#D4AF37;font-size:13px;font-weight:600;letter-spacing:0.5px;text-transform:uppercase;">${escapeHtml(toolName)}</div>
          <h1 style="margin:8px 0 0;color:#f0f0f0;font-size:22px;line-height:1.3;">${escapeHtml(headline)}</h1>
          <p style="margin:12px 0 0;color:#8a8a9a;font-size:15px;line-height:1.6;">${escapeHtml(summary)}</p>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;">
          <div style="color:#f0f0f0;font-size:14px;font-weight:600;margin-bottom:6px;">Your top moves</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${recs}</table>
        </td></tr>
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
