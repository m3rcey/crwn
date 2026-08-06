# CRWN Brain — Changelog

## 2026-08-06 - Campaign attribution: the funnel below signup learns which VIDEO produced the artist

**What existed:** more than expected. `funnel_events` was already applied in production with 20
stages and four reporting dimensions (`calculator`, `campaign`, `referrer`, `video`), the client
already snapshotted first-touch UTMs, and the beacon route already mirrored the top of the funnel.

**What was missing was the join below signup.** `account_created`, `setup_completed`,
`stripe_connected`, `fans_imported` and `first_paid_conversion` carried the CALCULATOR and nothing
else. `leadMagnetDashboard.ts` said so in its own header comment ("account_created is not tagged
with the source dimension"), which is why every ranking stopped at completion rate. A video could be
compared on completions and never on artists produced. `email_submitted` also dropped `utm_content`
entirely, and every UTM value was stored raw: unallowlisted marketing copy in a grouping key.

**The fix is one durable place, not a new system.** `src/lib/analytics/campaignAttribution.ts`
normalizes a tagged link into eight allowlisted slugs; the result is written onto the artist's own
`lead_magnet_results` row under `input_data._attribution`, which is exactly the row the existing
claim path binds at signup. `attributionLookup.ts` reads it back oldest-first and every downstream
stage stamps it. No migration, no new table, no cookie, no second identity system: attribution
survives a delayed signup on another device, because the claim matches on the verified email.

**Two attribution policies, both documented rather than invented.** The client beacon keeps its
existing last-touch behavior (current URL wins, snapshot fills silence). PERSISTED attribution is
FIRST-TOUCH: `mergeAttribution` never replaces a set field, so a later untagged visit cannot erase
the video that brought them, and can only ADD dimensions the first visit left empty.

**Quality, not just volume.** Capture now stamps the band from the CANONICAL server-side scorer
(`decideCallRequest`), so the admin scorecard reads "40 leads, 4 sales-priority" instead of "40
leads". The scorer, the ICP definition and the calculator formulas are untouched.

**Admin:** a Content scorecard (group by campaign / video / angle / platform / keyword / variant,
walked to first paid conversion, with the biggest drop named per row) plus a Campaign link builder
that emits links through the same normalizer the server parses with. Founder procedure:
`docs/acquisition/campaign-tagging.md`.

**Deliberately not built:** the affiliate/partner funnel, paid-ad attribution, a ManyChat API
integration, and a campaign dimension on `opportunity_ledger` (so per-campaign CRWN revenue is a
named limitation, not a silent gap).

## 2026-08-06 - A cold signup gets the same argument for the ladder, and the guard that keeps it

**What/why:** the question was whether an artist who signs up OUTSIDE a calculator is offered the
same tier template. Verified: they already are. `buildLadderDraft()` takes no argument, so
`RECOMMENDED_LADDER` is the draft for every artist; a claimed calculator result is an OVERRIDE
applied afterwards behind `if (s?.ladderPrefill && !ladderTouchedRef.current)`. The `ladder` screen
is in a flat `SCREENS` list with no plan condition, and `LadderConfirm` maps the template, not the
projections. Nothing needed building.

**What was actually missing** was the argument, not the offer. The calculator path renders a
per-rung "about N fans in range for this tier, dropping it leaves them with no way to pay you". A
cold signup saw four rungs and a "Drop this tier" link with nothing pushing back. It now gets one
loss-framed line, with prices derived from `RECOMMENDED_LADDER` rather than retyped, so a template
price change can never leave the wizard quoting a number no rung carries.

**The calculator signup is untouched.** The line is gated on `hasPlan === false` (a threaded
`plan !== null`), deliberately NOT on `projections.length === 0`: those are different facts, and
the second would have caught a calculator artist whose result modelled no buyers.

**Guarded:** `src/lib/setupLadderOffer.test.ts` (12 tests) pins the whole chain, including the
silent failure where prefill becomes the SOURCE of the draft and cold signups land on an empty
ladder with nothing failing, plus both second chances (the launch review's "Offers ready" fix, and
`TierLadderTemplate` mounted ungated in `TierManager`).

**Files:** `src/app/setup/page.tsx`, `src/lib/setupLadderOffer.test.ts`. **DB impact:** none.
**Migration:** none. **Tests:** 935 pass.

## 2026-08-06 - The First Revenue Launch offer layer: activation is the first paid member

**What/why:** the founder settled the updated offer ("The CRWN First Revenue Launch", a premium
concierge migration + launch service) as a LAYER ON TOP of the open self-serve funnel, never a
replacement for it. Nothing was gated; the calculators, free plan and wizard stay open. Five
product changes encode the offer:

1. **Activation is redefined as the first paid member**, not a published page. The roadmap's
   private-launch stage now reads "Get member number one before the world hears about it," its
   money step is "Get your first paid member," and the wizard's LaunchReview says a live page is
   not the finish line and steers the first shares at warm fans (ten DMs beat one public post).
2. **Fan import moved from the audience-launch stage into Foundation** (`artistRoadmap.ts`,
   pinned by a test): you cannot privately launch to warm contacts before the list exists.
3. **CRWN Revenue Models** (`src/lib/avatars/revenueModels.ts`, `revenueModel@1`): a second,
   ORTHOGONAL axis to the sub-avatars. The avatar answers "who is this artist" (acquisition);
   the revenue model answers "which monetization system runs first" (offer prescription):
   Membership Consolidation / Between-Tour Revenue / Live Community Monetization / Independent
   Empire Expansion. Deterministic explainable scorer over the same evidence shape as the
   avatar scorer plus touring/shop extras; below the floor it returns the ICP baseline
   (consolidation) marked `isDefault`. Touring is never prescribed without touring evidence.
   Derived on read in `/api/artist/strategy` (seed answers + live sessions + product count) and
   rendered as a block in `StrategyCard`. The acquisition chain is
   avatar -> revenue model -> launch plan; the two layers must never merge.
4. **First Paid Member Guarantee checklist** (launch-partner cohort, dark):
   `src/lib/launchPartner.ts` (pure, tested) maps every guarantee condition to the SAME quest
   evaluator the roadmap uses (Stripe, free door, purchasable paid tier, contacts, welcome
   post, campaign SENT) with one outcome condition (first real dollar). Founder review same
   day: the contacts rule is 100 imported contacts OR 40 proven buyers (Patreon-tagged), so
   quality never auto-disqualifies a small warm list, and "campaign drafted" was dropped as a
   requirement because sent subsumes it.
   `/api/artist/launch-partner` serves it only when `artist_profiles.launch_partner` is true
   (migration `schema-phase2-launch-partner.sql`, SERVER-ONLY column, no client grants, fail-soft
   42703); `LaunchPartnerChecklist` renders on the command screen above the roadmap. Cohort
   flips via `supabase/enable-launch-partner.sql`. Three partners first, manual Stripe invoice
   for the implementation fee, no checkout built on purpose.
5. **Stack Replacement Report** (`src/lib/stackReplacement.ts`, pure, tested, NO UI yet): the
   audit tool that prices the artist's CURRENT fragmented stack (per-tool subscriptions + each
   tool's fee on the GMV it processes) against every CRWN plan from TIER_PRICING/TIER_LIMITS,
   with `CRWN_REPLACES` keeping ticketing/scheduling honestly out of the savings claim, and a
   plain-text renderer for the audit conversation. Whether it becomes a public calculator is a
   post-cohort founder decision.

Copy: the three "no pitch" lines (worth page x2, artist welcome email) became honest
qualified-artists-get-hands-on-help lines, and two nurture objection emails
(switching-cost, no-time) now mention assisted migration for artists with an existing paid
fanbase. `handoffSeed.ts` now exposes `inputData` (already selected, previously dropped).

## 2026-08-04 - Genre becomes a dimension of the avatar cohorts, not a fifth cohort

**What/why:** the precedence question ("should a big R&B seller land in Empire Builder or R&B
Empire Builder?") was checked against the real scorer instead of reasoned about, and the answer
was that precedence barely matters: that artist scores Highest Priority 7 vs R&B Empire 6 and wins
on POINTS. Precedence only breaks an exact tie. **The order stays as declared.**

The check surfaced the real problem underneath it. The qualification bar (large audience plus
proven direct sales) outscores every genre segment, so every big seller lands in Highest Priority
whatever they make, and the genre cohorts silently become "artists who did not qualify as big
sellers". Comparing cohort revenue would then answer "which cohort holds the biggest artists?",
tautologically the one defined that way, while looking like a content result. That would have
misled exactly the acquisition decision the report exists to inform.

**The fix, because genre and priority are orthogonal:** genre now CUTS each cohort instead of
competing with it. `buildGenreBreakdown()` (`src/lib/avatars/cohortGenre.ts`, pure, tested)
returns all four genre rows per cohort with identities, first-paid artists, refund-netted GMV and
a within-genre first-paid rate that is null below 5 identities rather than a noisy percentage.
`?genre=` filters the whole report. It costs no extra query: genre is read from the same stored
answers the identity resolution already loads, and an artist row plus its owning user canonicalize
to one person so nobody is double-counted.

**The honesty rule it encodes:** `other` (they told us a genre outside the two families) and
`unknown` (they never told us, which is every anonymous row) are counted separately and never
merged, because folding them would report an absence of data as a measured result. Pinned by test.

**Files:** `src/lib/avatars/cohortGenre.ts` + test (new), `api/admin/avatar-cohorts/route.ts`,
`AvatarCohortsView.tsx`, `docs/SUB_AVATARS.md` (§7a, and §10 records the precedence decision as
settled). 889 tests pass. No migration, no founder action.

## 2026-08-04 - subAvatar@2: four identity segments, one front door

**What/why:** founder call, one day after `subAvatar@1` shipped. The four sub-avatars are renamed
to **Highest Priority Empire Builder / Established Independent Minded Operator / Brand-Led
Hip-Hop Artist / R&B Empire Builder**, and every one of them now enters through the ALL-IN-ONE
calculator (`/tools/opportunity-calculator?from=<avatar id>`) instead of a calculator of its own.

**Why this was a rebuild, not a rename.** v1's avatars were PAIN segments, so `calculator ->
avatar` was the entire assignment mechanism. The new names are IDENTITY segments (priority tier,
operating maturity, genre), and routing all four at one calculator deletes that mechanism: every
lead now runs the same tool. Renaming without rebuilding assignment would have produced one cohort
wearing four labels, and a report that lies is worse than no report. So:

- **Assignment moved onto the ANSWERS** (`assignment.ts`): the ICP Tier 1 audience floor crossed
  with proven direct sales, real supporter and revenue numbers, platform count, years or catalog
  depth, genre family, video output, unreleased count, plus the `?from=` funnel as a strong but
  outvotable declared signal. Genre alone deliberately scores 2, never enough on its own, because
  being a hip-hop artist does not make someone brand-led.
- **Overlap is handled explicitly.** These segments intersect by construction, so exactly ONE
  primary is assigned and ties break by declared precedence (the array order in `taxonomy.ts`,
  a founder decision). Disjoint cohorts are what make any comparison mean anything.
- **One new question**, `genre_family`, on its own opening step and NOT required: the calculator's
  standing invariant is that an artist can reach a real result from one number, and the existing
  invariant test caught the attempt to make it mandatory. Two of the four avatars are
  genre-defined, so without it they could never be assigned from an answer.
- **Cohort attribution rebuilt** for a world where `calculator` is a constant: stamped on
  `funnel_events.metadata.subAvatar` (client value validated against the taxonomy server-side),
  stored beside the answers as `_entry_context` at capture, and resolved per identity for
  post-signup stages, in that order of trust. Identity never overrides a stamp, so a cohort cannot
  gain members halfway down its own funnel. Ledger GMV is now attributed per ARTIST rather than
  per calculator, which would otherwise pool all four cohorts' money into one pile.
- **Personalization follows the avatar, not the slug:** nurture modules
  (`moduleFor(slug, subAvatar?)`, wired through the cron from the stored result) and starter-offer
  framing (audience line and reason only, never the offer, price or benefits).

**Safe because nothing had accumulated.** v1 lived for a day, the avatar was never stored on an
event, and its migration was unrun, so the taxonomy was replaced outright rather than migrated.
The migration's CHECK is now drop-and-recreate, so re-running the same file is safe either way.
The two v1 calculators (`fan-stack-calculator`, `between-tour-calculator`) are KEPT as ordinary
single-opportunity tools, each with its own entry context into the all-in-one calculator.

**Files:** `src/lib/avatars/{taxonomy,assignment}.ts` + both test files (rewritten),
`leadMagnets/registry.ts` (genre question, 6 new entry contexts), `leadMagnets/analytics.ts`
(entry-context persistence on every beacon), `api/lead-magnets/analytics` (validated stamp),
`api/lead-magnets/capture` + `PublicToolClient` (server-side entry context), `auto-claim`,
`api/admin/avatar-cohorts` (identity resolution), `AvatarCohortsView`, `api/artist/avatar`,
`starterOffer.ts` + `api/starter-offer`, `prospectNurture/calculatorModules.ts` +
`cron/prospect-nurture`, `setup/page.tsx`, `unifiedFunnel.test.ts`,
`supabase/schema-phase2-sub-avatar.sql`, `docs/SUB_AVATARS.md`, ICP.md, 13-CURRENT-STATE.md,
TODO.md. 881 tests pass.

## 2026-08-04 - The entry hero stops assuming the visitor has met CRWN before

**What/why:** the Opportunity Calculator's hero led with "The all-in-one calculator" and "You are
guessing at your own business with five separate numbers." Both only make sense to someone who
already knows CRWN has a family of single-opportunity calculators. On `/` and on
`/tools/opportunity-calculator` the reader is usually meeting us for the first time, so the pitch
was answering a question they had never asked, about a product they had never seen.

**New hero** (loss-framed per the copy rule, cost of inaction first, then cut to the bone on
Josh's call the same day): eyebrow "For independent artists", headline "Your fans are worth more
than they pay you.", subheadline "One number, and what to build first.", CTA "See what my fans are
worth". The first rewrite kept a three-sentence subheadline explaining the cost of guessing; it was
correct and too wordy for a hero. The loss is already carried by the headline.

**One config, both pages.** The homepage and the tool route render the same registry hero, so this
is a single edit in `src/lib/leadMagnets/registry.ts` and neither page has its own copy. Nothing
about the wizard, the model, the result, or the builder changed.

**Guarded:** a new test fails if the hero ever again contains "all-in-one", "five separate",
"other calculators" or similar, plus an em-dash check on the hero lines.

**Files:** `src/lib/leadMagnets/registry.ts`, `src/lib/leadMagnets/homepageFunnel.test.ts`.
**DB impact:** none. **Tests:** 876 pass.

**Left alone deliberately:** `videoAngle` (the source Josh writes video scripts from, where
contrasting with separate calculators is the actual argument), the `/tools` index `description`
(shown in a list where the other tools are visible anyway), and the post-result overlap note
(which names CRWN features the result just explained, not other calculators).

## 2026-08-03 - Four sub-avatars: two new calculators, one taxonomy, one cohort report

**What/why:** CRWN could not answer "which kind of artist should acquisition money chase?"
because every lead pooled into one funnel. The ICP is now segmented into four founder-approved
sub-avatars (Membership Stack Consolidator, Touring Access Seller, Live Community Creator,
Catalog and Vault Seller), each a complete journey from a loss-framed entry calculator through
builder, signup restoration, avatar-aware onboarding, launch, and calculator-attributed revenue,
compared side by side in a new admin Avatars tab. Spec: `docs/SUB_AVATARS.md`.

**The five-step pass applied:** no new funnel infrastructure. The two missing calculators
(`fan-stack-calculator`, `between-tour-calculator`) are ordinary registry entries riding the
shared wizard/loss-engine/capture/claiming rails; the two existing ones (vault, live) were
verified and reused untouched; the avatar of an event is a READ-TIME mapping of the funnel's
existing `calculator` dimension (`src/lib/avatars/taxonomy.ts`, `subAvatar@1`), so nothing is
backfilled and nothing stored can drift. Assignment is deterministic and explainable
(`assignment.ts`: acquisition path > declared > behavioral, manual override wins, below the
evidence floor there is NO assignment). The only storage is the override + its audit trail
(`schema-phase2-sub-avatar.sql`, fail-soft, UNRUN, in TODO.md).

**Model honesty:** `fanStack@1` claims only ADDED revenue (partial 60% migration, uplift only
above current per-fan revenue, tool costs a separate tile never summed into the headline);
`betweenTour@1` deflates attendance to unique fans, converts VIP buyers at 25% into the
Gold-priced tier, and sells off-month stream tickets only to non-members (disjoint
populations). Both are pure, versioned, and pinned by tests (54 new tests, suite at 874).

**Feedback loop:** `readCohortConstraint()` finds each cohort's largest observed drop under the
Constraint Engine's house rules (min sample 30, null is silence, investigation-only copy, no
causal claims). Cohort metrics without a trusted source (retention, churn, referral, CAC,
contribution) are listed as "not measured" with reasons, never zero-filled. Also new:
first-touch UTM persistence (`crwn_first_touch` snapshot with current-URL-wins fallback), the
`/api/artist/avatar` derive/override endpoint, avatar promise copy on the wizard's PlanIntro,
and the vault avatar defaulting the catalog step to the project path.

**Files:** `src/lib/avatars/*` (new: taxonomy, assignment, fanStackModel, betweenTourModel,
cohortConstraint + 5 test files), registry + toolAdapters (+2 tools), deliverableSpecs (+2),
postSetupDestination, continuationCta, calculatorModules (+2), starterOffer (+2 cases),
auto-claim, setup wizard, leadMagnets/analytics (first touch), `api/admin/avatar-cohorts` (new),
`AvatarCohortsView` (new), admin page tab, `api/artist/avatar` (new),
`supabase/schema-phase2-sub-avatar.sql` (new), `docs/SUB_AVATARS.md` (new), ICP.md,
13-CURRENT-STATE.md, TODO.md, sw.js v364.

## 2026-08-03 - The live fan preview runs beside the whole setup wizard

**What/why:** an artist building their CRWN could not see what they were building. The only fan
view was a link at the very end of the wizard. Now, from the moment they claim their link through
launch, `LivePagePreview` renders their REAL public page beside every screen, as a signed-out fan
sees it.

**Architecture:** an **iframe of `/{slug}?preview=visitor&embed=1`**, deliberately not a rebuild.
The public page is an RSC running ten Supabase queries over the money surface; re-rendering it from
wizard state would create the exact duplicate rendering architecture worth avoiding, and
refactoring it would put the highest-risk page in a preview widget's blast radius. Framing the real
route reuses it whole and cannot drift.

**Safety:** `preview=visitor` is the EXISTING persona lens (only ever REMOVES access). `embed=1` is
new: hides the owner `PreviewBar`, and makes both `SubscribeSection` handlers and
`ShopSection.handleBuy` inert. `embedded` survives the provider's non-owner branch on purpose (it
can only remove an action). The frame runs without `allow-top-navigation` / `allow-forms`.
`next.config.ts` went from `X-Frame-Options: DENY` to `SAMEORIGIN` + `frame-ancestors 'self'`:
cross-origin framing is still blocked exactly as before, same-origin is now permitted. Verified by
curling the built server, not inferred from config.

**State:** binds to `useArtistSetup`; no second copy of onboarding state. `previewSignature()`
(pure, tested) changes only on fan-visible change and the iframe reloads on that alone, never per
keystroke. A nonce bumped where the wizard already calls `refresh()` catches what the derived
booleans cannot see (a second track does not flip `hasMusic`).

**Files:** `src/lib/onboardingPreview.ts` (new), `src/components/onboarding/LivePagePreview.tsx`
(new), `src/app/setup/page.tsx`, `src/app/[slug]/page.tsx`, `src/hooks/useArtistPreview.tsx`,
`src/components/artist/SubscribeSection.tsx`, `src/components/artist/ShopSection.tsx`,
`next.config.ts`. **DB impact:** none. **Migration:** none. **Tests:** 820 pass (26 new).

**Deliberately deferred:** the pre-signup half of the ask (a preview on the calculator and builder
pages, before an account exists). See the report and TODO "On Claude's plate": before signup there
is no page, no name, no photo and no music, so the only fan-visible thing that exists is the tier
ladder, and `TierCards` is coupled to auth, router and live checkout. Showing an artist a
near-empty page at the moment of peak excitement is a conversion risk, not a north star.

## 2026-08-03 - The homepage server-renders again (loading gate was hiding the whole page)

**What/why:** the funnel reuse below shipped a real SEO regression, caught on the LIVE page. The
shared `PublicToolClient` opens on a `'loading'` phase so an emailed `?result=<token>` link does
not flash the hero before it resumes. `/` prerenders, so that first render was the served HTML:
production was shipping a nav plus "Loading…" (167 characters of text) where the old homepage
served its full marketing body. Every `?result=` link is built from `config.publicRoute`
(`/tools/<slug>`), so **nothing ever points at `/?result=`** and the gate bought the homepage
nothing.

**Fix:** the initial phase is now `surface === 'homepage' ? 'hero' : 'loading'` (one line). The
tool route is byte-identical: `/tools/opportunity-calculator` still prerenders its "Loading…"
placeholder exactly as before. Prerendered `/` went from 167 to 21,178 characters of text and
again contains the hero, the CTA, wizard step 1, and every marketing section below the funnel
(verified against `.next/server/app/index.html`, not inferred).

**Files:** `src/components/lead-magnets/PublicToolClient.tsx`. **Tests:** 794 pass (1 new
`pageComposition.test.ts` case pinning the homepage's initial phase). **DB impact:** none.

## 2026-08-01 - The homepage runs the Opportunity Calculator funnel (structural reuse)

**What/why:** `/` led with the Streaming Loss Calculator (`WorthExperience homepage`) while the
all-in-one Opportunity Calculator lived only at `/tools/opportunity-calculator`. The homepage now
opens with the same photo-led hero, one primary CTA that smooth-scrolls to the wizard on the same
page, and the same result → transition → builder → save/signup chain, because it mounts the SAME
component (`PublicToolClient` + the registry config). No homepage copy of the calculator, result,
builder, or boundary exists; both routes get every future fix.

**Order:** photo hero → one CTA → wizard → result → transition → builder → save/signup → tool +
CRWN showcase → **every existing homepage marketing section, unchanged and in the same order**
(embedded via a new `below` slot using `WorthExperience marketingOnly`, which strips that
component's own nav, hero, and calculator). Those sections render their existing no-number copy
path since the Streaming Loss result no longer leads the page; no section was removed, reordered,
or rewritten.

**Analytics:** no event renamed, added, or duplicated. `OpportunityEventMeta` gained one
allowlisted dimension, `surface: 'tool' | 'homepage'`, so the shared funnel's events stay
separable per page. `WorthExperience` fires no analytics of its own (verified), so embedding it
cannot double-count.

**Files:** `src/app/page.tsx`, `src/app/HomeFunnel.tsx` (new), `src/components/lead-magnets/PublicToolClient.tsx`
(additive `surface` + `below` props; `surface === 'tool'` keeps the "All tools" and "Explore
another tool" chrome so the tool page is visually unchanged), `src/app/(public)/worth/WorthExperience.tsx`
(additive `marketingOnly`, `HomeNav` exported), `src/lib/opportunityFunnels/analytics.ts`.

**DB impact:** none. **Migration:** none. **Tests:** 793 pass (5 new structural reuse tests in
`pageComposition.test.ts`, 6 config tests in `homepageFunnel.test.ts`, 1 analytics surface test);
`npm run build` passes with `/` still prerendered; `npm run verify:quests` OK.

**Known limitations:** the homepage marketing sections lose the personalized Streaming Loss
figures they used to interpolate (they fall back to their existing generic copy) because the
homepage no longer runs that calculator; `/worth` keeps the personalized version. Component-level
rendering (mobile overlap, focus order) was not automatically tested: this repo's vitest setup is
node-only with no jsdom, so those were verified by reading the shared components rather than
executed.

## 2026-08-01 - Onboarding music upload is project-centric (albums/EPs/singles/loose tracks)

**What/why:** the wizard's music step bulk-uploaded independent tracks and could ask for artwork
per track even when every track belonged to one album. It now asks WHAT you are adding first
(one OptionSelect): **an album/EP/mixtape** (one container, one title, ONE cover upload, bulk
audio, per-item title edit, up/down reorder; saved as an `albums` row + `album_tracks` in queue
order), **one featured track** (the existing single path, now with an OPTIONAL cover), or **a
batch of loose tracks** (the existing bulk path; no artwork required, 🎵 fallback stands).

**Key decisions from repository evidence:** NO migration — `albums.album_art_url` +
`album_tracks.track_number` is sufficient, and a "single" is by convention a standalone track
(no release_type exists). Artwork inheritance does NOT exist at render time (all 12 surfaces
read `track.album_art_url` only), so the project flow follows the AlbumManager convention:
upload the cover ONCE, store it on the album, and copy the URL STRING onto linked tracks that
have no art of their own (`.is('album_art_url', null)` guard; one storage object, N references).
Everything runs on the browser client under the existing albums/album_tracks RLS ownership
policies; no service role.

**Idempotency:** album created once per session (ref), `album_tracks` UPSERTs on
`(album_id, track_id)`, numbering continues from the album's max, duplicate ids dropped in the
pure layer, so retry/double-click cannot duplicate rows or renumber.

**Fixed along the path:** bulk upload failures used to fabricate a dead
`crwn-media.r2.dev` URL and insert the track anyway — they now FAIL the item with a per-item
Retry; bulk file selection now uses the shared `validateUpload` (100MB/audio types) instead of a
private 50MB check; and album share/OG metadata queried nonexistent `albums.cover_art_url`, so
every album OG card said "Album Not Found" — both duplicate album routes now use
`album_art_url`.

**Files:** `src/lib/projectUpload.ts` (+14 tests), `src/components/onboarding/OnboardingProjectUpload.tsx`,
`src/components/artist/BulkUploadForm.tsx` (additive props `projectMode`/`onBatchComplete`,
reorder, retry), `src/app/setup/page.tsx`, `src/lib/onboardingItems.ts` (optional single cover),
milestone `first_project_created` (existing jsonb pattern, no migration).

**DB impact:** none. **Migration status:** none needed. **Tests:** 781 pass, build passes.
**Known limitations:** a reload mid-project after some tracks uploaded leaves them as loose
tracks (manageable in Studio, linkable via the existing add-to-album flow); the studio bulk
path (TrackUploadForm mount) still fires no `first_track_uploaded` milestone (pre-existing gap);
`src/lib/albums.ts` remains dead schema-incompatible code (untouched, flagged).

## 2026-08-03 - The Constraint Engine: CRWN's first artist-facing closed loop

Turns the evidence layer shipped earlier today into ONE next action. Deterministic end to end:
no AI provider is involved at any point, and with every model offline the engine returns the
same answer. It reads, it never writes. No tier, price, promise, campaign, quest, XP or Revenue
Ramp state is touched by this path, and no roadmap step is ever marked complete from it.

**Shape.** `src/lib/constraint/` holds four files: `thresholds.ts` (the ONE policy object,
founder-adjustable, no migration to change), `types.ts` (vocabulary), `engine.ts` (pure
`readConstraint(evidence)`), `assembler.ts` (server-only evidence gather), plus
`presentation.ts` for the render decision. `GET /api/artist/constraint` derives on read and
stores nothing. `ConstraintCard` renders above `RoadmapCard` on `/profile/artist`.

**Evaluation order, and the one place it departs from the brief.** The obvious order is causal
(reach, capture, convert, deliver, retain). That is right for diagnosing a machine and wrong
for advising a person, because **fulfillment and retention protect revenue the artist has
already been paid, while acquisition wins revenue they have not been paid yet.** Sending an
artist to recruit fans into a system that is failing the fans already inside it makes the leak
bigger. So the order is: launch gate (delegated) → FULFILLMENT → RETENTION → REACH →
FREE_CAPTURE → FIRST_PAID → PAID_TIER_INTEREST → CHECKOUT_COMPLETION → DEPTH → none. The build
brief's illustrative list put fulfillment 7th and retention 8th while its own acceptance
criteria required fulfillment to outrank acquisition and retention to outrank expansion; those
cannot both hold, and the criteria encode the intent.

**Launch readiness stays owned by the Roadmap.** The engine checks only whether enough of the
machine exists for its numbers to MEAN anything (page live, Stripe charges enabled, a
purchasable paid tier, a track) and returns `insufficient_evidence` otherwise, letting the
roadmap render unchanged. Those four facts come from the Quest Engine's own `evaluateCondition`
via synthetic instances, the same pattern `/api/artist/roadmap` and `rampReconcile` use, so
there is no second completion oracle.

**Evidence discipline.** Every field the engine consumes is nullable, and null means "cannot
evaluate this stage", never zero. A missing table therefore reads as silence rather than as a
failing artist. Below a stage's minimum sample there is no diagnosis at all, not a low-confidence
one: confidence is sample sufficiency (`medium` at the minimum, `high` at 2x), never a model's
opinion. Every diagnosis renders its own evidence lines so an artist can DISAGREE with it, which
is the difference between coaching someone and managing them.

**Product-failure safety.** Checkout completion refuses to diagnose when joins exceed checkout
starts, because that means the two are not measuring the same population (members who joined
before instrumentation, or a fan who started on one day and paid on another) and the rate would
be a fiction. Tier stages need `interactionDataAvailable` plus real sample sizes, so they stay
quiet while tier evidence accumulates. Copy is neutral throughout: "Fans are viewing Silver but
few are starting checkout", never "your Silver tier is bad". A test asserts no diagnosis ever
mentions upgrades or downgrades, since the subscription schema cannot support that claim.

**One churn definition.** `computeChurn` / `rateChurnAgainstBenchmark` /
`lifespanMonthsFromChurn` moved out of `/api/analytics` into `src/lib/analytics/retention.ts`,
and that route now imports them. The engine needed the same two numbers, and a second copy of a
churn formula is the shape of bug that once produced a 5x commission overpay.

**Fallback.** `decideNextAction` is pure and tested because the repo's harness is node-only with
no jsdom: loading, error, insufficient evidence and "nothing is blocking you" all render the
roadmap exactly as before. The constraint card never replaces the roadmap, so when a constraint
clears, the next read simply stops showing it.

767 tests pass (103 new across 4 files). Build clean. **No migration, no env var, no flag.**

Deferred on purpose: platform-wide product-problem classification, AI phrasing of the
deterministic result, and the Belief/Learning Profile. The thresholds are first guesses made
with no cohort data and are in `TODO.md` as a thing to watch, exactly like the lead score bands.

## 2026-08-03 - Evidence layer: tier interactions, missed promises, and every paid rail

Closes the measurement gaps in `docs/FEEDBACK_LOOPS.md` §18 Phase 0 and Phase 1. **Evidence only:
no recommendations, no adaptive Rise Mode, no pricing or tier changes, no new artist-facing
screen.** The deterministic Constraint Engine is deliberately still unbuilt.

**(1) One finding was WRONG and is retracted.** The audit claimed `stripe_connected` and
`first_paid_conversion` were declared but never emitted. Both were emitted all along
(`connectReconcile.ts`, `webhookHandlers.ts`); the audit's grep was truncated by a `head -30`.
`stripe_connected` already fired only on a live `accounts.retrieve` reporting `charges_enabled`,
which is the correct authoritative state. Two real, smaller gaps sat underneath it. **Rail
coverage:** only the subscription and product paths emitted, and because the stage dedupes per
artist and only the first event ever lands, an artist whose first dollar came from a track,
booking, live ticket or tip read as "never converted" forever. **Attribution:** the event carried
`artistId` and nothing else, so it could not join back to the calculator the artist came in
through, which is the whole reason the funnel extends below signup. Both fixed by one shared
recorder, `src/lib/analytics/paidConversion.ts`, now called from all six rails and stamping
`calculator` + `resultId` from the artist's claimed result. A tip is tagged `live_tip` in metadata
so a stricter "recurring only" reading stays available without a backfill.

**(2) Missed promises are recorded.** `fulfillment_events.status = 'missed'` was read in nine
places and written in none, so promise reliability could only be sampled at this instant and never
measured over time. `MISSED_GRACE_DAYS = 14` in `src/lib/fulfillment.ts` is the ONE
founder-adjustable threshold (no founder-approved value existed, so this is a documented temporary
default). `sweepMissedPromises` (`src/lib/promiseSweep.ts`) runs piggybacked on the existing 6am
`scheduled-releases` cron, AFTER the reminders so an artist is nudged before being scored. Guarded
by `status = 'pending'` on the UPDATE itself, so it is idempotent, cannot touch a terminal status,
and cannot lose a race with a concurrent completion. It creates nothing. **Lateness is derived**
from `due_at`/`completed_at`, with no new column: `latenessDays`, `wasLate` and
`summarizePromiseHealth` give completion rate, missed rate, late-completion rate and median
lateness, all null (never 0) on an empty denominator.

**(3) Tier interaction instrumentation, the keystone.** New `tier_events` table (migration
`supabase/schema-phase2-tier-events.sql`, **unrun**), deliberately NOT an extension of
`funnel_events`: tier events are per-tier and higher volume, and folding them in would inflate the
acquisition funnel's stage counts and add a column 20 of 22 stages leave null. Grain is
`(artist, tier, event_type, visitor_hash, event_date)` UNIQUE, matching `artist_page_visits` so the
two reconcile, which is what makes both counts mean "unique visitors per day" and a view-to-checkout
rate arithmetically honest. `tier_card_viewed` comes from the browser at half-card visibility
(`useTierViewTracker`, IntersectionObserver, unobserve-on-fire + a per-page-load Set + the DB grain:
three layers, so rerenders cannot duplicate). `tier_checkout_started` is recorded SERVER-side in
`/api/stripe/checkout` after `sessions.create` resolves, so a failed session records nothing and a
client cannot forge one; the free path returns before it, so a free rung never gets a checkout it
does not have. **The caller never supplies an artist id**: `recordTierEvent` reads the artist off
the tier row, so cross-artist forgery is impossible by construction rather than by policy. Metadata
is key-blacklisted and shape-whitelisted so no Stripe id can ever land in an analytics row.

**(4) Derived tier evidence reader.** `src/lib/analytics/tierEvidence.ts` +
`GET /api/artist/tier-evidence` (owner-gated by `requireArtistOwner`, same as `/api/analytics`).
Per rung: views, checkout starts, joins, active and churned members, and the three conversion
rates. Derived on read, nothing stored. **Upgrade and downgrade rates are reported as unavailable,
not estimated**: `subscriptions` is UNIQUE (fan_id, artist_id) and every write upserts on that
pair, so an upgrade overwrites `tier_id` in place and no transition history exists.

**(5) One visitor identity.** `hashVisitor` moved from private-in-middleware to
`src/lib/analytics/visitorHash.ts` and middleware imports it. Tier events must use the SAME hash as
page visits or the two tables can never be reconciled, and two copies would be one edit from
disagreeing silently.

664 tests pass (86 new across 5 files). Build clean. **Josh must run
`supabase/schema-phase2-tier-events.sql`**; until then the recorder no-ops and the reader returns
counts with null view rates plus a stated limitation, never a confident zero.

## 2026-08-03 - The artist page redesign lands end to end (interface v2, PR10)

Four commits finish the artist-page pass of the v2 redesign. (1) **The page looks like the
mock**: contained ambient accent pool (pure CSS color-mix), banner as a rounded media card with
accent glow, lifted avatar tile, display-size name, accent-tinted verified chip and tier cards
with pill Join buttons; `GatedTrackPlayer` untouched on purpose (entitlement logic; its glyphs
already ride the accent variable). (2) **Self-healing palette**: `PaletteBackfill` samples in
place when the owner views their page with a banner but no stored palette (sampling needs a
browser canvas), persists, refreshes; m3rcey backfilled `#d50000` live. (3) **Banner
reposition**: drag to reframe stores two object-position percentages
(`schema-phase2-banner-position.sql`, applied and probe-verified), never a re-encoded image.
(4) **Ink correctness, measured not guessed**: derived accent variants clamped so hover/muted
survive being used as ink (hover brightens toward white, muted clamps to the AA floor);
`--crwn-muted-on-tint` fixes muted text on gold-tinted cards (the failure was on the DEFAULT
gold theme, 3.85:1 under a 15% tint, solved against the worst shipped 18%); TrackList's Locked
badge moved off `gold-muted` (3.88:1 even in base gold). `auditContrast()`/`sweepContrast()`
ship as a tested dev tool (`window.__crwnContrastSweep()`); CI wiring pending. The reference's
sampler bug (`180 - dh > 35` accepted identical hues, rejected exact complements) is fixed to
`dh > 35` and pinned by `palette.test.ts`. All migrations verified applied in production via
`npm run verify:migrations` (including plan recommendation, palette, banner position).

## 2026-08-01 - Release strategy phase 1: the membership strategy brain + content classes

Implements the core of `CRWN_UPDATED_RELEASE_STRATEGY.md`. (1) **The brain**:
`src/lib/membershipStrategy.ts` (pure, 18 tests), deterministic pick between **The Release Club**
(enhances the public release cycle, the default) and **The Vault Membership** (monetizes catalog
depth: 10+ declared unreleased songs, or 2 or fewer releases a year over a 20+ track catalog).
Each strategy maps ROLES onto the pinned Bronze/Silver/Gold/Platinum rungs (the spec's "First
Listen"/"Inner Circle"/"Executive" are roles, never names), and carries the monthly promise by
platform plan, a single-release waterfall template, and a 90-day outline. (2) **Derived on read**:
`/api/artist/strategy` (roadmap pattern) derives facts from real data; the only stored value is
the artist's override (`artist_profiles.membership_strategy`, migration
`schema-phase2-membership-strategy.sql`, fail-soft pre-migration). Surfaced by `StrategyCard` on
the command screen; announced via `announce_membership_strategy`. (3) **Content classes replace
the track access toggles**: free forever / members first, public later / members only, one
OptionSelect in `TrackUploadForm`, encoded onto the EXISTING fields by `fieldsForClass()`. This
fixed a real gating bug: the old independent "Free to all" + "Enable early access" toggles could
write a future `public_release_date` with an empty tier list, which `GatedTrackPlayer` reads as
locked for EVERYONE (paying members included) for the whole window; and early access on an
is_free=false track never actually opened to the public. `paid_first` keeps `is_free: true` so
"public later" is real, refuses to encode with zero tiers, and editing a mid-window track keeps
its existing date so unrelated edits cannot silently extend the window. (4) **Declared facts** (same day):
the strategy card asks the two questions that separate the strategies (unreleased depth, release
cadence) as range dropdowns; stored in `artist_profiles.declared_unreleased_tracks` /
`declared_releases_per_year` (same migration, idempotent) and re-derives live. (5) **Live-session
templates** (same day, spec 28.5): `src/lib/liveSessionTemplates.ts` (7 templates, tested) with an
OptionSelect picker in `LivestreamManager`; a template is a PREFILL of fields the form already has
(title, agenda, free vs paid vs top-tier audience via `audienceTierIds`, capacity, and the
Executive Producer template pre-wires submissions when the flag is on). Only on create, never
while editing. Deferred, in order: per-tier waterfall automation (Pro; per-tier dates need an
entitlement change), quest catalog realignment (the Quest Engine stays dark until then).

## 2026-08-01 - Money-path guards, plan truth, and the support chat's escalation model

Found by Josh's live testing, in order of severity.

(1) **Platform plan double-subscribe.** `/account/billing` offered "Go Pro" to an artist already
on Pro and opened Stripe. NOTHING checked at any layer: the billing screen read `platform_tier`
only to display it, `PlatformTierModal` never received the current tier, and `platform-checkout`
never selected it. Completing it would have created a real second $49/mo subscription, and because
`handlePlatformCheckoutCompleted` stores a SINGLE `platform_stripe_subscription_id` and overwrites
it, the first subscription would have become uncancellable from the app and billed forever.
Guards: checkout 409s when **Stripe** reports an active subscription for the customer (the DB pair
is only the fallback when Stripe is unreachable); the modal takes `currentTier` and disables the
current plan. **A first attempt that refused on `platform_tier` equality alone was wrong and was
reverted**: it would have trapped every comped/stale row as permanently unable to start paying.

(2) **"Start Free" left artists billed.** `/api/account/set-starter-tier` carried a comment saying
it only allows the downgrade if there is no paid Stripe plan, and never implemented it. It flipped
the DB row without cancelling Stripe, so an artist on Pro who clicked it kept paying while the
product treated them as free. Now 409s and points at the cancel route.

(3) **Phantom plans: a stored tier is a claim, Stripe is the truth.** `artist_profiles` can read
`pro`/`active` with nothing billing (every platform webhook matches by subscription id and returns
early on a miss, so a subscription deleted in Stripe never downgrades the row). Production had
exactly that. `src/lib/stripe/platformPlanReconcile.ts` + `/api/stripe/platform-status` ask Stripe
and correct the row; the billing screen self-heals on load. Only downgrades when Stripe positively
says nothing is billing. A SQL migration (`schema-phase2-reconcile-phantom-platform-plans.sql`)
covers the narrower NULL-subscription-id case.

(4) **`profiles.platform_tier` DOES NOT EXIST.** `schema-platform-tiers.sql` declares it but was
never applied. Three code paths wrote to it and every write failed silently (supabase-js returns an
error object rather than throwing, and none checked it). Nothing ever read it. Writes deleted;
`artist_profiles` is the single source of truth. Do not add a mirror.

(5) **Support chat escalation model.** The prompt said "ALWAYS escalate when you are not
confident", so a vague opener went straight to a human with no attempt. It now leads with TRY
FIRST. Escalation now splits JUDGMENT (user asked, or the assistant flagged it: thread locks to a
human) from FAULT (key unset, API error, empty response: alert only, thread stays open so it
self-heals). A "New question" control was added because the panel always resumes the newest
conversation, making one escalation a permanent dead end.

(6) **Plan limits are real or gone.** Members are UNCAPPED on every plan (the cap was enforced
nowhere and the only enforcement point would be refusing a paying fan at checkout); the 50-track
Launch cap is enforced by DB trigger; the email quota is enforced at CREATE and, authoritatively,
at SEND (a draft-then-send bypass existed because only sent/sending/scheduled count). Tooling:
`npm run verify:migrations` and `npm run verify:stripe`.

## 2026-07-31 - Platform repricing: Launch / Pro / Scale (CRWN_PRICING STRATEGY.md)

The platform plan lineup was repriced per the founder-approved `CRWN_PRICING STRATEGY.md`.
(1) NEW LINEUP: **Launch** (internal key `starter`, free, 12% fee, 50 tracks, 250
members/contacts, 1 email campaign/mo, free tier + 3 paid fan tiers), **Pro** ($49/mo or
$490/yr, 8% fee, unlimited tracks/members, 20 email campaigns/mo), **Scale** (internal key
`scale`, renamed from the old spec-only `label` $99 concept; $199/mo or $1,990/yr, 5% fee,
100 email campaigns/mo, assisted migration, team permissions). All plans allow the same
4-tier fan ladder. Launch limits were raised from 20 to 50 tracks and 100 to 250 members.
Break-evens: Pro beats Launch above $1,225/mo GMV; Scale beats Pro above $5,000/mo GMV.
Positioning: Launch "Prove your first direct-to-fan offer", Pro "Run your entire
direct-to-fan business in one place", Scale "Scale revenue, your team, and fan operations
with less manual work". (2) CODE: `empire` fully deleted from
`TIER_LIMITS`/`TIER_LIMITS_V2`/`PlatformTierName`; `resolveTierKey()` aliases stray
`label`/`empire` strings to `scale`; `formatTierName()` maps `starter` to "Launch". Both
`pro` and `scale` are in the platform-checkout whitelist, and the route now verifies the
live Stripe price amount against `TIER_PRICING` before checkout, so a stale env var fails
loudly. Stripe env vars are now `STRIPE_CRWN_PRO_PRICE_ID`, `STRIPE_CRWN_PRO_ANNUAL_PRICE_ID`,
`STRIPE_CRWN_SCALE_PRICE_ID`, `STRIPE_CRWN_SCALE_ANNUAL_PRICE_ID` (LABEL/EMPIRE vars gone).
(3) PLAN RECOMMENDATION ENGINE: `src/lib/planRecommendation.ts` (`recommendPlan()`, pure +
tested). Every account starts on Launch; the recommended operating plan is stored on
`artist_profiles.recommended_plan` / `recommendation_reason` / `projected_monthly_gmv`
(migration `supabase/schema-phase2-platform-plan-recommendation.sql`, NOT yet applied),
seeded from the claimed calculator in `/api/lead-results/auto-claim` (fail-soft
pre-migration). (4) LEGAL: `/terms` and `/artist-agreement` now state Launch 12% / Pro $49
8% / Scale $199 5% (hand-kept, never rendered from code). A true multi-artist Label tier
stays custom-priced and unshipped until org accounts / cross-artist analytics / bulk ops
exist; never describe the old $99 Label as a current plan.

## 2026-07-31 - SMS removed entirely; a real support system ships

(1) SMS REMOVAL (founder decision: the A2P 10DLC compliance cost was not worth it). Deleted:
`src/lib/twilio.ts`, all `/api/sms/*` routes (send, webhook, status, provision, upload),
`/api/cron/sms-reset` and its vercel.json cron, `/api/admin/twilio-health`, the `SmsSetup`
component, the SMS tab in the Fan CRM (AudienceTab), SMS limits in `platformTier.ts`, SMS
mentions in the tier upgrade emails / PlatformTierModal / PlatformBilling / worth page, the
SMS consent checkbox on lead capture, the fan SMS marketing toggle, and Terms §13 (SMS
Messaging Program) plus the privacy policy's Twilio mention. The DB tables
(`artist_phone_numbers`, `sms_subscribers`, `sms_consent_log`) were NOT dropped: they keep the
historical consent records, but nothing reads or writes them. Hot-lead call-request alerts to
the founder are now EMAIL always (joshn.wms@gmail.com), plus an optional carrier email-to-SMS
gateway via `FOUNDER_ALERT_SMS_EMAIL` (plain Resend email, no Twilio). `TWILIO_*` env vars are
dead; Twilio is no longer an integration. This also resolves by removal the old Twilio-inbound
webhook exposure and the LOW-3 quiet-hour drop finding, and moots the deferred-send-queue TODO.

(2) SUPPORT SYSTEM SHIPPED. `/support` is now a help center: search across the 14
getting-started guides, a link to /getting-started, a live chat, and the existing contact form
(which now CCs joshn.wms@gmail.com and accepts auto-captured context). The chat stores in
`support_conversations` + `support_messages` (migration `supabase/schema-phase2-support-chat.sql`,
PENDING until Josh runs it; the UI falls back to the form until then); the client reads via RLS
+ realtime, and ALL writes go through service-role API routes: `/api/support/chat` (user side,
session-auth) and `/api/admin/support-chat` (requireAdmin). AI answers come from DeepSeek
(deepseek-chat) with a knowledge prompt generated from the real guide content
(`src/lib/supportKnowledge.ts`, env `DEEPSEEK_API_KEY`). If the key is unset, the AI flags the
question, or the user taps "Talk to a human", the conversation escalates: status
`human_requested`, founder emailed a link to /admin?tab=support, where the new Support tab
(`SupportChatView`) lets the founder reply; replies email the user. A global bug-report widget
(`BugReportButton`, mounted in the root layout, hidden on auth/setup screens) shows a subtle
flag button bottom-right on every page and posts to `/api/support` with category Bug Report and
auto-captured page URL / user agent / user id. Announced via the one-time
`announce_support_chat` popup (2026-07-31) in the popup registry.

## 2026-07-31 — Purchase-level obligations and promise reminders: the calendar's last two organs

(1) PURCHASE-LEVEL FULFILLMENT (the spec's offer-level vs purchase-level rule, now complete):
`src/lib/purchaseObligations.ts`, called from the Stripe webhook's product-purchase handler
after the purchase row lands. A shipped product creates "Ship X to fan" (shipment, due +5
days); a scheduled experience creates "Schedule X with fan" (event, due +7 days); a digital
download creates NOTHING (no fake workload). Idempotent per purchase via metadata.purchase_id
(webhook retries safe), best-effort (never blocks the money path), artist-task only
(auto_create_fan_items false; the buyer already has their confirmation). (2) PROMISE REMINDER
DELIVERY: obligations always carried reminder_offsets ([7,3,1]) and nothing ever sent them.
`src/lib/promiseReminders.ts` now delivers: one loss-framed DIGEST email per artist per run
listing every promise crossing an offset today, deduped per (event, offset) via
metadata.reminded_offsets, paused/archived obligations never remind, artist email resolved via
auth admin. Piggybacked on the 6am scheduled-releases cron (Vercel Hobby allows no new
schedules), best-effort. sw.js v325.

## 2026-07-31 — Spec-gap sweep: the ladder they designed, segments they can target

Four gaps from the wizard spec closed. (1) LADDER PREFILL, the core "restore the business they
designed" promise: `src/lib/leadResults/ladderPrefill.ts` (pure + tested) shapes the artist's
own pre-signup tier edits (deliverable-draft t0-t3 values first, conversionPayload.ladder as
fallback, template filling every gap) and auto-claim returns it as `ladderPrefill`; the wizard's
ladder draft now carries a per-rung NAME, seeds from the prefill until the artist touches the
draft, renders custom names (with a "your Gold rung" hint), threads them through promise
planning ("serves your Day Ones members") and tier creation, and dedupes on custom name +
template aliases. (2) SEGMENT TARGETING: the campaign composer's contacts audience gained a
segment dropdown built from real contact tags with counts (patreon, patreon-tier:X), stored as
`filters.contactTag`; the contacts sender narrows with `.contains('tags', [tag])` under the SAME
consent rules, making per-tier Patreon invites real. (3) PLAN INTRO now shows the plan's
substance: their model line (their names/prices or stock), the honest recurring workload, and
the launch timeline. (4) CADENCE/TITLE PROPAGATION: syncTierObligations updates an existing
obligation's recurrence and title when a benefit's config changes (future cycles follow; history
never rewritten). Still open, recorded in TODO: purchase-level obligation engine, reminder
delivery, OAuth import connectors, Share-to-Earn as a confirmable wizard component, same-day
high-effort spacing, warn-before-delete. sw.js v323.

## 2026-07-31 — Live-test sweep: nine onboarding findings diagnosed from production, seven fixed

Josh walked the full journey on a fresh account (lagoo); every item was diagnosed against live
data before any code moved. (1) STRIPE: Stripe said charges_enabled and the milestone/backfill
HAD landed, but 30 minutes late; verification is asynchronous and nothing reconciled until a
polling surface was opened. One shared reconciler (`src/lib/stripe/connectReconcile.ts`) is now
used by connect/status AND run by the roadmap route whenever an account exists without the
milestone. (2) SHARE-TO-EARN: the public page advertised `|| 10` percent while the payout pays
the real rate (default 0): rates are now real everywhere, the fan button hides when the program
is off, and the page OWNER sees a program-state pill (live at X% / turn it on) since the fan
button is invisible to them by design. (3) RAMP: "Build your four-tier ladder" stayed pending
after the wizard built it; `rampReconcile.ts` completes ramp events via the quest evaluator's
own checks before the calendar projects. (4) RISE XP: not a flag (quest_engine on) or a
regression; lagoo had 975 XP at level 4 but a null artist build, and the build picker replaced
the whole board. The progression header now renders above the picker. (5) POP-UPS: PopupDef
gained `announcedAt`; the engine skips announcements for accounts created on/after that date
(context now carries profiles.created_at). All five announcement/notice defs dated. (6) TOURS:
the cross-tab feel is the artist-page tour clicking its own in-page tabs (kept: content mounts
per tab) plus tour CHAINING (every surface auto-firing its first-visit tour in one session);
startTour now caps auto-starts to ONE per browser session, deferring the rest to later visits.
Stale copy fixed (community step now mentions channels; the home tour's dead replay anchor now
points at the real help button). (7) FAN IMPORT: the launch review's "Audience imported" row
gained an in-place "Import now" that opens the FanImportModal inside the wizard. Deferred with
reasons: per-quest $/month estimates (needs an honest estimate model, not invented figures) and
the full 20-file tour audit. sw.js v322.

## 2026-07-30 — Launch no longer re-asks for the business the wizard just built

Josh's live test caught a stale journey: pressing "Launch my CRWN" routed him into the restored
deliverable builder (re-confirm tiers/growth/experiences), then into the offer builder, whose
publish tried to create a DUPLICATE Silver tier and was blocked by the paid-tier cap ("Your plan
allows 3 fan tiers"), reading like a broken free-tier promise. Diagnosis: the cap is CORRECT
(Option-2 counting, paid tiers only, the free Bronze does not count; he already had his 3 paid
tiers live). The restored-builder destinations were designed BEFORE Launch Wizard Stages 2-3,
when the wizard did not build the ladder; now they re-build what exists. Fixes: (1)
`resolveJourneyDestination` takes `hasPaidTier` (resolved server-side in
/api/lead-results/post-setup-destination) and skips any restore whose end state is tier creation
(calculator prefills bound for /offers/new, and saved deliverables whose spec `continueRoute` is
/offers/new), landing on the Rise Mode command screen instead; non-tier restores (Own Your Fans
plan, missions, demand tests, live builder) still restore. (2) The offer builder's publish now
has a duplicate-name guard: a tier whose name already exists gets "edit it in Fan tiers and
pricing instead of creating it twice," never a twin and never a confusing cap error. Resolver
covered by new tests. sw.js v321.

## 2026-07-30 — Wizard polish from Josh's live test: no screen claims to show what it does not show

Two fixes from Josh walking the wizard with a real account. (1) The plan-restore intro showed
"Build your CRWN plan" under "From your CRWN Opportunity Calculator": a deliverable DRAFT row
(saved pre-signup by /api/opportunity-drafts) stores the spec's CTA as its `title` and
`result_data = {}` with the revealed number in `input_data.opportunitySummary`, and the seed
reader never looked at input_data. `rowToSeed` now reads input_data and, for draft rows,
surfaces the summary (never the CTA); both seed queries select `input_data`. The intro card
also gained a substance fallback for old draft rows with no summary. This fix flows to EVERY
seed surface (Rise banner, action plan, starter offer copy). (2) The ladder and promises
screens showed a bare "already set up, hit Continue" to returning artists, under headlines
promising a confirm/review. They now render read-only summaries of the REAL data: the artist's
actual tiers (name + price) and their actual active obligations (title, cadence, next due),
with "nothing will be duplicated" framing. Identity screens correctly stay skipped for
existing artists (never re-ask, never pre-fill the email-seeded name). sw.js v320.


## 2026-07-30 — Launch Wizard Stage 9: preview, publish, command screen. The wizard is COMPLETE.

The last stage. The wizard's end screen became `LaunchReview` ("Your CRWN launch system"): a
six-item completeness checklist (offers / Stripe / content / promises / audience / campaign)
where open required items carry a "Fix it" jumping back to the exact wizard screen and the
after-launch items say honestly where they happen; the previews, shaped by the setup gate (the
PUBLIC PAGE serves as the storefront + checkout preview opened as a fan, while the Promise
Calendar's next events and the roadmap's first milestone render INLINE because their routes
bounce ungated artists back to /setup); the share block; and one publish action, "Launch my
CRWN", which remains exactly the existing server-side completion (markComplete →
/api/artist/complete-setup → journey resolver; role promotion stays the server trigger). The
post-launch command screen is Rise Mode's top: RoadmapCard now renders the REAL numbers
(members, paying members, MRR against the artist's own calculator goal) and the next three
upcoming promises, from /api/artist/roadmap's new stats/upcomingPromises, above the current
stage and next milestone. Real counts only, never projections dressed as results. With this,
all nine stages of docs/ARTIST_LAUNCH_WIZARD.md are SHIPPED: restore the business they designed
→ make it operational → show the workload → prepare the audience → launch it. sw.js v319.

## 2026-07-30 — Launch Wizard Stage 8: the launch campaign composer (drafts only, ever)

The Campaigns view in the Fan CRM now opens with a Launch Kit panel. `src/lib/launchCampaign.ts`
(pure + tested) writes the whole launch from what the artist actually built: the announcement
email ("I built us a home") and the follow-up, a social caption, story copy, DM copy, the share
link, a segment suggestion (Patreon members first when the import tagged them), a 20-contact
test size, and a suggested send date (the coming Friday with two days of review runway). One
click creates BOTH emails as `campaigns` DRAFTS through the existing /api/campaigns route,
announcement preset to the contacts audience with the test group; the artist reviews them in
the existing composer and sends through the compliant contacts sender (attested + subscribed +
suppression + unsubscribe). Copy buttons cover the manual path. Also fixed a real wiring bug
from Stage 7: the import done-screen CTA and the roadmap's announce step deep-linked to
/campaign-hub, which is ROAD-TO campaigns; email campaigns live at /studio/fans, and both
links now point there. The sign-off name is guarded by isPresentableArtistName so an email
address never signs a launch email. No migration. sw.js v318.

## 2026-07-30 — Launch Wizard Stage 7: the fan import hub, with the Patreon on-ramp

The Fan CRM's import modal became the fan import hub, and the TODO's chosen wedge (Patreon
on-ramp option (b)) is built. The first screen asks "where are your fans right now?": a Patreon
card carrying the exact export path (Audience → Relationship Manager → Download CSV) and an
any-CSV card (Mailchimp, Shopify, Gumroad, spreadsheets) that keeps the existing column-mapping
flow. A Patreon export is AUTO-recognized by `src/lib/patreonImport.ts` (pure + tested:
detection, status/pledge/tier parsing, closest-CRWN-tier suggestion with free→front-door and
ties-break-cheaper rules). The review step shows active vs former patrons (active-only default;
former import tagged `patreon-inactive` for win-back), and each Patreon tier's member count
with where it lands on the artist's ladder. Members import with `patreon` and
`patreon-tier:<name>` tags so campaigns can target each group separately. Consent unchanged
and central: the same versioned attestation gates the import, and the done screen hands off to
Campaign Hub, whose contacts audience only ever sends to attested, still-subscribed contacts
through the suppression-gated sender. Import never messages anyone by itself. No migration.
sw.js v317.

## 2026-07-30 — Launch Wizard Stage 6: the personalized artist roadmap, as a view over the Quest Engine

Every artist now has a 5-stage execution roadmap (Foundation → Private launch → Audience launch
→ Deliver and retain → Expand, ~21 steps) that answers "what do I do next?", surfaced as
`RoadmapCard` at the top of Rise Mode: current stage, ONE next milestone with a prefetched deep
link into the surface where the action happens, overall progress, and the full five stages on
expand. The design rule that mattered: this is NOT a second progression system. Steps reference
EXISTING Quest Engine DomainChecks by exact name, and `/api/artist/roadmap` evaluates them
through the evaluator's own `evaluateCondition` with a minimal synthetic instance, plus three
Promise Calendar facts the evaluator lacks (promises scheduled / first delivered / nothing
overdue). Derived on read, stored nowhere (deliberate deviation from the spec's "store
per-artist": the house derive-from-live-data pattern cannot go stale), so the roadmap can never
tell a different story than the quests, and XP keeps flowing only through the Quest Engine.
Personalized where CRWN has real data: share steps deep-link to the artist's public page, and
the Expand MRR milestone is the monthly figure from their own claimed calculator (default
$500/mo). Weekly availability and platform inputs are NOT used because CRWN does not collect
them. Pure structure + assembly tested in `artistRoadmap.test.ts`. No migration. sw.js v316.

## 2026-07-30 — Launch Wizard Stage 5: minimum viable content, with the catalog path

The wizard's music group now opens with a `content-plan` decision screen: one featured track
(the fastest minimum, unchanged single path, starts free), the full catalog, or an explicit
loss-framed "I'll add music later" escape that jumps the group. The catalog path mounts the
EXISTING dashboard `BulkUploadForm` inside the wizard, exactly per the spec's "reuse existing
systems, no onboarding-only media system": multi-file queue, per-track tier access and one-time
prices (real `allowed_tier_ids` gating against the tiers the wizard just created), cover art,
per-file progress, and the Artist Agreement consent line. The audio screen wears catalog copy in
bulk mode, the track-title screen is skipped on that path (titles come from file names), Continue
unlocks from the DB the moment tracks exist, and bulk completion fires the `first_track_uploaded`
activation milestone the single path already fired. This is the wedge for the 40-300-song ICP:
the deep catalog lands behind the Gold tier the artist just confirmed. The wizard is now 12
screens. sw.js v315.

## 2026-07-30 — Launch Wizard Stage 4: Stripe connect moved into the wizard

The wizard now surfaces Stripe at the right moment: a `stripe` screen right after the promise
review (monetize group). Understanding-first per the spec: the artist has just confirmed the
model and its workload, so "Connect Stripe so fans can purchase your offers and you can receive
payouts" finally has context. `/api/stripe/connect` accepts a validated same-site `?returnTo=`
for its account-link refresh/return URLs (wizard passes `/setup`; everything else keeps the
dashboard default), and the wizard's resume effect restores the EXACT `stripe` screen on
`?stripe=success|refresh` instead of running the first-incomplete scan. Verification stays
server-side: the screen only re-hits `/api/stripe/connect/status` (live `accounts.retrieve` +
tier-price backfill; the response now includes `payoutsEnabled`) and renders one of three
states: connected (charges enabled, payouts enabled-or-verifying), under review ("Check
again"), or not connected (Connect button + loss-framed skip note). The screen NEVER blocks
Continue, preserving the design rule that Stripe is required to take money, not to see the
recommendation or finish setup. The wizard is now 11 screens. sw.js v314.

## 2026-07-30 — Launch Wizard Stage 3: the benefit→obligation generator and the promise review screen

The wizard now shows the WORKLOAD before it creates anything. A new pure module
`src/lib/promisePlan.ts` is the one benefit→obligation brain, shared by the wizard's new
`promises` review screen and the server sync (`tierObligations.ts` consumes it): promise
detection, cadence/title/first-due-date read from benefit config, DEDUP (the same promise on
several tiers is ONE obligation, tracked in `metadata.merged_tier_ids` and re-anchored if the
anchor tier drops the benefit), INHERITANCE (Gold's monthly Vault unlock carries
`serves_higher_tiers`, so the one obligation also serves every higher tier via
`metadata.serves_tier_ids`, refreshed on every sync so wizard creation order converges), and the
recurring-workload model (`estimateMonthlyWorkload`, the full ladder is "about an hour a
month"). Fan-side eligibility (`calendarProjection.fanEligibleForObligation`) and the
promise-fulfilled fan notify now honor `serves_tier_ids`, so a Platinum member actually sees and
gets Gold's inherited promises. The wizard's monetize group is two decisions: confirm the MODEL
(`ladder`) then confirm the SCHEDULE (`promises`, where the create now runs); cadence
(shared `OptionSelect`) and first-due-date adjustments ride into `applyTemplateTier` as
`benefitConfigOverrides` → each benefit's config (`frequency`, `first_due_at`). Stage 2
leftovers landed: the ladder screen shows estimated buyers per rung from the artist's own
calculator (`tierProjections` on auto-claim, matched by current/legacy names) with loss-framed
attribution. Pure logic tested in `src/lib/promisePlan.test.ts`. No migration (metadata jsonb
only); the wizard is now 10 screens. sw.js v313.

## 2026-07-30 — Launch Wizard Stage 2: the wizard confirms the recommended model

The wizard's Monetize group stopped asking the artist to hand-build one free tier
(tier-name/tier-price/tier-benefits) and became a single `ladder` confirm screen: Bronze free
(always applied) plus Silver/Gold/Platinum with inline price editing and per-rung "Drop this
tier"; benefits expand in place and the Gold/Platinum fulfillment notes show what the artist is
committing to. The apply logic was extracted from Rise Level 3's `TierLadderTemplate` into
`src/lib/applyTierTemplate.ts` and BOTH surfaces now use it, so tier creation and Promise
Calendar seeding (via `/api/tier-benefits` → `syncTierObligations`) cannot drift. Retry-safe via
name/alias dedupe; the wizard is now 9 screens. sw.js v312.

## 2026-07-30 — Launch Wizard Stage 1: the wizard restores the pre-signup plan

Josh specced the full Artist Launch Wizard (restore plan → confirm offers → roadmap → Stripe →
content → Promise Calendar review → import fans → campaign → preview → publish → launch command
screen). The staged build plan, mapped stage-by-stage onto existing systems, is
`docs/ARTIST_LAUNCH_WIZARD.md`. Stage 1 shipped: `/api/lead-results/auto-claim` now returns the
claimed seed summary (toolName/headline/heroValue/estimatedMonthlyCents), and `/setup` opens with
a "Your CRWN plan is saved" intro for a brand-new signup with a claimed result (no artist row,
nothing typed), so signup reads as a continuation of the calculator, not a restart. The
profiles/artist_profiles policy-repair migration was applied and verified live the same day
(RLS insert 201, client profiles update 204, role freeze holding, email still revoked). sw.js v311.

## 2026-07-30 — /welcome retired; identity moved into the setup wizard; profiles UPDATE 42501 fixed

A real incognito signup (joshn.wms+onboardj) hit "Something went wrong saving your info" on
/welcome. Root cause: since `schema-phase2-profiles-column-privileges.sql` was applied
(~2026-07-23), the `profiles` FOR UPDATE policy's WITH CHECK subqueries read
`stripe_connect_id`, a column that migration revoked from `authenticated`; one forbidden column
42501s the whole statement, so EVERY browser-side profiles save (welcome, wizard photo, tour
completion, profile settings) silently failed. This is the same collision fixed once before on
`artist_profiles`. Fix: `schema-phase2-fix-profiles-update-permission.sql` moves the
is_active/stripe_connect_id/role freeze into a BEFORE UPDATE trigger (with an exemption for the
trg_promote_to_artist fan→artist promotion) and restores plain-ownership RLS. **Migration
pending Josh** (TODO.md P0).

Follow-up the same day: Josh's retest failed on the LINK screen ("Something went wrong creating
your page"). Second policy, same collision: the "Gated artist profile insert" policy on
artist_profiles subqueries the revoked `profiles.is_approved`, so the RLS INSERT 42501s
(reproduced against production with a throwaway user; permissions on policy subqueries are
checked at executor startup, so the artist_gate_enabled() short-circuit does not help). Fixes:
the identity route's artist_profiles insert moved to the admin client (ownership still enforced,
trg_promote_to_artist still fires), the wizard's photo save moved server-side too
(`POST /api/onboarding/avatar`, URL restricted to the caller's own avatars folder), and the
migration was extended to rebuild the INSERT gate on a SECURITY DEFINER helper
(`user_passes_artist_gate`). The full RLS surface of onboarding was probed live with a throwaway
user: tier, track, and product inserts and the avatars/audio storage uploads all pass; the daily
canary will alarm (correctly) until the migration runs. sw.js v310.

Independently of the migration, onboarding was restructured per Josh's ask: the /welcome page is
retired (route now redirects to /setup). The wizard gained two leading identity screens
(artist-name with a "Continue as a supporter" escape, artist-link), saved server-side by
`POST /api/onboarding/identity` (admin client for the profiles write, so it works pre-migration;
user-session client for the artist_profiles insert, so the canary-guarded RLS publish path stays
real, and the welcome email now sends once with the chosen name). Phone is no longer collected.
All entry points (signup, login, /verify, (main) gate, journey resolver, quest destination
registry, onboarding-reminder email) now point at /setup; `slugify` moved to `src/lib/slugify.ts`;
`setup` added to reserved slugs; sw.js bumped to v309.

## 2026-07-30 — Stock tier ladder renamed to Bronze / Silver / Gold / Platinum

The recommended four-tier ladder shipped under invented names (The Wave / Inner Circle / The
Vault / Throne). Fans had to learn what those meant before they could rank them. Bronze / Silver
/ Gold / Platinum is a ladder every fan already knows on sight, so the ordering does the selling.

Prices, keys, benefits and math are unchanged: free / $10 / $25 / $100, keys still
`wave | inner_circle | vault | throne`. Only the display names moved, everywhere the platform
builds tiers on an artist's behalf: `tierTemplate.ts` (`RECOMMENDED_LADDER`, the source of
truth), the setup wizard's free entry point (`DEFAULT_TIER_NAME`), the Rise Mode Level 3 ladder,
`/worth` (tiers, waterfall, mocks, prefilled builder), the calculator result email, the unified
opportunity model + adapter, `postSetupDestination` fallbacks, the vault planner's seeded tier,
the `/offers/new` goal templates, and the getting-started guides.

Each rung now carries `legacyNames`, and `TierLadderTemplate`'s "already added" check matches
those too, so an artist who applied the old ladder is never offered a duplicate tier. The quest
evaluator recognizes the free tier by `price = 0`, not by name, so it was unaffected.

"The Vault" survives as a FEATURE name (the Vault Revenue Planner, the monthly vault unlock, the
artist's private archive). It is no longer a tier name: the vault lives in the Gold tier.

Not renamed, deliberately: the `inner_circle` **fan role** in `quests/fanRoles.ts` (a different
concept from a subscription tier), and the m3rcey test artist's real tier rows in
`seed-demo-data.sql`.

## 2026-07-30 — The Tier 1 launch journey: qualified call requests, consent-attested fan import, and first-fan invites

The calculator-to-launch spine existed end to end (unified calculator → editable pre-signup
builder → save boundary → auto-claim → setup → prefilled `/offers/new` → Stripe backfill →
public page). What was missing was everything around it for the fragmented-stack ICP: a way for
a hot lead to raise their hand, a consent-honest on-ramp for the fan list they built elsewhere,
a way to actually invite those fans, and a funnel that reaches the first dollar.

**Qualified immediate-call requests (net-new).** The unified calculator's `proof` step now asks
the 40% question (`monetization_status`, one tap), matching every loss tool. A `CallRequestCard`
below the pre-signup builder (never before it) collects a callback number and explicit,
versioned consent (`src/lib/acquisition/callRequest.ts`). `POST /api/lead-magnets/call-request`
sanitizes the calculator answers against the tool's own definitions, recomputes qualification
through the canonical `scoreLead` (client bands are never read), claims idempotency on
`acquisition_events` (one per phone per day, insert-as-claim), and for `sales_priority` leads
only sends one SMS to the server-only `FOUNDER_ALERT_PHONE` via the existing `sendSms`, with an
email fallback to the founder. The whole CRM record (consent, qualification, answers, alert
status, manual contact status) lives in the claim row's `response_snapshot`, surfaced in
`/admin` → Acquisition → Calls with a status dropdown (`set_call_request_status`). The public
response is uniform so the endpoint cannot probe the scoring model. 18 new tests.

**Consent-attested fan import.** `/api/fan-contacts/import` (which already existed,
contradicting `docs/ICP.md`; the doc is corrected) now requires an explicit permission
attestation (`src/lib/fanImportConsent.ts`, versioned), stores `consent_attested_at` +
`consent_attestation_version` on each row (PGRST204-fallback keeps imports working
pre-migration), and records the `fans_imported` funnel stage. `FanImportModal` renders the
attestation checkbox and blocks import without it.

**First-fan invites through the EXISTING campaign sender.** `campaigns.filters.audience =
'contacts'` resolves recipients from `fan_contacts` (attested + still subscribed + not globally
suppressed), supports a small-test-group cap (`testCount`), sends via the same
`campaignEmail`/unsubscribe/pixel rails, and records `fan_invited`. `campaign_sends` learns
nullable `fan_id` + `contact_id` (migration `schema-phase2-fan-invites.sql`, with a recipient
CHECK); the unsubscribe route flips `fan_contacts.is_subscribed_email` for contact sends; the
cron sender refuses scheduled contact campaigns so the wrong audience can never resolve.
Pre-migration, the whole invite path returns a clean "not available yet" error.

**The funnel now reaches money.** `FUNNEL_STAGES` grew from fifteen to twenty:
`call_requested`, `stripe_connected` (written in `/api/stripe/connect/status` when
charges-enabled, deduped per artist), `fans_imported`, `fan_invited`, `first_paid_conversion`
(written in the Stripe webhook handlers on the first subscription or product sale, deduped per
artist). The unapplied `schema-phase2-funnel-events.sql` was updated in place and
`schema-phase2-funnel-events-journey-stages.sql` widens the CHECK for an already-applied table.
The funnel_events migration had silently dropped off TODO.md while CHANGELOG called it unrun;
both founder items are restored.

**Launch transition.** The `/offers/new` done screen becomes the post-publish launch step:
"now choose who should see it first" (import CTA, small-test-group invite CTA via
`/studio/fans?view=compose&audience=contacts`, copy launch link), plus "Connect Stripe so fans
can purchase this offer" whenever the status check answered that charges are off for a paid
offer. `AudienceTab` accepts `?view=` deep links; `CampaignComposer` gained the binary
fans/contacts audience toggle.

**Migrations applied same day (2026-07-30, verified via anon-key probes):** `funnel_events`
exists, `fan_contacts.consent_attested_at` exists, `campaign_sends.contact_id` exists, and
`prospect_nurture_enrollments` exists, so the invite path, the 20-stage funnel AND prospect
nurture are all LIVE. The products-physical CHECK migration was run in the same session
(founder-confirmed; not externally probeable). Remaining founder item: set
`FOUNDER_ALERT_PHONE` in Vercel (email fallback active until then). Deliberately NOT built:
OAuth contact imports (Mailchimp/Google/Patreon APIs), inbound SMS, any change to Stripe
fees/payouts, any new broadcast system. Build clean, 427 tests pass (18 added), sw.js bumped
to v297.

## 2026-07-30 (latest) — Two "done" items were not done: test artists still existed, and the Resend webhook was never registered

Verifying founder-completed items caught two real gaps, both now closed or filed.

**The two onboarding test artists still existed.** The SQL-editor deletion had hit a foreign-key
error and stopped, leaving both `auth.users` rows and their profiles live. Deleted properly via
the admin API after clearing the blocking rows (`sequences`, `abandoned_checkouts`,
`sequence_enrollments`), each scoped to those two ids. Verified: profiles and artist_profiles
gone, the real `m3rcey` account untouched.

**`FOUNDER_ALERT_PHONE` is live, and the hot-lead SMS now sends (resolved same day).** The first
end-to-end test (CLAUDE TEST) scored `sales_priority` 74, deduped, reached the admin Calls tab,
and failed at the SMS hop with *"The 'From' phone number provided (+13145573549) is not a valid
message-capable Twilio phone number for this destination"*, delivering by email fallback instead.
Twilio's message blames the number, so the first fix I proposed sent Josh chasing number
capabilities, trial mode and A2P 10DLC. Querying the Twilio API directly gave the real answer:
**error 20008, the configured credentials were Twilio's TEST pair**, which by design refuses any
real from-number (a send from the magic test number +15005550006 was accepted, proving it). Josh
swapped in the live Account SID + Auth Token, and a second test produced message SID `SMde98c…`
with no error and no fallback. **The sender number never needed changing**; the live account owns
it. `sendSms` now special-cases 20008 so this failure states its own cause instead of misdirecting
the next person.

**🔴 The Resend webhook was never registered in the Resend dashboard.** Josh could not find it
because it does not exist. The route is live and correctly fails closed (403 on an unsigned
POST), but the only row in `email_suppressions` is the July security test's
`victim@example.com`, proving no real event has ever arrived. **Hard bounces and spam complaints
have therefore never been suppressed in production**, while prospect nurture is live sending up
to 25 emails per lead over 12 months. Filed as the P0 item with exact create-and-configure
steps. `10-INTEGRATIONS.md` corrected (it still described the signature gap as open, and said
nothing about registration). The general lesson is recorded there: **a correct, deployed,
signature-verifying webhook proves nothing about whether the provider is calling it. Look for
received data, not for code.**

## 2026-07-30 (later) — Founder-list sweep: ramp verified live, bespoke calculator hero, real tiers in the artist context, Terms notice

Josh delegated the open TODO decisions. Executed: **revenue ramp verified end to end in
production** (promise-calendar tables probed, then `seedRevenueRamp` run for `m3rcey` via the
real lib with the service role: 31 steps seeded, 0 skipped); **bespoke hero** for the
opportunity calculator (`public/tool-opportunity.jpg`, charcoal + gold, artist 18-32, gold
threads converging to one point — reviewed before shipping; registry now points at it);
**`useArtistContext` fixed at the source** (tiers now come from `subscription_tiers`, not the
dead `artist_profiles.tier_config`; consumers of `ctx.tiers` no longer see an empty list);
**Terms notice shipped** as a once-ever, priority-10 banner (`notice_terms_2026_07_24`) because
Terms §1 promises notice of material changes. Decisions recorded: do NOT promote the unified
calculator to primary until `oyf-signup-timing-v1` concludes; the next on-ramp build is
**(b) Patreon member import** (over (c)), queued as a dedicated session. sw v298.

## 2026-07-29 — The conversion spine: from calculator result to "launch this, charge this, do this next"

The middle of the acquisition journey existed (claim, prefilled builders, post-setup routing) but
nothing ever told the artist WHAT to do: the homepage dropped all continuation context at its
highest-intent moment, and a brand-new artist landing on `/profile/artist` met a dead "Rise Mode is
on its way" placeholder. This ships the avatar-specific conversion spine for the ideal customer
(a proven direct-to-fan seller with audience traction who is not converting it into owned revenue).

**One deterministic starter-offer recommendation.** `src/lib/leadResults/starterOffer.ts`
(`starterOffer@1`, 17 tests):

- `buildStarterOffer(input)` is pure: claimed seeds + account state (paid-tier count, free tier,
  track, Stripe, plan) in, ONE offer out: kind, name, integer-cent price, audience, benefits,
  fulfillment burden, why, what is missing, three next actions, and a prefilled builder link that
  returns to Rise Mode. No LLM, no new tables, no writes.
- Prices come from the seed's own `conversionPayload` when the calculator modeled them, else from
  `RECOMMENDED_LADDER` in `tierTemplate.ts`, so there is no third copy of 1000/2500/10000.
- One monthly figure per recommendation via `monthlyCentsOf` (max semantics, never a sum across
  tools). Share-to-Earn and missions are labeled acquisition for the same membership, never a
  second income. Vault carries a "do not count it twice" note.
- Pro gating honored: producer-session and live seeds on Free fall back to the membership with a
  plain constraint note; the upgrade is never the first outcome.
- Low confidence (no seed, score-only tool) recommends the smallest testable offer, not a menu.

**Surfaces.** `GET /api/starter-offer` (session-authed, artist resolved server-side, Stripe status
read only through `connectAccount.ts`) feeds `StarterOfferCard`, which now renders in Rise Mode's
flag-off slot on `/profile/artist` ("Based on what you told us, start here", primary CTA "Finish my
offer", secondary "Preview what fans will see"). Falls back to the old placeholder on any failure.
Emits the existing `recommended_action_viewed`/`recommended_action_started` journey events; no new
event names, no new analytics sink.

**The homepage stops dropping context.** `WorthExperience` now renders the result-to-builder
continuation on the homepage too (it was `!homepage`-gated): saving the draft routes through
`buildContinueUrl('worth', token)` so signup receives the result token. The hero subline now
promises the outcome: "...get the exact offer to launch, what to charge, and what to do first."
`ConvertToFeatureButton` now calls `buildContinueUrl` instead of rebuilding the URL inline.

Three defects fell out of the audit and are fixed or filed:

- **`TierManager` truncated cents** (`parseInt("9.99") * 100` = $9.00) on tier create AND update;
  both now `Math.round(parseFloat(...) * 100)`.
- **The prospect-nurture cron wrote a `completed_at` column that does not exist**, so a finished
  enrollment could never leave `active`; the phantom field is removed (status/exit_reason carry it).
- **`products` CHECK constraints never allowed `physical`/`shipped`** though the setup wizard, the
  offer builder, and ShopManager all write them; corrective idempotent migration
  `supabase/schema-phase2-product-type-physical.sql` (self-verified), filed in TODO.md P1 together
  with the two prospect-nurture migrations that were promised in TODO.md but never actually added.

Deliberately NOT done: no new onboarding screens (refinement happens in the already-editable
prefilled builder), no Quest Engine changes (still dark), no `/welcome` name prefill (the blank
field is a deliberate guard against legal names leaking as public artist names), no new nurture
system (the built-but-dark 11-email sequence already personalizes per calculator).

## 2026-07-29 — The unified Opportunity Calculator: one model, nothing counted twice

Seventeen calculators each modeled one opportunity honestly. Run together they were dishonest,
because they were all built on the same audience and most of them resolved to the same dollar. At
500,000 followers their own published formulas sum to about **$550,835/mo and 23,500 paying people**,
against a following of 500,000 and a repo audience model that says only 2,250 of them ever pay for
anything. The vault tier alone claimed more payers than the entire membership model. An artist planning
against that number plans a business that does not exist.

**The new tool does not add them up.** `/tools/opportunity-calculator`, model
`src/lib/opportunity/unifiedModel.ts` (`unifiedOpportunity@1`):

- **One normalized audience.** `max(followers, listeners, owned)`, never a sum, because nothing in
  this repo can say how much two platforms overlap. Owned contacts are folded in by
  inclusion-exclusion (owned are fully reachable, the rest at `reachRate`), so addressable can never
  exceed the audience. Where the overlap is genuinely unknown, the result says so.
- **One unique paying-supporter count.** Every recurring dollar is the ladder applied ONCE to it.
- **The vault is a TIER** (Gold, $25, the middle rung of `RECOMMENDED_LADDER`), not a second membership.
  Standalone only when explicitly configured, and then it replaces a rung rather than adding one.
  Not recommended at all below five unreleased pieces.
- **Share-to-Earn and Clip-to-Earn are acquisition, not revenue.** Clips are a capped LIFT on the
  conversion of the audience the artist already has. Sharing is the one mechanism reaching people
  from outside, so it adds heads, but those heads join the same ladder at the same prices. Both
  appear only as a supporter and attribution split; `organic + clip + share == payingSupporters`.
- **A fan may hold two roles; a person is counted once.** `uniquePromoters = sharers + clippers -
  both`. The overlap question is asked only when both systems are live, and falls back to a
  documented default.
- **Incremental purchases sell only to non-members.** Members already have the live in their tier,
  so no member is also counted as a ticket buyer. A session that is a top-tier benefit earns
  **zero** on its own; a hybrid counts only the extra seats. This disjoint-population rule is what
  makes the total provable: every dollar is paid by a member or a non-member, never both.
- **Recurring and one-time stay separate**, gross is never mixed with net, the fee is applied once,
  commission only on the attributed slice, and current direct revenue is **subtracted**, never
  added. Headline is a conservative-to-high **range**.
- **82 tests** (`unifiedModel.test.ts`, `unifiedFunnel.test.ts`) assert every one of those, plus that
  the unified total stays below half the naive sum.

Around the model: an 11-screen branching wizard (the overlap question renders only when the artist
has both sharers and clippers; session structure only when they will go live; a step whose every
input is branched away is skipped rather than shown empty), `?from=<tool-slug>` entry contexts that
reorder the wizard for a single-opportunity video **without changing the model**, a coordinated
`system` builder that prefills the whole business (ladder, Vault placement, both growth systems,
the experience, the launch order) and re-runs the model via `recalcUnified.ts` the moment an edit
changes the structure, and a compact signup boundary carrying the range, the plan preview and a
one-line overlap disclosure.

**Additive and reversible.** No migration, no feature flag: it is an 18th entry in the existing
lead-magnet registry, so it inherits the tool page, capture, tokenized result, email, prospect
nurture, draft claiming and the journey resolver. All 17 individual calculators are untouched and
verified still working. Promotion is deliberately `secondary`, because Own Your Fans is `primary`
AND is the assigned experience of the running `oyf-signup-timing-v1` experiment.

Two fixes fell out of the work and apply beyond this tool:
- **`resultVersion` is pinned** in the funnel overlay. Defaulting would have stamped it
  `lossResult@1` and pooled its analytics with sixteen other tools, the same mislabelling the
  royalty overlay exists to prevent.
- **The analytics server allowlist is now DERIVED** from `ALL_OPPORTUNITY_EVENT_NAMES` instead of
  hand-copied in `/api/lead-magnets/analytics`. The two lists had drifted apart by hand, so adding a
  client event left the server silently dropping it: a 200 response with the row never written.

### Brain package audit, same day

Answering "is the brain up to date" honestly meant auditing all 20 docs against the code rather than
just the three the feature touched. It was not up to date, and two findings predate this work:

- 🔴 **The fee docs contradicted each other, in the direction that misquotes an artist.**
  `01-PRODUCT-VISION.md` stated the founding-artist flat **5%** override as live and `Confirmed`,
  and `16-GLOSSARY.md` + `CRWN-BRAIN-QUICK-CONTEXT.md` repeated it, while `07-BUSINESS-RULES.md`
  correctly said it was retired. Read the code: `getArtistFeePercent()` returns the tier fee, full
  stop, nothing writes `is_founding_artist`, and no production row ever carried it. An agent loading
  the vision doc or either context pack would have quoted a discount that does not exist. All three
  corrected against the code.
- **"Zero automated tests" was repeated in six places** (`00-START-HERE`, `04-ARCHITECTURE`,
  `09-CODING-CONVENTIONS`, `12-ENVIRONMENT-AND-SETUP`, `15-AI-AGENT-INSTRUCTIONS`,
  `CRWN-BRAIN-COMBINED`) plus `13-CURRENT-STATE`. Vitest is configured and `npm test` runs 392 tests
  across 23 files. Corrected everywhere, **with the limit stated**: coverage is the pure business
  layers only, there is no component/integration/e2e test, so `npm run build` is still the gate for
  everything the suite does not reach. Also recorded that `npm run lint` is NOT a gate (~635
  pre-existing errors), which no doc had said.
- **Counts were stale by a third or more.** Actual: 241 API routes (docs said ~190), 134 migrations
  (117), 115 pages (~89). Fixed in every doc that quoted them.
- **The 18th tool and the `/tools` routes were missing** from `06-ROUTES` (which did not mention
  `/tools` at all), `16-GLOSSARY`, `18-SOURCE-MAP`, and both single-file context packs. Added, along
  with a new **§14 Opportunity modelling rules** in `07-BUSINESS-RULES` so the overlap rules sit
  where an agent actually looks before touching money copy.
- Commit refs on the three docs that carry one now point at `86e3e8c` instead of `614b958`/`38186b1`.

Lesson worth keeping: the same fact was duplicated by hand across up to seven docs, so one code
change left six of them lying. That is the documentation version of the analytics allowlist bug
fixed in this same commit. Prefer one doc owning a fact and the rest linking to it.

## 2026-07-27 — Flagship calculator polish: wizard entry, above-fold CTA, signup continuation, four campaigns

Final UX pass on the three flagship funnels so they feel like one product.

- **Streaming Loss now opens as a wizard** (Issue 1): cold `/worth` asks listeners, then followers,
  then streaming revenue, one screen at a time via the shared `Wizard` with a sticky CTA. Scoped to
  the calculator view: the homepage keeps its instant-number marketing behavior and a personalized
  lead link still arrives with the numbers filled in. After the reveal the full inputs card returns
  below, so live re-calculation and the presets are preserved.
- **CTA immediately under the result** (Issue 2): `/worth` renders the shared `ResultToBuilder` card
  right below the result, above the derivation, scrolling and focusing the builder. The tool pages
  already had this in the result hero.
- **Signup is a continuation, not a restart** (Issue 3): new `DraftContinuation` reads the anonymous
  draft through the EXISTING public capability route and renders, above the form: the opportunity
  they uncovered (stored as `opportunitySummary` on the draft) and a list of what they already built
  (four tiers, four campaigns, or the deliverable's own items), then the builder-specific reason.
- **Four Share-to-Earn campaigns** (Issues 6 and 7): one per canonical tier, each with a pre-written
  message, a copy button, and inline help describing what that tier actually includes, so an artist
  who skipped Streaming Loss still knows what they are sharing. `saveLabel` is now "Save my campaigns".
  **Share links are NOT fabricated**: referral links are `/[slug]/r/[code]` and need an artist slug
  plus a referral code, so the card states the link is generated with the account. Referral economics
  untouched.
- **Marketing tour removed from the calculator funnel** (Issue 8): 12 sections (storefront, go live,
  clip army, community, own your audience, independence, AI manager, payouts, analytics, sync, and
  the rest) are now gated to `homepage`. `/worth` keeps only calculator support: where the number
  comes from, the setup that captures it, what the CRWN app is, streaming vs direct, the fan math,
  FAQ, how it works, and the disclaimers.
- Issues 4 and 5 were already shipped in v282 (four prefilled canonical tiers; generated launch copy)
  and were verified rather than redone.
- Tests: 285 pass. Build clean.


## 2026-07-27 — Builders that feel already built: four-tier ladder, sticky CTA, signup context

The builders existed but still asked artists to do the work. Now the artist arrives at something
already built, and signup reads as "save what you built".

- **Streaming Loss now builds the FULL four-tier ladder** (was one tier, which broke continuity with
  the result that shows four). Names, prices and benefits come from `RECOMMENDED_LADDER`
  (`src/lib/tierTemplate.ts`) — the SAME canonical ladder Rise Mode Level 3 and the Tier Manager
  apply — so nothing is invented: The Wave (free) / Inner Circle / The Vault / Throne. One tier per
  Wizard step, then a ladder preview. Prices prefer the calculator's own modeled ladder, falling back
  to the template. `deliverableType` is now `membership_ladder`.
- **New `ladder` preview kind** renders all four tiers with prices and benefit lists.
- **Above-the-fold CTA:** `Wizard` gained an OPT-IN `stickyFooter` prop (default off, so `/setup` and
  every other caller are untouched). Both pre-signup builders enable it, so the primary action is
  always reachable without scrolling a long step.
- **Benefit-driven save CTAs:** Save my membership / campaign / session / Vault / test / experience /
  mission / page / calendar / journey / leaderboard / action plan / founding offer / scenario / plan,
  and Own Your Fans is now "Save my fan system". Configurable per spec, never hardcoded in components.
- **Builder-specific signup context:** new `signupContext` per spec, rendered on `/signup` from the
  existing `?tool=` param ("Create your account to save your membership system and publish it inside
  the CRWN app"). Read-only banner; no auth behavior changed. Every tool's reason is unique.
- **Share-to-Earn no longer starts blank:** the offer is an `OptionSelect` of the canonical ladder
  tiers (reusing `tierTemplate`, not a second tier source), plus prefilled sharing instructions, a
  plain-words referral explanation, and a launch message. Referral economics untouched.
- **Section audit (second pass):** the result-to-builder path was already minimal after the previous
  correction (result -> transition -> builder on the shared template; result -> derivation -> builder
  on /worth). No further sections needed removing; supporting content stays below the builder.
- Tests: 282 pass (was 274), including canonical-ladder prefill, ladder preview integrity, save-label
  and signup-context contracts, and Share-to-Earn defaults. Build clean.


## 2026-07-27 — The builder is the CTA: universal page-composition correction

Founder-verified defect corrected: the builders existed but the pages kept their old conversion
architecture (a signup CTA embedded in the result hero on all 16 shared-template tools; on /worth
the builder sat below five marketing sections and multiple book-a-call CTAs).

**Root cause was ONE shared slot:** `PublicToolClient` rendered `LeadEmailCta` (email gate + gold
signup link) in the result's `afterHero`, before the builder, on every tool. Fixed at the shared
layer, not per page.

- **New page order (all 16 tools + OYF):** result -> `ResultToBuilder` transition (tool-specific
  "Build my X", scrolls to and focuses the builder, never navigates) -> BUILDER -> email-my-results
  (consent-carrying `LeadCaptureForm`, demoted below) -> explore link -> ToolShowcase -> CrwnShowcase.
  Nothing routes to signup before the builder; the save boundary inside the builder is the only
  identity ask.
- **Spec-driven transitions:** `transition` + `buildCta` added to every deliverable spec
  (`transitionFor`/`buildCtaFor` derive defaults). Founder-approved copy on the priority tools:
  Worth "Turn this estimate into an offer your fans can join." / Share-to-Earn "...a campaign your
  fans can share." / Executive Producer "Turn this opportunity into a session offer."
- **/worth reorder:** result -> derivation ("How we got to $X/mo") -> builder -> inputs -> email
  card. The misleading "Book a free 15-min call, keep this money" CTA is REMOVED; the two upper
  marketing PrimaryCTA blocks are homepage-only; exactly one optional help CTA remains, reframed
  "Need help setting this up? A 15-minute call, no pitch." Formulas and values untouched. The
  homepage (`homepage=true`) keeps its original marketing flow (it has no builder).
- **`LeadEmailCta`** gained a `secondary` mode (email only, no signup link) for remaining call sites.
- **Structural tests** (`pageComposition.test.ts`): source-order assertions for the shared template
  and /worth, CTA-copy contract (no signup/account/booking words, no em dashes), priority-tool
  transitions. 274 tests pass. Build clean. `sw.js` v281.
- **Known limitations:** the tokenized share page (`/tools/[slug]/result/[token]`) still uses
  `LeadEmailCta` in default mode (it has no builder; flagged for a follow-up); no real-browser
  visual verification (bundle + structural tests only); OYF experiment variants untouched.

## 2026-07-27 — Universal pre-signup deliverable: every public tool now builds something before signup

**Defect corrected.** The previous Opportunity Funnel phases delivered architecture plus ONE exemplar
(Own Your Fans). Verified in code: `ConvertToFeatureButton.tsx:42` pushed `/signup` for every public
tool, `PublicToolClient.tsx:256` branched to a builder only for OYF, and `/worth` linked to `/signup`.
So **16 of 17 tools ended in Result → generic CTA → immediate signup.** The founder's report was
accurate; prior reports described infrastructure, not the product outcome.

- **New `src/lib/opportunityDrafts/deliverableSpecs.ts`** — a data registry of the pre-signup
  deliverable for all 16 non-OYF tools (fields, steps, preview shape, save label, continue route).
  One registry, not 16 bespoke builders.
- **New `src/components/opportunity/DeliverableBuilder.tsx`** — the universal builder: Wizard steps,
  editable prefilled fields, a LIVE preview (offer card / page / plan list), and a
  planning-vs-publishing checklist. Renders for every tool with a spec.
- **CTA behavior changed**: `PublicToolClient` now renders the builder instead of the signup button,
  and `/worth` gained the membership-offer builder above its CTA. Signup is requested only at the save
  boundary, with expectation-matching labels ("Save my offer", "Save my plan", "Save my campaign plan").
- **Drafts generalized**: `POST /api/opportunity-drafts` + `GET|PUT /[token]` now serve any tool with a
  spec (spec-driven allowlist sanitizer, unclaimed-only, 30-day expiry). No migration: still
  `lead_magnet_results`.
- **Restoration**: new `/plan/[tool]` authenticated page restores the artist's OWN saved draft under
  RLS and continues into the real gated builder carrying their edits via existing `lm_*` params. The
  journey resolver gained `savedDeliverableTool`, which wins over a calculator-derived prefill.
- **Honesty rules enforced by tests**: prices are pre-filled only where the tool actually modeled one
  (Founder Window and Clip-to-Earn start empty); Team Splits is an explicitly NON-BINDING scenario;
  Royalty stays a checklist with no currency field and no collection claim; Quest Path is labeled a
  general order, not a personalized diagnosis; every preview carries a "not published yet" note.
- Tests: `deliverableSpecs.test.ts` + updated journey/onboarding tests. **265 pass** (was 230). Build
  clean. `sw.js` v280. **Known gaps are listed in the implementation report** (per-tool formula audit
  and browser screenshots were not completed in this pass).

## 2026-07-27 — Admin: filter Video/Campaign performance by tool

Small launch-support add: the admin Experiments tab's "Video and campaign performance" section now
has an `OptionSelect` to scope it to a single tool (e.g. show only the Worth videos vs the Share-to-
Earn videos). `experiment-analytics` accepts `?tool=<slug>`, applied ONLY to the video/campaign
aggregation (every other section stays global so its numbers are not distorted). Reads
`funnel_events.calculator`; no new data. Motivated by a launch driving ~26 videos across Worth,
Share-to-Earn, and Executive Producer, where per-tool video attribution matters more than A/B power.
230 tests pass, build clean, `sw.js` v271.

## 2026-07-27 — Admin variant-results readout (save vs preview, honest)

Added a "Variant results" section to the admin Experiments tab so the save-vs-preview outcome is
readable in the UI, not just via SQL. `experiment-analytics` now returns `experimentBreakdowns`: per
variant, distinct-aid `exposed` vs the `signup_completed` outcome + conversion rate, plus the shared
`compareRate` insight (sample sizes shown, no winner below MIN_SAMPLE=30, directional language, no
fake confidence). New tested pure helper `distinctAidByVariant`. Reached-builder is labeled honestly
(signup + onboarding complete, a consistent point for both arms). Build clean, 230 tests, `sw.js` v270.

## 2026-07-27 — Close the experiment loop: variant-attributed OYF outcome

Live smoke test confirmed assignment/exposure record correctly, but the experiment was not yet
READABLE: exposure rows are anonymous (aid + variant, no user_id) and nothing re-fired post-signup,
so a variant could not be tied to its outcome. Fixed minimally.

- New `recordExperimentOutcome(experienceKey, eventName)` in `src/lib/experiments/client.ts`: re-sends
  the persisted `crwn_aid` from an AUTHENTICATED surface; the track route re-derives the variant
  (never trusted) and stamps `user_id` from the session, deduped per browser + server-side.
- Wired into `src/app/(main)/own-your-fans/plan/page.tsx` (the post-signup OYF landing): fires
  `signup_completed` once on resume. This is a consistent point for both arms (signup + onboarding +
  reached the builder), so save-vs-preview conversion is now comparable per variant.
- Inert when no experiment runs. No migration. Full suite 229 pass, build clean, `sw.js` v269.
  Readout is a SQL query over experiment_events (exposed vs signup_completed per variant); a variant
  breakdown in the admin Experiments tab is a recommended follow-up.

## 2026-07-27 — Make oyf-signup-timing-v1 runnable (variant moves the signup boundary)

Closed the one gap that kept the first split test from being runnable: the OYF pre-signup builder now
HONORS its assigned variant. `recordExperimentEntry` already returned the server-derived variant;
`PublicToolClient` now reads it and passes `signupBoundary` to `FanCaptureBuilder`.

- New pure module `src/components/opportunity/fanCaptureSteps.ts` (`visibleSteps(boundary)`, node-tested):
  control `save` = full flow (goal -> copy -> capture -> preview, then sign up: max value before signup);
  `preview` = the save boundary moves one step earlier (sign up to see/keep the finished page; the
  in-wizard preview is deferred to the post-signup plan page, so nothing built is lost).
- Default is `save` (control), so with no experiment running NOTHING changes. Authenticated resume
  (plan page) always uses the full flow. Variant is derived server-side; the client only reads it.
- The experiment stays dark until the migration is applied, `admin_settings.experiments` is on, and
  `oyf-signup-timing-v1` is set to running. Tests: `fanCaptureSteps.test.ts` (4). Full suite 229 pass,
  build clean, `sw.js` v268.

## 2026-07-27 — Opportunity Funnel launch-readiness audit (small corrections only)

Final integration/security/attribution/experiment audit of the whole Opportunity Funnel system
(4 parallel audits + full test suite). Security came back with NO critical/high issues; analytics,
experiments, and product-language passed all critical checks (several exemplary). Corrections were
small and clearly justified; material/structural items were documented, not changed.

**Corrections made:**
- **Quest Path honesty (copy-only, HIGH):** `execute()` returns a FIXED result (score 68, fixed
  ranges) and never reads the two inputs, but copy implied a personalized path. Reframed to the fixed
  reality: `primaryCta` "See the right order", review subtitle "see the order most artists get wrong",
  flow "Get the proven order to build in", fix "ordered the way careers actually compound"
  (`leadMagnets/registry.ts`, `acquisition/toolAdapters.ts`). No formula, no output logic, no Rise
  Mode change.
- **Own Your Fans ownership language (copy-only, LOW):** the OYF result `cause` said "you own none of
  the people... you rent them"; changed to "you own none of your relationships with the people... you
  rent access to them" (owning the relationship/first-party data, not people; CLAUDE.md rule).
- **Royalty result version mislabel (MEDIUM):** the funnel layer emitted `lossResult@1` for
  `royalty-readiness-check`, but its adapter stamps `readiness@1`, so every royalty analytics event
  was mislabeled. Added `resultVersion: 'readiness@1'` to the overlay (`opportunityFunnels/registry.ts`)
  + a regression test.
- **Two stale test counts:** `ACQUISITION_TOOL_IDS` 5 -> 17 (all tools onboarded); `ALL_OPPORTUNITY_EVENT_NAMES`
  23 -> 32 (7 + 16 + 9 events). Both reflect legitimate growth; the `toContain` checks still hold.

**Confirmed safe (no change):** no ungated admin route (`requireAdmin` on every method); no
open-redirect bypass (`safeInternalPath`); cannot read/claim another user's draft (unclaimed-only +
verified-email-only + atomic `user_id IS NULL`); no PII/token leak; sanitizer allowlist; deterministic
whole-experience assignment (no mid-journey switch); exposure≠eligibility; projection (`revealed`)
shown separately from actual (`captured`, refund-netted), never combined; experiments cannot override
pricing/fees/ownership/RLS (prebuilt code, no dynamic JSON).

**Documented known gaps (no code change; several are honestly disclosed via `dataQuality`):** two
destination resolvers (`journey/resolveJourneyDestination` for post-setup, `quests/destinationRegistry`
for claim-time) share gate logic by copy, not extraction (drift risk); `funnel_events` rows are not
per-visitor stitchable (`anon_id` is a per-event id, no `user_id`) so only `experiment_events` links
anon->auth; `sourceVideoId` dimension relies on `utm_content` (no independent video id); subscription
cancellations/churn are not modeled in the opportunity ledger (refunds ARE netted); rate-limit keys on
the left-most `x-forwarded-for` hop (spoofable, all public routes); unclaimed anonymous drafts persist
to their 30-day TTL (cleanup query in the value-before-signup entry); the `/results/resume` fetch works
only by matching the `[id]` route's token branch (fragile); `funnel.resultRoute` is dead + inaccurate;
promotion is code-only (no `admin_settings` override wired yet).

**Deferred to founder (unchanged):** apply the three unrun migrations (`funnel_events`,
`opportunity_ledger`, `experiments`) and verify production state; flip `admin_settings.experiments`
to run an experiment; keep the sensitive tools deferred (Team Splits, Royalty economics, Clip/Share
economics, Live pricing, Quest/Rise Mode). Full suite 225 pass, build clean, `sw.js` v267.

## 2026-07-27 — Onboard Fan Mission + Proof of Demand onto the journey resolver (batch of 2)

Incrementally onboarded the next smallest coherent batch onto the shared Opportunity Funnel
architecture: **Fan Mission Generator** and **Proof of Demand Test Builder**. Both are
production-ready, non-financial, non-ownership tools that already have a real builder and a
`live_feature` conversion adapter; they were the only unmapped tools that fit every selection gate.

- **What changed:** two explicit cases in `buildDraftConfig` (`src/lib/leadResults/postSetupDestination.ts`)
  via a new `liveFeatureDraft` helper that routes to the tool's existing builder (`/missions/new`,
  `/proof-of-demand/new`) and prefills from the SAME conversion adapter the same-session flow uses
  (new `adapterPrefill` export in `conversionAdapters.ts`). So a claimed Fan Mission / Proof of Demand
  result now resumes into the right builder after signup instead of the dashboard fallback.
