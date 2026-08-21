// How a fan reached a lead magnet: the QR on the table, the JUBO text, or a plain link.
//
// This is a REPORTING dimension and nothing else, which is why it is safe to accept from
// the browser: it never reaches an authorization decision, a price, a tier, an
// eligibility check or a recommendation. It is allowlisted here so a query string can
// never write arbitrary text into a stored row, matching how campaignAttribution.ts
// treats every acquisition dimension.

/** The only values that may ever be stored. Anything else becomes null, never raw text. */
export const CLAIM_SOURCES = ['qr', 'jubo', 'sms', 'link'] as const;
export type ClaimSource = (typeof CLAIM_SOURCES)[number];

/** Aliases people put in flyers and links, mapped onto the canonical set. */
const ALIASES: Record<string, ClaimSource> = {
  qr: 'qr',
  qrcode: 'qr',
  'qr-code': 'qr',
  flyer: 'qr',
  jubo: 'jubo',
  text: 'sms',
  sms: 'sms',
  link: 'link',
  url: 'link',
};

export function normalizeClaimSource(raw: unknown): ClaimSource | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().slice(0, 32);
  if (!key) return null;
  return ALIASES[key] ?? null;
}

/** Human label for the Studio results table. */
export function claimSourceLabel(source: string | null | undefined): string {
  switch (source) {
    case 'qr': return 'QR code';
    case 'jubo': return 'JUBO text';
    case 'sms': return 'Text';
    case 'link': return 'Link';
    default: return 'Not recorded';
  }
}
