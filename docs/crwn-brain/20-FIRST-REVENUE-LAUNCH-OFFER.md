# 20 — The CRWN First Revenue Launch (the offer, in full)

> The settled premium offer, founder-decided 2026-08-06. `Confirmed`. This is the SETTLED
> version: the founder's original offer document plus the revisions agreed the same day. Where
> this doc and the original draft disagree, THIS doc wins; the superseded pieces are listed at
> the bottom so nobody resurrects them. Product build status is marked inline
> (SHIPPED / CONCIERGE / DEFERRED).

## The one structural rule

**The First Revenue Launch is a premium service LAYERED ON TOP of the open self-serve funnel.
It never gates it.** The calculators, the free Launch plan, and the setup wizard stay open to
everyone. Roughly 40 published videos point at the free tools; gating them would turn every one
into a bait-and-switch. The two paths:

- **Self-serve:** calculator → build offer → create account → launch independently. Scalable
  software funnel, everyone welcome.
- **Assisted:** calculator → high qualification score → founder call request → First Revenue
  Launch for qualified artists. The call-request hand-raiser
  (`/api/lead-magnets/call-request`, server-side `decideCallRequest` scoring) is the existing,
  already-shipped qualification gate.

The flywheel: calculators create demand → the free app captures and activates → product
behavior identifies serious artists → the premium service gets the strongest to first revenue →
those launches become case studies → case studies strengthen self-serve conversion → repeated
manual work reveals what to automate.

## Core promise

> We help qualified artists consolidate their existing direct-to-fan operation inside the CRWN
> app, build the recurring offer best suited to their fans, launch it to their warmest contacts
> and acquire their first paid CRWN members within 30 days.

The result being sold is a consolidated, launched direct-to-fan business with real paying
members. Not software access, not a fan page, not a 14-day setup process.

## Activation (the product principle underneath everything)

**Activation is the first paid member.** Not account created, not setup completed, not Stripe
connected, not page published. SHIPPED (revised 2026-09-03, founder decision D1): the roadmap's
launch stage is **First revenue**, the working funnel in the order a stranger meets it (offer,
gift, sales page, follow-up, Stripe, the switch, a test, the link, first paid), and every
configuration step opens a guided flow under `/build/<flow>`. Its money step is still "Get your
first paid member," the wizard's LaunchReview says a live page is not the finish line, and fan
import lives in the Foundation stage BEFORE the launch stages (pinned by `artistRoadmap.test.ts`).
The page-centric private launch ("first page visit") is gone: a published page is a Foundation
prerequisite, not the definition of launch.

The onboarding sequence the offer prescribes: build the offer → import the most likely buyers →
invite the first small group → acquire the first paid member → show the transaction → complete
the wider launch → recommend the next action.

## Who qualifies

Weighted, not a hard threshold (matches the ICP scoring philosophy in `docs/ICP.md`:
monetization 40 / audience 25 / engagement 20 / catalog 15). An artist with 150k followers and
strong direct sales beats 1M passive followers with no buyer data.

**Required:**
- Previous direct fan sales (evidence, not claims)
- An exportable audience or buyer list (email list, Patreon members, merch buyers, ticket
  buyers, Discord, VIP buyers)
- Willingness to actually execute the launch campaign
- Ability to fulfill the offer they build
- Control over their brand and fan offers

**Strongly preferred:**
- 250k to 2M total followers; 100k to 2M monthly listeners
- 50+ released songs; 3+ years of consistent releases
- Active engagement; a manager or small team

The offer creates no demand for unknown artists. It converts EXISTING demand into owned,
recurring revenue.

## The mechanism: the CRWN Fan Revenue Loop

Six steps, every one mapped to a real surface:

1. **Consolidate.** Fans, buyers, catalog, memberships, products, events, communication,
   payments into one system. (Fan import + catalog + tiers + shop + campaigns + Stripe.)
2. **Identify.** Which fans are most likely to buy, which revenue stream proves demand, which
   sub-avatar fits, which offer runs first. (Lead scoring, sub-avatars, Revenue Models.)
3. **Build.** Free front door, three-tier paid ladder, page, fulfillment plan, launch
   campaign. (Setup wizard, `applyTierTemplate`, Promise Calendar, Launch Kit.)
4. **Convert.** Previous buyers, existing members, VIPs, email subscribers, engaged fans
   FIRST, before the broad audience. (Private launch stage; campaign audiences.)