- **No formula, output, route, or economics change.** Result versions unchanged (1.0.0). The tools
  were already in the registry + funnel layer + shared analytics + admin reporting from prior phases;
  this only adds the post-signup resume path. Explicit per-tool cases (not a generalized live_feature
  branch) so economics-sensitive `bounty`/Clip-to-Earn is NOT auto-onboarded.
- **Deferred (documented, still a safe dashboard fallback, not a dead end):** Team Splits (ownership +
  legal), Royalty Readiness (dark, sensitive), Clip-to-Earn + Share-to-Earn economics, Live/Exec
  pricing, Quest Path (dark + fixed output), Founder Window (financial urgency), Fan Journey / Movement
  / Top Fan (no meaningful builder or partial feature).
- Tests: `src/lib/leadResults/toolOnboarding.test.ts` (17) + OYF/Worth no-regression. Build + lint pass.
  No migration, no frontend asset change (no sw bump).

## 2026-07-27 — One post-signup journey resolver (opportunity context survives signup)

An artist who enters through a specific problem now keeps that context after signup. ONE reusable
server-side resolver decides where they land, composing the pieces that already existed instead of
scattering routing conditionals or building a parallel onboarding system.

- **Resolver:** `src/lib/journey/resolveJourneyDestination.ts` (pure, tested). Ordering: no artist row
  -> `/welcome`; setup incomplete -> `/setup` (setup wins, never bypassed); a claimed calculator ->
  its real prefilled builder via the existing `buildDraftConfig` (Own Your Fans -> `/own-your-fans/plan`,
  Streaming Loss -> `/offers/new`); otherwise the dashboard (safe, never a dead end or a broken quest
  route). `safeInternalPath` validates `returnTo` (rejects `//`, schemes, backslashes, control chars,
  overlong) to prevent open redirects.
