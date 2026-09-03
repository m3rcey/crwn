# 32 - Tier Offer Experience

> Shipped 2026-09-02. The universal fan-facing sales presentation for an artist membership
> tier, and the rendering/data foundation the future Offer Builder writes into.
> GB The G1ft is the first reference implementation.

## The one architectural line

`subscription_tiers` and the canonical entitlement oracle define **what a fan gets**.
A Tier Offer Experience defines **how that value is presented and demonstrated before
purchase**. The marketing layer can never invent or override entitlement truth: the config
holds no tier grants, no prices, no benefit flags, and no protected media references. The
core principle, ratified: **the Offer Builder merchandises canonical entitlements. It does
not redefine them.**

## Shipped now

- **Storage**: `tier_offer_experiences` (migration `schema-phase2-tier-offer-experiences.sql`),
  one row per tier, `config` jsonb, service-role only (RLS on, anon+authenticated revoked
  by name), same-artist trigger. This is the row the Offer Builder will write.
- **Contract**: `src/lib/offerExperience/types.ts` + `normalize.ts`. Every string bounded,
  every list capped, unknown keys dropped. Two rules live at this boundary and cannot be
  bypassed by any writer:
  - **REAL vs EXAMPLE is a required field.** A preview without a declared truth state is
    refused, and the renderer prints the "Example experience" chip from the field, so
    honesty never depends on a developer remembering a label.
  - **Benefit-based CTA is a universal CRWN sales rule.** `isBenefitCta` refuses
    Join/Subscribe/Become/Upgrade buttons and any CTA containing the tier name. The
    button answers "what do I get by doing this?"; tier and price render beside it.
  - Media references must be plain public https URLs; anything signed or
    credential-shaped is stripped, so the sales layer is structurally unable to leak
    protected bytes. Entitlement checks are never duplicated in the renderer.
- **Renderer**: `src/components/offer/TierOfferExperience.tsx`. ONE component for every
  artist and tier: hero (promise, price, CTA above the fold, "See what you get" cue),
  optional VSL (null url renders NOTHING fan-facing, the ratified VSL-catalog rule; a
  placeholder video is chip-disclosed as an example), ordered previews (kinds: audio,
  video, image, decision, submission, collection, timeline, session, window, status),
  inherited-value strip, FAQ, final CTA, and a sticky CTA that appears only after the
  hero action scrolls away. EXAMPLE interactions render as inert demonstrations with
  assistive-tech labels, never as fake enabled controls.
- **Funnel integration**: the existing `/drop/[token]` journey, not a parallel funnel.
  The drop page loads configs server-side (`offerExperience/server.ts`, fail-soft: no
  row = the compact offer card, byte-for-byte the previous behavior). The purchase
  action is the funnel's ONE existing cluster (benefit CTA + inline sign-in code +
  canonical checkout); the experience receives it as a slot, and sticky/final CTAs
  scroll back to it so checkout and auth state can never fork.
- **Primary/downsell stays configuration** (`fan_automations.gold_tier_id`/`silver_tier_id`
  through `resolveFunnelOffers`); the experience layer adds presentation only. An explicit
  decline (never a Stripe back-out) moves primary -> downsell -> stay free, and the free
  fallback is a legitimate membership, not an error state.
- **Analytics**: reuses `tier_events`. Two added types (migration
  `schema-phase2-tier-events-offer-vocabulary.sql`): `tier_vsl_started`,
  `tier_offer_declined`. Views reuse `tier_card_viewed`; checkout starts remain
  server-recorded and are NOT client-namable in the beacon.
- **Campaign overlay**: the config shape is evergreen; a campaign layer will sit above it
  and be removable without touching the permanent experience. No campaign is active and
  none is hard-coded.

## GB reference configuration

