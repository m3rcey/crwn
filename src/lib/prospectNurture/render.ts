// Deterministic renderer for prospect-nurture emails.
//
// Pure and side-effect free, so it is fully unit-testable without a database or a mail provider.
// Given a code-defined email, the resolved tokens, and the calculator module, it returns the
// subject, preview, HTML body, and a plain-text body.
//
// It NEVER computes a financial value. Money strings arrive pre-formatted in the tokens (sourced
// from the stored result's result_data). All interpolated values are HTML-escaped, so a lead's
// self-entered artist name can never inject markup into an email.

import type { CalculatorModule, NurtureBlock, NurtureEmail, NurtureTokens } from './types';

export interface RenderInput {
  email: NurtureEmail;
  tokens: NurtureTokens;
  module: CalculatorModule;
  // Whether the lead's result carries a real dollar figure (drives numberOrFallback blocks).
  hasNumber: boolean;
}

export interface RenderedEmail {
  subject: string;
  preview: string;
  html: string;
  text: string;
}

// Format integer cents into a plain display string, e.g. 124000 -> "$1,240". No decimals for whole
// dollars; this is a marketing display, not an invoice.
export function formatCentsDisplay(cents: number | null | undefined): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents) || cents <= 0) return '';
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString('en-US')}`;
}

export function escapeHtml(s: string): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, '&#96;');
}

// Replace {{token}} with the token value. An unknown token is left as an empty string (never the
// literal "{{x}}" and never "undefined"), which is the graceful-fallback rule.
export function resolveTokens(text: string, tokens: NurtureTokens): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = (tokens as unknown as Record<string, unknown>)[key];
    return typeof v === 'string' ? v : '';
  });
}

// Turn one block into resolved plain-text lines (an array so lists become multiple lines).
function blockToText(block: NurtureBlock, tokens: NurtureTokens, module: CalculatorModule, hasNumber: boolean): string[] {
  switch (block.kind) {
    case 'p':
    case 'callout':
      return [resolveTokens(block.text, tokens)];
    case 'list':
      return block.items.map((i) => `- ${resolveTokens(i, tokens)}`);
    case 'moduleQuickWin':
      return [resolveTokens(module.quickWin, tokens)];
    case 'moduleUseCase':
      return [resolveTokens(module.useCase, tokens)];
    case 'numberOrFallback':
      return [resolveTokens(hasNumber ? block.withNumber : block.withoutNumber, tokens)];
    default:
      return [];
  }
}

// Turn one block into an HTML fragment. Every interpolated value is escaped.
function blockToHtml(block: NurtureBlock, tokens: NurtureTokens, module: CalculatorModule, hasNumber: boolean): string {
  const p = (t: string) =>
    `<p style="margin:0 0 16px;color:#e8e8ea;font-size:15px;line-height:1.7;">${escapeHtml(resolveTokens(t, tokens))}</p>`;
  switch (block.kind) {
    case 'p':
      return p(block.text);
    case 'callout':
      return `<div style="margin:0 0 16px;border-left:3px solid #D4AF37;padding:10px 0 10px 16px;color:#D4AF37;font-size:15px;line-height:1.6;font-weight:600;">${escapeHtml(
        resolveTokens(block.text, tokens),
      )}</div>`;
    case 'list':
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">${block.items
        .map(
          (i) =>
            `<tr><td style="padding:6px 0;color:#e8e8ea;font-size:15px;line-height:1.6;"><span style="color:#D4AF37;">&bull;</span>&nbsp;&nbsp;${escapeHtml(
              resolveTokens(i, tokens),
            )}</td></tr>`,
        )
        .join('')}</table>`;
    case 'moduleQuickWin':
      return `<div style="margin:0 0 16px;background:#20200f;border:1px solid #D4AF37;border-radius:12px;padding:14px 16px;"><div style="color:#D4AF37;font-size:12px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;margin-bottom:6px;">Your quick win</div><div style="color:#f0f0f0;font-size:15px;line-height:1.6;">${escapeHtml(
        resolveTokens(module.quickWin, tokens),
      )}</div></div>`;
    case 'moduleUseCase':
      return p(module.useCase);
    case 'numberOrFallback':
      return p(hasNumber ? block.withNumber : block.withoutNumber);
    default:
      return '';
  }
}

function ctaTarget(email: NurtureEmail, tokens: NurtureTokens): { url: string; label: string } {
  const c = email.primaryCta;
  if (c.kind === 'result') {
    return { url: tokens.result_url, label: c.label || 'Reopen my result' };
  }
  return { url: tokens.signup_url, label: c.label || tokens.cta_label || 'Create my free account' };
}

export function renderNurtureEmail(input: RenderInput): RenderedEmail {
  const { email, tokens, module, hasNumber } = input;
  const subject = resolveTokens(email.subject, tokens);
  const preview = resolveTokens(email.preview, tokens);
  const { url, label } = ctaTarget(email, tokens);

  const bodyHtml = email.body.map((b) => blockToHtml(b, tokens, module, hasNumber)).join('');
  const bodyText = email.body
    .flatMap((b) => blockToText(b, tokens, module, hasNumber))
    .join('\n\n');

  const ctaHtml = url
    ? `<tr><td style="padding:8px 28px 20px;" align="center">
        <a href="${escapeAttr(url)}" style="display:inline-block;background:#D4AF37;color:#0f0f0f;font-weight:700;font-size:15px;text-decoration:none;padding:14px 28px;border-radius:999px;">${escapeHtml(
          label,
        )}</a>
      </td></tr>`
    : '';

  const html = `<!doctype html>
<html>
<body style="margin:0;background:#0f0f0f;font-family:Inter,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f0f;padding:32px 16px;">
    <tr><td align="center">
      <!-- Hidden preview text -->
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#1a1a1a;border-radius:16px;overflow:hidden;">
        <tr><td style="padding:24px 28px 4px;">
          <div style="color:#D4AF37;font-size:13px;font-weight:700;letter-spacing:2px;">CRWN</div>
        </td></tr>
        <tr><td style="padding:8px 28px 4px;">
          ${bodyHtml}
        </td></tr>
        ${ctaHtml}
      </table>
      <p style="max-width:520px;margin:16px auto 0;color:#5a5a6a;font-size:11px;line-height:1.6;text-align:center;">
        You are getting this because you asked the CRWN app to email you your ${escapeHtml(
          tokens.tool_name || 'calculator',
        )} result. Figures are planning estimates based on what you entered, not guarantees. The CRWN app does not provide legal, tax, or financial advice.
        <br/><a href="${escapeAttr(tokens.unsubscribe_url)}" style="color:#8a8a9a;text-decoration:underline;">Unsubscribe</a>
      </p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    bodyText,
    url ? `${label}: ${url}` : '',
    '',
    'Figures are planning estimates based on what you entered, not guarantees.',
    `Unsubscribe: ${tokens.unsubscribe_url}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  return { subject, preview, html, text };
}