- **Rise Mode:** stays behind `admin_settings.quest_engine`. When ON it only APPENDS
  `returnTo=/profile/artist` (Rise Mode surface); when OFF, no returnTo and the destination is the
  normal builder. The global flag is never modified and no hidden setting is exposed.
- **Wiring:** `GET /api/lead-results/post-setup-destination` now builds the context server-side (own
  artist row + `setup_completed`, most-recent claimed seed, quest flag) and runs the resolver. The
  experiment variant is re-derived server-side from an optional `aid` (never trusted from the client),
  so experiment assignment is preserved into the restored builder (`lm_variant`). `/setup` passes the
  durable `crwn_aid`. The OYF plan page emits the personalized-journey events and routes the next best
  action to the ownership-gated `/studio/fans`.
- **Analytics:** 9 events (`personalized_journey_assigned`, `context_restored_after_signup`,
  `onboarding_context_viewed`, `recommended_action_viewed/started/completed`, `feature_activated`,
  `feature_published`, `next_action_viewed`) on the existing sink, sanitized, no PII/tokens.
- No `/welcome`/`/setup`/role-promotion/publishing/payment changes. No migration. Tests:
  `resolveJourneyDestination.test.ts` (13). Build + lint pass. Live `sw.js` v266.

## 2026-07-27 — Holistic experience experimentation foundation + experience analytics (dark)

