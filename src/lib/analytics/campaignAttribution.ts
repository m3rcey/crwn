// Campaign attribution: the ONE normalizer for a tagged acquisition link.
//
// The organic videos all point at the same calculators. Without a tag on the link, every visit
// reads as "instagram" and the founder can compare nothing: which video produced a result, which
// produced a signup, which produced an artist who actually got paid. This module turns the query
// string on a tagged link into a small, normalized, allowlisted record that is safe to store, safe
// to render, and safe to group by.
//
// RULES, all enforced here so no caller has to remember them:
//   - Every value is normalized to a slug: lowercase, [a-z0-9._-], separators collapsed, 64 chars.
//     Anything else is DROPPED, so no marketing copy, no HTML, no injection reaches a report.
//   - `channel` is allowlisted. An unrecognized channel is null, never stored.
//   - `platform` is allowlisted (with a small alias map). A non-empty unrecognized platform
//     becomes 'other' so the visit still counts without storing uncontrolled text.
//   - Open-ended fields (campaign / creative / variant / angle / keyword / ref) are normalized and
//     bounded but NOT allowlisted: the founder names their own campaigns, and an allowlist that
//     needs a deploy per video would just stop being used.
//   - NOTHING here participates in pricing, lead scoring, entitlement, or authorization. These are
//     reporting dimensions only.
//
// TRANSPORT. The link uses standard UTM params, because ManyChat, email clients and every social
// platform already pass them through untouched, and CRWN already parses them end to end:
//     utm_source  -> platform      (instagram, tiktok, youtube, ...)
//     utm_medium  -> channel       (organic, paid, referral, ...)
//     utm_campaign-> campaign      (kcamp_streaming_loss)
//     utm_content -> creative      (kcamp_v1)
// Three CRWN-specific params carry what UTM has no slot for:
//     angle       -> the content promise (streaming_loss)
//     keyword     -> the ManyChat comment trigger (vault)
//     variant     -> the creative version/variation (b, hook2)
// Plus the two that already existed: `ref` (partner/referrer code) and `from` (the sub-avatar
// entry context, docs/SUB_AVATARS.md). Plain-English aliases (platform=, channel=, campaign=,
// creative=) are accepted too, so a hand-written link still works.
//
// ATTRIBUTION POLICY (documented, not invented):
//   - The CLIENT beacon keeps its existing behavior: values on the current URL win, and the
//     first-touch snapshot only fills silence. That is last-touch at the event level.
//   - PERSISTED attribution is FIRST-TOUCH: mergeAttribution never overwrites a field that is
//     already set, so a later untagged or partially-tagged visit cannot erase the video that
//     actually brought the artist.

export const ATTRIBUTION_INPUT_KEY = '_attribution';

/** How the visit was acquired. Allowlisted: an unknown channel is dropped. */
export const ACQUISITION_CHANNELS = [
  'organic',
  'paid',
  'referral',
  'partner',
  'affiliate',
  'email',
  'sms',
  'direct',
] as const;
export type AcquisitionChannel = (typeof ACQUISITION_CHANNELS)[number];

/** Where the visit came from. Allowlisted; anything else normalizes to 'other'. */
export const SOURCE_PLATFORMS = [
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'facebook',
  'threads',
  'snapchat',
  'linkedin',
  'reddit',
  'twitch',
  'pinterest',
  'discord',
  'podcast',
  'email',
  'manychat',
  'web',
  'other',
] as const;
export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];

