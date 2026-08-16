// ladderPrefill.ts — the artist's OWN pre-signup tier edits, shaped for the
// wizard's ladder screen. Pure; no I/O.
//
// "Restore the business they designed" means the ladder screen must open on the
// names and prices THEY set in the builder, not the stock template. Three places
// those edits can live, tried in order:
//  1. a deliverable DRAFT's field values (t0Name/t1Name/t1Price/...), written by
//     the opportunity-calculator builder before signup,
//  2. a SINGLE-OFFER tool's draft (tierName + price), which models one rung
//     rather than a ladder: the Vault Revenue Planner's Vault IS the Gold rung
//     (see entryOffer.ts). Without this the artist confirmed a stock Gold and
//     the Vault they just named and priced was silently dropped.
//  3. the calculator's modeled ladder in conversionPayload.ladder (name +
//     priceCents per paid rung).
// Anything absent or junk falls back to the recommended template rung, so a
// partial draft can never produce a broken ladder.

import type { LeadMagnetSeed } from './handoffSeed';
import { ANCHOR_RUNG } from './entryOffer';
import { RECOMMENDED_LADDER } from '@/lib/tierTemplate';

export interface LadderRungPrefill {
  /** Template rung key: wave | inner_circle | vault | throne. */
  key: string;
  name: string;
  priceCents: number;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** "25", 25, "$25" → 2500. Null for junk/zero (paid rungs need a real price). */
function dollarsToCents(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

/** conversionPayload.ladder prices are ALREADY integer cents. */
function cents(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

/**
 * The four rungs with the artist's edits applied where they exist. Always
 * returns all four (template defaults fill the gaps); returns null when the
 * seed carries no ladder edits at all, so callers keep the stock draft.
 */
export function buildLadderPrefill(seed: LeadMagnetSeed | null): LadderRungPrefill[] | null {
  if (!seed) return null;

  const dv = seed.draftValues ?? null;
  const cpLadder = Array.isArray(seed.conversionPayload?.ladder)
    ? (seed.conversionPayload.ladder as { name?: unknown; priceCents?: unknown }[])
    : [];

  // Draft field slots, in ladder order (the crwn_business_system spec's fields).
  const draftSlots = [
    { name: str(dv?.t0Name), priceCents: 0 as number | null, free: true },
    { name: str(dv?.t1Name), priceCents: dollarsToCents(dv?.t1Price), free: false },
    { name: str(dv?.t2Name), priceCents: dollarsToCents(dv?.t2Price), free: false },
    { name: str(dv?.t3Name), priceCents: dollarsToCents(dv?.t3Price), free: false },
  ];
  const hasDraftEdits = dv != null && draftSlots.some((s) => s.name || (!s.free && s.priceCents != null));

  // conversionPayload.ladder lists PAID rungs only, in order.
  const cpSlots = cpLadder.map((t) => ({ name: str(t.name), priceCents: cents(t.priceCents) }));
  const hasCpEdits = cpSlots.some((s) => s.name || s.priceCents != null);

  // A single-offer tool models ONE rung. Its draft field names are the offer's
  // own (tierName/price), not the ladder slots above; the calculator's modeled
  // figure in conversionPayload is the fallback for an artist who never opened
  // the builder.
  const anchorKey = ANCHOR_RUNG[seed.toolSlug] ?? null;
  const anchor = anchorKey
    ? {
        name: str(dv?.tierName) ?? str(seed.conversionPayload?.tierName),
        priceCents: dollarsToCents(dv?.price) ?? cents(seed.conversionPayload?.priceCents),
      }
    : null;
  const hasAnchorEdits = !!anchor && (!!anchor.name || anchor.priceCents != null);

  if (!hasDraftEdits && !hasCpEdits && !hasAnchorEdits) return null;

  // The anchor price is the artist's own modeled number, but it was modeled for
  // ONE offer with no ladder around it, so it can land below the rung beneath
  // it. An inverted ladder is something WE would have created (the artist can
  // still type any price they like on the screen), and price order is what the
  // release waterfall staggers on, so a too-low anchor keeps the template price.
  const anchorIndex = anchorKey ? RECOMMENDED_LADDER.findIndex((r) => r.key === anchorKey) : -1;
  const floorCents = anchorIndex > 0 ? RECOMMENDED_LADDER[anchorIndex - 1].priceCents : 0;
  const anchorPrice =
    anchor?.priceCents != null && anchor.priceCents > floorCents ? anchor.priceCents : null;

  let paidIndex = 0;
  return RECOMMENDED_LADDER.map((rung, i) => {
    const draft = hasDraftEdits ? draftSlots[i] : null;
    const anc = anchorKey === rung.key ? anchor : null;
    const cp = !hasDraftEdits && rung.priceCents > 0 ? cpSlots[paidIndex] : null;
    if (rung.priceCents > 0) paidIndex += 1;
    return {
      key: rung.key,
      name: draft?.name ?? anc?.name ?? cp?.name ?? rung.name,
      priceCents:
        rung.priceCents === 0
          ? 0
          : draft?.priceCents ?? (anc ? anchorPrice : null) ?? cp?.priceCents ?? rung.priceCents,
    };
  });
}
