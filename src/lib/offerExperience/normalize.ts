// The validation boundary for a stored Tier Offer Experience.
//
// A config row is DATA an eventual Offer Builder writes, so nothing downstream may trust
// its shape: every string is bounded, every list is capped, unknown keys are dropped, and
// a preview without a truth state is refused outright rather than defaulting, because
// "real" must never be something a config gets for free. Media references are restricted
// to plainly public URLs: anything that smells like signed or private storage is stripped,
// which is what keeps the sales layer structurally unable to leak protected bytes.

import {
  PREVIEW_KINDS,
  OFFER_LIMITS as L,
  type OfferPreview,
  type TierOfferExperience,
  type PreviewKind,
} from './types';

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** Public web URLs only. A signed URL, a storage path, or any credentialed shape is
 *  refused: a preview may point at artwork the artist already publishes, never at bytes
 *  the oracle protects. */
export function safePosterUrl(v: unknown): string | null {
  const s = str(v, 500);
  if (!s) return null;
  if (!/^https:\/\//.test(s)) return null;
  if (/token=|X-Amz|\/object\/sign\//i.test(s)) return null;
  return s;
}

/** The benefit-based CTA rule, enforced at the data boundary. "Join Platinum" style
 *  labels are refused so a stored config cannot regress the whole point: the button must
 *  say what the fan GETS, and tier + price render beside it, not inside it. */
export function isBenefitCta(cta: string, tierName?: string): boolean {
  const c = cta.trim().toLowerCase();
  if (!c) return false;
  if (/^(join|subscribe|become|upgrade)\b/.test(c)) return false;
  if (tierName && c.includes(tierName.trim().toLowerCase())) return false;
  return true;
}

function normalizePreview(raw: unknown): OfferPreview | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const kind = PREVIEW_KINDS.includes(r.kind as PreviewKind) ? (r.kind as PreviewKind) : null;
  const truth = r.truth === 'real' || r.truth === 'example' ? r.truth : null;
  const title = str(r.title, L.previewTitle);
  // No kind, no declared truth, or no title: the preview does not exist. Refusing beats
  // guessing, and refusing an undeclared truth state is the whole REAL/EXAMPLE rule.
  if (!kind || !truth || !title) return null;

  const p: OfferPreview = { kind, truth, title };
  const description = str(r.description, L.previewDescription);
  if (description) p.description = description;
  const actionLabel = str(r.actionLabel, 40);
  if (actionLabel) p.actionLabel = actionLabel;
  const badge = str(r.badge, 30);
  if (badge) p.badge = badge;
  if (r.windowState === 'open' || r.windowState === 'upcoming' || r.windowState === 'closed') {
    p.windowState = r.windowState;
  }
  const poster = safePosterUrl(r.posterUrl);
  if (poster) p.posterUrl = poster;

  if (Array.isArray(r.options)) {
    const options = r.options
      .map((o) => {
        const label = str((o as Record<string, unknown>)?.label, 60);
        if (!label) return null;
        const sublabel = str((o as Record<string, unknown>)?.sublabel, 60);
        return sublabel ? { label, sublabel } : { label };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .slice(0, L.maxOptions);
    if (options.length) p.options = options;
  }
  if (Array.isArray(r.items)) {
    const items = r.items
      .map((o) => {
        const rec = o as Record<string, unknown>;
        const title2 = str(rec?.title, 60);
        if (!title2) return null;
        const item: NonNullable<OfferPreview['items']>[number] = { title: title2 };
        const subtitle = str(rec?.subtitle, 60);
        if (subtitle) item.subtitle = subtitle;
        if (rec?.locked === true) item.locked = true;
        const art = safePosterUrl(rec?.artUrl);
        if (art) item.artUrl = art;
        return item;
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .slice(0, L.maxItems);
    if (items.length) p.items = items;
  }
  if (Array.isArray(r.steps)) {
    const steps = r.steps
      .map((o) => {
        const label = str((o as Record<string, unknown>)?.label, 40);
        if (!label) return null;
        return (o as Record<string, unknown>)?.participates === true
          ? { label, participates: true as const }
          : { label };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .slice(0, L.maxSteps);
    if (steps.length) p.steps = steps;
  }
  if (Array.isArray(r.fields)) {
    const fields = r.fields
      .map((o) => {
        const label = str((o as Record<string, unknown>)?.label, 50);
        if (!label) return null;
        const placeholder = str((o as Record<string, unknown>)?.placeholder, 80);
        return placeholder ? { label, placeholder } : { label };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .slice(0, L.maxFields);
    if (fields.length) p.fields = fields;
  }
  return p;
}

/**
 * Parse a stored config into the typed shape, or null when it cannot be one.
 * `tierName` lets the CTA rule refuse tier-name buttons for this specific tier.
 */
export function normalizeOfferExperience(raw: unknown, tierName?: string): TierOfferExperience | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const promise = str(r.promise, L.promise);
  const description = str(r.description, L.description);
  const cta = str(r.cta, L.cta);
  if (!promise || !description || !cta) return null;
  if (!isBenefitCta(cta, tierName)) return null;

  const out: TierOfferExperience = { promise, description, cta, previews: [] };

  const secondaryCue = str(r.secondaryCue, L.secondaryCue);
  if (secondaryCue) out.secondaryCue = secondaryCue;

  if (r.vsl && typeof r.vsl === 'object') {
    const v = r.vsl as Record<string, unknown>;
    const url = typeof v.url === 'string' ? safePosterUrl(v.url) : null;
    const vsl: NonNullable<TierOfferExperience['vsl']> = { url };
    const poster = safePosterUrl(v.posterUrl);
    if (poster) vsl.posterUrl = poster;
    if (v.isPlaceholder === true) vsl.isPlaceholder = true;
    out.vsl = vsl;
  }

  if (Array.isArray(r.previews)) {
    out.previews = r.previews
      .map(normalizePreview)
      .filter((x): x is OfferPreview => !!x)
      .slice(0, L.maxPreviews);
  }

  if (r.inherited && typeof r.inherited === 'object') {
    const inh = r.inherited as Record<string, unknown>;
    const heading = str(inh.heading, 80);
    const items = Array.isArray(inh.items)
      ? inh.items
          .map((x) => str(x, L.inheritedItem))
          .filter((x): x is string => !!x)
          .slice(0, L.maxInherited)
      : [];
    if (heading && items.length) out.inherited = { heading, items };
  }

  if (Array.isArray(r.faqs)) {
    const faqs = r.faqs
      .map((f) => {
        const q = str((f as Record<string, unknown>)?.q, L.faqQ);
        const a = str((f as Record<string, unknown>)?.a, L.faqA);
        return q && a ? { q, a } : null;
      })
      .filter((x): x is { q: string; a: string } => !!x)
      .slice(0, L.maxFaqs);
    if (faqs.length) out.faqs = faqs;
  }

  return out;
}
