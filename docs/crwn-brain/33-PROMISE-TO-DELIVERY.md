# 33 - Promise to Delivery

> Shipped 2026-09-03. One static registry connects every tier benefit to the existing CRWN
> mechanism that delivers it, the readiness of that mechanism, and the one tap that keeps the
> promise. No migration, no new destination, no new delivery engine. GB The G1ft is the first
> configured artist.

## The universal rule

**Selecting a CRWN-supported benefit connects it to an existing canonical delivery path.**
`tier_benefits.benefit_type` is the identity of a promise. `src/lib/benefitRegistry.ts` maps each
key to: the artist-facing outcome label, the fan-facing card line, its support class, how CRWN
delivers it, the effort it costs, whether it may carry a schedule, the readiness resolver that
checks it, the fast action that fulfils it, and the Tier Offer Experience preview kind that best
demonstrates it. `benefitCatalog.ts` is now a derived display view of that registry, so a label
lives in exactly one place. Keys are frozen (ID-007, `FROZEN_BENEFIT_KEYS`): appended, retired
from selection, never renamed.

The product standard behind it: the artist chooses what fans get; CRWN knows where that is kept,
whether it is ready, and where to go next. GB should not need to know which feature does the work.

## Supported vs custom (D2, D3)

| Class | Meaning | Keys |
|---|---|---|
| **recommended** | The fan-economy model CRWN sells, in pillar order (access, influence, contribution, status, experience). Prominent in the picker. | `exclusive_tracks`, `early_access`, `exclusive_posts`, `stems`, `vault_collection`, `creative_voting`, `fan_submissions`, `member_recognition`, `group_live_qa` |
| **additional** | Real and enforced, not a default recommendation. Under "More options". | `welcome_unlock`, `drop_alerts`, `direct_messaging`, `shop_discount`, `credits_on_releases` |
| **manual** | The artist delivers it. Printed on the card, never given a readiness chip or a fast action. The picker says "You deliver this yourself". | `one_on_one_call`, `priority_replies`, `custom_song_request`, `custom_experience`, `shoutout` |
| **retired** | Not selectable for new tiers. Existing rows still resolve and render; the picker shows them only on a tier that already carries one, under "No longer supported". | `exclusive_albums`, `community_badge`, `supporter_wall`, `monthly_merch` |

Seven keys were added on 2026-09-03 for capabilities that were already live with no benefit
identity: `stems` (member_files), `vault_collection` (gated artist playlist), `creative_voting`
(song_lab_decisions; `stage_label` carries the decision type, tier scope carries Gold-and-up vs
Platinum-only), `fan_submissions` (session_submissions), `member_recognition` (self-visible
membership state), `welcome_unlock` (the drop funnel), `drop_alerts` (member notification).
Existing keys kept their strings and gained outcome labels: `exclusive_tracks` is "Hear music
only members get", `exclusive_posts` is "Go behind the scenes", `group_live_qa` is "Watch
selected creation sessions" and no longer implies a cadence.

`credits_on_releases` stays additional with a rights disclaimer on the card; its copy never
implies songwriting, producer, publishing, master, royalty or approval rights.

## Cadence: no fixed schedule unless explicitly chosen

`PROMISE_BENEFITS` (`promisePlan.ts`) no longer carries a default recurrence. `recurrenceFromConfig`
returns the artist's explicit `config.frequency` or null, and null means no obligation.
`syncTierObligations` creates a Promise Calendar obligation ONLY for a schedulable benefit with an
explicit frequency; a benefit present without one leaves any legacy obligation untouched, and only
removing the benefit archives it. The picker's schedule control defaults to "No fixed schedule" and
writes NO frequency key. Tests: `promisePlan.test.ts`, `tierObligations.test.ts` (mutation-tested:
reintroducing the monthly default fails two tests). `getBenefitDisplayText` prints a cadence word or
a day count only when the config holds one.