A feature-flagged foundation to compare COMPLETE Opportunity Funnel journeys (Own Your Fans vs
Streaming Loss), plus a new admin Experiments tab. Ships dark: nothing assigns or exposes a variant
until the migration is applied AND `admin_settings.experiments` is on AND an experiment is set to
running. No experiment can ever change pricing/fees/Stripe/ownership/permissions/RLS/roles/revenue,
because experiment BEHAVIOR is prebuilt code, never remote JSON.

- **Code registry** `src/lib/experiments/registry.ts` (experiences, variants, prebuilt experiment
  configs; `toPublicExperiment` strips hypothesis/metrics before the browser). `assignment.ts`
  (deterministic FNV-1a assignment: pure, stable, holdout-aware, no mid-journey switching, re-derived
  server-side so a client cannot pick its arm). `anonId.ts` (durable non-PII `crwn_aid` cookie +
  localStorage; bot exclusion). `taxonomy.ts` (versioned event map; `opportunity_captured` = ACTUAL,
  `opportunity_revealed` = PROJECTION, `thirty_day_retention` marked unavailable, never invented).
  `metrics.ts` (every metric has a definition). `insights.ts` (directional, sample-sized, no causal
  claims, no fake confidence, no winner below MIN_SAMPLE=30).
- **Migration (UNRUN):** [supabase/schema-phase2-experiments.sql](../../supabase/schema-phase2-experiments.sql)
  creates `experiments` (operational state) + `experiment_events` (measurement sink; service-role
  write, admin-only read RLS, dedupe_key, indexes, self-verify). Listed in TODO.md.
