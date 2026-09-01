// Where a VSL viewer goes when they click the CTA.
//
// A nurture lead reaching a VSL already finished a calculator, gave CRWN their email and has a
// saved result. Sending them to a calculator is asking them to redo work they have done, and
// sending them to /worth specifically is worse: it is a DIFFERENT calculator for anyone who did not
// arrive through Streaming Loss.
//
// There is no second routing system here. The canonical continuation is
// `buildContinueUrl` + `continueCtaFor` in src/lib/leadMagnets/continuationCta.ts, which is what
// the result pages, the tokenized result page and ConvertToFeatureButton all already use. This
// module only decides WHICH calculator context to hand them, and it takes that from the lead's
// ORIGINATING calculator, never from the video they happen to be watching. The four VSLs are one
// shared series; which one they clicked is not a routing input.
//
// Security shape: the destination is always built by `buildContinueUrl`, which returns a fixed
// relative `/signup?...` path. A caller-supplied value can only ever become a QUERY VALUE on that
// path, never the path itself, so no input here can produce an off-site redirect. The tool slug is
// additionally checked against the registry, so an unknown slug falls back rather than travelling.

import { buildContinueUrl, continueCtaFor } from '@/lib/leadMagnets/continuationCta';
import { getLeadMagnet, EXTERNAL_TOOLS } from '@/lib/leadMagnets/registry';
import { watchPath } from './catalog';

export interface VslContinuation {
  /** Always an internal path. */
  href: string;
  label: string;
  /** True when a real originating calculator was recognised. */
  resolved: boolean;
}

/**
 * The canonical fallback for a viewer with no calculator context: the ordinary account-creation
 * route. NOT a calculator. Sending an unknown visitor to /worth is the exact bug this module
 * exists to fix, and it would also silently relabel a lead's origin as Streaming Loss.
 */
export const VSL_FALLBACK_HREF = '/signup?ref=vsl';
export const VSL_FALLBACK_LABEL = 'Build My Membership';

/** A tool slug is only usable if it is a real calculator: registry tool or registered external. */
export function isKnownTool(slug: string | null | undefined): slug is string {
  if (!slug || typeof slug !== 'string') return false;
  if (getLeadMagnet(slug)) return true;
  return EXTERNAL_TOOLS.some((t) => t.key === slug);
}

/**
 * The CTA for a VSL viewer, from their ORIGINATING calculator.
 *
 * `tool` is the calculator they actually completed and `resultToken` is the public token for their
 * saved result, both carried on the watch link the nurture email builds. The token is the existing
 * handoff: signup stores it server-side as `pending_result_token` and auto-claim binds the saved
 * result to the new account, which is what makes the plan come back rather than being re-entered.
 */
export function vslContinuation(
  tool: string | null | undefined,
  resultToken: string | null | undefined,
): VslContinuation {
  if (!isKnownTool(tool)) {
    return { href: VSL_FALLBACK_HREF, label: VSL_FALLBACK_LABEL, resolved: false };
  }
  const token = typeof resultToken === 'string' && resultToken.trim() ? resultToken.trim() : null;
  return { href: buildContinueUrl(tool, token), label: continueCtaFor(tool), resolved: true };
}

/**
 * The watch-page link a nurture email uses, carrying the lead's own calculator context forward.
 * Built here so the email and the page agree on the parameter names by construction rather than by
 * two places remembering the same strings.
 */
export function watchUrlFor(
  vslSlug: string,
  ctx?: { tool?: string | null; resultToken?: string | null },
): string {
  const params = new URLSearchParams();
  if (isKnownTool(ctx?.tool)) {
    params.set('tool', ctx!.tool as string);
    const token = ctx?.resultToken;
    if (typeof token === 'string' && token.trim()) params.set('result', token.trim());
  }
  const qs = params.toString();
  return qs ? `${watchPath(vslSlug)}?${qs}` : watchPath(vslSlug);
}
