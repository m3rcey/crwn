// Where an `auto` CTA points, and the rule for when it is allowed to change.
//
// THE BOUNDARY: this module decides which EXISTING surface a nurture email links to. It does not
// decide who qualifies, it does not send a founder alert, and it never writes a qualification
// anywhere. The canonical gate is `decideCallRequest` (server-side, recomputed from the stored
// calculator answers), and the hand-raiser at `/api/lead-magnets/call-request` re-scores again
// before any alert fires. So the worst case for a wrong branch here is a lead seeing a link to a
// call request that the server will then decline to escalate. That is the correct failure mode.
//
// WHY A LINK AND NOT A NEW ROUTE: the qualified hand-raiser already exists, on the artist's own
// result page, as `CallRequestCard` under the `crwn-launch-call` anchor. Linking to it reuses a
// shipped, already-secured surface. Building a nurture-specific booking path would duplicate the
// qualification boundary, which is exactly how the two copies drift apart.
//
// TRADEOFF, stated deliberately: only the DESTINATION and LABEL branch, never the body copy. Per
// -lead copy branching would need a conditional block type and a second copy set to keep truthful
// for both audiences, and pre-PMF that is a lot of unmeasurable surface area. The copy is therefore
// written to be true for a self-serve reader first, with the assisted option mentioned only where
// it is honestly available to everyone who qualifies.

/** The hand-raiser only exists on this tool's result page, so only this tool can branch. */
export const QUALIFIED_CTA_TOOL = 'opportunity-calculator';

/** `PublicToolClient`'s `QUALIFY_ANCHOR_ID`. Kept in sync by `nurture.test.ts`. */
export const QUALIFIED_CTA_ANCHOR = 'crwn-launch-call';

export interface BranchInput {
  ctaKind: 'signup' | 'result' | 'auto';
  toolSlug: string;
  /** True only when `decideCallRequest` said so, recomputed server-side from the stored inputs. */
  qualified: boolean;
  resultUrl: string;
  qualifiedLabel?: string;
}

/**
 * Resolve an `auto` CTA. Returns null when the caller should use the normal (non-branched) target,
 * which is every case except a qualified lead on the one tool that hosts the hand-raiser.
 */
export function resolveQualifiedCta(input: BranchInput): { url: string; label: string } | null {
  if (input.ctaKind !== 'auto') return null;
  if (!input.qualified) return null;
  if (input.toolSlug !== QUALIFIED_CTA_TOOL) return null;
  if (!input.resultUrl) return null;
  return {
    url: `${input.resultUrl}#${QUALIFIED_CTA_ANCHOR}`,
    label: input.qualifiedLabel || 'See the assisted launch option',
  };
}