5. **Measure.** Free joins, paid conversions, tier selection, revenue, upgrades, campaign
   performance, drop-offs. (funnel_events, roadmap stats, admin scorecard.)
6. **Expand.** The next campaign, offer, segment, benefit, tier adjustment. (Constraint
   Engine, roadmap Expand stage, post-launch focus per avatar.)

This is what makes CRWN more than Patreon + Shopify + Discord: the system tells the artist what
to do next based on what fans actually do.

## The two personalization layers (never merge them)

- **Acquisition sub-avatars** (`subAvatar@2`, `src/lib/avatars/taxonomy.ts`) answer WHO the
  artist is: Highest Priority Empire Builder / Established Independent Minded Operator /
  Brand-Led Hip-Hop Artist / R&B Empire Builder. They drive funnels, framing, nurture.
- **CRWN Revenue Models** (`revenueModel@1`, `src/lib/avatars/revenueModels.ts`, SHIPPED
  2026-08-06) answer WHICH monetization system runs FIRST, the offer prescription:
  1. **Membership Consolidation** (fragmented stack; the ICP baseline and the below-floor
     default)
  2. **Between-Tour Revenue** (ticket/VIP demand, income stops when the run ends; never
     prescribed without touring evidence)
  3. **Live Community Monetization** (already goes live, none of it pays)
  4. **Independent Empire Expansion** (already sells several things, offers should compound)

  Deterministic explainable scorer, derived on read in `/api/artist/strategy`, rendered in
  `StrategyCard` with first-move links. The chain is
  **acquisition avatar → revenue model → personalized launch plan**. The artist can customize;
  they start from a proven default rather than inventing the offer.

## The offer stack (component → status)

1. **Stack Replacement and Revenue Audit** → SHIPPED as math
   (`src/lib/stackReplacement.ts`: per-tool subscriptions + each tool's fee on the GMV it
   processes vs every CRWN plan from `TIER_PRICING`/`TIER_LIMITS`, break-even GMVs,
   `CRWN_REPLACES` keeps ticketing/scheduling honestly OUT of savings claims, plain-text
   renderer for the audit call). Deliberately NO public UI; whether it becomes a calculator is
   a post-cohort founder decision. The pitch: "Before the CRWN app earns you one additional
   dollar, here is what the fragmented version already costs you every month."
2. **Revenue Model Prescription** → SHIPPED (above).
3. **Four-Tier Fan Revenue Ladder** → SHIPPED long since. Bronze free / Silver ~$10 / Gold
   ~$25 / Platinum ~$100, names and prices personalizable per artist, rung names pinned by
   `tierTemplate.test.ts`. Tier purposes per the offer: Bronze converts anonymous followers
   into identifiable fans and must deliver immediate value (never a bare email capture);
   Silver produces the first recurring buyers; Gold monetizes the existing creative inventory
   (the Vault, the strongest broadly scalable premium offer); Platinum serves limited
   superfans through ONE-TO-MANY intimacy. **Platinum fulfillment rule:** no default monthly
   1-on-1s, unlimited DMs, or custom songs per subscriber; individual access only when price,
   capacity and a member cap make it sustainable. The Promise Calendar workload estimate is
   the enforcement surface.
4. **Done-For-You Migration Concierge** → CONCIERGE (manual). Artist hands over exports
   (Patreon, Shopify, Gumroad, Mailchimp, ticketing, Discord, spreadsheets); CRWN helps with
   import, dedup, buyer segmentation, tier mapping, catalog organization, migration messaging.
   Product support today: Patreon CSV auto-recognition (`patreonImport.ts`) + the attested
   generic import. Other platform importers are DELIBERATELY unbuilt until the manual work
   shows what repeats.
5. **Superfan Identification / prioritized launch list** → CONCIERGE. The ingredients exist
   (tags, fan events, badges); the ranked-list deliverable is assembled by hand for the
   cohort. Launch order: previous direct buyers → existing members → engaged known fans →
   wider owned audience → social followers.
6. **Done-For-You Page and Offer Build** → SHIPPED as self-serve (wizard + live fan preview);
   CONCIERGE means the founder drives the same UI with the artist.
7. **Personalized Launch Campaign** → SPLIT. Generated by the product today: announcement
   email, follow-up email, social caption, story copy, DM copy (`launchCampaign.ts`, drafts
   only, nothing auto-sends). Delivered manually in the cohort: previous-customer migration
   email, founding-member invitation, livestream outline, FAQ, objection responses,
   final-call email, free-to-paid campaign. Sell it as "we create your launch campaign with
   you," never "the software generates every asset."