- **Routes:** `POST /api/experiments/track` (public, flag-gated, rate-limited, server-derives the
  variant, links to the authed user only from the session cookie, no PII/tokens, fail-safe).
  `GET|POST /api/admin/experiments` and `GET /api/admin/experiment-analytics` (requireAdmin; aggregate
  server-side from existing funnel_events/lead_magnet_events/opportunity_ledger + experiment_events,
  fail-safe on missing tables).
- **Admin UI:** new feature-flagged `experiments` tab -> `src/components/admin/ExperimentsView.tsx`
  (Experience / Funnel / Tool / Video-Campaign / Opportunity performance; insight cards; metric
  definitions; data-quality notes; projected shown SEPARATELY from actual captured; tool promotion
  status visible; pause/resume/complete controls). Reuses admin layout + Recharts.
- **Client:** `recordExperimentEntry` fires 'assigned' + 'exposed' for the OYF experience (inert
  unless an experiment runs). welcome/setup/auth/role-promotion untouched.
- Tests: `src/lib/experiments/experiments.test.ts` (19). Build + lint pass. Live `sw.js` v265.

## 2026-07-27 — Own Your Fans value-before-signup journey (build a fan page, then sign up)

An anonymous artist can now BUILD a fan-capture page after the Own Your Fans result and only sign up
at the save boundary ("Save my fan page"), so they arrive at signup with something they do not want
to lose. No new table, no migration: the anonymous draft reuses `lead_magnet_results` (status
`draft`, `lead_id`/`user_id`/`artist_id` NULL) and the EXISTING claim path.

