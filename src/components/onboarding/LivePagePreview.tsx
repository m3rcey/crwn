'use client';

// The live fan preview that runs beside the whole setup wizard.
//
// WHAT IT IS: an iframe of the artist's REAL public page at
// `/{slug}?preview=visitor&embed=1`. Not a mockup, not a second renderer, not a
// wireframe. Every section, lock, tab and player inside it is the production
// artist page, so it cannot drift from what fans get, and at launch the artist
// is already looking at the finished article.
//
// WHY AN IFRAME: the public page is a React Server Component that runs ten
// Supabase queries and renders the money surface. Rebuilding it against wizard
// state would create the exact duplicate rendering architecture this is meant to
// avoid, and refactoring it mid-onboarding would put the highest-risk page in
// the blast radius of a preview widget. Framing the real route reuses it whole.
//
// WHY IT IS SAFE: `preview=visitor` is the EXISTING persona lens
// (`useArtistPreview`), which only ever REMOVES access, so the artist sees the
// locks a signed-out fan sees. `embed=1` additionally makes subscribe and buy
// inert. Framing is same-origin only (`frame-ancestors 'self'`).

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, X, ExternalLink, RefreshCw } from 'lucide-react';
import {
  previewUrl,
  previewChecklist,
  previewCompletion,
  type PreviewSetupFacts,
} from '@/lib/onboardingPreview';

interface LivePagePreviewProps {
  facts: PreviewSetupFacts;
  /** Changes exactly when something fan-visible changed. Reloads the frame. */
  version: string;
}

/** The frame itself, plus the honest empty state for before the page exists. */
function PreviewSurface({ facts, version }: LivePagePreviewProps) {
  const url = previewUrl(facts.slug);
  // Which version has finished loading, rather than a boolean reset by an
  // effect: a new version is by definition not loaded yet, so the fade falls
  // out of the comparison with no cascading render.
  const [loadedVersion, setLoadedVersion] = useState('');
  const loaded = loadedVersion === version;

  if (!url) {
    return <PreviewChecklist facts={facts} pending />;
  }

  return (
    <div className="relative w-full h-full overflow-hidden rounded-2xl border border-crwn-elevated bg-crwn-surface-solid">
      {!loaded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-crwn-surface-solid">
          <RefreshCw className="w-5 h-5 text-crwn-gold animate-spin" aria-hidden />
          <span className="sr-only">Loading your page</span>
        </div>
      )}
      <iframe
        // Remounting on version is what reloads the page. It only happens when
        // something a fan can see actually changed, never per keystroke.
        key={version}
        src={url}
        title="Live preview of your CRWN page, as a fan sees it"
        onLoad={() => setLoadedVersion(version)}
        loading="lazy"
        // No allow-top-navigation and no allow-forms: even if a money action
        // slipped past the in-page guard, it cannot navigate the wizard away or
        // post a form. allow-same-origin is required for the page's own session
        // reads; allow-scripts for the tabs and the player.
        sandbox="allow-same-origin allow-scripts allow-popups"
        className={`w-full h-full border-0 bg-crwn-bg transition-opacity duration-500 motion-reduce:transition-none ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </div>
  );
}

/** What a fan can see so far. The empty state, and the caption under the frame. */
function PreviewChecklist({ facts, pending = false }: { facts: PreviewSetupFacts; pending?: boolean }) {
  const items = previewChecklist(facts);
  return (
    <div
      className={
        pending
          ? 'w-full h-full rounded-2xl border border-crwn-elevated bg-crwn-surface-solid p-6 flex flex-col justify-center'
          : 'pt-3'
      }
    >
      {pending && (
        <>
          <Eye className="w-6 h-6 text-crwn-gold mb-3" aria-hidden />
          <p className="text-sm font-semibold text-crwn-text mb-1">Your page appears here</p>
          <p className="text-xs text-crwn-text-secondary mb-5">
            Claim your link on the next screen and this becomes the real thing, exactly as a fan sees it.
          </p>
        </>
      )}
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 text-xs">
            <span
              aria-hidden
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                item.done ? 'bg-crwn-gold' : 'bg-crwn-text-secondary/30'
              }`}
            />
            <span className={item.done ? 'text-crwn-text' : 'text-crwn-text-secondary/70'}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Desktop: a sticky column beside the wizard. Below xl: a button that opens the
 * same surface as a bottom sheet, so the wizard keeps the full width on the
 * screens where one field per screen is already tight.
 */
export function LivePagePreview({ facts, version }: LivePagePreviewProps) {
  // No mount guard needed: the portal is only reached once `sheetOpen` is true,
  // and that can only happen from a click, which can only happen on the client.
  // The server render never touches `document`.
  const [sheetOpen, setSheetOpen] = useState(false);

  const url = previewUrl(facts.slug);
  const pct = Math.round(previewCompletion(facts) * 100);

  // A fixed sheet anchors to any transformed ancestor, so it has to leave the
  // wizard's DOM entirely.
  const sheet =
    sheetOpen
      ? createPortal(
          <div className="fixed inset-0 z-[100] xl:hidden">
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setSheetOpen(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Live preview of your CRWN page"
              className="absolute inset-x-0 bottom-0 top-10 rounded-t-3xl bg-crwn-bg border-t border-crwn-elevated p-3 flex flex-col"
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <p className="text-sm font-semibold text-crwn-text">What fans see</p>
                <button
                  onClick={() => setSheetOpen(false)}
                  aria-label="Close preview"
                  className="p-2 -m-2 text-crwn-text-secondary hover:text-crwn-text"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <PreviewSurface facts={facts} version={version} />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {/* Desktop column */}
      <aside className="hidden xl:block w-[400px] flex-shrink-0" aria-label="Live preview">
        <div className="sticky top-24 pr-6">
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-sm font-semibold text-crwn-text">What fans see</p>
            <span className="text-[11px] text-crwn-text-secondary">{pct}% built</span>
          </div>
          <div className="h-[620px]">
            <PreviewSurface facts={facts} version={version} />
          </div>
          <PreviewChecklist facts={facts} />
          {url && (
            <a
              href={url.replace(`&embed=1`, '')}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs text-crwn-text-secondary hover:text-crwn-gold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open the full page
            </a>
          )}
        </div>
      </aside>

      {/* Below xl: the sheet trigger. Sits above the wizard footer. */}
      <button
        onClick={() => setSheetOpen(true)}
        className="xl:hidden fixed right-4 bottom-24 z-30 inline-flex items-center gap-2 rounded-full bg-crwn-surface-solid border border-crwn-elevated px-4 py-2.5 text-sm font-medium text-crwn-text shadow-lg"
      >
        <Eye className="w-4 h-4 text-crwn-gold" />
        See my page
      </button>
      {sheet}
    </>
  );
}
