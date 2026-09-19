// The name of the thing the artist built, the same at every boundary.
//
// An artist builds a named artifact before signing up ("Marcus Private Vault", a fan page headed
// "Get everything first"), and then signup said "Create your account", the email screen said
// "Check your email", the verified screen said "Welcome to CRWN" and the first in-app screen said
// "Your CRWN plan is saved" and named the CALCULATOR. The object they made vanished at the exact
// moment they were asked to trust CRWN with it (2026-09-19 audit).
//
// This is the ONE derivation of that name. It reads the spec's existing `preview` keys over the
// draft's own values, so there is no second registry of artifact names to drift: the signup card,
// the email screen, the verified screen, the setup intro and the plan page all call this.
//
// It never invents. With no name typed it says "Your Vault", not a made-up title, and with no
// values at all it returns null so a surface can say honestly that nothing could be restored.
//
// Pure. No React, no I/O. Output is plain text: every surface renders it as TEXT, never as HTML.

import type { DeliverableSpec, DraftValues } from './deliverableSpecs';

export interface ArtifactLabel {
  /** What kind of thing it is, from the spec's own save label: "Vault", "membership", "fan page". */
  noun: string;
  /** The name or headline the artist gave it, if the artifact has one. */
  name: string | null;
  /** One identifying choice, so two artifacts of the same kind can be told apart. */
  detail: string | null;
  /** "Marcus Private Vault is saved" / "Your Vault is saved". */
  savedLine: string;
  /** "Continue Marcus Private Vault" / "Continue my Vault". */
  continueLabel: string;
}

const MAX_NAME = 60;
const MAX_DETAIL = 90;

/** Plain text only: a draft is artist-typed prose, so angle brackets and line breaks never ride along. */
function clean(v: unknown, max: number): string {
  const s = typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
  const flat = s.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** "Save my Vault" -> "Vault". Every spec's save label already names its artifact. */
export function artifactNoun(saveLabel: string): string {
  const noun = saveLabel.replace(/^save\s+(my|your|the)?\s*/i, '').trim();
  return noun || 'plan';
}

function build(noun: string, name: string | null, detail: string | null, nameIsTitle: boolean): ArtifactLabel {
  // A proper name stands on its own ("Marcus Private Vault is saved"). A headline is a sentence the
  // artist wrote for fans, so it is quoted behind the noun instead of being made the subject.
  const savedLine = name ? (nameIsTitle ? `${name} is saved` : `Your ${noun} "${name}" is saved`) : `Your ${noun} is saved`;
  const continueLabel = name && nameIsTitle ? `Continue ${name}` : `Continue my ${noun}`;
  return { noun, name, detail, savedLine, continueLabel };
}

/**
 * The label for a deliverable draft. Returns null when there is nothing of the artist's to name
 * (no values at all), which is a caller's cue to say so instead of claiming a save.
 */
export function artifactLabel(spec: DeliverableSpec, values: DraftValues | null | undefined): ArtifactLabel | null {
  const v = values ?? {};
  if (!Object.values(v).some((x) => (Array.isArray(x) ? x.length > 0 : String(x ?? '').length > 0))) return null;

  const noun = artifactNoun(spec.saveLabel);
  const p = spec.preview;

  if (p.kind === 'ladder' || p.kind === 'system' || p.kind === 'campaigns') {
    const names = (p.tiers ?? []).map((t) => clean(v[t.nameKey], 30)).filter(Boolean);
    return build(noun, null, names.length ? clean(names.join(', '), MAX_DETAIL) : null, false);
  }

  if (p.kind === 'list') {
    const first = (p.itemKeys ?? []).map((k) => v[k]).find((x) => (Array.isArray(x) ? x.length : String(x ?? '').length));
    const detail = Array.isArray(first) ? clean(first[0], MAX_DETAIL) : clean(first, MAX_DETAIL);
    return build(noun, null, detail || null, false);
  }

  // offer | page: one titled thing.
  const name = p.titleKey ? clean(v[p.titleKey], MAX_NAME) : '';
  const price = p.priceKey ? Number(v[p.priceKey]) : NaN;
  const priceText = Number.isFinite(price) && price > 0 ? `$${price}` : '';
  const cadence = clean(v.cadence, 20);
  const subtitle = p.subtitleKey ? clean(v[p.subtitleKey], MAX_DETAIL) : '';
  const detail = [priceText && (cadence ? `${priceText} a month` : priceText), cadence && `${cadence} drops`].filter(Boolean).join(', ') || subtitle;
  return build(noun, name || null, detail || null, p.kind === 'offer');
}

/** Own Your Fans keeps its own draft shape (a fan page with a headline), so it gets its own reader. */
export function fanPageArtifactLabel(draft: { headline?: unknown; ctaLabel?: unknown } | null | undefined): ArtifactLabel | null {
  if (!draft || typeof draft !== 'object') return null;
  const headline = clean(draft.headline, MAX_NAME);
  const cta = clean(draft.ctaLabel, 40);
  if (!headline && !cta) return null;
  return build('fan page', headline || null, cta ? `Button: ${cta}` : null, false);
}