The Promise Calendar still tracks explicit cadences, scheduled sessions (`live_sessions.scheduled_at`
is already projected), submission deadlines and real commitments. It never tracks "offered".

## Readiness: derived, never stored, never a gate

`src/lib/benefitReadiness.ts` is pure. `/api/tier-benefits/readiness` resolves the artist from the
session, counts rows for that artist through the service role, and returns counts and dates only.
States: `needs_setup`, `nothing_yet`, `upcoming`, `active`, `ready`, `manual`, `retired`. A
readiness answer may never widen access; the entitlement oracles are untouched, and the source test
asserts the module contains no write and no client.

| Benefit | Ready / active when |
|---|---|
| exclusive_tracks | a member-only track carries the rung |
| early_access | active inside a members-first window for the rung; ready after one |
| exclusive_posts | a gated artist post carries the rung |
| stems | an active member_files bundle carries the rung |
| vault_collection | a gated playlist for the rung holds a track whose OWN gate is members-only; empty is not ready; no playlist is needs_setup |
| creative_voting | active: an open decision the rung may vote in; upcoming: opens_at in the future; ready: a closed one exists; needs_setup when Song Lab is off |
| group_live_qa | active: live; upcoming: scheduled; ready: an ended session |
| fan_submissions | active: a session that accepts submissions, admits the rung, lets it submit (`submission_tier_ids` only narrows), deadline unpassed; needs_setup while the producer flag is off |
| member_recognition | always ready (automatic) |
| welcome_unlock | an active fan automation |
| drop_alerts | always ready: in-app alerts already go to every member on publish; email is the fast action |
| direct_messaging | the plan allows DMs |
| shop_discount | an active product exists |
| credits_on_releases | a credit row exists |

## The panel and the fast actions (D4)

`PromiseDeliveryPanel` renders inside `TierManager` on `/account/tiers`, under the tier list:
"What do my members need from me?" One row per benefit on the tier that owns it, setup first,
naming the tiers it serves. An inherited duplicate (same key, same config on a higher tier)
collapses onto the owner. Every supported benefit except automatic recognition has ONE fast
action to an EXISTING surface, carrying `?benefit=<key>&tier=<id>` as a pointer:

| Benefit | Destination | What arrives preset |
|---|---|---|
| exclusive_tracks | /studio/music | content class member_only, rung and above |
| early_access | /studio/music | content class paid_first, paid rung and above |
| exclusive_posts | /<slug>?tab=community | the composer gated to rung and above |
| stems | /studio/music (member files) | add form open, rung and above |
| vault_collection | /studio/music (Playlists) | the existing Vault for the rung opens for edit, else a create form named "The Vault" gated rung and above |
| creative_voting | /studio/lab | decision form open on the latest project, rung and above |
| group_live_qa | /studio/live | create form open, gated rung and above |
| fan_submissions | /studio/live | create form open, submissions on for rung and above |
| welcome_unlock | /studio/automations | the drop funnel |
| drop_alerts | /studio/fans?view=compose | a fresh email composer (audience: fans) |

Pointer discipline: every destination matches the tier id against tiers it loaded for the
signed-in artist; a foreign id opens nothing. Client context is never authority; the write routes
(`/api/tier-benefits`, `/api/song-lab/decisions`, `/api/member-files`) and the RLS-backed browser
writes keep their own ownership checks.

## The Vault (D5)

The Vault is a tier-gated artist PLAYLIST. `src/lib/vaultCollection.ts`: adding a track to a gated
collection makes the track itself members-only for the collection's rungs (`fieldsForClass`,
`expandFromTier`), never narrowing what a member already had; the form states the effect before
save. The playlist gate stays cosmetic; `can_play_track` stays the one oracle. No Vault table,
route or player.

## Recognition (D1)