- **Builder:** `src/components/opportunity/FanCaptureBuilder.tsx` (shared anon + authed). Wizard +
  OptionSelect + a live preview card mirroring the smart-link editor, plus an honest
  planning-vs-publishing checklist. Collects ONLY non-sensitive planning copy (goal, headline,
  subheadline, CTA label, capture type, optional http(s) link). Rendered after the OYF result in
  `PublicToolClient` (OYF only), replacing the bare post-calculator signup button.
- **Draft store + capability routes:** `src/lib/opportunityDrafts/ownYourFansDraft.ts` (bounded
  sanitizers + `isDraftToken`). `POST /api/opportunity-drafts` (public, rate-limited, no PII,
  server-recomputes the result) and `GET|PUT /api/opportunity-drafts/[token]` (public capability
  token; act ONLY on UNCLAIMED, unexpired rows; the UPDATE re-asserts `user_id IS NULL` to lose a
  claim race safely). localStorage (`crwn_oyf_draft`) mirrors for instant refresh; the server row is
  the durable truth.
- **Handoff:** "Save my fan page" -> existing `/signup?result=<token>` -> `user_metadata` token ->
  existing `autoClaimForUser`/`claimByRawToken` binds the row (idempotent, atomic on `user_id` null).
  `postSetupDestination` now routes OYF to `/own-your-fans/plan`.
- **Resume:** `src/app/(main)/own-your-fans/plan/page.tsx` reads the claimed draft under RLS
  (`owner_manage_lm_results`, owner-only, no token, no cross-user lookup), resumes at the exact step,
  and routes real publishing into the ownership-gated `/studio/fans`. `/welcome`, `/setup`, auth, and
  server-side role promotion are untouched.
- **Analytics:** 16 journey events (`anonymous_value_*` -> `feature_published`) on the existing
  `lead_magnet_events` sink, sanitized, never mirrored into `funnel_events`, never carrying a claim
  token or PII.
- **Retention:** abandoned anonymous drafts expire via `public_token_expires_at` (30 days) and are
  inert once expired (deny-public RLS, token unusable). Optional periodic cleanup:
  `DELETE FROM lead_magnet_results WHERE status='draft' AND user_id IS NULL AND public_token_expires_at < now() - interval '7 days';`
- Tests: `src/lib/opportunityDrafts/ownYourFansDraft.test.ts` (9). Build + lint pass. Live `sw.js` v264.

## 2026-07-27 — Shared Opportunity Funnel layer (phase 1); Own Your Fans migrated, Worth connected

Turned the public tools into a measurable, configurable funnel layer WITHOUT a new subsystem or a
migration. New `src/lib/opportunityFunnels/` assembles a typed `OpportunityFunnel` VIEW over the
existing registries (`LEAD_MAGNETS` + `EXTERNAL_TOOLS`) and layers only the dimensions they lacked:
lifecycle (`draft|internal|active|paused|archived`), promotion (`primary|secondary|none` + a
`promotionRank`, so priority is configurable and NOT permanently hardcoded), tool type, stable
`opportunityKey`, `toolVersion`/`resultVersion`, availability + auth boundary, feature flag (metadata
only), attribution channels, and internal-only fields stripped by `toPublicFunnel`. Resolution +
pure selection/order helpers (`getFunnelByToolKey`, `resolveFunnelByKeyword` with orchestrator-matching
`normalizeKeyword`, `selectActive`/`selectPublic`/`sortByPromotion`).

- **Own Your Fans** is marked **primary** (rank 0) via overlay; `opportunityKey: own-your-fans`;
  `recommendedNextRoute: /studio/fans` (the owned-CRM `AudienceTab`, the most repository-supported
  next surface; no dedicated builder exists so `builderRoute` stays null). Its formula and published
  result are UNCHANGED (still the loss-engine `lossResult@1`).
- **Streaming Loss / Worth** joins the metadata layer only (`opportunityKey: streaming-loss`,
  `secondary`, rank 1). Its `/worth` page, formulas, inputs, disclaimers, and CTA are untouched.