`src/lib/offerExperience/reference/gb.ts` (content, reviewed and tested), written to
production by `scripts/configure-gb-offer.mjs` (idempotent, validates through the same
normalizer, re-reads after writing). Canonical CTAs: Bronze capture **Unlock Go Bad**
(the capture button is benefit-led for every artist: "Unlock <magnet>"), Silver **Take Me
Backstage**, Gold **Help Shape What Comes Next**, Platinum **Put My Ideas in the Room**.
Only two REAL previews exist today (Platinum status; members-only music, true because Go
Bad is member-gated in production); everything else is truth: 'example' until GB actually
runs one. Tests in `reference/gb.test.ts` pin the truth discipline: no rights/royalty/
credit language, no cadence promises, "for consideration" present, no em dashes, VSL null.

## The V1 Offer Builder (shipped 2026-09-03, Rise Mode Guided Setup)

An artist writes their own experience through the guided flow at `/build/experience`
(`src/components/guided/experience/`), which Rise Mode opens as "Show fans why the paid tier
is worth it". It is a STRUCTURED writer over this contract, not a page builder: CRWN owns the
layout (the one renderer), the artist supplies truthful content one decision per screen.
Promise and description are pre-filled from the tier; the button is checked by `isBenefitCta`
before publish; each CRWN-delivered benefit gets one screen where the artist chooses a REAL
thing (offered only when Promise to Delivery readiness says it exists), their own public
artwork, a labelled EXAMPLE, or words only, so the truth state comes from the choice and is
never typed; the FAQ is drafted deterministically from tier facts (`draftFaqs`, no cadence, no
result); the video is optional; the preview IS `TierOfferExperience` over the normalized draft.
Publish goes through `PUT /api/tier-offer-experiences` (session authority, the tier id matched
against the owner's own active paid tiers), which validates with `normalizeOfferExperience` and
names the first refusal in the artist's words (`src/lib/offerExperience/refusal.ts`). In-flight
text lives in the browser; the published row is the only canonical state, and it is what
`artist_offer_experience_live` (the quest) and the roadmap read. There is deliberately no proof
screen: the contract has no proof field, and real proof becomes a preview when it exists.

## Changing an artist's offer copy by hand (the concierge loop still works)

The script loop below predates the builder and remains valid for GB's reference configs; it
writes the same row through the same normalizer:

1. Edit the artist's reference config (GB: `src/lib/offerExperience/reference/gb.ts`).
   Promise, description, CTA, preview titles and copy, FAQs, and preview ORDER all live
   there as plain data.
2. Run `npx tsx scripts/configure-gb-offer.mjs`. It validates each config through the
   same normalizer the read path uses, upserts, and re-reads to confirm. Content-only
   changes need no deploy: the page reads the row server-side on the next request.

Two rules the normalizer will enforce on whatever the artist asks for, and they are not
negotiable in a concierge edit either: the CTA cannot be "Join <tier>" or contain the
tier name (it must name the OUTCOME), and every preview must carry a REAL or EXAMPLE
truth state. A config that breaks either is refused by the seed script rather than
written, which is the point: the artist's voice can change freely, the honesty rules
cannot.

**Why concierge rather than a form, for now.** The first artists on this architecture
tell us which fields actually get edited. Building the editor before that is guessing at
a form, and the wrong fields are more expensive to remove than to add.

## What the future Offer Builder will control

Promise, description, CTA (validated by `isBenefitCta` and against configured
entitlements), VSL attachment, ordered previews with truth status, inherited-benefit
merchandising, FAQ, proof references, campaign overlay, and primary/downsell selection
where appropriate.

## What it will NEVER control

Entitlement grants, Stripe billing logic, tier ownership, subscription status, protected
media access, legal claims, raw HTML, or executable components. It is not a CMS, not a
page builder, and not a theme editor.

## Deferred deliberately

AI copy/VSL generation (every field has a deterministic default from the artist's rows;
a model may later suggest, the normalizer still decides), per-tier ascension VSLs,
proof/testimonial wiring for GB (he has none yet; the renderer omits the section
gracefully), uploaded preview media (the builder offers artwork the artist already
publishes; a private upload would need a public image path that does not exist), and any
further analytics events.