V1 is self-visible: the fan's own rung plus "Member since <Month Year>" from their own
`subscriptions.created_at`, on their tier card (`SubscribeSection`) and under My Subscriptions on
`/profile`. Day One is the existing `is_founder` flag (`src/lib/recognition/status.ts`), set only by
a tier's Founder Window; no cutoff is invented. Public membership recognition is deferred pending a
fan opt-in decision; `supporter_wall` is retired; subscription RLS is unchanged.

## `monthly_merch` retired, 2026-09-03

CRWN sells no physical goods (see the physical-goods rule in `CLAUDE.md`). The shop, the setup
wizard and the offer builder no longer offer a physical product type, so a tier promising "Merch
in the mail" was the only place left where CRWN handed an artist a shipping obligation it had no
screen to help them keep. It is now `support: 'retired'`, and it also left `PROMISE_BENEFITS` in
`promisePlan.ts`, so no shipment obligation can be scheduled under it at all. The key is retired,
never renamed: `FROZEN_BENEFIT_KEYS` still carries it and any legacy row still renders.

Production carried zero `tier_benefits` rows with this key when the change landed (anon probe,
2026-09-03), so nothing an artist had already promised was touched.

**Semantic gap:** GB's Bronze promises "Day One recognition", and no Bronze member is `is_founder`
because his Bronze has no Founder Window. Until he turns one on (cap and/or deadline in Tiers), the
truthful recognition his Bronze members see is their member-since date. The separate "Day One A&R"
`fan_badges` row awarded on a fan's first Song Lab vote is unrelated and unchanged.

## Card lines

`subscription_tiers.access_config.card_lines = 'prose_only'` makes a card print only the artist's
own lines while the structured rows keep powering delivery. GB's four tiers use it, so his approved
prose is still exactly what fans read. The toggle is in the tier editor under "In your own words".

## Offer Builder connection

The Tier Offer Experience is unchanged and still holds no benefit key. The registry's `previewKind`
is the suggestion the future Offer Builder will read for each selected benefit, and readiness is
the source of truth it will show beside a preview. A preview's `truth` never counts as fulfillment.
The Offer Builder itself has not shipped.

## GB fulfillment matrix (configured by `scripts/configure-gb-tier-benefits.mjs`)

| Rung | Approved line | Identity | Path |
|---|---|---|---|
| Bronze | Go Bad, yours the moment you join | welcome_unlock | drop funnel, ready (active automation) |
| Bronze | First word on every new drop | drop_alerts | in-app on publish; Notify members opens the email composer |
| Bronze | Day One recognition | member_recognition | member-since on the fan's card; Day One via Founder Window |
| Bronze | Story continuations and drops | exclusive_posts | Share member update on his page |
| Silver | Finished songs before they go public | early_access (no day count) | Release to members first |
| Silver | Alternate versions and members only music | exclusive_tracks | Add member track (Go Bad already qualifies) |
| Silver | Stems | stems | Add stems |
| Silver | Private BTS, extended stories, commentary | inherited exclusive_posts | same composer |
| Gold | Vote on the songs before anyone hears them | creative_voting | Create decision, Gold and above preset |
| Gold | The Vault | vault_collection | Add to Vault, Gold and above preset |
| Gold | Watch Executive Producer Sessions | group_live_qa | Create group session, Gold and above preset |
| Gold | A say in selected creative decisions, priority on polls | same creative_voting | same |
| Platinum | Send beats, vocals, ideas, references | fan_submissions | Open submission window, Platinum preset |
| Platinum | Platinum-only and final-round decisions | inherited creative_voting | Create decision, choose "Platinum only" |
| Platinum | Platinum recognition | inherited member_recognition | the fan's card says Platinum |
| Platinum | Group Q and A when GB opens one | inherited group_live_qa | Create group session, choose Platinum only |
| Platinum | EP submission opportunities, submission windows | same fan_submissions | same |

Two known conditions outside this build: GB's one open decision ("Hook") is gated to Bronze alone,
so his Gold members cannot vote in it and the Gold row reads "nothing published"; and Executive
Producer submissions stay behind the `producer_sessions` flag until the fan agreement ships.