// What artists and founders actually type. Kept small on purpose: an alias map is a maintenance
// cost, and 'other' is a perfectly honest answer for anything not listed.
const PLATFORM_ALIASES: Record<string, SourcePlatform> = {
  ig: 'instagram',
  insta: 'instagram',
  instagram: 'instagram',
  reels: 'instagram',
  tt: 'tiktok',
  tiktok: 'tiktok',
  yt: 'youtube',
  youtube: 'youtube',
  shorts: 'youtube',
  twitter: 'x',
  x: 'x',
  fb: 'facebook',
  facebook: 'facebook',
  meta: 'facebook',
  threads: 'threads',
  snap: 'snapchat',
  snapchat: 'snapchat',
  li: 'linkedin',
  linkedin: 'linkedin',
  reddit: 'reddit',
  twitch: 'twitch',
  pinterest: 'pinterest',
  discord: 'discord',
  podcast: 'podcast',
  newsletter: 'email',
  email: 'email',
  manychat: 'manychat',
  dm: 'manychat',
  web: 'web',
  website: 'web',
};

const CHANNEL_SET = new Set<string>(ACQUISITION_CHANNELS);

/** Max length of any single normalized tag. Long enough to be readable, short enough to be a key. */
export const MAX_TAG_LENGTH = 64;

/**
 * Normalize one externally supplied value into a safe slug, or null.
 *
 * This is the security boundary: only [a-z0-9._-] survives, so a value can never carry HTML, a
 * quote, a script, a SQL fragment, or a newline into a stored row or an admin table.
 */
export function normalizeTag(v: unknown, max: number = MAX_TAG_LENGTH): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const slug = String(v)
    .trim()
    .toLowerCase()
    .replace(/[\s+]+/g, '-')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/[-_.]{2,}/g, (m) => m[0])
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, max)
    // A trailing separator can reappear after the slice.
    .replace(/[-_.]+$/g, '');
  return slug || null;
}

/** Normalize + allowlist a channel. An unrecognized channel is dropped, never stored. */
export function normalizeChannel(v: unknown): AcquisitionChannel | null {
  const slug = normalizeTag(v, 24);
  return slug && CHANNEL_SET.has(slug) ? (slug as AcquisitionChannel) : null;
}

/**
 * Normalize + allowlist a platform. A non-empty value we do not recognize becomes 'other': the
 * visit still counts in a report without the report ever rendering uncontrolled text.
 */
export function normalizePlatform(v: unknown): SourcePlatform | null {
  const slug = normalizeTag(v, 32);
  if (!slug) return null;
  return PLATFORM_ALIASES[slug] ?? 'other';
}

/** The normalized, storable attribution for one visit. Every field is optional by design. */
export interface CampaignAttribution {
  /** organic | paid | referral | ... (allowlisted) */
  channel: AcquisitionChannel | null;
  /** instagram | tiktok | youtube | ... (allowlisted, 'other' for anything else) */
  platform: SourcePlatform | null;
  /** The campaign this piece of content belongs to, e.g. kcamp_streaming_loss. */
  campaign: string | null;
  /** The specific video/creative, e.g. kcamp_v1. Maps onto the funnel's `video` dimension. */
  creative: string | null;
  /** A version or variation of that creative, e.g. b, hook2. */
  variant: string | null;
  /** The content angle / calculator promise, e.g. streaming_loss. */
  angle: string | null;
  /** The ManyChat comment trigger word, e.g. vault. */
  keyword: string | null;
  /** A legitimate partner/referrer code that already exists (?ref=). */
  ref: string | null;
  /**
   * `?artist_ref=` — the PUBLIC SLUG of a CRWN artist who shared a Post-Win referral link.
   *
   * DELIBERATELY NOT `ref`. That field means "partner/recruiter code" and flows into
   * `partner_code_used` / `recruited_by` / `artist_referrals`, whose rows carry a $50
   * `flat_fee_amount` written from a Stripe webhook. Overloading it would put an organic
   * artist-to-artist share one branch away from a commission obligation. This dimension is
   * REPORTING ONLY and touches no money rail, by founder decision (see 25-POST-WIN-REFERRAL.md):
   * Post-Win referrals are unpaid, are never retroactively commissionable, and never enter the
   * recruiter rail.
   *
   * The slug is used as the identity because it is already public (it IS the artist's page URL),
   * already unique, already stable, and server-resolvable back to one artist, so this needs no
   * token table and no new schema. It is normalized like any other tag: a hostile value simply
   * does not survive.
   */
  artistReferrer: string | null;
  /** The calculator entry context (?from=), the sub-avatar funnel. Normalized only; the
   *  sub-avatar itself is still validated against the taxonomy where it is stored. */
  entry: string | null;
}