- **Analytics:** seven shared events (`opportunity_funnel_viewed|started|completed`,
  `opportunity_result_viewed`, `opportunity_recommendation_viewed`, `opportunity_cta_clicked`,
  `opportunity_builder_started`) on the EXISTING sink (`/api/lead-magnets/analytics` ->
  `lead_magnet_events`), added to its allowlist. They are NOT mirrored into `funnel_events`, so the
  existing 15-stage counts never double-count. `sanitizeOpportunityMeta` is an allowlist that strips
  email/phone/tokens/raw answers/financials (defense in depth on top of the server's column allowlist).
- **Wired (additive, defaults reproduce today's behavior):** `PublicToolClient` emits the funnel
  events alongside the existing beacons; `ConvertToFeatureButton` emits cta/builder; the tools
  directory now hides non-active/unsupported funnels and leads with promoted ones (all current tools
  default active + public, so only the ORDER changes and Own Your Fans surfaces first).
- Tests: `src/lib/opportunityFunnels/{registry,analytics}.test.ts` (20). No migration, no env var, no
  flag. Live `sw.js` v263.

## 2026-07-26 — Executive Producer seat price: $300 top band + "suggested" framing

Resolved the tool-vs-script price conflict by RAISING the calculator, not lowering the scripts (the
producer-kendrick/travis scripts price a seat at $300; a mega-artist charging $300 is more credible
than $200). Added an `audience >= 1M -> $300` band to `seatPrice` in `toolAdapters.ts` (the exec
adapter); all its copy reads `seatPrice` dynamically, so nothing else needed touching. The seat/ticket
price stays artist-set: the LivestreamManager price field now labels itself "Seat price — suggested for
your level / a starting point based on your audience, you set the final price" when it was prefilled
from the calculator (`ticketSuggested`), generic otherwise. Suggestions stay because the calculator
CANNOT project a dollar without a price assumption, and a blank price box is decision friction. Live sw.js v261.

## 2026-07-26 — P0: every artist page 404d (`profiles(*)` embed named a revoked column)

`/[slug]` (the public artist page, both its queries), `/[slug]/playlist/[id]`,
`/artist/[slug]/playlist/[id]`, and community `PostCard` all selected `profile:profiles(*)` /
`author:profiles(*)`. `profiles.email` and `.phone` have SELECT revoked from anon/authenticated, and
naming a revoked column 42501s the WHOLE embedded query, so PostgREST returned NO row and the page
called `notFound()` -> "Artist Not Found" for EVERY artist. No fan could view, subscribe, or buy.
Same class as the Stripe-id revoked-column outage; the fix there used a view for the base table but
left the `profiles(*)` EMBED unfixed. Proven from production with the anon key (view returns the row;
`profiles(*)` 42501s; explicit public columns return the row). Replaced every embed with an explicit
PUBLIC column list (`id, display_name, username, avatar_url, bio, social_links, is_active`; PostCard
adds `role`). Live `sw.js` v256.

## 2026-07-25 — Bridge the ManyChat funnel into funnel_events (video = the IG post)

The dashboard's funnel + "Highest Converting Video" only saw WEB traffic: the client beacon maps
utm_content -> funnel_events.video, but real leads come via IG comment -> ManyChat -> CRWN, handled
server-side and never loading that beacon. Their "which video" signal is `lead_sessions.source_post_id`
(the IG post/Reel), captured server-side but living in acquisition_events/lead_sessions, not funnel_events.

`src/lib/analytics/acquisitionFunnelMirror.ts` records the ManyChat funnel into funnel_events using the
post as the video dimension (creator -> referrer `ig:<acct>`, keyword -> campaign fallback). Wired at the
existing acquisition choke points: `lead_session_started` -> page_viewed (orchestration.ts, attribution
straight off the payload), `lead_result_generated` -> calculator_completed (resultGeneration.ts),
`lead_result_viewed` -> result_revealed (resultAccess.ts). Deduped by session/result id; fail-safe. Web
and ManyChat are disjoint (web has no lead_session), so no double counting. account_created stays covered
by the useAuth auto-claim path.

REQUIRES the ManyChat External Request to send `source_post_id` (IG post id) to the CRWN webhook, or the
video dimension stays null for those leads. `igFunnelDims` is the tested pure mapping.

## 2026-07-25 — Feature-specific continuation CTAs on every calculator

Replaced the generic post-result CTA ("Create your CRWN account and fix this", "Claim it on CRWN",
"Build this inside CRWN") with copy that names the exact feature: worth -> "Build My Membership",
share-to-earn -> "Turn On Share-to-Earn", executive-producer -> "Build My Executive Producer
Session", live-experience -> "Create My First Ticketed Live Event", vault -> "Build My Vault". Every
other calculator derives "Build My {featureName}" (with natural overrides for a few plurals/labels),
so a new calculator gets a feature-specific CTA for free.

- **Single source of truth:** `src/lib/leadMagnets/continuationCta.ts` — `continueCtaFor(slug)`
  (bespoke overrides + featureName-derived default) and `buildContinueUrl(slug, token)` (the EXISTING
  signup flow, `/signup?tool=&result=`). No new signup flow; the token handoff is unchanged.
- **Render sites rewired to the helper:** `ConvertToFeatureButton` (the one registry-driven CTA, so
  all 16 tools change at once), `LeadEmailCta` (new `ctaLabel` prop; web + tokenized result page,
  web claimHref now token-aware via buildContinueUrl), the tokenized result page `SignupCta`, the
  capture email `ctaLabel`, and both `/worth` continuation buttons.
- **Deliberately left alone:** `CrwnShowcase` / `IndependenceSection` — platform-wide showcases that
  list ALL revenue streams, not a single feature; and the `hero.primaryCta` "run the calculator"
  buttons. Only the true post-result continuation CTA changed.

Tests in `src/lib/leadMagnets/continuationCta.test.ts` (the five exact strings + every registered
calculator gets non-generic copy + the URL preserves context).

## 2026-07-25 — Lead Magnet Performance dashboard (admin)

The admin-facing surface over the funnel + opportunity analytics. New tab `leadmagnets` in
`src/app/admin/page.tsx` -> `src/components/admin/LeadMagnetsView.tsx` (admin-gated by the page's
role check; its data route re-checks admin server-side, so nothing is exposed publicly).

- **Data:** `GET /api/admin/lead-magnet-dashboard` reads funnel_events + opportunity_ledger and
  returns every tile: Views / Completions / Emails / Accounts, Activation Rate (accounts /
  completions), Builder Completion (published / opened), Revenue Opportunity Revealed + Captured
  (current month, so reveals are not summed across months), Top Calculator, and Highest Converting
  Source / Video / Campaign. Filters: date, campaign, calculator, artist (fetched once per window,
  filtered in memory so the filter-option dropdowns never collapse).
- **Pure aggregation** `src/lib/analytics/leadMagnetDashboard.ts` (tested): stage counts, the two
  rates, `conversionByDimension` (completion rate per source/video/campaign with a min-views floor
  so a 1-view/1-completion row can't top the chart), `calculatorPerformance`.
- **Video dimension added:** funnel_events gained a `video` column (utm_content), wired through the
  recorder and the analytics mirror, so "Highest Converting Video" is real. (Amended the still-
  unapplied funnel migration; no second migration.)
- **UI:** responsive (cards reflow 2->6 cols, recharts in ResponsiveContainer, the per-calculator
  table scrolls on mobile), reuses the FunnelView card/pill/chart patterns. Tests in
  `src/lib/analytics/leadMagnetDashboard.test.ts`.

## 2026-07-25 — Opportunity tracking (revealed / activated / captured / remaining)

Tracks the DOLLAR opportunity a calculator revealed through its lifecycle, per artist per FEATURE
per month. Distinct from the funnel event counts below: this is a money ledger.

- **Table:** `opportunity_ledger` (`supabase/schema-phase2-opportunity-ledger.sql`, UNRUN, TODO.md).
  Grain (artist_id, feature, period_year, period_month) UNIQUE = the dedup guarantee. Columns:
  revealed_cents / captured_cents / remaining_cents / activated + calculator + dimensions. Artist
  reads own, admin reads all.
- **Pure core** `src/lib/analytics/opportunity.ts` (fully tested): `FEATURE_BY_CALCULATOR` maps the
  five calculators onto THREE disjoint features (worth+vault -> membership, live+exec -> live,
  share -> referral); `revealedByFeature` dedups per feature with MAX (two calculators describing
  the same money are never summed); `computeRemaining` = max(0, revealed - captured);
  `capturedFromEarnings` sums net revenue per feature and nets refunds back onto the ORIGINAL
  payment's feature (grouping by type alone would strand refunds and overstate captured).
- **Captured is real money, from disjoint ledgers so it never double-counts:** membership = artist
  net `earnings` type='subscription' (already referral- and fee-netted), live = earnings
  live_ticket + live_tip, referral = `referral_earnings.commission_amount` (the referrer's cut that
  was netted OUT of subscription earnings). Monthly, refund-adjusted.
- **Recompute** `src/lib/analytics/opportunityLedger.ts` `recomputeArtistOpportunity(db, artistId)`:
  reveals (from claimed results) + captured (this month) + activated (real state: a live tier / a
  live session / referral rate > 0) -> upsert the current-month rows. Idempotent.
  `refreshAllOpportunities` does it for all artists with a claimed result.
- **Triggers:** on `builder_published` (the funnel beacon recomputes that artist); read-time for a
  single ?artistId in the rollup; and a daily refresh piggybacked on the `outcome-measure` cron (no
  new cron, per the Hobby cap).
- **Reporting:** `GET /api/admin/opportunity` rolls up revealed/activated/captured/remaining by
  feature, calculator, artist, month, and year.

Tests in `src/lib/analytics/opportunity.test.ts` (feature map, max-dedup, remaining floor, refund
netting, totals).

## 2026-07-25 — Complete lead-magnet funnel analytics

One canonical funnel store for the whole acquisition funnel (page view -> mission completed),
deduped and dimensioned for dashboards. It does NOT replace the two existing event tables
(`lead_magnet_events` append-only log, `acquisition_events` IG outbox); it unifies the funnel.

- **Table:** `funnel_events` (`supabase/schema-phase2-funnel-events.sql`, UNRUN, in TODO.md). Columns:
  `stage` (CHECK of the 15 canonical stages), the five dimensions `calculator`/`campaign`/`referrer`/
  `artist_id`/`occurred_at`, plus `user_id`/`result_id`/`anon_id`/`metadata`, and `dedupe_key`
  (UNIQUE) for "no duplicate events". Admin-read RLS, service-role write.
- **Recorder:** `src/lib/analytics/funnelEvents.ts` — `FUNNEL_STAGES`, `recordFunnelEvent(db, input)`
  (upsert ON CONFLICT (dedupe_key) DO NOTHING; fail-safe, never throws; no-ops pre-migration),
  `buildFunnelRow` (pure, tested). The dedupe_key is namespaced by stage and defaults to a random
  uuid so inherently-repeatable stages never collapse while a retried beacon of one occurrence does.
- **Instrumentation (server-side, each stage once):**
  - Stages 1-7 (page/started/completed/revealed/signup) are MIRRORED from the EXISTING client beacon:
    `/api/lead-magnets/analytics` maps the lm event -> stage via `LM_EVENT_TO_STAGE`; `trackLeadMagnet`
    now stamps a per-occurrence `eventId` (dedup key) and `document.referrer`.
  - Email Submitted: capture route. Assumptions Changed: recalculate route (dedup on result+values).
  - Account Created + Email Verified: auto-claim route (dedup per user). Setup Completed:
    complete-setup route (dedup per artist). Builder Opened: post-setup-destination route.
    Rise Mode Started + Mission Completed: quests route (reuses quest completions).
  - Setup Started + Builder Published: a new authenticated beacon `POST /api/funnel/track`
    (identity from session, never body) called from the setup page and the two builders.
    Client helper `src/lib/analytics/trackFunnelClient.ts` (separate file so node:crypto never
    bundles into a client component).
- **Reporting:** `GET /api/admin/funnel-events` (admin-only) rolls up per-stage counts + breakdowns
  by calculator/campaign/referrer over a date range. Distinct from `/api/admin/funnel` (the existing
  artist activation-milestone funnel), which is untouched.

Tests in `src/lib/analytics/funnelEvents.test.ts` (stage guard, dedup key, fail-safe).

## 2026-07-25 — Lead magnets ARE the first Rise Mode mission

A calculator an artist completed now becomes their personalized first mission, generated through the
existing Action Plan architecture (no new quest/mission system). `src/lib/leadResults/leadMagnetMissions.ts`
is the single shared generator both surfaces read from:
- `LEAD_MAGNET_MISSIONS` maps the five builder-mapped calculators to concrete titles: worth -> "Build
  Membership", executive-producer-session -> "Create Your First Executive Producer Session",
  share-to-earn-planner -> "Turn On Share-to-Earn", live-experience-calculator -> "Schedule Your First
  Ticketed Live", vault-revenue-planner -> "Launch Your Vault".
- `buildLeadMagnetMissions(db, {userId, artistId})` reads EVERY claimed result (via new
  `getClaimedResults` / `rowToSeed` in handoffSeed), keeps one mission per completed calculator
  (newest), ranks by monthly opportunity (worth's dollar is `conversionPayload.netMrrCents`; loss tools
  use `estimatedMonthlyCents`), and each mission's CTA is the prefilled builder URL from
  `postSetupDestination`.

Wiring:
- `/api/action-plan` Rule 0 now emits one recommendation per completed calculator: the top is `high`
  (the personalized FIRST mission), the rest `medium`. Title carries the dollar, e.g. "Build Membership
  ($1,200/mo)".
- `/api/quests` returns the top mission as `leadMagnet`, and RiseMode's banner (above "Your next move")
  renders it as the starting mission with its value. Existing quests/board untouched; degrades to null
  when no calculator was completed.

No migration, env var, or flag. Tests in `src/lib/leadResults/leadMagnetMissions.test.ts`.

## 2026-07-25 — Pre-built draft configs from calculator results (honest scope)

Extends the routing below from a thin prefill to a fuller, auto-generated DRAFT the artist edits and
publishes. Nothing persists until they publish; the two draft-until-publish builders (Offer Builder,
LivestreamManager) are the only homes. A builder audit drew the line between what is a real draftable
field and what is not, and the code respects it rather than faking features:

- **Real drafts (pre-filled, editable):** Membership entry tier (name/price/benefits), the Vault tier,
  the referral share step (on, 20%), a ticketed live/producer session (title, ticket price,
  submissions), and the producer session's `max_slots` (limited room = 20).
- **Suggestions, NOT drafts (because the field does not exist):** the full 3-tier membership ladder
  (Free caps live paid tiers at 1, so only the entry tier is drafted; the rest, with the calculator's
  real projected supporter counts, links to the Pro Tier Ladder builder), the live tip goal (needs a
  live session, commits immediately, dark-launched), replay (records automatically, gated post-hoc),
  and Vault release cadence (no scheduler exists; timing is per-track in Music).

Mechanics: `src/lib/leadResults/postSetupDestination.ts` now centers on a tested pure
`buildDraftConfig(seed) -> { path, prefill, suggest }`. `prefill.*` -> editable `lm_*` fields the
builders hydrate; `suggest.*` -> `lm_suggest_*` guidance the new `CalculatorSuggestions` card renders
(mounted under the prefill banner in both builders). Payloads enriched to carry the real numbers:
worth adapter now emits the `ladder` (price + projected subs per tier, 70/22/8), live adapter emits
`suggestedTipGoalCents`. Tests in `postSetupDestination.test.ts` lock the draft/suggestion boundary.

No migration, env var, or flag. Public result-page CTAs untouched.

## 2026-07-25 — Post-onboarding routing: land in the builder, not the dashboard

Extends the handoff below. When setup finishes, the wizard no longer hardcodes `/profile/artist`.
It asks `GET /api/lead-results/post-setup-destination`, which reads the artist's most recent
claimed calculator result and maps it to the matching builder, PREFILLED. Null (no calculator, or
an unmapped one) falls back to the dashboard, so nothing regresses.

The five calculators collapse onto two real builders (there is no dedicated Referral/Vault/Live
route; they are steps/modes inside these two):
- **`/offers/new`** (Offer Builder): Streaming Loss -> Membership (`grow-supporters` goal, price =
  the calc's implied ARPU netMrr/payers), Vault -> the `vault-access` goal (The Vault tier + price),
  Share-to-Earn -> subscription + the share step turned on.
- **`/studio/live`** (LivestreamManager): Live Experience -> ticketed live ($15), Executive
  Producer -> ticketed live + submissions on, seat price banded to audience.

Mechanics, reusing the existing `lm_*` prefill convention (Missions/PoD/Bounties already do this):
- `src/lib/leadResults/postSetupDestination.ts` is the pure map (tool_slug -> path + `lm_*` params).
  It invents nothing: prices come from each result's `conversionPayload`. Two adapters were enriched
  to carry their real number: live-experience (`ticketPriceCents: TICKET`) and executive-producer
  (`ticketPriceCents: seatPrice`, `acceptsSubmissions`).
- Both builders gained a one-shot prefill `useEffect` reading `window.location.search` (Offer
  Builder presets the goal + jumps past the picker; LivestreamManager opens the form like
  `runItAgain`), and both mount `CalculatorPrefillBanner` ("We already filled this out using your
  calculator.").

Public result-page CTAs (`conversionTarget`) were deliberately left untouched: the routing lives
only in the post-setup path, so blast radius is onboarding, not the marketing pages. No migration,
env var, or flag. Tests in `src/lib/leadResults/postSetupDestination.test.ts`.

## 2026-07-25 — Lead-magnet handoff: the storage-free bridge into the app

The persistence already existed. `lead_magnet_results` has stored every field the calculators
produce (inputs, outputs, generator/formula version, tokens) since the lead-magnet + acquisition
schemas landed, and `claimResult` already bound an anonymous result to a verified account without
ever duplicating an artist. The gap was SURVIVAL: the only thing carrying a result through
signup was `localStorage['crwn_claim']`, redeemed by `ClaimRedeemer` only after setup finished.
That loses the result on a different device, in incognito, or with a cleared cache, and the WEB
calculator path (raw `public_token`) had no claim at all, so a web signup never attached anything.

The bridge, all server-side, no browser storage as a dependency:

- **`autoClaimForUser(userId, {email, token})`** in `src/lib/leadResults/resultAccess.ts` sits
  next to `claimResult` and reuses its safety rules. Two durable keys: (1) a token carried
  through signup in Supabase `user_metadata` (resolves BOTH the hashed acquisition token and the
  raw web `public_token`), and (2) a **verified-email match** across `lead_magnet_leads` and
  `lead_identities`. Only ever anchored on the auth side's VERIFIED email, so binding a
  self-entered lead email to it is safe. Every write touches only unclaimed rows and is
  idempotent; it re-runs to backfill `artist_id` after `/welcome`.
- **`POST /api/lead-results/auto-claim`** derives user + verified email + metadata token from the
  SESSION (never the body), rate-limited, burns the one-shot token.
- Triggered fire-and-forget from `useAuth` (both session-establish paths) and from
  `ClaimRedeemer`. `/signup?result=|token=` carries the token into `user_metadata` via `signUp`,
  which also finally makes the long-dead capture-email CTA work.
- **Feels started:** `getLeadMagnetSeed` (`src/lib/leadResults/handoffSeed.ts`) reads the claimed
  result back into a display shape. The always-on **Action Plan** leads with it (loss-framed) and
  the dark-launched **Rise Mode** shows a banner above "Your next move".
- The numeric opportunity is now persisted INTO `result_data` (`estimatedMonthlyCents` /
  `estimatedAnnualCents`, set by `buildLossResult`) so the handoff leads with a real figure.

No migration, no env var, no flag: it runs on columns/tables the live acquisition engine already
uses, and every path fails safe. Tests in `src/lib/leadResults/handoff.test.ts`.

## 2026-07-24 — P0: a revoked column had silently killed every Stripe flow

Found while chasing why the hamburger showed artists the fan menu. That was one symptom.

`schema-phase2-stripe-id-column-privs.sql` revoked SELECT on `stripe_connect_id`,
`platform_stripe_customer_id` and `platform_stripe_subscription_id` from `anon` and
`authenticated`. Correct, and it stays. What nobody accounted for is **how Postgres refuses**:
naming one revoked column fails the ENTIRE statement with `42501`, and PostgREST applies the
same rule to **embedded joins**. A query does not come back missing a field, it comes back as
**no row at all**, so every caller reads "not found" and fails closed while looking healthy.

Verified against production with the anon key before changing anything (a control query proves
the probe works, per the RLS-canary discipline):

| Query | Result |
|---|---|
| `artist_profiles?select=slug` | 200, row |
| `artist_profiles?select=slug,stripe_connect_id` | **42501** |
| `subscription_tiers?select=id,artist:artist_profiles(slug,platform_tier)` | 200, row |
| `subscription_tiers?select=id,artist:artist_profiles(stripe_connect_id)` | **42501** |

**Money in, all of it, dead:** `/api/stripe/checkout` ("Tier not found", no subscriptions),
`track-checkout`, `product-checkout`, `live-checkout`, `live-tip-checkout`.
**Money out and setup, all of it, dead:** `/api/stripe/connect` ("Artist not found", so no artist
could connect Stripe at all), `connect/status` (reported not-connected for connected artists),
`balance`, `cashout`, `login-link`, `create-price`, `platform-portal`.
**Three screens rendered empty:** `PayoutDashboard`, `PlatformBilling`, `MonetizationRoadmap`.

Fix: `src/lib/stripe/connectAccount.ts`, a service-role helper that is now the ONLY way these
ids are read. The ownership check stays where it was, on the user session; only the secret moves
server-side. This generalizes the pattern `booking-checkout` had already worked out alone.

Still exposed on purpose: `src/app/team/[id]/page.tsx` reads `profiles.stripe_connect_id` from
the browser. It works only because `schema-phase2-profiles-column-privileges.sql` is unapplied.
Flagged in TODO.md against that migration.

## 2026-07-24 — Public artist page opens on Music, and the hub stopped trusting profile.role

- **Default tab on `/[slug]` is now Music, not Movement** (`ArtistProfileContent`). A fan who
  lands on an artist page came for the songs. Movement asked them to care about the artist's
  campaign before they had heard anything. Returning from checkout still lands on Tiers.
- **`AccountHub` derives artist-ness from the `artist_profiles` row, not `isArtist()`.** The
  whole slug/plan/Stripe fetch was gated on `profile.role`, which lags a token refresh. When the
  context still said `fan`, the slug never loaded, so the identity header fell back to the email
  line and **"View as fan" never rendered** for someone who plainly is an artist. Same class of
  bug the `(main)` gate and `useArtistSetup` already guard against. The context is now only a
  placeholder while the row is in flight.

## 2026-07-24 — The artist dashboard's 16-tab strip became 15 real screens

Josh compared CRWN to the Lyft driver app: an identity header, collapsed accordion groups, and
sub-screens that open with an X in the top left that puts you back in the menu. He was right, and
the reason it mattered is that CRWN had **three competing artist hubs** (AccountHub, `/studio`,
and the `/profile/artist` tab strip), one of which was quietly broken.

- **`/profile/artist` is now Rise Mode and nothing else.** It was 16 lazy tabs behind a horizontal
  scroll strip. On a phone, tabs 8 through 16 (Sync, Profile, Albums, Shop, Billing, Tiers,
  Payouts, Referrals) sat past the edge of the screen.
- **Bug this inherited and fixed:** the page only honored **7 of its 16** `?tab=` values from the
  URL and silently fell through to `activeTab = 'rise'` for the rest. 102 internal links pointed
  at `?tab=`, and the biggest groups were dead: `?tab=payouts` (15 links, including the account
  menu's own "Payouts and tax"), `?tab=profile` (6), `?tab=tracks` (5), `?tab=analytics` (5),
  `?tab=livestreams` (5), `?tab=referrals` (4). All landed on Rise Mode. `?tab=live`,
  `?tab=community`, `?tab=bookings` and `?tab=upgrade` were linked but were never tabs at all.
- **Three surfaces, one job each.** Bottom nav = do the work (Studio is back in the artist's 3rd
  slot). Hamburger `AccountHub` = manage the business (`/account/*`). `/studio` = the toolbox
  (`/studio/*`). Explore, Messages and Library deliberately stayed on the tab bar: Lyft can hide
  everything because the driver's actual job is the map underneath, and CRWN's equivalent of the
  map is discovery and the fan inbox.
- **`HubPage`** (`src/components/layout/HubPage.tsx`) is the shared shell: X in the top left,
  artist gate, artist context. `?from=hub` on a link means the X returns to the hamburger, via a
  one-shot sessionStorage flag (`requestHubReopen`) that `Navigation` consumes on the next
  pathname change. A query param would have been simpler but pulls `useSearchParams` into the
  layout, forcing every static page under it into a Suspense boundary. Without `from=hub` the X
  is a plain `smartBack`, which is what keeps Rise Mode CTAs returning to Rise Mode.
- **Why it is now instant.** The tabs were already lazy, so the cost was never parsing: it was
  that a tab's chunk downloaded **at tap time**, behind a spinner, because nothing was a route
  and nothing could be prefetched. AccountHub and the Studio grid now use `<Link prefetch>`, so
  chunks arrive while the menu is on screen. `useArtistContext()` caches the `artist_profiles`
  row at module scope, so splitting one page into 15 did not turn one query into 15.
- **Legacy links.** `src/lib/dashboardRoutes.ts` holds `TAB_ROUTES`; `/profile/artist` redirects
  through it carrying every param except `tab` (notification rows hold
  `?tab=payouts&earning=<id>`). All 98 in-repo `?tab=` links were rewritten to point directly at
  the new routes, so only history pays the redirect hop.
- **The old 27-step dashboard tour was deleted.** Every step targeted a `[data-tour="tab-*"]`
  element that no longer exists. Replaced with a 6-step orientation tour: Rise, Studio, the
  hamburger, view-as-fan.
- The overlay sits at `z-45`, under the nav's `z-50`, so the bottom tab bar and desktop sidebar
  stay visible and tappable while the menu is open.

## 2026-07-24 — The app was slow because three surfaces did work that never needed doing

Josh reported the site loading slowly, worst on Home and worst of all on Rise Mode. Diagnosed
against the code, then measured in production. Nothing here was an N+1 or a missing index. Every
cause was **redundant or serialized work**, which is why it never showed up as one slow query.

- **Rise Mode / `/api/quests`** (runs on every load AND every tab switch, and the route loops its
  cascade up to 12 times per load):
  - `ensureRoleQuests` called `assignQuest` for all ~72 templates every time. Each call costs 3+
    round trips (open check, completed check, prereq check) before concluding it has nothing to
    do. Now it reads what the user already holds in ONE query and only assigns what is missing:
    ~200 queries down to 1 on a settled account. `assignQuest` keeps its own guards, so the
    prefilter is an optimization, not the correctness boundary.
  - `refreshQuests` evaluated every open quest sequentially. `evaluateCondition` is read-only, so
    the read phase is now concurrent. **Writes stay sequential on purpose**: `completeQuest` does a
    read-modify-write on the shared `user_progression` row, so parallel completions would lose XP
    grants. Progress-percent writes hit distinct rows and share nothing, so those batch.
  - `reconcileXp` did a select-then-insert per completed quest. It is a self-heal for a historical
    bug, so on a healthy account every lookup found nothing. One ledger query now.
  - `safeEvaluate` isolates a throwing quest condition. Previously one bad quest rejected the whole
    sequential pass and blanked the board.
- **Home:** every load called `/api/stripe/connect/status` through `useArtistSetup`, which does a
  live `stripe.accounts.retrieve()` plus `backfillTierPrices`. An external API round trip in Home's
  critical path, for a "Finish setup 2/4" pill that never reads the value. The hook now takes
  `withStripe` (default OFF) and only the setup wizard pays for it. The featured grid also selected
  `*, profile:profiles(*)` for 50 artists to render 12 tiles; narrowed to the five fields shown.
- **Artist dashboard bundle:** the page opens on Rise Mode but statically imported all 16 tab
  managers, so the browser downloaded and parsed the charts, upload widgets, calendars and the whole
  shop editor before Rise could paint. Every tab except Rise is now `next/dynamic`. Tabs were
  already render-gated by `visitedTabs`, so behavior is unchanged.
- **Explore** (measured after the above shipped: 2.7s cold, ~0.95s warm): eight sequential round
  trips, most of them independent of each other. Now three waves.
- **`artist_profiles.featured_hidden`** (`supabase/schema-phase2-featured-hidden.sql`): removes ONE
  artist from Featured + the Explore browse list without deactivating them. Previously the only
  lever was `profiles.is_active = false`, which kills the whole account. They stay findable by
  SEARCH. **The migration REBUILDS `artist_profiles_public`** because that view enumerates its
  columns at creation time, so a new base-table column stays invisible to it until rebuilt, and the
  app reads the view. The self-verify asserts the column reaches the view AND that the rebuild did
  not re-expose the three Stripe id columns. App code queries the flag separately and tolerantly so
  it survives the pre-migration schema; verified in production (200, full list) before the column
  existed.
- **Royalty Readiness is now reachable from Rise Mode**, not only the Studio tile. Josh looked in
  Rise, which is correct: Rise is the guided path, Studio is the tool hub. Deliberately NOT a quest
  template, because coupling two separately dark-launched features makes each harder to launch alone.

## 2026-07-23 — profiles was leaking every user's email to the public internet

Found while chasing a much smaller problem (12 accounts whose public `display_name` was their
signup email). Probing production from OUTSIDE with the public anon key showed the real issue:
`GET /rest/v1/profiles?select=*` returned **all 68 profiles including `email`**, plus 5 real
`phone` numbers. The anon key ships in every browser bundle, so this required no login.

- **Cause.** `schema.sql` created `"Profiles are viewable by everyone" ON profiles FOR SELECT
  USING (true)`. That is correct for the PUBLIC columns, since an artist's `display_name` and
  `avatar_url` have to render on their page. But `profiles` later grew private columns by
  ALTER TABLE (`email`, `phone`, `full_name`, `stripe_connect_id`, `is_approved`,
  `last_active_at`, `onboarding_nudge_sent_at`) and every one inherited "viewable by everyone".
- **Why RLS was never going to fix it.** RLS filters ROWS, not COLUMNS, and the rows really are
  public. This is a column-privilege problem. The identical fix already exists one table over:
  `artist_profiles.stripe_connect_id` returns 42501 to anon. That hardening was done once and
  never applied to `profiles`.
- **Fix.** `supabase/schema-phase2-profiles-column-privileges.sql` revokes the table-level SELECT
  from `anon` and `authenticated` FIRST (a column grant is a no-op while a table grant stands),
  then re-grants only the public columns. `authenticated` additionally keeps the tour/onboarding
  booleans the client UI needs. Self-verifies with `has_column_privilege` for both roles.
- **The one code change that mattered:** `useAuth.fetchProfile` did `select('*')`, which would
  have started returning 42501 for every logged-in user the moment the grant was narrowed. It now
  selects an explicit column list. A user's own email comes from the Supabase session
  (`user.email`), which is where it should have been read from all along. Nothing else in the
  browser reads `email`/`phone`/`full_name` (every such read is a server route on the
  service-role client, which is not subject to grants).
- **Still open, deliberately:** a fan's chosen `display_name` remains anon-readable. That is a
  design question (community bylines, chat authors, and leaderboards render it) rather than a
  leak, so it was not bundled into this fix.

## 2026-07-23 — Royalty Readiness Check: CRWN starts noticing money the artist already earned

Everything CRWN did before this answered one question: **how much NEW revenue can an artist create
from their audience?** This is the first piece of the second question: **how much revenue have they
already earned and never collected?** Streaming pays badly, but an artist who is not registered
with a PRO, has never registered their songs, and has never heard of SoundExchange is also failing
to collect money that already exists. Nobody in the artist's stack tells them: the distributor
reports masters, the PRO reports only what the PRO collected, and no one reports the gaps.

- **Royalty Readiness Check (dark-launched).** Page `(main)/royalty-readiness`, route
  `/api/royalty-readiness`, scorer `src/lib/royalty/readiness.ts`, table `royalty_readiness`
  (`supabase/schema-phase2-royalty-readiness.sql`), flag `admin_settings.royalty_readiness`, off by
  default, same pattern as the quest, pop-up and live-tips engines. Twelve questions across
  ownership / registration / collection, a 0-100 coverage score, and a ranked action list.
- **The hard constraint, and the reason it is a score and not a dollar figure.** CRWN cannot verify
  a single answer. A precise "you are owed $14,200" from unverifiable self-reported inputs is a fake
  royalty statement, so the output is coverage plus a checklist and the copy says "not confirmed" /
  "nobody is set up to collect this", never "you are owed". `buildLossResult` already had a `score`
  mode for exactly this class of tool; the same reasoning applies in-app.
- **Scoring rules that matter.** Publishing questions are SKIPPED for an artist who does not write,
  rather than scored as failures, so a performer is not shown gaps that are not theirs. `unsure`
  scores as uncovered but yields a "find out" action rather than a "set this up" action. An
  unregistered backlog is an INVERTED question (yes is the risky answer) and is the only item with
  a real clock on it, because back claims are not open forever.
- **CRWN diagnoses, it does not collect.** Every action points outward (ASCAP/BMI, the MLC,
  SoundExchange, an administrator) with no affiliate relationship and no preference. Whether that
  becomes referral revenue is a founder decision, and it changes what the list means.
- **`PopupContext` now carries `featureFlags`.** An announcement pop-up for a dark-launched feature
  must gate on that feature's own flag, not just `popup_engine`, or flipping the engine announces
  something the user cannot reach. Both owed announcements are now written and safe:
  `announce_live_tips` and `announce_royalty_readiness`. New announcements must add their flag to
  `ANNOUNCEABLE_FLAGS` in `src/app/api/popups/route.ts` or the gate is `false` forever.
- **Deliberately NOT built:** the Unclaimed Royalty lead magnet (ships only after the in-app check
  is live, so the tool points at something real), per-song registration tracking, and a composition
  record separate from the recording. The last one is the real prerequisite for anything split-sheet
  shaped, and it must never be collapsed into Team Splits: a CRWN revenue share is a payout
  arrangement, not copyright ownership.

## 2026-07-23 — Live Tips + Tip Goals, and the LIVE lead magnet

CRWN had **no tipping primitive of any kind**. The only money paths into a live were the
subscription tier gate and the pre-sale ticket, which blocked six requested live features at once
(tip goals, biggest-tipper badges, tip-leader queue sorting, revenue-by-minute, live challenges,
tip-goal sponsors). Tipping was therefore built first, ahead of the flashier backstage/FaceTime work.

- **Live Tips (dark-launched).** `live_tips` + `live_goals`
  (`supabase/schema-phase2-live-tips.sql`), checkout at `/api/stripe/live-tip-checkout`, board at
  `/api/live/tips`, `handleLiveTip` + `settleLiveGoals` in `webhookHandlers.ts`, UI in
  `LiveTipBar` (viewer + broadcaster) and `LiveGoalsEditor` (artist), shared helpers in
  `src/lib/live/tips.ts`. Reads `admin_settings.live_tips`, off by default, same pattern as the
  quest and pop-up engines. A tip is a one-time Connect charge in the same shape as a ticket:
  pending row at checkout, flipped to `paid` by the webhook, and only paid tips move the bar.
- **Three traps worth remembering.** (1) A tip carries `live_session_id` just like a ticket, so the
  webhook must match `metadata.type === 'live_tip'` BEFORE the ticket branch or the ticket handler
  swallows it. (2) `earnings_type_check` did not list `live_tip`; the earnings handlers return early
  on a failed insert, so without widening it every tip would be charged and never reach payouts.
  (3) Money columns and `reached_at` are frozen in BEFORE UPDATE triggers, not an RLS `WITH CHECK`,
  so the artist's tip-moderation policy cannot self-approve a payment.
- **Goal unlocks announce themselves in the live chat**, posted as the artist at tier rank 99, so
  the payoff happens on stream rather than in a dashboard.
- **Live Experience Calculator** (`live-experience-calculator`, DM keyword `LIVE`): the 15th
  acquisition tool, ticketed-live angle, registered in `leadMagnets/registry.ts` +
  `acquisition/toolAdapters.ts` with a bespoke charcoal-and-gold hero. Its math and its fix use
  ONLY shipped features (ticket, tips, recording-as-replay). **Standalone post-show replay sales
  and brand sponsorship are deliberately excluded from both** because neither exists in CRWN.
  Sibling of `executive-producer-session`, which sells one seat in the room at a high price; this
  one sells the show itself at volume.

## 2026-07-18 to 2026-07-22 — Backfill: the loss-revelation lead magnet build-out, Founder Window, and two production fixes

**Written 2026-07-23 as a catch-up.** These 20 commits shipped without a brain update, which is a
process failure, not a code one: the `doc-sync-reminder.sh` Stop hook only *reminds*, it does not
gate, so a long run of feature commits drifted. Recorded here so the brain is not silently wrong.

- **The lead magnet system became the acquisition front door.** It grew from 4 tools to 16, all
  running through ONE engine (`src/lib/acquisition/lossResult.ts` `buildLossResult`). Each tool is
  an adapter in `toolAdapters.ts`; a registry entry with `usesLossEngine: true` makes the web
  clients render from that same adapter, so the web page and the DM show an identical result from
  one model. New tools across the window: Founder Window, Movement Page, Fan Journey, Top Fan
  Leaderboard, Quest Path, Supporter Promise, Team Split, Share-to-Earn, Executive Producer
  Session, Own Your Fans, Live Experience.
- **Two integrity rules were learned the hard way and now govern every tool.** (1) Every `fix` must
  point to a CRWN feature that ACTUALLY exists; the audit found one gap (Founder Window), which was
  then built rather than removed from the copy. (2) The result must deliver the dollar the DM hook
  teased. Tools that required `direct_fan_revenue_cents` returned $0 for a cold lead, so
  Supporter Promise and Team Split were switched to project from `social_followers` like the rest.
- **Result presentation was rebuilt twice.** Loss pages now lead with a bold gold dollar hero plus
  stat tiles, carry a `derivation` infographic showing how the number is built, and put the email
  and signup CTAs above the fold. `cause`/`consequences` prose is intentionally NOT rendered (it
  repeated the hero) but stays on the params for storage. Two renderers exist and BOTH need any new
  section kind: the tokenized result page and the web tool client.
- **Share-to-Earn model correction (Josh caught it).** Referral conversions come from the NEW reach
  the sharers create, not a flat percentage of the artist's own followers. Funnel is now
  sharers x reach-per-sharer x conversion x $10.
- **Email capture was broken for every loss tool** and is fixed: the capture route called
  `generateResult`, which throws for `usesLossEngine` tools, so the emailed result never sent.
  Tools also gained email-only `emailInsights` (a computed cost-of-waiting plus a tailored move).
- **Founder Window shipped as a real feature** (see the feature map row): cap, deadline, and
  `is_founder` marking, enforced in checkout on both free and paid paths.
- **Two production fixes on 2026-07-22.** Artists could not save their profile at all (42501: the
  `artist_profiles` UPDATE policy's `WITH CHECK` subqueried Stripe-id columns whose SELECT had been
  revoked from `authenticated`; the freeze moved into a BEFORE UPDATE trigger). And `handle_new_user()`
  was seeding a new user's PUBLIC `display_name` with their signup email. **Both fixes are
  migrations that were still unrun as of 2026-07-23**, so the underlying breakage is live until
  Josh applies them.

## 2026-07-17 — Pop-up Engine, account hub, and interruption governors

A batch of engagement/nav work, all built around one principle: the platform must NOT overkill
the user. Every surface that interrupts a user now passes a frequency governor.

- **Pop-up Engine (dark-launched).** A governed in-app interruption layer. Catalog lives in code
  (`src/lib/popups/registry.ts`), server logic + governor in `src/lib/popups/index.ts`, API at
  `src/app/api/popups/route.ts`, client host `src/components/popups/PopupHost.tsx` mounted in
  `(main)/layout.tsx`. Governor: **at most one pop-up shown per user per calendar day**, plus each
  pop-up's own frequency cap (`once` / `max N` / `everyN days`), plus role/stage targeting.
  Dark-launched exactly like the quest engine: reads `admin_settings.popup_engine`, the API echoes
  `enabled`, the client renders nothing when off. Migration:
  `supabase/schema-phase2-popup-engine.sql` (adds `popup_events`, `popup_survey_responses`, seeds
  the flag OFF). Copy is loss-framed, no em dashes.
- **Pop-up surveys** are a pop-up `kind` (1-5 rating + feedback). Answers → `popup_survey_responses`;
  a score of 1-2 emails the founder the feedback (the "what to fix first" signal).
- **Broadcast + notification governors.** `api/messages/broadcast` gained a daily cap (5/day) on top
  of the hourly 10; `api/notifications/notify-subscribers` gained a daily cap (8/day) on top of the
  5/min burst. Both return loss-framed 429 copy (a muted fan is a lost fan).
- **Account hub (hamburger).** New `src/components/layout/AccountHub.tsx`: a Lyft-driver-style
  full-screen menu (identity header + "View as fan" + plan/upgrade pill + accordion sections)
  reached from a top-left hamburger. **Profile was removed from the bottom tab bar** and now lives
  here; the freed 5th slot is **Rise Mode** for artists / **Library** for fans (`Navigation.tsx`).
- **Fan CRM is now its own route** `/studio/fans` (wraps `AudienceTab` + a Back to Studio control),
  no longer a dashboard tab deep-link. The Studio "Fan CRM" card and the hub point at it. The
  ownership-guarded `/api/audience` is unchanged.
- **Home cleanup.** The two identical "?" icons collapsed into ONE `home-help` control: a setup
  progress pill while an artist has steps left, else a single Getting Started link. The tour replay
  moved into the hub ("Replay the app tour" → `/home?tour=1`). The static welcome subtext is now a
  **rotating daily line** (`getDailyWelcome`, deterministic per calendar day).

## 2026-07-15 — Founding-artist fee/AI promo killed at the source

Founder call: the partner-code 5%-fee promo (and its incidental Pro-level AI access) is dead. It reused the retired founding-artist plumbing and would have fired the first time an influencer converted an artist.

- **The one writer removed:** `metadata.founding_artist = 'true'` in `platform-checkout`. That was the ONLY code path that ever set the flag (`founding_number` was never set, so the original 50-spot webhook branch was already dead). With the writer gone, `is_founding_artist` is permanently false.
- **Dead readers deleted** rather than left as latent landmines: the 5% branch in `getArtistFeePercent` (it now returns the tier fee, unconditionally), and the "founding → Pro access" clause in all three AI-manager surfaces (`cron/ai-manager`, `ai-manager/generate`, `AiManagerCard` + the `isFoundingArtist` prop and the profile-page state that fed it).
- **Kept, because it is the influencer program, not the promo:** the partner-code branch still records attribution (`partner_code_used`, `acquisition_source='partner'`), creates the `artist_referrals` row + `recruited_by`, and grants the 1-month Stripe trial. It just no longer touches the platform fee. Artists pay their plan's normal fee (12% Free / 8% Pro) from day one.
- **Inert residue, left on purpose:** `FoundingBadge` renders behind `artist.founding_artist_number`, which nothing sets, so it never shows. Cosmetic, not behavioral; not worth public-profile render surgery.
- Zero artists ever carried the flag in production, so nothing changed for anyone live.

## 2026-07-14 — The legal pages now state the fees the code actually charges; founding artists retired

The **artist agreement** (a document artists accept) said **Starter = 8%** while `getArtistFeePercent` charges **12%**: a contract term wrong in the direction that hurts the artist. It also said Pro was $50/month ($9.99) and Label 6% at $150 (5%, $99, not sellable). `/terms` repeated the same fiction ("standard fee is 8%, reduced to 6% for Label").

- **Founder call (2026-07-14): the code is correct, the documents bend to it.** Free **12%** / Pro **8%** at **$9.99/mo**. Fixed in `(public)/artist-agreement`, `(public)/terms`, and the Stripe guide.
- The Label row was **deleted** from the fee schedule rather than corrected: it is spec-only and not sellable, and listing it in a contract implies an artist can buy it.
- **Founding Artist program retired** (founder call, same day). Every user-facing mention removed. Zero artists ever carried the flag in production, so nobody was affected.
- ⚠️ **Still live in code:** the partner-code promo (**5% fees for 3 months**, `platform-checkout:132` → `webhookHandlers:1529`) deliberately *reuses* `is_founding_artist` to get the fee reduction. It is unadvertised and currently unused, and it cannot render the Founding badge (that needs a `founding_artist_number` the partner path never sets). Awaiting a keep/kill call in `TODO.md`. **Do not delete the founding fee path without deciding this**, or the influencer program silently loses its closing discount.
- **Rule:** a legal page must state what the code does. Do not render it from a live constant either, or a code change silently rewrites the contract artists agreed to.

## 2026-07-14 — A deploy is not an outage: the error boundaries were mislabelling a routine deploy as a crash

Reported as "site not loading, says something went wrong" on the homepage and the featured
artist page, which then stopped on its own. Production was never down. It was a **stale-deploy
chunk error**: a deploy had gone out ~1h earlier, and an open tab still held HTML pointing at
the previous build's content-hashed JS chunks. Fetching one 404s, throwing `ChunkLoadError`,
which trips the nearest error boundary. `chunkReload` then hard-reloads once and the next load
is clean, which is why it "fixed itself."

- **The defect was the presentation, not the recovery.** All three boundaries only tested
  `isChunkLoadError` inside `useEffect`, so the crash screen **painted first** and the reload
  fired a tick later. Every deploy therefore flashed "Something went wrong" at anyone mid-session.
  It convinced the founder the site was down; a visiting artist would conclude the same and leave.
  That puts it on the acquisition surface, not in the cosmetics pile.
- **Fix:** the check now runs during **render**, so the first paint is a quiet "Updating to the
  latest version" screen (`src/components/shared/AppUpdating.tsx`). The genuine crash copy is
  reserved for genuine crashes.
- **`global-error.tsx` was also missing `<html>`/`<body>`**, which Next requires because that
  file *replaces* the root layout when it renders. It is now inline-styled end to end: it cannot
  depend on `globals.css`, since the layout it replaces is what imports it.
- **Boundary coverage:** only `(main)`, `(auth)` and the root `global-error` exist. `(public)`
  and `[slug]` (artist profiles) have no route-level boundary and fall through to `global-error`,
  which is the path this bug came in on.

## 2026-07-14 — Influencer commission is 1% of artist REVENUE (founder rule), and it was paying 5x

Founder rule: **influencers earn 1% of the referred artist's revenue**, negotiable per influencer. The code was paying a percentage of something else entirely.

- **The bug:** `cron/recruiter-recurring` held a private price map (`pro: 5000, label: 17500, empire: 35000`) and fed it straight into `stripe.transfers.create()`. Pro is **$9.99**, so a 10% recurring commission on a Pro artist would have wired **$5.00/mo against an artist paying $9.99** (5x), Label 1.77x. It had been logged in TODO.md as a P2 "harmless dead code" item. **It never fired** (no recurring payout has ever run; no qualified referrals exist), so nothing needed clawing back.
- **The rule now:** commission base is `earnings.net_amount` (what the artist keeps, the same basis Team Splits uses) summed over the **previous calendar month**. Refunds are negative rows and net out; a net-negative month pays 0, with no clawback. Rate defaults to **1%**, overridden per influencer via `recruiters.partner_recurring_rate` (legacy column name, now applies to every recruiter).
- **Plan gates removed.** The old "artist must be on an active paid plan" and "partners earn nothing on Pro artists" rules assumed the commission came out of the artist's SaaS fee. A revenue share is funded by the platform fee (Free 12%, Pro 8%), which exists on every plan.
- **Also fixed:** the summary emails were rebuilt by a second pass that re-derived every amount and re-applied none of the skips, so a recruiter could be emailed about money that was never sent. They now report what was actually transferred. Earnings reads are paginated (PostgREST caps at 1000 rows, so a busy artist's month would have silently underpaid).
- **Copy:** `/partner`, `/recruit` and the getting-started guide were selling the fiction ($69 Pro, Label $175, Empire $350, "10% on Label+"). Rewritten to the real deal.
- **Rule:** never hardcode a price or fee in a route. Derive from `TIER_PRICING` / `TIER_LIMITS`. A "harmless dead constant" that feeds arithmetic is not harmless.

## 2026-07-14 — All four unsigned webhooks now verify signatures (HIGH-1 closed)

`webhooks/resend`, `outreach/webhook`, `outreach/inbound`, `sms/webhook` accepted a POST from anyone and wrote via the service-role client. See `11-SECURITY-AND-PRIVACY.md` HIGH-1. Verified with hand-rolled HMAC (`src/lib/webhookSignatures.ts`) against Twilio's and Svix's official test vectors. All fail closed. Needs three Resend signing secrets in Vercel (in `TODO.md`).

## 2026-07-14 — Internal self-calls hit Vercel's auth wall, silently

`cron/ai-manager`, `admin/agent/{briefing,autonomous,execute}` and the RLS canary built base urls from `req.nextUrl.origin` / `VERCEL_URL`. Inside a Vercel cron both resolve to the `*.vercel.app` **deployment** origin, which sits behind Vercel Authentication (custom domains are public, deployment urls are not). That wall answers **every** path, `/api/*` included, with an **http 200 and an html login page**, so the self-calls did not fail loudly: they "succeeded" with html and the work never happened. It also made the RLS canary email a false LEAK alert about its own front door. One hardcoded `PUBLIC_ORIGIN` (`src/lib/publicOrigin.ts`) now. Two of the routes also had `(A || B) ? C : D` precedence bugs that made the `NEXT_PUBLIC_SITE_URL` fallback unreachable.

## 2026-07-11 — Rate limiter fixed (every unauthenticated route was fail-closed)

`check_rate_limit(p_user_id)` is typed `uuid`, but unauthenticated routes have no user id and key on a string like `ip:1.2.3.4`. Postgres could not cast it (`22P02`), the RPC errored, and `checkRateLimit` discarded the error, so `data === true` evaluated `false`. An errored limiter was indistinguishable from a denial, and **every visitor got a 429 on their first request**.

- **Was broken in production:** `/api/support` (support form), `/api/partner/apply` (partner applications), `/api/lead-magnets/capture`, `/api/lead-magnets/email`. All four are unauthenticated and top-of-funnel. Authenticated routes pass a real uuid and were never affected, which is why this went unnoticed.
- **Fix (`src/lib/rateLimit.ts`, no schema change):** hash any non-uuid key into a stable uuid so it buckets like a real one (verified against prod: allows exactly `max_requests`, then denies); log RPC errors instead of swallowing them.
- **Note:** the limiter still fails CLOSED on an RPC error (unchanged semantics, so money routes are not weakened), but it now logs loudly. `check_rate_limit` has no checked-in migration; its signature was recovered by probing production.

## 2026-07-11 — Lead Magnet system (4 tools)

Added a config-driven Lead Magnet system (branch `claude/rise-mode-full-journey`). One typed registry (`src/lib/leadMagnets/registry.ts`) drives all tools; adding a tool = one config + one deterministic generator, no new pages.

- **Tools shipped (4):** Vault Revenue Planner (`vault-revenue-planner`), Proof of Demand Test Builder (`proof-of-demand-test-builder`), Fan Mission Generator (`fan-mission-generator`), Clip-to-Earn Campaign Planner (`clip-to-earn-campaign-planner`).
- **Routes:** public `/tools` + `/tools/[slug]` (SSG shells, `(public)` group); protected `/artist/tools`, `/artist/tools/[slug]`, `/artist/tools/saved` (middleware `protectedPaths` gains `/artist/tools`; `tools` added to `knownRoutes`).
- **Shared engine:** reuses `Wizard` + `OptionSelect`; deterministic versioned generators (`resultGenerators.ts`, `GENERATOR_VERSION`); preview-gated result renderer; consent-correct public lead capture; save/email/share; conversion adapters that PREFILL the live builders (Proof of Demand, Missions, Bounties read `lm_*` params, one-time seed, their own validation/payout logic untouched). Vault degrades to a saved plan by design.
- **APIs (`/api/lead-magnets/*`):** `capture` (public, IP rate-limited, server-recomputes the result), `results` + `results/[id]` (owner-scoped CRUD, public read by high-entropy token), `email` (recipient-locked, suppression-checked), `analytics` (field-allowlisted sink), `admin` (aggregates only).
- **DB:** `supabase/schema-phase2-lead-magnets.sql` (**APPLIED 2026-07-11**) adds `lead_magnet_leads`, `lead_magnet_results`, `lead_magnet_events` with RLS (owner-manage + admin-read) and a self-verify block. Distinct from `crm_contacts`/`fan_contacts`/`fan_events`.
- **Verified in production:** end-to-end capture writes the lead + result, recomputes server-side and mints a token; token read returns 200, no token 401, wrong token 404 (no leak). Smoke-test rows were deleted afterward.
- **Out of scope preserved:** the existing `/worth` "money left on the table" calculator is untouched.
- **Follow-up:** builder->result "converted" callback (marking a result `converted` after the builder creates the record) is not yet wired; no `/admin` Lead Magnets tab yet.

## v1.0 — 2026-07-10 (initial generation)

- **Generated:** 2026-07-10
- **Repository:** CRWN (`thecrwn.app`), Supabase project ref `ecpqtuidtsncjfwtkvwc`
- **Git branch:** `master`
- **Git commit:** `614b9582b2e5c456837fcd0c5cfc42b1d3194bac` (`614b958` — "Dropdowns for multi-option selectors; notification polish; Rise Mode return-to")
- **Repository status at generation:** working tree had unrelated uncommitted changes (mostly Windows `:Zone.Identifier` / Dropbox attribute sidecar files, plus edits to video-script and SQL notes). **No application source was modified to produce this documentation** — the CRWN Brain only adds files under `docs/crwn-brain/`.

### Method
Documentation was produced by static analysis of the repository at the commit above: reading source, routes, ~190 API handlers, 117 `supabase/*.sql` migrations, config, and the repo's own docs (`CLAUDE.md`, `CODEBASE.md`, `DEV_RULES.md`, `PRD.md`, `CRWN_Kickoff_Brief.md`). Evidence was gathered by parallel read-only exploration agents across domains (database, auth/security, payments, features, integrations, design/conventions, current state) and cross-checked against direct file reads. No code was executed, no migrations applied, no external API called, no production data touched.

### Files created (23)
`00-START-HERE.md`, `01-PRODUCT-VISION.md`, `02-FEATURE-MAP.md`, `03-USER-ROLES-AND-PERMISSIONS.md`, `04-ARCHITECTURE.md`, `05-DATABASE.md`, `06-ROUTES-AND-USER-FLOWS.md`, `07-BUSINESS-RULES.md`, `08-DESIGN-SYSTEM-AND-UX.md`, `09-CODING-CONVENTIONS.md`, `10-INTEGRATIONS.md`, `11-SECURITY-AND-PRIVACY.md`, `12-ENVIRONMENT-AND-SETUP.md`, `13-CURRENT-STATE.md`, `14-ROADMAP-INFERRED.md`, `15-AI-AGENT-INSTRUCTIONS.md`, `16-GLOSSARY.md`, `17-OPEN-QUESTIONS.md`, `18-SOURCE-MAP.md`, `CRWN-BRAIN-COMBINED.md`, `CRWN-BRAIN-QUICK-CONTEXT.md`, `CHANGELOG.md` (this file).

### Certainty labels
Statements are marked `Confirmed`, `Strongly inferred`, `Unclear`, `Not found in codebase`, or `Needs founder confirmation`. No secrets or secret values were included; env vars are referenced by name only.

### Key reconciliations baked in
- **Pricing:** code (`TIER_LIMITS`) is authoritative — Free 12% / Pro $9.99 8% / $99 `label` spec-only / `empire` dead. `PRD.md`, `schema-platform-tiers.sql`, and `recruit/page.tsx` all carry stale/contradictory pricing.
- **AI provider:** DeepSeek (+ narrow OpenAI), not "Moonshot/Kimi" as PRD says. `@google/genai` is unused by the app.
- **Booking:** live flow is booking tokens; the Calendly components are orphaned.
- **Onboarding:** `/welcome` → `/setup` wizard (PRD's tour/action-picker flow is stale).

### Known documentation limitations
1. **Schema is not fully reconstructable from the repo** — `earnings`, `referrals`, `referral_earnings`, `fan_payouts`, `processed_webhook_events`, `recruiters` have no checked-in CREATE TABLE migration; their columns are described only from later ALTERs. A production `pg_dump` is needed for completeness.
2. **Security audit sampled, not exhaustive** — the 195-file `SUPABASE_SERVICE_ROLE_KEY` surface was reviewed across every risk category, not line-by-line for all files. No leak found in anything reviewed; a full sweep is a reasonable follow-up.
3. **Env var equality unverifiable** — whether `NEXT_PUBLIC_CRON_SECRET == CRON_SECRET` in production (which determines exploitability of HIGH-2) could not be checked without Vercel access.
4. **Runtime-only facts unverified** — e.g. whether body text renders Inter vs a fallback, and whether subscription downgrades actually apply on Stripe's side, were reasoned from static code and flagged, not observed at runtime.
5. **Dynamic ranking/algorithm logic** (Explore/Home feed ordering) was not deeply traced.
6. Reflects a single commit; drift begins immediately. Update this changelog + the affected docs after each behavior/architecture change.

### How future agents should update the CRWN Brain
- After a feature/change: update `02-FEATURE-MAP` (status), `05-DATABASE` (schema), `07-BUSINESS-RULES` (rules), `13-CURRENT-STATE`, and any doc whose claims changed. Re-check certainty labels.
- Append a new dated `## vN` section here with the new commit hash, what changed, and any new limitations.
- If a statement in the Brain becomes stale, fix it in place and note the correction — stale docs caused several of the reconciliation issues found during this generation.
- Keep `CRWN-BRAIN-COMBINED.md` and `CRWN-BRAIN-QUICK-CONTEXT.md` consistent with the numbered docs when you edit them.
