import type { Metadata } from 'next';

/**
 * One builder for every shared-link preview.
 *
 * Before this existed, only a handful of routes exported metadata, so every other CRWN
 * link pasted into iMessage, WhatsApp or a DM inherited the ROOT layout's title
 * ("CRWN | The Fan Economy Operating System for Independent Artists") no matter what the
 * page actually was. A fan being sent a song saw a pitch for artist software.
 *
 * Two rules the builder enforces so a page cannot break them by hand:
 *   - the title says what THIS page is, in under 40 characters (a link preview truncates
 *     past roughly that, and a truncated title reads as the wrong page);
 *   - the description is a single trimmed line, never the site boilerplate.
 */

export const SHARE_TITLE_MAX = 40;

/** Collapse whitespace and fit inside the preview's usable title width. */
export function shareTitle(raw: string | null | undefined, fallback = 'CRWN'): string {
  const clean = (raw || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  if (clean.length <= SHARE_TITLE_MAX) return clean;
  return `${clean.slice(0, SHARE_TITLE_MAX - 1).trimEnd()}…`;
}

function shareDescription(raw: string | null | undefined, fallback: string): string {
  const clean = (raw || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  return clean.length <= 200 ? clean : `${clean.slice(0, 199).trimEnd()}…`;
}

interface ShareMetadataInput {
  /** What this page IS. Truncated to 40 characters. */
  title: string;
  /** One line under the title. */
  description: string;
  /** Site-relative path, e.g. `/m3rcey/lab`. metadataBase supplies the origin. */
  path?: string;
  /** Absolute or site-relative image. Falls back to the CRWN mark. */
  image?: string | null;
  /** True when the image is a wide banner/cover rather than a square icon. */
  wideImage?: boolean;
}

export function shareMetadata({
  title,
  description,
  path,
  image,
  wideImage,
}: ShareMetadataInput): Metadata {
  const t = shareTitle(title);
  const d = shareDescription(description, t);
  const img = image || '/icon-512x512.png';
  const wide = wideImage ?? img !== '/icon-512x512.png';

  return {
    title: t,
    description: d,
    openGraph: {
      title: t,
      description: d,
      siteName: 'CRWN',
      ...(path ? { url: path } : {}),
      images: [{ url: img, alt: t }],
      type: 'website',
    },
    twitter: {
      card: wide ? 'summary_large_image' : 'summary',
      title: t,
      description: d,
      images: [img],
    },
  };
}