export const EMPTY_ATTRIBUTION: CampaignAttribution = {
  channel: null,
  platform: null,
  campaign: null,
  creative: null,
  variant: null,
  angle: null,
  keyword: null,
  ref: null,
  artistReferrer: null,
  entry: null,
};

/** Anything that can answer "give me the value of this query param". */
export type ParamSource = URLSearchParams | Record<string, unknown> | null | undefined;

function pick(src: ParamSource, ...keys: string[]): unknown {
  if (!src) return null;
  for (const k of keys) {
    const v = src instanceof URLSearchParams ? src.get(k) : (src as Record<string, unknown>)[k];
    if (v != null && v !== '') return v;
  }
  return null;
}

/**
 * Parse a query string (or a plain object) into normalized attribution. Pure, total, and never
 * throws: a hostile or malformed value simply does not survive normalization.
 */
export function parseCampaignAttribution(src: ParamSource): CampaignAttribution {
  return {
    channel: normalizeChannel(pick(src, 'utm_medium', 'channel')),
    platform: normalizePlatform(pick(src, 'utm_source', 'platform')),
    campaign: normalizeTag(pick(src, 'utm_campaign', 'campaign')),
    creative: normalizeTag(pick(src, 'utm_content', 'creative', 'video')),
    variant: normalizeTag(pick(src, 'variant', 'utm_term'), 32),
    angle: normalizeTag(pick(src, 'angle')),
    keyword: normalizeTag(pick(src, 'keyword', 'kw'), 32),
    ref: normalizeTag(pick(src, 'ref'), 48),
    // Only `artist_ref`. No alias, and deliberately never `ref`: see the field's note above.
    artistReferrer: normalizeTag(pick(src, 'artist_ref'), 48),
    entry: normalizeTag(pick(src, 'from'), 48),
  };
}

/** True when at least one dimension survived normalization. */
export function hasAttribution(a: CampaignAttribution | null | undefined): boolean {
  return !!a && Object.values(a).some((v) => !!v);
}

/**
 * Re-normalize an attribution record read back from storage. A stored row is still an
 * externally-influenced value (it originated in a query string), so it is re-validated on the way
 * out rather than trusted because it is "ours now".
 */
export function sanitizeStoredAttribution(v: unknown): CampaignAttribution {
  if (!v || typeof v !== 'object') return { ...EMPTY_ATTRIBUTION };
  return parseCampaignAttribution({
    utm_medium: (v as Record<string, unknown>).channel,
    utm_source: (v as Record<string, unknown>).platform,
    utm_campaign: (v as Record<string, unknown>).campaign,
    utm_content: (v as Record<string, unknown>).creative,
    variant: (v as Record<string, unknown>).variant,
    angle: (v as Record<string, unknown>).angle,
    keyword: (v as Record<string, unknown>).keyword,
    ref: (v as Record<string, unknown>).ref,
    // Round-tripped under its QUERY-PARAM name, because this re-parses through
    // `parseCampaignAttribution`. Omitting it here would silently drop the dimension on every
    // read-back, so it would survive capture and die at the first reader.
    artist_ref: (v as Record<string, unknown>).artistReferrer,
    from: (v as Record<string, unknown>).entry,
  });
}

/**
 * FIRST-TOUCH merge for persisted attribution: a field that is already set is never replaced.
 *
 * This is what stops a later untagged visit, a partially-tagged retry, or a malformed value from
 * erasing the video that actually brought the artist. Fields the existing record has no value for
 * are filled from the incoming one, so a second visit can only ever ADD detail.
 */
