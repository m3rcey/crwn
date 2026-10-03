# 36 · Project Credits

**Status:** built 2026-10-03, dark until [supabase/schema-phase2-project-credits.sql](../../supabase/schema-phase2-project-credits.sql)
is applied and `npx tsx scripts/project-credits.mjs <key> --apply` creates the products.
**Founder decision:** 2026-10-03, in the Prince Dre money-model work (the high-ticket rail his
model was missing).

## What a fan buys

A one-time product that prints the fan's NAME in one project's credits, numbered in the order they
bought. Two levels per project:

| Level | Dre's price | Spots | What it delivers |
|---|---|---|---|
| Founding Supporter | $250 | 25 | Name listed first, numbered; a seat at the artist's private listening session for that project; a shareable card |
| Supporter | $150 | 50 | Name listed after Founding, numbered; a shareable card |

Supporter is the DOWNSELL: it is shown only after the fan presses "No thanks" on Founding (or
when Founding has no spots left, as the plain offer). The cheaper level takes away status and the
session; it never weakens what it does deliver.

**Recognition only.** Not ownership, equity, royalties or a share of anything. The sentence
(`RECOGNITION_ONLY` in `src/lib/projectCredits/credits.ts`) is printed on the offer, in the
product description Stripe Checkout shows, and is pinned by test. A real investment arrangement
would need its own legal structure and is out of scope.

## Why it is built this way

- **A product, not a tier.** Products carry the one enforced sale cap CRWN has
  (`products.max_quantity`, refused in `/api/stripe/product-checkout`, incremented atomically by
  the webhook), so "25 spots" is true. The plan allows 3 paid rungs and the artist has 3.
- **No Platinum access in the package.** A one-time purchase cannot grant a membership, so the
  page cannot promise one. The listening-session seat is the experience it CAN deliver.
- **Per project.** Each release can sell its own credits again; an artist-wide credit could be
  sold once.
- **Not a supporter wall.** Membership recognition is unchanged (no public list of who pays).
  A credit is bought, per project, and named only when the fan opts in.

## Automatic fulfilment, step by step

1. **Numbering.** `handleProductPurchase` (webhookHandlers.ts) calls `assignCreditForPurchase`,
   which runs `assign_project_credit(purchase)`: SECURITY DEFINER, `service_role` EXECUTE only,
   per album+level advisory lock, idempotent per purchase, and it refuses a product whose album
   belongs to another artist. Not an earnings write; the purchase and earning rows are the
   existing ones.
2. **The name.** Checkout returns the buyer to `/<artist>/credits/<project>?credited=1`. The page
   polls `GET /api/project-credits` until the webhook lands, then asks for the printed name and one
   opt-in ("Print my name in the credits and make my card public"). `PATCH /api/project-credits`
   writes it from the session, only on the fan's own row. `cleanCreditName` refuses emails, links
   and phone numbers; the name is never seeded from `profiles.display_name` (that defaults to
   the signup email).
3. **The proof they take outside CRWN.** `/<artist>/credits/<project>/<level>/<n>` is a public
   card page with a link preview, and `/api/credit-card/...` renders the card as an image
   (`?format=story` for a 1080x1920 Instagram story, otherwise 1200x630) with `next/og`. Both
   exist only for a listed, standing credit.
4. **The seat.** A live with `live_sessions.credit_album_id` seats every standing Founding credit
   on that project from the same artist. `hasLiveSeat` in `src/lib/live/access.ts` (ticket OR
   credit) is the ONE seat check every gate calls; `seatHoldersBySession` feeds reminders. The
   artist picks "Seat your Founding Supporters" when scheduling a live; the control appears only
   for projects that sell Founding credits.
5. **A refund revokes it by derivation.** `handleChargeRefunded` sets `purchases.status =
   'refunded'`; every reader requires `completed`, so the name leaves the list, the card 404s and
   the seat goes. The number is never reused.

## Measuring it (decided before any traffic)

`product_offer_events` (the `tier_events` twin for a product; `tier_events.tier_id` is NOT NULL):
`offer_viewed` and `offer_declined` from the `/api/offer-events` beacon, `offer_checkout_started`
recorded server-side in product-checkout only, each with a `primary` or `downsell` placement.
Founder devices are never counted. Sales come from standing credits, never from events.

`creditsVerdict` in `src/lib/projectCredits/verdict.ts` holds the rules, fixed in advance:

| Verdict | When |
|---|---|
| sold_out | Founding sold every spot: raise the price or cut the spots next project |
| not_enough_traffic | fewer than 50 distinct Founding viewers: a traffic question, not an offer verdict |
| offer_not_landing | 50+ viewers, nobody pressed buy |
| checkout_friction | people pressed buy, nobody paid |
| downsell_carrying | Supporter outsold Founding at least 2 to 1, at least 3 sales |
| working | sales at 2% or more of Founding viewers |
| weak | selling, under 2% |

Read it with `npx tsx scripts/project-credits.mjs <key>` (dry run prints the funnel and the
verdict). Do not move a threshold after seeing the data.

## Files

- Schema: [supabase/schema-phase2-project-credits.sql](../../supabase/schema-phase2-project-credits.sql)
- Rules: `src/lib/projectCredits/credits.ts`, `verdict.ts`; server reads `server.ts`
- Boundaries (mutation-tested): `src/lib/projectCredits/boundaries.test.ts` (CREDITS-001..005)
- Pages: `src/app/[slug]/credits/[project]/`, card page under it, image at
  `src/app/api/credit-card/`; the artwork is `src/lib/projectCredits/cardImage.tsx`, and
  [scripts/render-credit-card.mjs](../../scripts/render-credit-card.mjs) renders it to PNG with a
  real cover and no database writes. Look at it before anyone posts one. The footer must name a
  page that exists (`cardFooterLink`): the card is proof.
- Config: `credits` in a launch config (`CreditsConfig`, validated by `checkLaunchPartner`);
  product copy is generated by `creditProductCopy`, never written in config (its promise check
  would refuse the disclaimer's words)
- Script: [scripts/project-credits.mjs](../../scripts/project-credits.mjs) (`--apply` creates or
  refreshes the products, changing price or spots only while nothing is sold; `--repair` numbers
  any paid credit the webhook missed)
