// The live fan preview: pure helpers.
//
// The preview shows the artist their REAL public page, as a fan sees it, for the
// whole of the setup wizard. It is an iframe of `/{slug}` and not a rebuild, so
// there is exactly one artist-page rendering architecture and the preview cannot
// drift from what fans actually get. What lives here is only the arithmetic
// around it: when to reload, and what to say before the page exists.

/**
 * Everything the preview needs from the wizard's existing source of truth
 * (`useArtistSetup`). Deliberately a subset of `ArtistSetupState`: the preview
 * derives from that hook and never keeps a second copy of onboarding state.
 */
export interface PreviewSetupFacts {
  slug: string;
  avatarUrl: string;
  hasMusic: boolean;
  hasTier: boolean;
  hasProduct: boolean;
  stripeConnected: boolean;
}

/**
 * The query string that turns the public page into an embedded fan view.
 *
 * `preview=visitor` is the EXISTING persona system (`useArtistPreview`), so the
 * page re-derives every lock as a signed-out visitor. `embed=1` additionally
 * strips the owner's preview chrome and makes checkout inert, because a preview
 * an artist can accidentally buy from is not a preview.
 */
export const PREVIEW_QUERY = 'preview=visitor&embed=1';

/** The embedded fan view of an artist's own page. Empty string when no page exists yet. */
export function previewUrl(slug: string): string {
  const clean = slug.trim();
  return clean ? `/${clean}?${PREVIEW_QUERY}` : '';
}

/**
 * A string that changes exactly when something fan-visible has changed.
 *
 * The iframe reloads on change and ONLY on change, which is what keeps the
 * preview live without re-rendering a whole page on every keystroke. Wizard
 * fields that are still being typed are not in here on purpose: a half-typed
 * artist name has not been saved, so a fan cannot see it yet, and reloading per
 * keypress would be both wrong and expensive.
 *
 * `nonce` is the escape hatch for changes the derived booleans cannot see: the
 * second track upload does not flip `hasMusic`, so the wizard bumps the nonce
 * wherever it already calls `refresh()`.
 */
export function previewSignature(facts: PreviewSetupFacts, nonce = 0): string {
  return [
    facts.slug,
    facts.avatarUrl,
    facts.hasMusic ? 'm' : '-',
    facts.hasTier ? 't' : '-',
    facts.hasProduct ? 'p' : '-',
    facts.stripeConnected ? 's' : '-',
    nonce,
  ].join('|');
}

export interface PreviewChecklistItem {
  key: 'page' | 'photo' | 'tiers' | 'music' | 'payments';
  label: string;
  done: boolean;
}

/**
 * What a fan can see so far. Drives the honest empty state before the page
 * exists, and the caption underneath the preview once it does.
 *
 * Order matches the wizard's own screen order, so the list fills top to bottom
 * as the artist moves through it.
 */
export function previewChecklist(facts: PreviewSetupFacts): PreviewChecklistItem[] {
  return [
    { key: 'page', label: 'Your page is live at a link', done: !!facts.slug.trim() },
    { key: 'photo', label: 'A photo fans recognise', done: !!facts.avatarUrl.trim() },
    { key: 'tiers', label: 'Something for fans to join', done: facts.hasTier },
    { key: 'music', label: 'Music fans can hear', done: facts.hasMusic },
    { key: 'payments', label: 'Payments switched on', done: facts.stripeConnected },
  ];
}

/** How much of the page is real yet, 0 to 1. Drives the progress caption. */
export function previewCompletion(facts: PreviewSetupFacts): number {
  const items = previewChecklist(facts);
  return items.filter((i) => i.done).length / items.length;
}
