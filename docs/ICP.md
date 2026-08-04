# The CRWN customer avatar

Set by Josh, 2026-07-28. This file is the single source of truth for who CRWN is for. Code that
targets, scores, prices or writes copy for artists points here.

## The thesis

The ideal customer is **not** the artist with the biggest audience. It is the artist who has
**already proven they understand direct-to-fan monetization**, and whose monetization stack is
**fragmented**.

Streaming is exposure. Direct sales are proof.

An artist with 300k monthly listeners, 1.2M Instagram followers and sold-out tours is worth far
more to CRWN than one with 5M monthly listeners, no social engagement, and nothing ever sold
directly.

## Scoring weights

| Factor | Weight | Why |
|---|---|---|
| Direct monetization history | 40% | Biggest predictor they will understand CRWN |
| Audience size | 25% | Gives leverage immediately |
| Engagement | 20% | More important than raw followers |
| Catalog depth | 15% | More inventory to monetize |

Implemented in [`src/lib/acquisition/leadScoring.ts`](../src/lib/acquisition/leadScoring.ts)
(`SCORE_VERSION` 2.0.0).

## Tiers

**Tier 1, the ideal early customer.** Build the company around these.
- 250k to 5M followers across platforms
- 100k to 3M Spotify monthly listeners
- 40 to 300 released songs, multiple projects, consistent release history
- Has already sold: VIP experiences, merch, tour packages, Patreon, Discord communities,
  exclusive drops, beat packs, sample packs, masterclasses, fan subscriptions, meet and greets

They already know fans will pay for access. CRWN gives them ten more products to sell.

**Tier 2, also excellent.** The second wave.
- 50k to 250k followers, 20k to 100k monthly listeners, 20 to 80 songs
- Enough fans for meaningful recurring revenue, still figuring monetization out

**Tier 3, wait until later.** Under 50k followers, under 20k monthly listeners.
They can absolutely succeed on CRWN. The problem is economics: they need more education, support,
onboarding and coaching, which makes acquisition too expensive right now.

## The filter

Must have: 250k+ followers, 100k+ monthly listeners, 40+ released songs, releasing for 3+ years.

**Green flags:** sells merch, has an email list, has a Discord, uses YouTube Community, goes live,
sells meet and greets, has superfans, replies to comments, has a manager, has a touring schedule,
has repeat buyers.

**Red flags:** huge streaming numbers with almost no social engagement; one viral song and nothing
else; no evidence they ever tried to sell anything; inactive for long stretches; mostly
label-controlled with little direct fan interaction.

## The single biggest insight

The first ICP is not "successful independent artists." It is:

> Artists who have already proven they can get fans to spend money directly, but whose
> monetization stack is fragmented.

Today they are running some combination of Patreon, Shopify, Discord, Linktree, Kajabi, Gumroad,
Eventbrite, email software, SMS software, Calendly, Stripe and YouTube Memberships.

CRWN is compelling because it **consolidates those workflows into one platform** while adding
monetization they do not have: memberships, paid vaults, Executive Producer sessions, live
experiences, missions, referrals.

**Consolidation is the pitch. Not "streaming pays pennies."** They already know streaming pays
pennies. What they do not have is one place where the fan, the sale, the data and the next offer
all live together.

## The one numeric target to optimize marketing around

- 250k to 2M total followers
- 100k to 2M monthly Spotify listeners
- 50+ released songs
- At least one proven direct revenue stream outside streaming

## What this changed in the code

| Surface | Change |
|---|---|
| [`leadScoring.ts`](../src/lib/acquisition/leadScoring.ts) | Rewritten to the four weights. Deleted the `reachWithoutOwnership` bonus and inverted it into a `reachPenalty`. `monetization_status` was being collected and never scored; it is now the 40% dimension. Audience bands raised to the avatar's (v1 topped out at what is now the floor). Tier 1 is a hard `sales_priority`; below the floor is capped at `nurture`. |
| [`fieldRegistry.ts`](../src/lib/acquisition/fieldRegistry.ts) | Added `engagement_level`, `years_releasing`, `existing_platforms`. All `column: null`, so they live in `lead_profiles.extra` and need no migration. |
| [`registry.ts`](../src/lib/leadMagnets/registry.ts) | Every loss tool now asks the 40% question (`monetization_status`) as a second one-tap step. It used to ask follower count and nothing else. |
| [`WorthExperience.tsx`](../src/app/%28public%29/worth/WorthExperience.tsx) | Killed "Small is the whole point... built for the artist streaming can't pay yet." Objections and hero reframed on the fragmented stack. Input defaults raised from 50k listeners / 20k followers to 150k / 250k. |

## The four sub-avatars (2026-08-03)

The ICP is segmented into four founder-approved sub-avatars, in PRECEDENCE order: **Highest
Priority Empire Builder**, **Established Independent Minded Operator**, **Brand-Led Hip-Hop
Artist**, **R&B Empire Builder**. These are identity segments (priority tier, operating
maturity, genre), not pain segments, so **all four share ONE front door**: the all-in-one
calculator at `/tools/opportunity-calculator?from=<avatar id>`, which leads with that avatar's
questions and framing while every cohort runs the identical model.

Taxonomy (`subAvatar@2`) and deterministic assignment live in
[`src/lib/avatars/`](../src/lib/avatars/); the full spec is
[`docs/SUB_AVATARS.md`](SUB_AVATARS.md). Assignment is scored on the calculator's own answers
(audience against the Tier 1 floor above, proven direct sales, catalog depth, genre, content
output), never on which tool was run. The comparison metric is retained economic value per
avatar, in the admin Avatars tab.

## Still open

**The consolidation on-ramp is partially built.** An earlier version of this section claimed CRWN
had no email-list CSV import; that was wrong. The CSV import has existed at `/studio/fans` (Import
Fans, `/api/fan-contacts/import`) and, as of 2026-07-30, records an explicit permission
attestation at import, and imported contacts can be emailed a launch invite through the existing
campaign sender (small test group first). What is still missing is the deeper migration path:
Patreon member import with tier matching, and product/catalog import from Shopify or Gumroad. That
scope decision sits in [TODO.md](../TODO.md).

**Qualified hand-raising now exists.** The unified opportunity calculator asks the 40% question
(`monetization_status`) like every loss tool, and a qualified (sales_priority, recomputed
server-side) artist who explicitly consents can request an immediate founder call from the save
boundary, which sends one deduplicated SMS to `FOUNDER_ALERT_PHONE`.
