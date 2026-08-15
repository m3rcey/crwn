// Render EVERY prospect-nurture touch, for review.
//
// The renderer is pure, so the whole sequence can be read exactly as it will arrive without a
// database, without Resend, and without sending anything to anybody. Reviewing copy by reading
// `sequence.ts` is how a typo, a dead token or a wrong CTA reaches an artist.
//
// This covers all 16 touches: the day-0 transactional result email (which is the first email in the
// customer's journey and is easy to forget) plus the 15 nurture emails.
//
// Pure and side-effect free. It sends nothing, and there is deliberately no mail client in scope.

import { PROSPECT_NURTURE_SEQUENCE } from './sequence';
import { moduleFor } from './calculatorModules';
import { renderNurtureEmail } from './render';
import { NURTURE_ART, artUrl } from './art';
import { resolveQualifiedCta } from './ctaBranch';
import { leadMagnetResultEmail } from '@/lib/emails/leadMagnetResult';
import { getLeadMagnet, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';
import type { NurtureTokens } from './types';

/** Exactly what `resolveConfig` in the nurture cron does, so a preview cannot drift from a send. */
function toolNameFor(slug: string): string {
  return getLeadMagnet(slug)?.name || EXTERNAL_TOOLS.find((t) => t.key === slug)?.name || slug;
}
/**
 * The MODULE owns the buildable feature name, matching what the cron now passes into
 * `{{feature_name}}`. The registry's `featureName` is a directory-card label: the external `worth`
 * tool carries "Worth Calculator", which rendered as "Setting up the first version of your Worth
 * Calculator in the CRWN app". Preview and send must resolve this identically or the preview is
 * checking a different email than the one that goes out.
 */
function featureNameFor(slug: string): string {
  return moduleFor(slug).featureName;
}

export interface PreviewTouch {
  day: number;
  id: string;
  phase: string;
  /** Why this email exists, from the sequence's own objective field. Internal, never sent. */
  objective: string;
  subject: string;
  preview: string;
  art: string;
  ctaLabel: string;
  ctaUrl: string;
  html: string;
  text: string;
}

export interface PreviewOptions {
  appUrl?: string;
  /** Which calculator's module to inject. Changes the quick-win / use-case lines. */
  toolSlug?: string;
  /** Preview the qualified branch, where an `auto` CTA points at the launch-call hand-raiser. */
  qualified?: boolean;
  /** Render the no-number variants, as a score-only tool (Royalty, Quest Path) would. */
  withoutNumber?: boolean;
  firstName?: string;
}

/** Representative tokens. Shaped exactly like `buildNurtureTokens` output, so nothing renders that
 *  could not really render. */
function sampleTokens(o: Required<Pick<PreviewOptions, 'appUrl' | 'toolSlug' | 'firstName'>>, withNumber: boolean): NurtureTokens {
  const token = 'previewtoken';
  return {
    first_name: o.firstName,
    artist_name: o.firstName,
    // Resolved the SAME way the cron resolves it, from the registry (or EXTERNAL_TOOLS for
    // `worth`). A hardcoded name here made every tool's preview claim the reader had run the Vault
    // planner, which reads as cross-calculator contamination that does not exist in production.
    // A preview that lies is worse than no preview.
    tool_name: toolNameFor(o.toolSlug),
    feature_name: featureNameFor(o.toolSlug),
    hero_value: withNumber ? '$1,240' : '',
    monthly_value: withNumber ? '$1,240 a month' : '',
    annual_value: withNumber ? '$14,880 a year' : '',
    result_url: `${o.appUrl}/tools/${o.toolSlug}?result=${token}`,
    signup_url: `${o.appUrl}/signup?tool=${o.toolSlug}&result=${token}&ref=nurture`,
    cta_label: 'Build this in the CRWN app',
    unsubscribe_url: `${o.appUrl}/api/prospect-nurture/unsubscribe/${token}`,
  };
}

/** The day-0 transactional result email, with realistic content. */
function dayZero(appUrl: string, toolSlug: string): PreviewTouch {
  const art = NURTURE_ART.discovery;
  const ctaUrl = `${appUrl}/signup?tool=${toolSlug}&result=previewtoken&ref=lead-magnet`;
  return {
    day: 0,
    id: 'transactional.result',
    phase: 'delivery (transactional, sent by the capture route)',
    objective: 'Deliver the result they asked for. Always sent, with or without marketing consent.',
    subject: `${toolNameFor(toolSlug)}: your result is ready 👑`,
    preview: '(no preheader: this template does not set one)',
    art: art.id,
    ctaLabel: `Build my ${featureNameFor(toolSlug)}`,
    ctaUrl,
    html: leadMagnetResultEmail({
      toolName: toolNameFor(toolSlug),
      headline: `Your ${featureNameFor(toolSlug)} could add about $1,240 a month`,
      summary: 'Based on the numbers you entered.',
      topRecommendations: [
        moduleFor(toolSlug).quickWin,
        moduleFor(toolSlug).firstBuild,
        'Invite the fans who have already paid you before, first',
      ],
      insights: [
        { title: 'Only in this email', body: 'The order you invite people in matters more than the offer itself.' },
      ],
      resultUrl: `${appUrl}/tools/${toolSlug}?result=previewtoken`,
      ctaUrl,
      ctaLabel: `Build my ${featureNameFor(toolSlug)}`,
      bannerUrl: artUrl(art, appUrl) ?? undefined,
      bannerAlt: art.alt,
    }),
    text: '(the day-0 template is HTML only; Resend generates the text part)',
  };
}

/** Every touch, in send order, starting with day 0. */
export function renderAllTouches(opts: PreviewOptions = {}): PreviewTouch[] {
  const appUrl = opts.appUrl ?? 'https://thecrwn.app';
  const toolSlug = opts.toolSlug ?? 'vault-revenue-planner';
  const firstName = opts.firstName ?? 'Ari';
  const hasNumber = !opts.withoutNumber;
  const tokens = sampleTokens({ appUrl, toolSlug, firstName }, hasNumber);
  const mod = moduleFor(toolSlug);

  const nurture = PROSPECT_NURTURE_SEQUENCE.emails.map((email) => {
    // Same resolution the cron performs, so the previewed CTA is the one that would really be sent.
    const override =
      resolveQualifiedCta({
        ctaKind: email.primaryCta.kind,
        toolSlug,
        qualified: !!opts.qualified,
        resultUrl: tokens.result_url,
        qualifiedLabel: email.primaryCta.qualifiedLabel,
      }) ?? undefined;

    const rendered = renderNurtureEmail({ email, tokens, module: mod, hasNumber, appUrl, ctaOverride: override });
    const fallbackLabel =
      email.primaryCta.kind === 'result'
        ? email.primaryCta.label || 'Reopen my result'
        : email.primaryCta.label || tokens.cta_label;

    return {
      day: email.dayOffset,
      id: email.id,
      phase: email.phase,
      objective: email.objective,
      subject: rendered.subject,
      preview: rendered.preview,
      art: NURTURE_ART[email.art].id,
      ctaLabel: override?.label ?? fallbackLabel,
      ctaUrl: override?.url ?? (email.primaryCta.kind === 'result' ? tokens.result_url : tokens.signup_url),
      html: rendered.html,
      text: rendered.text,
    };
  });

  return [dayZero(appUrl, toolSlug), ...nurture];
}

/** Wrap the touches in one browsable page. Pure string building; the caller writes the file. */
export function buildPreviewPage(touches: PreviewTouch[], appUrl: string): string {
  const esc = (s: string) =>
    String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);

  const card = (t: PreviewTouch) => `
<a id="t${t.day}"></a>
<section class="touch">
  <div class="meta">
    <span class="day">Day ${t.day}</span>
    <span class="phase">${esc(t.phase)}</span>
    <span class="id">${esc(t.id)}</span>
  </div>
  <h2>${esc(t.subject)}</h2>
  <p class="line"><b>Inbox preview:</b> ${esc(t.preview)}</p>
  <p class="line"><b>Why it exists:</b> ${esc(t.objective)}</p>
  <p class="line"><b>Art:</b> ${esc(t.art)} &nbsp;·&nbsp; <b>CTA:</b> ${esc(t.ctaLabel)}
     &rarr; <code>${esc(t.ctaUrl)}</code></p>
  <div class="panes">
    <div>
      <div class="lbl">As it renders</div>
      <iframe srcdoc="${esc(t.html)}" loading="lazy"></iframe>
    </div>
    <div>
      <div class="lbl">Plain text (what a blocked-image inbox shows)</div>
      <pre>${esc(t.text)}</pre>
    </div>
  </div>
</section>`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CRWN nurture preview</title><style>
body{margin:0;background:#0b0b0c;color:#e8e8ea;font:15px/1.6 Inter,system-ui,sans-serif}
.wrap{max-width:1180px;margin:0 auto;padding:32px 20px 80px}
h1{font-size:26px;margin:0 0 6px}.sub{color:#8a8a9a;margin:0 0 26px}
.toc{background:#141416;border:1px solid #26262a;border-radius:12px;padding:14px 18px;margin-bottom:34px}
.toc a{color:#D4AF37;text-decoration:none;display:block;padding:3px 0;font-size:14px}
.touch{background:#141416;border:1px solid #26262a;border-radius:14px;padding:22px;margin-bottom:26px}
.meta{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.day{background:#D4AF37;color:#111;font-weight:700;border-radius:999px;padding:2px 12px;font-size:13px}
.phase{color:#8a8a9a;text-transform:uppercase;letter-spacing:1px;font-size:11px}
.id{color:#5a5a66;font-family:ui-monospace,monospace;font-size:12px}
h2{margin:4px 0 10px;font-size:20px}
.line{margin:0 0 5px;color:#9a9aa8;font-size:13px}
code{color:#c8a44a;word-break:break-all;font-size:12px}
.panes{display:grid;grid-template-columns:560px 1fr;gap:18px;margin-top:14px}
@media(max-width:1000px){.panes{grid-template-columns:1fr}}
.lbl{color:#6a6a78;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
iframe{width:100%;height:820px;border:1px solid #26262a;border-radius:10px;background:#0f0f0f}
pre{white-space:pre-wrap;background:#0f0f10;border:1px solid #26262a;border-radius:10px;padding:14px;
    color:#b8b8c2;font-size:12.5px;max-height:820px;overflow:auto}
</style></head><body><div class="wrap">
<h1>CRWN prospect nurture, every touch</h1>
<p class="sub">${touches.length} emails rendered from the live sequence. Artwork loads from ${esc(appUrl)}.
This page sends nothing.</p>
<div class="toc">${touches.map((t) => `<a href="#t${t.day}">Day ${t.day} &nbsp; ${esc(t.subject)}</a>`).join('')}</div>
${touches.map(card).join('')}
</div></body></html>`;
}