8. **Founding-Member Launch** → SHIPPED primitives (FoundingBadge, tier limits). Legitimate
   early-adopter benefits: founding badge, recognition, first private event, permanent
   founding status, first vote on future benefits. Avoid automatic permanent lifetime
   discounts. Urgency comes from limited founding status, a real enrollment period, a
   scheduled event, Platinum capacity, a real release/tour moment.
9. **30-Day First Revenue Sprint** → the roadmap IS the sprint: Foundation (days 1-7:
   diagnose, migrate, build, connect) → Private launch (days 8-10: invite warmest, first
   members) → Audience launch (days 11-14: campaign, content, event) → Deliver and retain +
   Expand (days 15-30: optimize, second conversion campaign, first promised experience,
   revenue report).
10. **First Paid Member Activation** → SHIPPED (see Activation above).
11. **Promise Protection System** → SHIPPED (`promisePlan.ts` + Promise Calendar: what was
    promised, which tier, cadence, due dates, dedup, tier inheritance, recurring workload
    estimate before anything is created).
12. **Revenue Optimization Loop / 30-day report** → CONCIERGE for the cohort (the founder
    reads roadmap stats + funnel events and prescribes the next action; the artist is never
    left with analytics and no interpretation). The Constraint Engine is the product-side
    seed of this.
13. **Guarantee** → SHIPPED as a live checklist (below).

## The guarantee

**Headline (customer-facing): the First Paid Member Guarantee.** Qualified artists who
complete the documented required actions acquire at least one paid member within 30 days, or
CRWN rebuilds and relaunches the offer at no additional service charge (new audit, benefit and
pricing revision, campaign rewrite, relaunch support). It is not an income guarantee.

**The rendered wording is shorter than this paragraph, on purpose (founder decision, 2026-08-22).**
`GUARANTEE_BODY` in [src/lib/positioning/story.ts](src/lib/positioning/story.ts) now states the
condition and the remedy in ONE sentence and stops. Two supporting sentences were cut as defensive
asides: an explicit "not a specific income result", and the live-checklist line. The TERMS above are
unchanged, and both are still enforced elsewhere: the remedy clause carries the income limit (a
rebuild and relaunch is all CRWN owes) and is pinned by `toolPositioning.test.ts` and
`pageComposition.test.ts`, while the measured conditions below are enforced in code by
`launchPartner.ts` regardless of what the marketing copy says about them. Do not restore the cut
sentences without a founder decision, and do not cut the remedy clause: a guarantee that names a
consequence without naming its remedy reads as a promise of the outcome.

**Supporting (internal SLA, not a promoted second guarantee): the 14-Day Implementation
Commitment.** Once the artist provides required assets and approvals, setup deliverables
complete within 14 days; delays caused by CRWN never bill additional implementation fees.

**Conditions are MEASURED, not self-reported** (SHIPPED: `src/lib/launchPartner.ts` +
`/api/artist/launch-partner` + `LaunchPartnerChecklist` on the command screen (2026-08-13: the
measured STATUS shows on first paint, the conditions sit one tap behind "See what it covers", so
the guarantee informs Rise Mode without competing with its one next move), dark behind the
server-only `artist_profiles.launch_partner` flag; migration
`supabase/schema-phase2-launch-partner.sql`, cohort flips via
`supabase/enable-launch-partner.sql`):

- Stripe connected
- Free front door live
- Paid tier purchasable (real Stripe price)
- **Contacts: 100 imported OR 40 proven buyers** (Patreon-tagged). Quality never
  auto-disqualifies a small warm list. Founder review 2026-08-06.
- Welcome post published
- Launch campaign SENT ("drafted" is deliberately NOT a requirement; sent subsumes it)
- Outcome condition: first real dollar (membership or sale)

Statuses: pending → eligible (all required met, guarantee active) → achieved. Both sides see
the same evidence, which is what makes the guarantee real, and it doubles as an implementation
motivator rather than a refund objection handler.

## Pricing

Two distinct products: the launch/migration service, and ongoing app access. High-touch
migration never lives permanently inside a $49 subscription.

- **Founding cohort (now): THREE launch partners.** Not five to ten; the cohort exists to
  learn delivery hours, repeating migration problems, and what artists value. $0 to $500
  implementation, charged by MANUAL Stripe invoice (deliberately no checkout built), + Pro at
  $49/mo + 8%. The discount buys case-study rights, testimonials, feedback, and anonymized
  performance data. $0 is an intentional investment for one strategically important artist,
  never the default (free reduces commitment).