export function mergeAttribution(
  existing: CampaignAttribution | null | undefined,
  incoming: CampaignAttribution | null | undefined,
): CampaignAttribution {
  const a = existing ?? EMPTY_ATTRIBUTION;
  const b = incoming ?? EMPTY_ATTRIBUTION;
  const out = { ...EMPTY_ATTRIBUTION };
  for (const k of Object.keys(EMPTY_ATTRIBUTION) as (keyof CampaignAttribution)[]) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (out as any)[k] = a[k] ?? b[k] ?? null;
  }
  return out;
}

/** The subset of funnel_events dimensions this attribution fills. Only non-null keys appear. */
export interface FunnelAttributionDims {
  campaign?: string | null;
  referrer?: string | null;
  video?: string | null;
  metadata?: Record<string, string>;
}

/**
 * Map attribution onto the funnel's existing reporting dimensions, plus the extra tags in
 * metadata. Deliberately ADDITIVE: it returns only the keys it can fill, so a caller can spread it
 * over an event without blanking a dimension it already set from a stronger source.
 */
export function attributionToFunnelDims(a: CampaignAttribution | null | undefined): FunnelAttributionDims {
  if (!a) return {};
  const dims: FunnelAttributionDims = {};
  if (a.campaign) dims.campaign = a.campaign;
  // `referrer` is the funnel's source/platform dimension. The normalized platform is a better key
  // than a raw document.referrer URL, but it only ever fills the slot, never overwrites it.
  if (a.platform) dims.referrer = a.platform;
  if (a.creative) dims.video = a.creative;

  const meta: Record<string, string> = {};
  if (a.channel) meta.channel = a.channel;
  if (a.platform) meta.platform = a.platform;
  if (a.variant) meta.variant = a.variant;
  if (a.angle) meta.angle = a.angle;
  if (a.keyword) meta.keyword = a.keyword;
  if (a.ref) meta.ref = a.ref;
  // Rides the existing metadata bag, so the funnel gains a sliceable artist-referrer dimension
  // with NO schema change. It never fills `referrer`, `campaign` or `video`: those belong to the
  // marketing attribution contest and this dimension is purely additive.
  if (a.artistReferrer) meta.artist_referrer = a.artistReferrer;
  if (Object.keys(meta).length) dims.metadata = meta;
  return dims;
}

/**
 * Build the canonical tagged URL. The ONE place a link is composed, so the admin builder, the docs
 * and the tests can never drift from what the parser accepts.
 *
 * `base` may already carry a query string; existing params are preserved and attribution params
 * are overwritten. Values are normalized first, so a builder cannot emit a link the parser drops.
 */
export function buildCampaignUrl(base: string, attr: Partial<CampaignAttribution>): string {
  const a = parseCampaignAttribution({
    utm_medium: attr.channel,
    utm_source: attr.platform,
    utm_campaign: attr.campaign,
    utm_content: attr.creative,
    variant: attr.variant,
    angle: attr.angle,
    keyword: attr.keyword,
    ref: attr.ref,
    // Under its QUERY-PARAM name, because this re-parses through `parseCampaignAttribution`.
    // Omitting it here silently serialized null: the link looked right and carried nothing.
    artist_ref: attr.artistReferrer,
    from: attr.entry,
  });

  const [path, existingQuery = ''] = String(base || '').split('#')[0].split('?');
  const params = new URLSearchParams(existingQuery);
  const set = (k: string, v: string | null) => (v ? params.set(k, v) : params.delete(k));
  set('utm_source', a.platform);
  set('utm_medium', a.channel);
  set('utm_campaign', a.campaign);
  set('utm_content', a.creative);
  set('angle', a.angle);
  set('keyword', a.keyword);
  set('variant', a.variant);
  set('ref', a.ref);
  set('artist_ref', a.artistReferrer);
  set('from', a.entry);

  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
