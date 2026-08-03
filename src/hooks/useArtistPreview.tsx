'use client';

// Owner-only "see your page as a fan sees it" preview.
//
// WHY THIS EXISTS: every gated surface on the public artist page decides locked
// vs unlocked from the viewer's subscription tier, and the OWNER has no
// subscription row. Worse, the database deliberately hands the owner entitled
// data (tracks_public signs their own audio, community_posts_feed returns
// can_view = true), so an artist looking at their own page cannot tell whether
// a visitor sees a locked door or an open one. They ship a ladder where either
// nothing converts or the paid catalog is free, and only a fan ever finds out.
//
// SAFETY: preview only ever REMOVES access. It re-derives every client-side gate
// as if the viewer held the previewed tier (or nothing at all), so it can never
// show more than the owner is already entitled to. It is a rendering lens, not
// an authorization boundary, and it is inert for anyone who is not the owner.

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export const OWNER_PERSONA = 'owner';
export const VISITOR_PERSONA = 'visitor';

export interface PreviewPersona {
  /** OWNER_PERSONA, VISITOR_PERSONA, or a tier id. */
  key: string;
  label: string;
  hint?: string;
  /** The subscription tier this persona holds. null = no subscription. */
  tierId: string | null;
}

export interface ArtistPreviewValue {
  /** True only while the owner is actively viewing as someone else. */
  previewing: boolean;
  /**
   * True when the page is rendered inside the onboarding live preview
   * (`?embed=1`). Everything still renders exactly as a fan sees it; the one
   * difference is that money actions are inert, because an artist watching
   * their page come alive must not be able to buy from themselves by mistake.
   * Unlike `previewing`, this holds even for a non-owner: it can only ever
   * remove an action, never grant one.
   */
  embedded: boolean;
  /** Tier the previewed persona holds. null = visitor or free-tier-less. */
  previewTierId: string | null;
  previewTierName: string | null;
  personaKey: string;
  personas: PreviewPersona[];
  isOwner: boolean;
  setPersona: (key: string) => void;
}

// Default for every tree without a provider (every page that is not a public
// artist page). previewing:false means all consumers behave exactly as before.
const INERT: ArtistPreviewValue = {
  previewing: false,
  embedded: false,
  previewTierId: null,
  previewTierName: null,
  personaKey: OWNER_PERSONA,
  personas: [],
  isOwner: false,
  setPersona: () => {},
};

const ArtistPreviewContext = createContext<ArtistPreviewValue>(INERT);

export function useArtistPreview(): ArtistPreviewValue {
  return useContext(ArtistPreviewContext);
}

/**
 * Wraps the public artist page. `isOwner` MUST be the real ownership check
 * (session user id === artist_profiles.user_id), never "is this viewer an
 * artist" — a rival artist is not the owner of this page.
 */
export function ArtistPreviewProvider({
  isOwner,
  tiers,
  initialPersona,
  embedded = false,
  children,
}: {
  isOwner: boolean;
  tiers: { id: string; name: string; price: number }[];
  initialPersona?: string | null;
  /** Rendered inside the onboarding live preview (`?embed=1`). */
  embedded?: boolean;
  children: ReactNode;
}) {
  const personas = useMemo<PreviewPersona[]>(() => {
    const ladder = [...tiers].sort((a, b) => a.price - b.price);
    return [
      { key: OWNER_PERSONA, label: 'Yourself (the owner)', hint: 'Everything unlocked', tierId: null },
      { key: VISITOR_PERSONA, label: 'A visitor', hint: 'Not signed in, no membership', tierId: null },
      ...ladder.map((t) => ({
        key: t.id,
        label: `${t.name} member`,
        hint: t.price === 0 ? 'Free tier' : `$${(t.price / 100).toFixed(2)}/mo`,
        tierId: t.id,
      })),
    ];
  }, [tiers]);

  // A persona from the URL (?preview=) only counts if it resolves to a real
  // persona for THIS artist, so a stale tier id from another page is ignored.
  const validInitial =
    initialPersona && personas.some((p) => p.key === initialPersona) ? initialPersona : OWNER_PERSONA;
  const [personaKey, setPersonaKey] = useState<string>(validInitial);

  const setPersona = useCallback((key: string) => setPersonaKey(key), []);

  const value = useMemo<ArtistPreviewValue>(() => {
    // `embedded` survives the non-owner path: it only ever disables a money
    // action, so it must never depend on the ownership check to apply.
    if (!isOwner) return { ...INERT, embedded };
    const active = personas.find((p) => p.key === personaKey) ?? personas[0];
    const previewing = personaKey !== OWNER_PERSONA;
    return {
      previewing,
      embedded,
      previewTierId: previewing ? active?.tierId ?? null : null,
      previewTierName: previewing && active?.tierId ? active.label : null,
      personaKey,
      personas,
      isOwner,
      setPersona,
    };
  }, [isOwner, personaKey, personas, setPersona, embedded]);

  return <ArtistPreviewContext.Provider value={value}>{children}</ArtistPreviewContext.Provider>;
}