- **Standard offer (after proof):** $1,500 to $3,000 implementation + Pro, or Scale
  ($199/mo + 5%) when the math justifies it. 30-day launch support, the guarantee.
- **Future Scale Concierge (DO NOT LAUNCH until the core process is repeatable):** $5k to
  $10k implementation, Scale subscription, multi-platform migration, team configuration,
  dedicated launch management.

Platform pricing itself is unchanged and lives in `TIER_LIMITS`/`TIER_PRICING`: Launch free
12% / Pro $49 8% / Scale $199 5%. The offer changed nothing there.

## Real scarcity

Service capacity, never software availability: "We accept N artist migrations per month
because each launch includes direct audit, migration, offer design and campaign support."
Limitable: founder-assisted slots, case-study partnerships, migration capacity, cohorts,
strategy reviews, Platinum offer design support. Legitimate because the labor is real.

## What NOT to promise yet

Guaranteed dollar amounts · automatic migration from every platform · AI predictions without
data · conversion benchmarks not yet possessed · guaranteed retention · done-for-you social
posting · unlimited strategy/migration/revisions · permanent founder access · high-touch
service for free-plan users. A promise beyond operational reality weakens the offer.

The remaining path from 9.5 to 10 is not more promises: it is successful launches, reliable
first-paid-member rates, documented revenue, repeatable benchmarks, automated migrations, and
case studies, until "most qualified artists who complete this process acquire paying members
within 30 days" is a true sentence with receipts.

## Superseded decisions (do not resurrect)

- ~~Application-gate the funnel / ICP-gate signup~~ → layered on the open funnel.
- ~~Cohort of five to ten~~ → THREE.
- ~~Two promoted guarantees~~ → one headline (First Paid Member); 14-day piece is an internal
  commitment.
- ~~Hard 250k-follower threshold~~ → weighted qualification; required = proof of direct sales
  + exportable list + will execute.
- ~~"Membership Stack Consolidator / Touring Access Seller / Live Community Creator /
  Independent Empire Builder" as sub-avatars~~ → renamed to the four CRWN Revenue Models, a
  separate orthogonal layer; the acquisition avatars are untouched.
- ~~Flat 100-contact guarantee minimum~~ → 100 OR 40 proven buyers.
- ~~"Campaign drafted" as a guarantee requirement~~ → dropped; sent subsumes it.
- ~~Advertise 15 automated campaign assets~~ → 5 product-generated + the rest human-delivered,
  and sold that way.
- ~~Build implementation-fee checkout / more importers now~~ → manual invoice, manual
  migration, automate what the cohort proves repeats.
- The offer document's tier names remain ROLES; the ladder stays Bronze/Silver/Gold/Platinum
  (standing rule, `tierTemplate.test.ts`).

## What remains (service delivery, founder work, not product)

Selecting the three artists (TODO.md) · defining exactly what the $500 implementation includes ·
limiting revision/migration scope · running the audit calls (use
`renderStackReplacementReport`) · tracking hours per artist · documenting first-paid-member
results · converting results into case studies. The next major improvement to this offer comes
from real launches and proof, not another feature build.

**Measurement (2026-08-10):** the hours / results / case-study items above now have an
instrument: the internal Money Model system (`21-MONEY-MODEL-MEASUREMENT.md`, `/admin` →
Money Model) records engagement terms, labor, consent and evidence, and computes 30-day
contribution margin per launch partner. The work itself is still the founder's; the offer,
pricing, and guarantee are unchanged by it.

## Source map

`src/lib/launchPartner.ts` (+test) · `src/app/api/artist/launch-partner/route.ts` ·
`src/components/artist/LaunchPartnerChecklist.tsx` · `src/lib/avatars/revenueModels.ts`
(+test) · `src/lib/stackReplacement.ts` (+test) · `src/lib/artistRoadmap.ts` (+test) ·
`src/app/setup/page.tsx` (LaunchReview) · `src/app/api/artist/strategy/route.ts` ·
`src/components/artist/StrategyCard.tsx` · `supabase/schema-phase2-launch-partner.sql` ·
`supabase/enable-launch-partner.sql` · nurture/no-pitch copy:
`src/lib/prospectNurture/sequence.ts`, `src/app/(public)/worth/WorthExperience.tsx`,
`src/lib/emails/artistWelcome.ts`.
