# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stock tier ladder — Bronze / Silver / Gold / Platinum

The recommended four-tier ladder is **Bronze (free) / Silver ($10) / Gold ($25) / Platinum ($100)**,
renamed from The Wave / Inner Circle / The Vault / Throne on 2026-07-30. Every surface that builds
tiers for an artist (the setup wizard's free entry point, Rise Mode Level 3, the /worth calculator,
the calculator result email, the unified opportunity model, the offer builder goals) uses these
names. `src/lib/tierTemplate.ts` (`RECOMMENDED_LADDER`) is the source of truth: change a name there,
not in a component.

**Strategy documents propose their own tier names. Those are ROLES, not the ladder.**
`CRWN_UPDATED_RELEASE_STRATEGY.md` and similar specs say things like First Listen, Inner Circle,
Executive, and Vault. Those describe what a rung DOES in a membership strategy; they are not
names to ship. Map them onto the four rungs and keep the rung names:
Free/entry → **Bronze**, first paid ("First Listen"/"Vault") → **Silver**, mid ("Inner Circle")
→ **Gold**, top ("Executive"/"Throne") → **Platinum**. Artists may rename their own tiers
whenever they like; that is their choice, not a default. `src/lib/tierTemplate.test.ts` pins the
names and prices, so drift fails `npm test` instead of reaching an artist.

- The internal keys stay `wave | inner_circle | vault | throne`. They are referenced across the
  calculators, drafts and offer builder, and renaming them moves data for no artist-visible gain.
- Each rung carries `legacyNames`. The ladder's "already added" check matches those too, so an
  artist who applied the old ladder is not offered a duplicate tier. **Never drop a legacy name.**
- "The Vault" survives as a FEATURE name (the Vault Revenue Planner, the monthly vault unlock, the
  artist's private archive). It is no longer a tier name: the vault lives in the Gold tier.

## Membership strategy + content classes (release strategy spec, 2026-08-01)

`src/lib/membershipStrategy.ts` is the pure, tested brain for the release strategy
(`CRWN_UPDATED_RELEASE_STRATEGY.md`). Vocabulary is strict: **platform plan** (Launch/Pro/Scale,
what the artist pays CRWN), **membership tier** (Bronze/Silver/Gold/Platinum, what fans buy),
**membership strategy** (Release Club / Vault Membership, how the tiers are run), **content
class** (free forever / paid first / member only, how one piece of content is gated).

- The strategy pick is DETERMINISTIC (`recommendStrategy`) and derived on read by
  `/api/artist/strategy`, roadmap-style: nothing derived is stored. The only stored value is the
  artist's override (`artist_profiles.membership_strategy`, migration
  [`supabase/schema-phase2-membership-strategy.sql`](supabase/schema-phase2-membership-strategy.sql),
  APPLIED and live-verified 2026-08-16; the fail-soft path stays as a guard). Surfaced by `StrategyCard`
  on `/account/tiers`, where the ladder it describes is edited (it left Rise Mode on 2026-08-13:
  see "Rise Mode is ONE next move").
- The spec's tier names (First Listen, Inner Circle, Executive, Vault) are ROLES a strategy
  assigns to rungs; the rung names stay Bronze/Silver/Gold/Platinum (pinned by
  `tierTemplate.test.ts`). A strategy's `tierRoles` may never carry a `name` field.
- **Content classes are the ONE track access control.** `fieldsForClass()` derives
  `is_free`/`allowed_tier_ids`/`public_release_date`; `classifyTrack()` reads them back. Never
  set those fields directly in a form: the old independent toggles could produce a future date
  with an empty tier list, which the gate reads as LOCKED FOR EVERYONE (members included) for
  the whole window. `paid_first` keeps `is_free: true` (that is what makes "public later" real)
  and degrades to free when no tiers are selected. Editing a mid-window paid-first track keeps
  its existing date, or every unrelated edit would silently extend the window.
- **`can_play_track` is the ONE oracle, and it reads the WINDOW, not just `is_free`.** Because
  `paid_first` keeps `is_free: true`, the old `IF t.is_free THEN RETURN true` handed anonymous
  readers the audio for a members-first track's whole window (`tracks_public` serves
  `audio_url_*` on that boolean and is granted to `anon`, so `/api/tracks/[id]/stream` signed a
  URL and `/embed/[trackId]` passed its own `is_free` guard). Fixed by
  `schema-phase2-early-access-window-enforcement.sql`. "Inside the window" is defined EXACTLY as
  `classifyTrack` defines `paid_first`: future `public_release_date` AND a non-empty
  `allowed_tier_ids`. A future date with NO tiers stays public on both sides, because treating it
  as a locked window is the lock-out bug above. Never add a second window check in a route: the
  window belongs to the oracle, and every playback path already reads it through the view.
- **Early-access DAYS come from `tier_benefits.config.days_early`, never from a positional
  constant.** That value is what the fan is shown (`getBenefitDisplayText`), it is per-tier, and
  the artist can edit it, so it is what the scheduler must execute. `LADDER_EARLY_DAYS` in
  `waterfall.ts` is the FALLBACK for a tier carrying no `early_access` benefit. `waterfall.test.ts`
  asserts displayed promise == scheduled opening for every rung, so drift fails `npm test`.
- **The release waterfall NEVER touches the entitlement gate.** "Higher tiers first" stores a
  schedule in `tracks.waterfall` (`src/lib/waterfall.ts`, migration
  `schema-phase2-track-waterfall.sql`), and the daily scheduled-releases cron ADDS each tier to
  `allowed_tier_ids` when its entry comes due. Additive only: a scheduler bug can open a tier
  early or late, never lock a paying member out. Stagger order is PRICE order (artists rename
  tiers); malformed entries open immediately rather than stranding a paid tier. Do not implement
  per-tier windows inside `can_play_track` or any gate; the schedule-mutates-fields approach is
  the deliberate design.

## UX Rule — multi-option selectors are DROPDOWNS

Whenever a screen asks the user to pick ONE option from several (campaign goal type,
mission type, offer type, product type, signal type, unlock type, etc.), render it as
a DROPDOWN (a single collapsed control that expands a list), not a grid/stack of all
options at once. Use the shared `OptionSelect` component in `src/components/ui/OptionSelect.tsx`.
Exception: a genuine 2-option binary toggle can stay as two buttons (a dropdown for two
choices is worse). This applies to new code and when editing existing selectors.

## UX Rule — flows started from Rise Mode return to Rise Mode

When a creation flow is launched from Rise Mode (the CTA carries `?returnTo=...`), its
exit/X/back controls and its on-success redirect must return the user to that `returnTo`
(Rise Mode), NOT a hardcoded route like /studio. Read returnTo from the URL and honor it;
fall back to the old route only when returnTo is absent. Use `smartBack(router, fallback)`
for back/X controls so they return to the actual previous page.

## Copy Rule — lead with the LOSS, not the gain

Artist-facing marketing copy (lead magnet heroes, tool cards, landing pages) must be framed
around **what the artist loses by not doing it**, not what they gain by doing it. Loss aversion,
not upside. Gain-framed: "One clear mission beats 'please support me.'" Loss-framed (correct):
"'Please support me' is why your fans do nothing." Name the cost of inaction (money not earned,
fans not converted, reach going to someone else) first, then the fix.

### CTAs are loss-framed too, but only where the tool can back it

Extended 2026-08-25. The rule above already governed heroes and landing pages, and every lead
magnet headline complied. The CTAs did not, so they do now: calculator hero buttons, carousel
caption CTAs, and nurture email CTAs all lead with the cost of not acting.

Three things decide whether a given CTA can actually take a loss frame, and "when possible" is
real: a forced loss frame is worse than an honest gain frame.

- **The hero CTA IS the wizard submit label** (`PublicToolClient` reuses it), so it has to read as
  "press this to get your result". `conversionContract.test.ts` pins it to
  `/^(See|Plan|Build|Generate|Show|Find)\b/` and under 45 characters. A slogan will not fit.
- **A CTA may only promise a number the tool actually produces.** `artist-quest-path` outputs an
  ORDER, not a cost, so "see what the wrong order costs" would sell a figure it never computes.
  Builder tools (`proof-of-demand-test-builder`, `fan-mission-generator`,
  `clip-to-earn-campaign-planner`) keep their action labels for the same reason: the loss lives in
  their headline, which is where it belongs.
- **Post-result ACTION buttons stay actions.** `cta.publicPrimary`, `cta.artistPrimary`,
  `continuationCta.ts` labels ("Build My Vault", "Email my plan") and the nurture navigation labels
  ("Reopen my result") describe what the click does. Loss-framing a confirm button makes it vague,
  and the persuasion already happened in the headline and the result.

Carousel captions are the one surface where BOTH ends are loss-framed and it is machine-checked;
see the coverage guard in `fanEconomyCarouselContract.test.ts`, which exists because a first pass
converted one batch and silently left 21 other carousels gain-framed.

## Brand Imagery — flat vector poster art, dark + gold, artists aged 18-32

**Every image generated for the app or for an email is a FLAT VECTOR POSTER ILLUSTRATION**
(founder decision, 2026-08-15, replacing the previous cinematic-photography rule). Bold geometric
colour blocks, a near-black silhouette figure with a few sculpted flat highlight planes, radiating
sunburst rays, concentric arcs and repeating dot rows, hard vector edges. **No gradients, no
photographic texture, no realism, no soft shading, no 3D, no drop shadows.**

- **Palette is exactly five**: near-black `#0D0D0D`, deep charcoal `#1A1A1A`, warm gold `#D4AF37`,
  amber `#E8A33D`, burnt orange `#C2571A`, on a predominantly near-black background so the art sits
  on a dark page. Do not introduce a sixth colour, and do not drift to bright red-orange: that
  fights the gold CTAs and reads as a second brand.
- **No text, letters, numbers, logos or watermarks inside the image, ever.** The page supplies the
  words. A model that renders type will render it wrong.
- **Anyone shown is a Black (African American) hip hop or R&B artist reading age 18 to 32.** State
  the age explicitly in the prompt or the model drifts middle-aged.
- **Gender mix is roughly 65% male / 35% female across the set, not per image.** The artist base is
  expected to run about 65/35, and the imagery should look like the people it is for. The first
  generated set came out ~93% male purely because every prompt said "artist" and the model defaulted
  to men, so **name the gender in each prompt** and count the finished set before shipping it.
  Groups and crowds are mixed by default.
- **Encode as WebP, never JPEG.** Flat colour and hard edges are the worst case for DCT: the same
  artwork is ~90% smaller as WebP with no visible loss (4.8 MB to 475 KB across one nine-image set).
- **Match the aspect ratio to the slot it renders in** (16:9 for the hero and section bands today).
  Generating 4:3 for a wide slot forces a choice between a crop and an image too small to carry the
  page.
- **No border, frame, mat or white edge around the artwork.** The image must bleed to all four
  edges. The generator drew a 25px white frame around one hero and it reached production, because a
  thin light border is genuinely invisible at review scale against a dark page. **The eye is the
  wrong instrument for this**, so it is machine-checked: `toolPositioning.test.ts` samples all four
  edges of every `public/hero-*` and `public/section-*` file and fails on a near-white edge. If a
  generation comes back framed, crop to the largest exact 16:9 box inside the content area rather
  than stretching it back.
- **Always open and look at every image before shipping it.** The age, the gender and the palette
  are all checked by looking, not by trusting the prompt. Looking catches what the edge test cannot
  (a middle-aged face, a sixth colour, the wrong gender); the edge test catches what looking cannot.

Reference implementation: `src/lib/positioning/sectionImages.ts` (the nine section images and why
each composition was paired with its section), `public/hero-*.webp` and `public/section-*.webp`.

**Existing photography stays until the surface it sits on is next touched.** The 14 paused
calculators, `studio_*.jpg` and `homepage_*.jpg` are still photographic; this rule governs what is
GENERATED from now on, and does not license a mass re-shoot nobody asked for.

## Copy Rule — NEVER use em dashes

NEVER use an em dash (—) in ANY user-facing copy, anywhere, ever: UI strings, emails, web/marketing pages, notifications, button labels, tooltips, error messages, docs — all of it. This applies to everything new you write and anything you edit. Do not substitute an en dash (–) either. Rewrite instead: split into two short sentences (also better for readability), or use a comma, colon, or parentheses. Example: "Your front door — the easiest yes" becomes "Your front door: the easiest yes". (Hyphens in compound words like "one-time" are fine; this rule is about the dash punctuation between clauses.)

## Every file path you hand Josh is a MARKDOWN LINK. No exceptions.

The moment you type `supabase/` and `.sql` in the same string, it must already be wrapped as
`[supabase/schema-phase2-foo.sql](supabase/schema-phase2-foo.sql)`. A backticked path, a bold path,
or a bare path does NOT count: the VSCode harness renders repo-relative markdown links as clickable
file links, and backticks render as inert code he then has to hunt for.

**This applies in the CHAT REPLY, not only in TODO.md.** That distinction is the whole reason this
keeps regressing: the rule below is written about TODO items, so it gets followed there and dropped
in conversation, which is where Josh actually reads it first. Josh has now asked four times
(2026-07-11, twice on 2026-08-13, and 2026-08-15). It has never been a missing rule; it is not
applying it at write time.

Same for any other file you ask him to open: `scripts/*.mjs`, docs, components. When more than one
SQL file is involved, give the RUN ORDER. Never fence SQL inline (see the TODO.md rule below).

## TODO.md — you maintain it, Josh works it

`TODO.md` at the repo root is Josh's list. It has three sections: **Do Now** (one-shot,
P0/P1/P2), **Ongoing** (recurring rituals), and **On Claude's plate** (so he knows what he is
not carrying).

**Whenever you create work only Josh can do, add it to TODO.md in the SAME commit.** That
means: a SQL migration to apply, an env var to set in Vercel, a secret to rotate, a pricing
or legal decision, a dark-launched flag to flip, anything needing an account you cannot log
into. If you ship a migration and do not list it, the migration does not get run and the
feature is silently dead.

Rules:
- **P0 means "blocks artist acquisition or breaks money flows."** Not "feels urgent." Use the
  same definition as the triage principle below, or the priorities become meaningless.
- Each item carries the **exact command, SQL, or file path**. The item IS the instruction. If
  Josh has to go look something up, the item is not finished.
- **NEVER put SQL in a fenced ```` ```sql ```` block in TODO.md.** Josh selects the block and
  pastes it, fence included, and Postgres answers `syntax error at or near "```"` (this really
  happened, 2026-08-01). Any SQL he must run goes in a **`supabase/*.sql` file** that he opens and
  runs, and the TODO item links to it. That is already the pattern for migrations; it is now the
  pattern for one-off statements and flag flips too. Same for shell commands: give one plain
  indented line, never a fence.
- **DELETE items the moment they are done. Do not tick them, do not strike them through, do not
  keep them "for the record."** Git remembers what was done and when; TODO.md is only for what
  is still true. Every completed item left in the file is a line Josh has to read past to find
  the ones that matter, and a list he skims is a list he stops trusting. Delete stale items too.
- Do the same for the "Done" archives: there is no Done section, in any part of the file.
- Put your OWN follow-up work in "On Claude's plate", never in his sections.
- If you discover a founder-blocking task that predates this file, add it. Verify it first:
  do not copy claims out of the Brain or CLAUDE.md without checking the code, because both
  have been wrong.

## The public artist page — `isOwner` is the OWNER, and preview only removes access

Two rules on `src/app/[slug]/page.tsx` and everything under it:

- **Owner checks are `session.user.id === artist.user_id`, never "does this viewer have an
  `artist_profiles` row."** The page used the latter for months, so every artist got owner-only
  controls (locked-channel reads, moderation menus, the artist-voice composer) on every OTHER
  artist's page. The DB stopped the reads; it did NOT stop `community_posts.is_artist_post`,
  whose INSERT policy is only `auth.uid() = author_id`
  (`supabase/schema-phase2-artist-post-authorship.sql` adds the trigger).
- **Owner preview** (`src/hooks/useArtistPreview.tsx` + `PreviewBar`) lets the owner view the
  page as a visitor or any tier. `useSubscription` is the ONE injection point: override it and
  all 13 gated consumers follow. It must only ever REMOVE access, which is what makes it safe
  as a pure rendering lens. If you add a surface that reads a SERVER-granted flag
  (`can_view`, a signed URL, a purchase row), it must fall back to tier math when `previewing`,
  or the owner sees an unlocked page while it claims to be a fan's.

## Plan limits: only advertise what the product enforces

Audited and settled 2026-08-01. Every limit is now either real or gone; do not reintroduce a
third state.
- **Members: NO CAP on any plan.** Removed rather than enforced, because the only enforcement
  point is refusing a paying fan at checkout. Never re-advertise one. A big list routes to Pro
  via `contacts_need_more_sends` (the email cadence limit), never a member count.
- **Tracks (50 on Launch): enforced by a DB trigger** (`schema-phase2-track-cap-enforcement.sql`),
  because tracks are inserted straight from the browser client and no API guard can cover that.
  The UI must warn BEFORE an upload starts and translate `TRACK_LIMIT_REACHED` into plain words.
- **Email blasts: enforced at CREATE and, authoritatively, at SEND** through
  `src/lib/emailQuota.ts`. A draft costs nothing; only a send spends the quota. Never write a
  second copy of that rule.
If you add a plan limit, it needs an enforcement point that a browser cannot route around, or it
does not go in the marketing copy.

## Founder traffic is never counted (2026-08-25)

`src/lib/analytics/doNotTrack.ts` is the one definition. Two mechanisms: the `crwn_dnt` DEVICE
cookie (set for a year by `useAuth` the moment an admin profile loads in a browser; covers every
later request from that device, any account, logged out included) and the ACCOUNT rule
(`recordFunnelEvent` skips events attributed to an admin user id, covering webhook/server call
sites the cookie never reaches; it fails OPEN so a broken role read never drops a real event).
**Every tracking write path checks it**: middleware visit tracking, `/api/tier-events`,
`/api/funnel/track`, `/api/lead-magnets/analytics`, `/api/admin/track`, and the player's play
logging. **If you add a new tracking write path, gate it with `requestHasDnt` (server) or
`clientHasDnt` (browser) in the same commit.** Two deliberate exceptions: `popup_events` are the
pop-up governor's frequency-cap STATE, not a metric, and are never gated or deleted; and this is
an analytics exclusion ONLY — it must never gate a product behavior, entitlement, or
authorization, since anyone can hand-set the cookie. Historical founder rows were removed by
[supabase/cleanup-founder-analytics.sql](supabase/cleanup-founder-analytics.sql) (applied
2026-08-25; account-attributable rows verified 0 by live probe). Anonymous history only carries
the one-way IP+UA visitor hash, so no after-the-fact SQL can name it; `/admin/forget-device`
(admin-only) is the eraser: the device making the request computes its own current hash, every
row under it is deleted, and the response stamps the crwn_dnt cookie. History under an old IP or
browser version is unattributable by design and stays.

## Campaign attribution — one normalizer, one durable home, no new table

Organic video links are TAGGED (`docs/acquisition/campaign-tagging.md`).
`src/lib/analytics/campaignAttribution.ts` is the ONE normalizer: it turns a query string into
eight allowlisted slugs (channel / platform / campaign / creative / variant / angle / keyword / ref,
plus `from`). Never read a raw `utm_*` value into a stored row, a grouping key, or admin output;
parse it through this module, which is also the length limit and the HTML-safety boundary.

- **The durable copy lives on `lead_magnet_results.input_data._attribution`**, not a new table and
  not a cookie. That row is what the existing claim path binds to the account at signup, so the
  video survives the anonymous/authenticated boundary and a delayed signup on another device.
  Read it back with `attributionDimsFor()` (`attributionLookup.ts`) and spread it onto the funnel
  event. **If you add a funnel stage below signup, stamp it**, or that stage is invisible per video.
- **Two policies, on purpose.** The client beacon is LAST touch (current URL wins, the snapshot
  fills silence): existing behavior, do not change it. Persisted attribution is FIRST touch:
  `mergeAttribution` never replaces a set field, so a later untagged visit cannot erase the video.
- Attribution is a REPORTING dimension. It may never reach a calculator input, a price, a fee, the
  lead scorer, or an authorization decision. Lead quality comes from the canonical server-side
  scorer (`decideCallRequest`), stamped as `metadata.band`; never trust a client-sent band.
- Funnel stage names stay server-controlled (`FUNNEL_STAGES`), and the admin scorecard's group-by
  dimension is allowlisted server-side. A query string can never name a stage or a column.

## Fan Drives (Virality Engine) — the campaign is a DIMENSION, never a source of truth

`src/lib/campaigns/*` is the thin campaign spine (V1 shipped 2026-08-11; its migration
`supabase/schema-phase3-fan-campaigns.sql` is APPLIED in production, verified by probe
2026-08-12, so the feature is LIVE, not dark). Canonical architecture:
`docs/crwn-brain/22-VIRALITY-ENGINE-ARCHITECTURE.md`, and section 28 is what is actually live.

**The falsifiable rule: if a campaign row and a canonical rail can disagree about who earned what,
the boundary is wrong and one of the two is paying real money.** `boundaries.test.ts` asserts this
against the source, so breaking it fails `npm test` rather than reaching an artist.

- **Never add a campaign dimension to `referrals`, the referral cookie, Stripe metadata or any
  money row.** Outcomes are DERIVED: referrals for this artist, credited to someone in this
  participant set, created inside this window. The partial unique index (ONE active campaign per
  artist) is what makes that unambiguous, so do not remove it.
- **Archetypes are DATA** (`archetypes.ts`). Adding one touches that registry and its toolkit copy.
  If archetype logic appears as `if (archetype === '...')` anywhere else, the abstraction has failed.
  An archetype declaring a capability the spine has not built is refused, not half-run.
- **The constraint gate is server-side and fails CLOSED.** Only REACH and FIRST_PAID route to a
  drive. FULFILLMENT and RETENTION never do. `insufficient_evidence` never does. **Never add a
  `VIRALITY` constraint type**: virality is a mechanism, and putting it in the list of problems
  destroys the engine's causal clarity.
- **No campaign surface calls `recordIssuedRecommendation`.** Only `/api/artist/constraint` issues,
  so a diagnosis shown in two places is still ONE Z3 recommendation. The campaign row stores Z3's
  existing `actionKey`, never a new identity.
- **V1 is non-cash at the database** (`incentive_kind` CHECK). Introducing a cash reward takes a
  migration, which is the founder gate it should have.
- **Free joins attributed to a participant are UNMEASURABLE** (`/api/stripe/free-subscribe` writes
  no referral row). Report `missing`, never 0. Same for external views: CRWN has no social
  integration, and a self-reported number may never rank, pay or feed a recommendation.
- **No campaign leaderboard**, and `/api/leaderboard` publishes no score, because the points total
  was exactly invertible back to a fan's lifetime spend given the counts beside it
  (`src/lib/leaderboardPrivacy.ts` holds the scoring and the public projection, with a test).

## The public calculators — one shared funnel, and speed is never bought by asking less

20 active calculators: 19 `LEAD_MAGNETS` registry tools plus the standalone `/worth`. Almost
everything is shared (`PublicToolClient` → `ToolHero` / `LeadMagnetWizard` / `LeadMagnetResult` /
`DeliverableBuilder`); per-calculator differences are DATA in `src/lib/leadMagnets/registry.ts`. The
homepage mounts the SAME component with the Opportunity Calculator config, so fix the shared
primitive, never 19 copies. `src/lib/leadMagnets/conversionContract.test.ts` pins all of this.

- **Optimize qualified downstream progression, not opt-ins.** A change that lifts completion while
  thinning the result loses. The unified model derives money from the ANSWERS, so an artist who
  skips questions gets a SMALLER number: buy speed by MERGING SCREENS, never by dropping,
  optionalizing or defaulting a field. Every removal needs the Z2B-1 consumption trace first.
- **The result is never gated and always correctable.** `leadCapture.required` is false on all 20,
  there is no `preview` phase, and **no signup link and no booking flow** may appear between the
  result and the builder. The post-result "change an answer and recalculate" control must keep
  working: a number the artist cannot touch is a number they do not believe.
- **The OPTIONAL email capture is the one exception, and it sits INSIDE THE HERO, directly under
  the primary CTA** (founder decision 2026-08-26, revising 2026-08-15's "above the builder", which
  in turn replaced "nothing may appear between the result and the builder"). Gating and ordering
  are different things: the capture card may precede the builder as long as the result is already
  delivered, the card is skippable, and the builder works without it. It must precede the builder
  because the builder's own action is `stickyFooter` (`sticky bottom-0`), so its Continue/Save is
  pinned to the viewport the whole time and the final press `router.push`es to signup. Anything
  below the builder is therefore behind a permanently visible exit, which is why production
  captured **zero** leads across every calculator. **Above the builder was not far enough.** It
  goes in the `afterHero` slot, whose own contract is "rendered directly under the hero, above the
  fold (e.g. email + signup CTAs)", because the hero's 2x3 metric grid renders AFTER that slot: a
  capture placed as a sibling instead lands under roughly 230px of tiles, and on a tier-modeling
  tool under a whole ladder section as well. The tokenized DM page had already reached the same
  conclusion for those tiles. `ResultToBuilder` still scrolls straight to `builderRef`, so an
  artist who wants to build skips the card entirely. Asserted by `pageComposition.test.ts` (order,
  hero placement, and the mutation test behind both) and `prospectNurture/capture.test.ts`; the
  signup/booking half of the rule above is unchanged and still asserted.
- **Tier-modeling calculators show the ladder under the EMAIL ASK, and the call hand-raiser is
  ONE allowlist** (founder decision 2026-08-26, revising 2026-08-25). Page order on those tools:
  result with the primary CTA and the email ask inside its hero, then the shared `LadderSection`
  (rungs from `RECOMMENDED_LADDER`, overlaid with the calculator's own modeled
  `conversionPayload.ladder` prices and projected fans), then the builder, then the
  `CallRequestCard` last. The ladder is EVIDENCE for the number, and evidence may follow the ask;
  it previously sat between the result and the ask, which pushed the only ask on the page well
  below the fold. The ladder's trigger is the modeled payload, never a slug list; the
  call card renders only for `CALL_HAND_RAISER_TOOLS` (`src/lib/acquisition/callRequest.ts`),
  the SAME set the call-request route enforces, so a surface cannot offer a call the server
  refuses. The tokenized ManyChat result page renders the same ladder and call sections from the
  STORED result, so a DM arrival reads the same page a direct visitor reads. Ordering is pinned
  and mutation-tested in `pageComposition.test.ts`.
- **A re-run after a correction is NOT a new completion.** It emits only
  `opportunity_estimate_recalculated`; the wizard remounts with `trackStart={false}`. Never let a
  correction add a second `calculator_started` / `calculator_completed`, or every ratio measured
  against them silently drops.
- **Never rename a calculator slug, `analyticsMetadata.toolId`, a DM keyword or a funnel stage.**
  ManyChat triggers, campaign links and every historical `funnel_events` row are keyed to them.
- **A wizard step id lives in three places**: the input's `step`, the tool's `wizardSteps`, and
  `priorityStepIds` in BOTH `registry.ts` entry contexts and `src/lib/avatars/taxonomy.ts`. Change
  one and change all four, or a screen renders empty or an avatar silently stops being personalized.
- **The wizard's last screen is validated on submit** (`validateAll`, jumping back to the offending
  question). That is what lets a tool end on a required question instead of a `review` screen.
- **The launch call layers on top, it never gates.** No page may present booking a call as step one
  of the self-serve path.

## Interruptions are governed — one engine, one cap

Every surface that interrupts a user (pop-ups, artist broadcasts, fan notifications, surveys)
must pass a frequency governor. Do NOT add a new interruption path without one.
- **Pop-ups** go through the Pop-up Engine, NOT ad-hoc modals: add a `PopupDef` to
  `src/lib/popups/registry.ts` (targeting + `frequency` cap + loss-framed copy). The engine
  enforces **max one pop-up per user per day** on top of each pop-up's own cap. **Every
  ANNOUNCEMENT pop-up ("we changed X" / "new feature") MUST carry `announcedAt`** (the date the
  change went live): the engine skips it for accounts created on/after that date, because those
  users met the current product at signup and the announcement is noise to them. Gated by
  `admin_settings.popup_engine`, which is ON in production (verified 2026-08-12, 16 popup_events
  recorded; the code default is false but the flag is LIVE, same as `quest_engine`). Surveys are a
  pop-up `kind` (1-5 + feedback), stored in `popup_survey_responses`; low scores email the founder.
  **ADMINS NEVER SEE A POP-UP.** `eligiblePopupFor` returns null for `role === 'admin'` before any
  targeting runs, so the founder's own account cannot verify one. Before investigating "the pop-up
  is not showing", check the role: that has already been mistaken for a product defect once.
  A pop-up's copy is STATIC except where a def is explicitly given a per-user builder in
  `/api/popups` (two exist: the Post-Win referral link, and `resumeCopyFor` naming the resume
  goal). Build any such copy from the SAME context field the audience predicate gated on, never a
  second query, or the prompt can name something that never qualified it. And a pop-up that names
  a specific thing must send the user to a surface that SHOWS that thing: the resume prompt points
  at `/quests`, not Rise Mode, because Rise Mode renders the constraint-resolved move instead.
- **Broadcasts / fan notifications** already carry hourly + daily rate-limit caps in their routes
  (`api/messages/broadcast`, `api/notifications/notify-subscribers`). Keep them. A muted fan is a
  lost fan, so the platform caps even a well-meaning artist.

## Rise Mode is ONE next move (founder decision, 2026-08-13)

`/profile/artist` is the presentation layer for a SINGLE resolved priority, not a dashboard of
CRWN's intelligence. It answers four questions and nothing else: where am I, what should I do next,
why does it matter, what happens after that. **Exactly one visually dominant action, exactly one
gold CTA.** If you are about to put a second recommendation, a second CTA, a stat tile, a strategy
explainer, an XP bar or a list on this screen, the answer is no: the surface that owns that
information already exists.

- **An overdue promise is only urgent if somebody can receive it.** `obligationHasNoEligibleRecipient`
  (`src/lib/calendarProjection.ts`) is the existential form of `fanEligibleForObligation` and is
  shared by the Constraint Engine's assembler and the promise-reminder cron. The gate is ZERO versus
  ONE eligible member, never a sample threshold, and it fails SAFE (unknown audience kinds and failed
  reads keep counting). Never derive eligibility from `fulfillment_events.eligible_fan_count`:
  nothing has ever written it and it is 0 on every production row. Empty-room obligations stay on
  the calendar; they just stop being urgency. Without this, four auto-seeded template promises on
  tiers with no subscribers were about to outrank the road to a first paying member.
- **Overdue fulfillment owed to paying supporters outranks a normal roadmap milestone.** That rule
  is NOT in the UI and must never be copied there. It is Stage 1 of `readConstraint`
  (`src/lib/constraint/engine.ts`), which evaluates FULFILLMENT before every growth stage and fires
  at n = 1. `resolveOperatingFlow` reads back which owner won; `src/lib/riseNextMove.ts` (pure,
  tested) flattens that answer into one title, one reason, one fact, one destination and the LABEL
  of the next move. It holds no threshold and compares nothing. **Do not add a second priority
  engine, and do not re-derive the override in a component.**
- **The destination is part of the advice.** The CTA goes to the most specific SAFE EXISTING
  completion surface, never a hub the artist must search: `/studio/promise?tab=overdue&event=<id>`,
  `/studio/fans?import=1`, `/account/tiers?tier=<id>`. Every such param is a POINTER, never
  authority: the destination matches it against rows it already loaded for the signed-in artist, so
  a foreign id opens nothing. Never fetch by a URL id, and never let one decide a permission.
  Before adding a step's `href`, open the destination and confirm the control is actually there:
  `Connect Stripe` pointed at `/account/payouts` for months, which has no connect control.
- The losing move appears as a plain `After this:` line, never a second button.
- Stage context is discrete (`Foundation · 2 of 7 complete`), never a percentage.
- The fact is stated ONCE, from `evidence[0]`. The constraint's `title` is a summary of that same
  fact and is deliberately not rendered.
- **Everything removed from the surface is still running.** The quest board (XP, level, artist
  build, daily/weekly moves) is at `/quests`; Rise Mode mounts `RiseMode variant="driver"`, which
  renders nothing and exists only to keep calling `/api/quests` (that route ASSIGNS and
  auto-completes quests server-side, so removing the call would freeze every artist's progression
  silently). `StrategyCard` is on `/account/tiers`. Stats belong to `/studio/analytics`, promises to
  `/studio/promise`. Absence from this screen is never evidence a system was deleted.

## Navigation — three surfaces, one rule each

The artist dashboard is NO LONGER a tab strip. `/profile/artist` is Rise Mode and nothing else.
Every one of its old 16 tabs is a real route. Three surfaces, and each one has a single job:

**EVERYONE lands on `/home` at login, artists included** (founder decision, 2026-08-20). Artists
were briefly routed to `/profile/artist` on the reasoning that Rise Mode is their command screen.
Reverted after seeing it: Rise Mode answers ONE question and is deliberately sparse, so as a
landing it is a mostly empty screen, and `/home` is where the governed pop-up meets an artist at
the start of a session. Rise stays one tap away in the bottom bar. **Do not re-propose the Rise
landing without new evidence.**

`/home`'s **Quick Actions section is deleted** (2026-08-19), "Artist Dashboard" tile included,
because every tile in it was a second door to a bottom-nav slot. **Do not re-add a link to
`/profile/artist` on `/home`, and never pad the Featured row with placeholder tiles**: it shows
only artists with music AND an avatar AND a presentable name AND `featured_hidden = false`.

**A short Featured row is NOT evidence the catalogue is short.** I claimed that on 2026-08-19
from the completeness filter alone and it was wrong; probing on 2026-08-20 found the real cause
is `featured_hidden`, and that the curation is inverted. Five of ten artists are hidden,
including the two most complete real ones (20 tracks and 14 tracks, both Stripe-connected with
priced tiers), while a 1-track artist with no paid tier is shown. **Check `featured_hidden`
before concluding anything about that row**, and fix a thin row by unhiding a complete artist,
never by lowering the completeness bar.

- **Bottom tab bar** (`Navigation.tsx`, `buildNavItems`) — DOING the work. Since the 2026-08-13
  pre-PMF surface reduction: THREE slots for an artist (Home, Studio, Rise) and TWO for a fan
  (Home, Library). Explore and Messages lost their slots (routes still work); the fan Library
  slot is the money surface (ReferralDashboard). Visible on mobile AND desktop (sidebar).
  Profile is NOT a slot. Do not add management destinations here.
- **Hamburger AccountHub** (`src/components/layout/AccountHub.tsx`, top-left) — the index of the
  DEFAULT product. Since 2026-08-13 it is no longer the complete index of everything ever built:
  the pre-PMF surface reduction cut it to the path to a first paying member (Grow: Rise Mode,
  Studio, Analytics, Fan CRM, Promise Calendar, Fan Proof / Music and shop: the five core tools /
  Your business: page, tiers, payouts, billing, referrals / Account / Support). Hidden
  destinations (quests, Manager, Needs You, playbooks, fan mechanics, Team Splits, Sync, DMs...)
  keep their ROUTES and are reachable by link or calculator CTA; they are simply not indexed.
  **If you add a destination to Studio, add it here too** (NAV-001 asserts that parity). First
  group renders expanded.
- **Studio** (`/studio`) — the work destinations you MAKE/ACT in, as a visual grid. Since
  2026-08-13: exactly five tiles (Music, Albums, Shop, Offer Builder, Live). Everything else
  (Manager, Sync, campaigns, missions, bounties, squads, Needs You, playbooks, clip controls,
  Royalty Readiness) was hidden, NOT deleted: the routes work, and four of them are live
  calculator CTA destinations (/missions/new, /proof-of-demand/new, /bounties/new,
  /royalty-readiness). Reference/config screens (`/studio/analytics`, `/studio/fans`,
  `/studio/promise`) live in the hamburger only. Re-add a tile when a qualified pilot artist
  needs it to reach a first paying member.

Rules when you touch any of this:
- **Every ex-tab screen wears `HubPage`** (`src/components/layout/HubPage.tsx`): X in the TOP
  LEFT, artist gate, and artist context via `useArtistContext()` (module-cached, so navigating
  between these screens costs no round trip). Do not hand-roll the gate or the back control.
- **`?from=hub` means "the X returns to the hamburger."** AccountHub appends it; HubPage reads
  it and sets a one-shot sessionStorage flag (`requestHubReopen`) that `Navigation` consumes on
  the next pathname change to reopen the menu. Without `from=hub` the X is a normal `smartBack`,
  which is what makes Rise Mode CTAs return to Rise Mode.
- **Connector pages that are NOT HubPage but ARE reachable from the hamburger** (offers,
  campaigns, missions, bounties, squads, city-unlocks, proof-of-demand, campaign-hub, action-plan,
  playbooks, clip-controls) use `HubBackControl` (`src/components/shared/HubBackControl.tsx`) for
  their back control, NOT a hand-rolled `smartBack` button. It reads `?from=hub` and renders the
  same top-left X + reopen-menu behavior as HubPage when opened from the hamburger, and the page's
  normal back arrow otherwise. If you add a connector page to AccountHub, give the link `hub: true`
  AND swap its back button to `HubBackControl`, or its X will wrongly say "Back to Studio".
- **Link to these routes with `<Link prefetch>`, never `<button onClick={router.push}>`.** The
  prefetch is the entire reason they open instantly; a button cannot be prefetched.
- **Never add a new `?tab=` link.** `src/lib/dashboardRoutes.ts` (`TAB_ROUTES`) is the legacy
  map, and `/profile/artist` redirects through it so links already sitting in emails and
  `notifications.link` rows keep working. It exists for history, not for new code.

## Product Drift Prevention — the registry is the contract

`docs/crwn-brain/26-PRODUCT-DRIFT-PREVENTION.md` is canonical. The short version:
- **`src/lib/architecture/invariants.ts`** is the one inventory of ratified architecture
  contracts (who owns what, what must never happen, which identifiers are frozen, which
  features are live/dark/dormant, which migrations are expected applied vs pending).
- **`src/lib/architecture/exceptions.ts`** is the ONLY place intentional deviations live; a
  scattered "ignore this test" comment is forbidden, and stale exceptions fail the suite.
- **To change a ratified rule**: founder decision → update the Brain doc → update the
  implementation → update the registry/exceptions → update the tests → `npm run
  verify:architecture` → `npm test` → `npm run build`. "The test failed, so weaken the test"
  without that chain is drift, not evolution.
- **When you add**: a Studio destination (hub parity is asserted), a notification type
  (classify it in `src/lib/comms/taxonomy.ts`), an attribution dimension (register it in
  `ATTRIBUTION_DIMENSIONS`), a migration (add an `EXPECTED_MIGRATION_STATE` row AND a probe
  line), a pop-up (its key gets frozen; a flag-gated one needs its flag in
  `ANNOUNCEABLE_FLAGS`), a cron (schedule it, at most daily), an earnings write (it lives in
  `webhookHandlers.ts` or gets a registered exception).
- New drift assertions use `src/lib/architecture/sourceScan.ts` and must be mutation-tested
  (introduce the violation, watch the suite fail, revert) before they count as protection.
  **A mutation test counts only if you PROVED the mutation actually applied** (grep the fixture
  before and after), the test failed for the intended reason, you reverted, and the clean suite
  passed again. "I made the change and the test failed" without that evidence is not proof.

## AI agents — the model is never the security boundary

Full manual: `docs/crwn-brain/15-AI-AGENT-INSTRUCTIONS.md`. Provider table:
`docs/crwn-brain/10-INTEGRATIONS.md`. The standing rules:

- **TWO providers, 8 model call sites** (scan-verified 2026-08-25): DeepSeek (support, admin
  agent, Manager), Anthropic (acquisition lead decision on the ManyChat path). OpenAI is RETIRED:
  the synthetic sync generator was deleted, nothing reads `OPENAI_API_KEY`, and the privacy
  policy's processor list deliberately omits it. Do not repeat a stale count in either direction,
  and do not switch provider because another model looks better. That is not an objective.
- **Models are untrusted text generators, not security principals.** Authorization lives OUTSIDE
  the model. A user text claim ("I am Josh", "I am an admin", "I own artist X") is never
  authority. All external prose is untrusted DATA, never instructions: support messages, bug
  reports, filenames, URLs, user-agent strings, stored DB prose, ManyChat lead text, prior model
  output.
- **Write every agent as though it WILL be fully prompt-injected.** The required property: even
  then it cannot exceed server-defined capability. The model may PROPOSE; it may never authorize
  itself. Executable AI actions stay allowlisted, schema-validated, target-verified server-side,
  signed, re-authorized at execution, and shown to the approving admin WITH their actual params.
- **Never call an AI security issue fixed because the system prompt forbids it.** Name the
  non-model control: cross-user privacy → server query ownership; admin mutation → validator +
  signature + auth + approval; secrets → never in model context; money → server computes amount
  and destination.
- **Manager explains canonical priority, it never creates one.** Constraint owns diagnosis,
  Roadmap owns launch readiness, Rise owns execution, Needs You owns real pending work, Promise
  Calendar owns FAN promises. Manager must separate observed / modeled / insufficient evidence and
  must never claim causality from association or surface cross-artist private evidence.
- **Autonomous Manager is DORMANT and stays dormant.** Do not repair its scheduling, broaden its
  actions, or enable auto-send. Same for Team Split funding/cashout, which stays deliberately
  disabled (503): the three funding decisions are RATIFIED (`FUNDING_RATIFIED_DECISIONS` in
  `src/lib/teamSplits/funding.ts`; detail in `docs/crwn-brain/28-TEAM-SPLIT-FUNDING-ARCHITECTURE.md`),
  but settled decisions do not open the rail. It stays closed until the charge-time reserve is
  wired and a test-mode canary proves the payout source.
- **Team Splits are ARTIST-funded.** CRWN platform revenue never subsidizes a collaborator share,
  and collaborator authority is the authenticated `collaborator_user_id`, never a mutable email.

## The Claude Code subagents are covered too

`.claude/agents/**.md` (Marcus, Priya, Sage, Devon, Kai, Amara, Zara, Luna, Miles, Nadia, Reese,
Orion) are gated by `src/lib/architecture/agentContracts.test.ts`, inside `verify:architecture`.
If you add or edit one: any agent that runs `npm run build`/`test`/`verify:architecture` must
invoke it through `wsl.exe` (direct invocation FAKE-PASSES here, which is how the build agent
came to certify builds it never ran), every `npm run <script>` it names must exist, every
backticked `src/` path it cites must exist, and it must not repeat a retired fact. Keep shared
rules as references to canonical docs, not copies.

## Security: prove the authority SOURCE, and probe production separately

- **Middleware deliberately excludes `/api/`, so every API route establishes its own authority.**
  Security-looking code is not security: `admin`/`role`/`user_id`/`require...` appearing in a file
  proves nothing. Admin authority must be session-derived or an explicitly registered internal
  authority, and a **caller-supplied target id is never the authenticated actor's identity** (that
  confusion was SEC-001). Service role bypasses RLS, which is what makes route authorization
  mandatory. RLS does not protect a callable RPC: EXECUTE grants matter, and `REVOKE ... FROM
  PUBLIC` does NOT remove Supabase's per-role grants (revoke `FROM anon` by name too).
- **Four states, never collapsed:** migration file in repo / migration applied in production /
  feature flag state / feature runtime reachability. "A migration file exists therefore the
  feature is pending" is forbidden. Static gates (`npm run verify:architecture`) and live probes
  (`npm run verify:migrations`, `npm run verify:flags`) are separate and both required. There is
  no `verify:security` script; the security suites run inside `verify:architecture`.
- **A committed security mutation and a passing self-verify are different facts.** A migration can
  commit its change, leave production secure, and still fail a later post-`COMMIT` `DO` block.
  Do not infer rollback from a raised assertion: probe first. And make a migration ENFORCE exactly
  what it ASSERTS, or it certifies a property it never applied.
- **A live probe must be able to distinguish secure from insecure.** For security migrations the
  semantics invert: `42501` is the PASS, `200` is the failure, and `25006` means still executable.
  Where an anon probe cannot prove the property (authenticated writes, silent trigger reverts),
  classify it `sql-check` rather than shipping a green probe that proves nothing.

## Problem-Solving Principles

Four tools. Each answers a different question. Use the one that matches.

WHEN EXECUTING EACH AND EVERY PROMPT, EXECUTE THIS PROCESS:

### **"Which of these should I do first?" → Most-Critical-First**

When you have a list, queue, backlog, multiple failures, or several possible changes, start with the item that most threatens the current goal.

Critical means:

**"What fails worst if ignored?"**

Not:

* What's quickest
* What's easiest
* What's loudest
* What's most interesting

Pre-PMF, critical usually means something that blocks artist acquisition, activation, first revenue, retention, fan value, or secure money movement.

Fix the dominant constraint before optimizing downstream symptoms.

---

### **"What's actually true here?" → First Principles**

Before fixing, diagnosing, implementing, or arguing about anything, establish reality.

List what you KNOW is true from authoritative evidence.

Verify:

* The current repository
* Runtime behavior where relevant
* Tests
* Database/schema state
* Logs or events
* Existing CRWN Brain documentation
* Existing business rules
* Current permissions and ownership boundaries

Separate:

* Verified fact
* Assumption
* Inference
* Stale documentation
* Previous-agent claim
* Hypothesis

Never implement a fix solely because a previous report, audit, prompt, TODO, documentation file, or founder assumption says a problem exists.

Verify the underlying reality first.

When documentation and implementation disagree, investigate the discrepancy rather than automatically trusting either one.

**Establishing reality may fan out (read fan-out).** Once Most-Critical-First has picked the ONE
dominant constraint, independent evidence questions about that constraint may be investigated
concurrently by read-only subagents (what does the Brain say / what does the repo actually do /
what does the schema enforce / what covers this in tests or invariants / what does production
show). Sequence investigations only on real dependency: make B wait for A only when B genuinely
needs A's output, and fan out only when the expected speed or evidence-quality gain is worth the
extra context cost — no fixed file-count or layer threshold, judge the actual task. The rules that
keep this safe:

* **Parallelism never means multiple constraints.** Idle agent capacity is not a reason to
  investigate or optimize downstream constraints; the fan-out's root is the one dominant
  constraint, always.
* **Investigators are evidence collectors, not deciders.** They answer narrow factual questions;
  their reports are claims (treat them as "Previous-agent claim" above), never established facts,
  and never product decisions. If an investigator surfaces a genuine founder-level ambiguity,
  label it as such — do not resolve it because a synthesis needs an answer.
* **One synthesis context reconciles everything** before any hypothesis: it resolves
  contradictions against the source hierarchy (the repository, then canonical Brain docs where
  the repo agrees, then live probes for production state), separates fact from inference, and
  only then defines the single implementation hypothesis and continues into the Five-Step Pass.
* **Read fan-out, not write fan-out.** Implementation stays single-writer unless the work is
  provably disjoint AND low-risk. Never casually parallelize writes touching money, Stripe,
  subscriptions, payouts, auth, ownership, permissions, shared schema, migrations, or the
  architecture invariant registry.
* **The serial spine is untouched.** Reality before hypothesis, decision before execution,
  diagnosis before correction. Parallelism accelerates evidence collection inside a stage; it
  never skips or reorders a stage.
* **Deterministic evidence outranks agent consensus.** Where a test, invariant, probe, schema
  constraint, or build can observe the property directly, that observation is the verification.
  Agents find what needs checking and interpret results; they never replace the check.

---

### **"What should I do about this one thing?" → Five-Step Pass**

Apply in order. Never reverse the sequence.

1. **Question the requirement.**
   Should this exist at all? Challenge the requirement regardless of who created it.

2. **Delete.**
   Try to remove parts, steps, abstractions, state, code, dependencies, processes, or requirements.
   If you are never adding something back, you probably are not deleting aggressively enough.

3. **Simplify.**
   Only after confirming the thing should exist and cannot be deleted.

4. **Accelerate.**
   Make the correct system faster only after steps 1–3.

5. **Automate.**
   Always last.
   Never automate something that should not exist, has not been validated, or is not reliably correct.

Prefer the smallest safe implementation that solves the verified problem and preserves existing architecture.

---

### **"Did reality match what I expected?" → Feedback Loop**

Every implementation is a hypothesis until reality confirms it.

Before making the change, explicitly establish:

**Expected outcome**

* What should be different after this implementation?

**Success evidence**

* What observable evidence would prove it worked?

**Failure evidence**

* What observable evidence would show the implementation is incomplete, wrong, or caused a regression?

Then execute the smallest safe change.

After implementation:

1. **Observe**
   Run the relevant tests, build, type checks, runtime checks, database verification, event inspection, or manual flow needed to observe the actual result.

2. **Compare**
   Compare the actual result against the expected result.

3. **Diagnose the gap**
   If they differ, determine WHY before making another change.

   Ask:

   * Was the original assumption wrong?
   * Was the implementation wrong?
   * Was the measurement wrong?
   * Was there another upstream constraint?
   * Did the change expose a deeper problem?
   * Did the fix improve one thing while breaking another?

4. **Correct**
   Apply the Five-Step Pass again to the newly verified problem.

5. **Re-test**
   Run the loop again.

Do not declare the task complete merely because:

* Code was written
* A migration exists
* Tests were added
* The build passes
* The requested UI appears
* The original error disappeared

Completion requires evidence that the intended outcome is satisfied without unacceptable regressions.

When the intended product outcome cannot be fully observed immediately, distinguish between:

* **Implementation verified**
* **Product outcome not yet measurable**

Do not pretend future user behavior, conversion, retention, revenue, or other delayed outcomes have been validated when they have not.

Instead ensure the correct instrumentation exists so reality can provide the answer later.

---

## The Full Execution Loop

For every prompt:

### 1. TRIAGE

Use Most-Critical-First.

Ask:

**What threatens the requested outcome most if ignored?**

Start there.

### 2. ESTABLISH REALITY

Use First Principles.

Ask:

**What is actually true right now?**

Verify before assuming.

### 3. DEFINE THE HYPOTHESIS

Before editing, state internally:

**If I make this change, I expect ______ because ______.**

Define the evidence that would confirm or reject it.

### 4. DECIDE

Use the Five-Step Pass:

**Question → Delete → Simplify → Accelerate → Automate**

Choose the smallest safe change.

### 5. EXECUTE

Implement using existing architecture, components, business rules, security boundaries, and patterns wherever possible.

### 6. OBSERVE

Collect the relevant evidence after implementation.

### 7. COMPARE

Ask:

**Did reality match the expected outcome?**

### 8. CORRECT

If not:

**Identify the earliest/root constraint revealed by the evidence, not merely the visible symptom.**

Run:

**First Principles → Five-Step Pass → Execute**

again.

### 9. RE-TEST

Repeat until:

* The intended implementation outcome is verified
* Relevant tests pass
* No unacceptable regression remains
* Security and permissions remain intact
* Money/data behavior remains correct where applicable

### 10. LEARN

Before finishing, state what the execution taught us:

* Which assumption was confirmed?
* Which assumption was disproven?
* What changed because of the evidence?
* Did we discover documentation or repository drift?
* Is there anything the CRWN Brain should now reflect?

Update CRWN Brain documentation when implemented behavior or confirmed product truth has changed.

---

## Core Rule

**Do not merely execute the requested change. Close the loop.**

Every meaningful change should follow:

**Hypothesis → Implementation → Evidence → Comparison → Correction → Verification → Learning**

The objective is not to be right on the first attempt.

The objective is to stay wrong for the shortest possible amount of time.

---

## Feedback Loop Guardrails

The feedback loop must not create unnecessary complexity.

Do not:

* Add analytics solely because "feedback loops need data"
* Build dashboards when direct verification is sufficient
* Create permanent storage for values that can safely be derived
* Add AI where deterministic verification works
* Add instrumentation with no clear decision it will influence
* Continue iterating after the requested outcome is already verified
* Optimize downstream stages while an upstream constraint is still failing
* Treat small samples as established truth
* Treat missing evidence as zero
* Confuse correlation with causation
* Change multiple unrelated variables when one controlled correction will answer the question

Prefer the shortest trustworthy loop between:

**Action → Reality → Correction**

---

## Final Report Requirement

For implementation prompts, the final report should clearly state:

1. **Triage:** What was actually most critical?
2. **Reality:** What did repository/runtime investigation establish?
3. **Hypothesis:** What outcome was the implementation expected to produce?
4. **Five-Step Pass:** What was questioned, deleted, simplified, accelerated, or deliberately not automated?
5. **Change:** What was implemented?
6. **Evidence:** What happened when it was tested?
7. **Gap:** Did actual behavior differ from expected behavior?
8. **Correction:** What changed because of that evidence?
9. **Verification:** What proves the final implementation works?
10. **Learning:** What assumption was confirmed or disproven?
11. **Remaining uncertainty:** What cannot yet be known from available evidence?

Do not manufacture content for a section when nothing meaningful occurred. Keep the final report proportional to the task.

## Project Overview

CRWN is a music monetization platform where artists sell subscriptions, tracks, and digital products to fans. Built with Next.js 16 (App Router + Turbopack), Supabase (Postgres/Auth/Storage), Stripe Connect (5-12% platform fee by plan), and Tailwind CSS 4. Deployed on Vercel.

## Commands

- `npm run dev` — Start dev server (port 3000)
- `npm run build` — Production build (**must pass before pushing**)
- `npm run lint` — ESLint
- `npm test` — vitest (node env, pure `src/**/*.test.ts` suites; no jsdom/component tests). Run it before pushing when you touch a tested lib.
- `npm run verify:architecture` — the deterministic product-drift suite (~2.5s, no credentials):
  the invariant registry's tests plus every boundary/contract suite it references. **Run it before
  pushing anything that touches money, priority ownership, notifications, attribution, navigation,
  identifiers, or docs.** A failure is either real drift (fix the code) or an intentional rule
  change (follow the workflow in `docs/crwn-brain/26-PRODUCT-DRIFT-PREVENTION.md`); never weaken
  the test alone.
- `npm run verify:quests` — quest catalog integrity check
- `npm run verify:stripe` — read-only check that the live CRWN Pro/Scale prices match
  `TIER_PRICING`, plus a count of anyone still on the old $9.99 Pro price. Proves the PRICES are
  right; it cannot prove which id each Vercel var holds (Sensitive vars are unreadable), so one
  real Upgrade click is the final confirmation.
- `npm run verify:migrations` — probes PRODUCTION (anon key) for which migrations are applied.
  Run it after any "I ran the migrations": that has meant "some of them" more than once. Add a
  probe line when you ship a migration.

## Architecture

### Routing (App Router)

- `src/app/(auth)/` — Login, signup, onboarding (redirect to /home if authenticated)
- `src/app/(main)/` — Protected routes with sidebar navigation (home, explore, community, library, profile)
- `src/app/(public)/` — Public marketing pages
- `src/app/[slug]/` — Dynamic public artist profile pages
- `src/app/api/` — API routes (Stripe webhooks, cron jobs, notifications, analytics)
- `src/middleware.ts` — Auth middleware, PKCE code exchange, route protection

### State Management

Context-based (no Redux): `AuthProvider`, `PlayerProvider`, `ToastProvider`. Data fetching via direct Supabase queries in custom hooks (`src/hooks/`).

### Supabase Client Pattern

Two clients — using the wrong one is a common source of bugs:
1. **Browser client** (`@/lib/supabase/client`): Components. Respects RLS, uses anon key.
2. **Admin client** (created in API routes with `SUPABASE_SERVICE_ROLE_KEY`): Bypasses RLS. **Only use in `/api/` routes.**

### Stripe Architecture

- Prices created on the **platform** account (not connected account)
- Checkout uses `transfer_data.destination` for connected accounts
- Subscriptions: `application_fee_percent` = the artist's plan fee from `getArtistFeePercent()` (Launch 12 / Pro 8 / Scale 5)
- One-time purchases: `application_fee_amount: Math.round(price * feePercent / 100)`, same source
- Webhook route: `/api/stripe/webhook`

### Key Directories

- `src/components/` — Feature-organized (artist/, auth/, booking/, community/, player/, ui/, shared/)
- `src/hooks/` — useAuth, usePlayer, useContentAccess, useFavorites, useSubscription, usePlatformLimits
- `src/lib/` — Business logic: supabase/, stripe/, r2/, emails/, notifications, tours, upload validation
- `src/types/` — TypeScript interfaces (Profile, Track, Album, etc.)

## Critical Rules

**Read CODEBASE.md and DEV_RULES.md for full details. The rules below cause the most bugs:**

### Prices Are In Cents

ALL database prices are integers in cents. Form input: `Math.round(parseFloat(val) * 100)`. Display: `(price / 100).toFixed(2)`.

### Column Locations — Do Not Guess

| Column | Table | NOT on |
|--------|-------|--------|
| `display_name` | `profiles` | ~~artist_profiles~~ |
| `slug` | `artist_profiles` | ~~profiles~~ |
| `avatar_url` | `profiles` | ~~artist_profiles~~ |
| `banner_url` | `artist_profiles` | ~~profiles~~ |
| `stripe_connect_id` | `artist_profiles` | ~~profiles~~ |
| `user_id` | `artist_profiles` | (profiles uses `id` from auth.users) |
| `platform_tier` | `artist_profiles` | ~~profiles~~ (see below) |

**`profiles.platform_tier` DOES NOT EXIST.** `supabase/schema-platform-tiers.sql` declares it but
was never applied to production. Three code paths wrote to it anyway and every write failed
silently, because supabase-js returns an `{error}` object instead of throwing and none of them
checked it. Nothing ever read it: every `platform_tier` reader queries `artist_profiles`. The
writes are deleted. **`artist_profiles` is the single source of truth for the plan; do not add a
mirror.**

To get an artist's display name: query `profiles` WHERE `id = artist_profiles.user_id`.

### TypeScript Form State

When resetting form state with `setFormData({...})`, include **every** field from the type. Missing one = build error.

### RLS Gotchas

- Client-side operations that silently return null/empty likely hit an RLS policy.
- Soft-delete (`is_active: false`) breaks SELECT policies that filter `is_active = true` — the owner can't see their own deactivated items. Fix: add owner override to SELECT policy.
- Webhook inserts must use the admin/service-role client.

### Notification Pattern

- **Artist notifications** (server/webhook): `notifyNewSubscriber`/`notifyNewPurchase`/`notifySubscriptionCanceled` from `@/lib/notifications` with supabaseAdmin
- **Fan notifications** (client): `POST /api/notifications/notify-subscribers` with `{ artistId, type, title, message, link }`

### File Patterns for New Code

- New API route: `src/app/api/[name]/route.ts`
- New page: `src/app/[name]/page.tsx`
- New artist dashboard tab: add to `src/app/(main)/profile/artist/page.tsx` tab list, create component in `src/components/artist/`
- SQL migrations: `supabase/schema-phase2-[name].sql` (not auto-run; applied manually)

## Design System

Dark theme. Background: #0D0D0D, Cards: #1A1A1A, Elevated: #2A2A2A, Gold accent: #D4AF37. Font: Inter. Mobile-first responsive. Icons: lucide-react. Charts: recharts.

## Dependencies

Check `package.json` before importing. Key packages: @supabase/supabase-js, @supabase/ssr, stripe, @stripe/stripe-js, @aws-sdk/client-s3, lucide-react, recharts, @dnd-kit/core, driver.js, resend. If a package isn't installed, run `npm install` first.


### Next.js 16 / Vercel Gotchas

- **Middleware matcher MUST exclude `api/` routes** — otherwise all POST requests return 404. Check `src/middleware.ts` matcher config.
- **Internal navigation: use `router.push()`**, never `window.location.href` — preserves the audio player persistence. Only use `window.location.href` for external URLs (Stripe checkout).
- **`NEXT_PUBLIC_` env vars require a full redeploy** (no cache) to take effect on Vercel.
- **Service worker caches aggressively on iOS Safari** — test in incognito or clear Safari cache. Bump `CACHE_NAME` in `public/sw.js` after every frontend change (that file is the source of truth for the current version; do not hardcode the number here).

### Vercel Hobby Plan Limits — MUST FOLLOW

- **Cron jobs: ONCE PER DAY maximum.** Vercel Hobby plan only allows daily crons. NEVER use `*/30`, `*/6`, or any schedule that runs more than once per day. Use `0 <hour> * * *` format (e.g. `0 8 * * *` for 8am daily). Weekly is fine (e.g. `0 11 * * 1`). Monthly is fine (e.g. `0 0 1 * *`). **Anything more frequent than daily will BLOCK ALL deployments.**
- **Env vars at build time:** Always use fallback values when creating Supabase admin clients in API routes: `process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'` and `process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-key-for-build'`. NEVER use `!` non-null assertion on env vars — it crashes the Vercel build during static page collection.
- **Vercel CLI is linked to project `crwn`** (not `workspace-crwn`). If `.vercel` folder is deleted, relink with `npx vercel link --project crwn --yes`.

### NEVER name a revoked column from a browser or user-session client

`artist_profiles.stripe_connect_id`, `.platform_stripe_customer_id` and
`.platform_stripe_subscription_id` have SELECT **revoked** from `anon` and `authenticated`
(`schema-phase2-stripe-id-column-privs.sql`). This is correct and stays.

The trap is how Postgres refuses. Naming ONE revoked column fails the **entire statement** with
`42501 permission denied for table artist_profiles`, and PostgREST applies the same rule to
**embedded joins**. The query does not return a row with that field missing, it returns **no row
at all**, so every caller reads it as "not found" and fails closed while the code looks fine.
This silently killed every checkout, payout, and Stripe-connect flow on the platform.

- Read these ids ONLY through `src/lib/stripe/connectAccount.ts` (service role).
- Keep the ownership check on the user session. Only the secret moves server-side.
- `select('*')` on `artist_profiles` from a browser client is the same bug waiting to happen.
- The same applies to `tracks.audio_url_*` and (once its migration lands) `profiles.email`/`.phone`.
- To verify, probe production with the ANON key, never a superuser session:
  `curl "$URL/rest/v1/artist_profiles?select=slug,stripe_connect_id" -H "apikey: $ANON"`

### Test-mode Stripe must never write to the production database

`/api/stripe/webhook` refuses any event with `livemode: false` when the live secret key or the
production Supabase project is configured. This is not theoretical: a test-mode Pro checkout wrote
`platform_tier = 'pro'` plus a TEST subscription id into production, and the live Stripe API
answers that id with `resource_missing` forever, so the row claimed a plan nobody paid for. The
realistic route in is local development, `stripe listen` forwarding test events to a dev server
whose `.env.local` points at the PRODUCTION Supabase project: the signature verifies, the key is a
test key, everything is self-consistent, and the write still lands in production. Checking
`livemode` against the DATABASE is what catches it.

**When a check asks "is this subscription a CRWN plan", it must match the PRICE**, not merely
"is there a live subscription". Fan tier subscriptions live on the same Stripe account and can sit
on the artist's own platform customer (production had an artist whose platform customer carried an
active $10/mo fan tier). Use `isPlatformPlanSubscription()`.

### A stored plan is a claim; Stripe is the truth

`artist_profiles.platform_tier` can say `pro` with nothing billing behind it, and no SQL migration
can fix that class (deciding whether a subscription is live means asking Stripe). Every platform
webhook matches the artist by `platform_stripe_subscription_id` and **returns early on a miss**, so
a subscription deleted in Stripe never downgrades the row. `src/lib/stripe/platformPlanReconcile.ts`
is the ONE place that asks Stripe and corrects it; `/api/stripe/platform-status` calls it and the
billing screen self-heals on load, same pattern as `connectReconcile`. It only ever downgrades when
Stripe positively reports no live subscription: any other API error leaves the row alone, because
wrongly downgrading a paying artist is worse than briefly trusting a stale row.

### A platform plan change is never a new checkout session

An artist already on a paid plan must NEVER be able to open a new platform checkout: Stripe runs
unlimited concurrent subscriptions on one customer, and `handlePlatformCheckoutCompleted` stores a
SINGLE `platform_stripe_subscription_id`, so a second subscription overwrites the first and the app
can no longer cancel the original. It bills forever. Guards, all of which must stay:
- `platform-checkout` refuses with 409 when **Stripe** reports an active subscription for the
  customer. Stripe is the authority; `platform_tier` is only a label and several paths set it to
  `pro` with nothing billing (a partner-code trial, a test-mode webhook, an unmatched
  `subscription.deleted`, a manual write). **Never refuse on the label alone** — that traps those
  accounts as unable to ever start paying, which is worse than the double charge. The DB pair
  (tier match AND status active) is only the fallback when Stripe is unreachable.
- `PlatformTierModal` takes `currentTier` and renders the current plan as a disabled
  "Your current plan". The UI is not the control, but it should not lie either.
- `set-starter-tier` refuses when a paid plan exists. It only ever flipped the DB row, so
  "Start Free" used to leave the artist billed while the product treated them as free.
  Cancellation goes through the cancel route, and the downgrade lands via the
  `customer.subscription.deleted` webhook, never from a button.

### Stripe Platform vs Connect — THIS CAUSES THE MOST BUGS

- **Subscriptions live on the PLATFORM account, NOT Connect** — NEVER pass `stripeAccount` to subscription retrieve/update/cancel calls.
- **Prices MUST be created on the platform account**, not the connected account.
- **Unique constraint on `(fan_id, artist_id)`** in subscriptions table — use upsert for resubscribes.
- **Checkout handler checks `data.url`**, not `data.success`.
- Always include metadata: `fan_id, artist_id, tier_id` (subscriptions) or `fan_id, artist_id, product_id` (purchases).

### CSS / Tailwind v4

- **Custom CSS MUST go in `neumorphic.css`** — Tailwind v4 purges custom CSS from `globals.css`.
- `stagger-fade-in` animation: apply to inner list containers, not page wrappers.
- Design: flat/minimal style, pill-shaped buttons, solid gold `#D4AF37`. No neumorphic shadows.
- Prefer divider lines over card borders for list items.

### Access Control Model

- Tracks/products use: `is_free` (boolean) + `allowed_tier_ids` (JSONB array of tier UUIDs) + optional `price` (cents).
- Use `useSubscription` hook which returns `tierId` for gating checks.
- This replaces the old `access_level` field.

### Albums

- `album_tracks` uses `track_number` NOT `position`.
- `playlist_tracks` uses `position`.
- Albums use `is_active` (not `is_published`), and have no `slug` field.

### Onboarding Safety Net — DO NOT REMOVE

The artist onboarding path (signup → publish page → upload track) once broke silently for **months** because a migration half-applied and left `artist_gate_enabled()` missing, so the `artist_profiles` INSERT policy referenced a non-existent function and RLS rejected every publish. Two guards now prevent a silent recurrence:

1. **Daily canary** — `/api/cron/onboarding-health` (cron `0 7 * * *`) creates a throwaway user, performs the REAL RLS `artist_profiles` insert, verifies the user was **promoted to `role: artist`**, exercises `validateUpload`, then deletes the user. **Emails joshn.wms@gmail.com the moment any step fails.** The `new-artist-hook` skips `__canary*` slugs so this doesn't spam the founder. If you change the publish or upload flow, keep this check in sync.

   **Role promotion is SERVER-SIDE.** A user CANNOT change their own `role` — `schema-phase2-rls-column-restrictions.sql` freezes it. Publishing an artist page promotes `fan → artist` via the `trg_promote_to_artist` trigger (`schema-phase2-promote-artist-role.sql`). Never add a client-side `profiles.update({ role })` — RLS rejects it silently and leaves artists stuck as `fan`.
2. **Self-verifying migrations** — every migration MUST end with a `DO $$ ... RAISE EXCEPTION ... $$` block asserting its functions/policies/rows/columns exist (template: `supabase/schema-phase2-artist-approval-gate-repair.sql`). A partial apply then errors loudly in the SQL editor instead of silently half-landing.

### Artist Setup Wizard (post-signup onboarding)

New artists do NOT get the old dashboard tour first. They flow **signup → `/setup`** directly, a full-screen, hard-gated wizard. Reference this as **"the artist setup wizard"**. **The `/welcome` page was RETIRED on 2026-07-30** (Josh's call: it was a redundant screen); the route now just redirects to `/setup`, and the wizard's first two screens do what it did. Every entry point (signup, login, `/verify`, the `(main)` gate, the journey resolver, the quest destination registry, the onboarding-reminder email) points at `/setup`.

- **Route:** `src/app/setup/page.tsx` (+ `layout.tsx`). **ONE FIELD per screen** — the wizard is a flat list of single-field screens (`SCREENS` in that file), 12 in order: **artist-name → artist-link → photo → ladder → promises → stripe → content-plan → track-audio → track-title → product-type → product-title → product-price**. Grouped into the four chips up top (Profile/Monetize/Music/Shop) for orientation; progress bar by screen. Identity + Photo + Track are **mandatory**; the Monetize + Shop groups are **skippable** ("Skip for now" jumps the whole group). **Tagline is NOT asked in the wizard** (set later in the Profile tab). **Phone is NOT collected at onboarding anymore.** Do NOT stack multiple asks on one screen — that was the repeated mistake; the `ladder` screen is one DECISION (confirm the recommended model), not stacked fields. A signup with a claimed calculator result first sees the "Your CRWN plan is saved" intro (`PlanIntro`). The full staged evolution of this wizard is `docs/ARTIST_LAUNCH_WIZARD.md`.
- **Identity screens** (replaced `/welcome`): `artist-name` (never pre-filled — the profile seed is the signup email, and pre-filling is how emails leak out as public artist names; carries a small "Not an artist? Continue as a supporter" escape that saves role=fan and exits to `/home`) then `artist-link` (handle auto-synced from the name via the shared `src/lib/slugify.ts` until edited). The link screen's Continue calls **`POST /api/onboarding/identity`**, which does BOTH writes with the SERVICE-ROLE client (ownership enforced explicitly; `trg_promote_to_artist` still promotes fan→artist on the insert): browser-side `profiles` updates AND the RLS `artist_profiles` insert both 42501 until `schema-phase2-fix-profiles-update-permission.sql` is applied — the column-privileges hardening collided with the profiles UPDATE policy (reads revoked `stripe_connect_id`) and the artist_profiles INSERT gate (reads revoked `is_approved`). The wizard's photo save is server-side for the same reason (`POST /api/onboarding/avatar`). The daily canary still exercises the RLS insert and alarms until the migration runs. The identity route also sends the welcome email once, with the chosen name.
- **The `ladder` screen confirms the FULL recommended model (Launch Wizard Stage 2, 2026-07-30).** One decision screen renders `RECOMMENDED_LADDER` (Bronze free always applied + Silver $10 / Gold $25 / Platinum $100 with inline price edit and per-rung "Drop this tier"). It also shows estimated buyers per rung from the artist's own claimed calculator (`tierProjections` on `/api/lead-results/auto-claim`, matched by current or legacy tier name via `projectedBuyersFor`). Applying goes through **`src/lib/applyTierTemplate.ts`** — the ONE shared path also used by Rise Level 3's `TierLadderTemplate` — so structured benefits route through `/api/tier-benefits` and the Promise Calendar obligations (Gold's monthly Vault unlock, Platinum's quarterly listening event) seed automatically. Retry-safe: rungs whose name or legacy name already exists are skipped. A dropped rung stays offerable in Rise Level 3 (alias matching prevents duplicates). Onboarding tiers still get null Stripe ids, backfilled by `backfillTierPrices()` on connect.
- **A SINGLE-OFFER entry tool still gets the full ladder, and now gets told why.** Three tools
  model one offer instead of a ladder: the Vault Revenue Planner (a recurring membership offer, so
  it IS the Gold rung), the Live Experience Calculator and the Executive Producer Session (ticketed
  products, so they are NOT rungs and are built in Live after setup). Every entry path reaches the
  ladder screen (the setup gate wins over the journey resolver), but for these three
  `tierProjections` is empty AND `hasPlan` is true, so BOTH existing arguments for keeping the paid
  rungs were suppressed. `src/lib/leadResults/entryOffer.ts` is the one place that copy lives
  (`anchorLine` = where their offer landed, `ladderLine` = loss-framed cost of keeping only it);
  auto-claim returns it as `seed.entryOffer`. Prices come from `RECOMMENDED_LADDER`, never retyped.
  `buildLadderPrefill` reads the single-offer draft (`tierName`/`price`) onto the anchor rung, so
  the Vault they named and priced opens on Gold; an anchor price at or below the rung beneath it
  keeps the template price, because CRWN must never build an inverted ladder (price order is what
  the release waterfall staggers on). The Founder Window is deliberately NOT anchored to a rung:
  no CRWN surface enforces its cap or its dates (the offer builder it continues into has neither
  field), so anchoring it would sell a mechanic that does not exist.
- **Every no-ladder tool gets the argument, not just the four named ones.** The trigger is one
  deterministic fact: `modelsLadder(seed)` is false, meaning the tool wrote no `conversionPayload.ladder`.
  That covers missions, demand tests, leaderboards and royalty checks too, which had the same
  silence. They get the generic counterweight and a NULL `anchorLine`, because inventing a home for
  a mission on the ladder screen would be a claim the product does not keep. A ladder that IS
  modeled but projects ZERO buyers is untouched and keeps its own flow, which is the ratified rule
  in `setupLadderOffer.test.ts`. Never re-gate this on `hasPlan` or on an empty projections array.
- **The Vault artist's drop cadence is not asked twice.** They chose one in the planner, so it
  seeds the promise-review screen's Gold unlock (`vaultPlan` on auto-claim), and their first
  30 days render there read-only. The cadence is written into `promiseDraft`, never rendered as a
  display-only default: the CREATE path reads that same draft, so a rendering-only override would
  show one cadence and schedule another. It writes only when the artist has not already set that
  promise.
- **The `promises` screen reviews the workload BEFORE anything is created (Launch Wizard Stage 3, 2026-07-30).** The tier create runs on THIS screen, not the ladder screen. `src/lib/promisePlan.ts` is the pure benefit→obligation brain shared by the wizard and the server sync (`src/lib/tierObligations.ts` consumes it): promise detection, cadence/title/first-due from benefit config, DEDUP (the same promise on several tiers is ONE obligation via `metadata.merged_tier_ids`, re-anchored if the anchor tier drops it) and INHERITANCE (`serves_higher_tiers` on Gold's vault unlock serves every higher tier via `metadata.serves_tier_ids`, refreshed on every sync so creation order converges), plus the recurring-workload estimate. The screen's cadence dropdown (shared `OptionSelect`) and first-due date ride into `applyTemplateTier` as `benefitConfigOverrides` and become each benefit's config (`frequency`, `first_due_at`). Fan eligibility (`calendarProjection.fanEligibleForObligation`) and the fulfillment fan-notify honor `serves_tier_ids`, so a Platinum member sees and gets Gold's inherited promises. No migration: serve lists ride the existing `metadata` jsonb. Pure logic is under test in `src/lib/promisePlan.test.ts` (run `npm test` when touching it).
- **The `stripe` screen surfaces Connect in-wizard (Launch Wizard Stage 4, 2026-07-30) and NEVER blocks Continue.** Stripe is required to take money, not to finish setup. `/api/stripe/connect` accepts a validated same-site `?returnTo=` (the wizard passes `/setup`); on `?stripe=success|refresh` the wizard's resume effect restores the exact `stripe` screen instead of the first-incomplete scan. Verification is server-side only: the screen re-hits `/api/stripe/connect/status` (live `accounts.retrieve`, tier-price backfill, and now `payoutsEnabled` in the response) and renders connected / under-review / not-connected. Do not add a client-side Stripe check or make this screen required.
- **The `content-plan` screen picks the catalog path (Stage 5; PROJECT-CENTRIC since 2026-08-01).** One OptionSelect decides what the artist is adding first: **an album/EP/mixtape** (`contentPlan='project'`), **one featured track** (`'single'`, starts free, now with an optional cover), or **a batch of loose tracks** (`'bulk'`, no artwork required), plus "I'll add music later". The project path mounts `OnboardingProjectUpload` (`src/components/onboarding/`), which wraps the EXISTING `BulkUploadForm` in `projectMode`: one title, ONE cover upload, per-item title edit and up/down reorder, then on batch completion creates the `albums` row + `album_tracks` (`track_number` = queue order, UPSERT on `(album_id, track_id)`, numbering continues from the album's max) and copies the cover URL onto linked tracks that have none (`.is('album_art_url', null)`; the AlbumManager convention — all rendering surfaces read `track.album_art_url`, there is no render-time inheritance). A "single" is a standalone track (no release_type exists; do not invent one). Pure logic + tests: `src/lib/projectUpload.ts`. `track-title` is skipped on the bulk AND project paths. Do not build an onboarding-only uploader; if the bulk form changes, the wizard inherits it.
- **The personalized roadmap (Launch Wizard Stage 6, 2026-07-30) is a VIEW over the Quest Engine, never a second progression system.** `src/lib/artistRoadmap.ts` defines 5 stages whose steps reference existing DomainChecks by exact name; `/api/artist/roadmap` evaluates them through the quest evaluator's `evaluateCondition` (synthetic instance) plus three Promise Calendar facts, derived on read, stored nowhere. Surfaced as `RoadmapCard` above `RiseMode` on `/profile/artist`. Never grant XP from the roadmap and never store per-step completion; if a step needs a new fact, add a DomainCheck to the evaluator (or a fact to the route), not a parallel query in a component.
- **The fan import hub (Launch Wizard Stage 7, 2026-07-30) lives in `FanImportModal`, and a Patreon export is auto-recognized.** `src/lib/patreonImport.ts` (pure, tested) detects the Relationship Manager CSV, parses status/pledge/tier, and suggests the closest CRWN tier; members import with `patreon` / `patreon-tier:<name>` tags through the SAME `/api/fan-contacts/import` with the versioned attestation. Import never sends anything: invites go through Campaign Hub's contacts audience, which only emails attested, still-subscribed contacts. Never add an invite path that bypasses that campaign sender.
- **The Launch Kit (Launch Wizard Stage 8, 2026-07-30) generates launch copy as DRAFTS, never sends.** `src/lib/launchCampaign.ts` (pure, tested, no em dashes) builds announcement/follow-up emails + social/story/DM copy from the artist's real page, tiers, and imported audience; the `LaunchKit` panel (top of `/studio/fans?view=campaigns`) creates both emails as `campaigns` drafts through /api/campaigns (announcement preset to contacts + 20-contact test group). EMAIL campaigns live at `/studio/fans` (AudienceTab); `/campaign-hub` is Road-To campaigns; do not link "send an email" flows to /campaign-hub.
- **The wizard ends on the `LaunchReview` screen (Launch Wizard Stage 9, 2026-07-30), and the publish action is UNCHANGED server-side.** "Launch my CRWN" is still `markComplete` (`/api/artist/complete-setup`) + the journey resolver; never add a second completion path. The checklist's "Fix it" jumps back into wizard screens; the calendar/roadmap previews render INLINE (their routes are behind the setup gate until launch), and the storefront/checkout preview is the public page. Post-launch, Rise Mode is the command screen, and since 2026-08-13 it shows ONE next move rather than the old stats-and-promises card: the real counts (members/paying/MRR vs the calculator goal) are still returned by `/api/artist/roadmap` and are owned for display by `/studio/analytics`. Real counts only wherever they render; never render projections as results. The paid cap is 3 on every plan, and the free tier does not count against it (Option-2 counting). LaunchReview also carries the **operating plan panel** (journey spec Screen 11): `recommendPlan()` re-derived client-side from the roadmap goal with `monthlyPlanCostCents()` arithmetic, advisory only, never blocking the launch; all numbers come from `TIER_PRICING`/`TIER_LIMITS`, never hardcoded. Post-launch, Level 5 quests close the activation loop (first visit via `artist_page_visits`, first delivered promise via completed `fulfillment_events`), and the upgrade pop-ups (`artist_pro_break_even`/`artist_scale_break_even`) fire once on REAL trailing-30-day GMV crossing the derived break-evens. Experiences + the lower fee (12% to 8%) + live/DMs/scheduling remain **Pro** ($49/mo), surfaced AFTER the wizard; the product step offers only **Digital + Physical**.
- **Item creation:** the multi-field items (tier, track, product) collect their fields across screens into **draft state** in `setup/page.tsx`, then create on the last field's Continue via `src/lib/onboardingItems.ts` (`createOnboardingTier/Track/Product`). Minimal fields only (first track free; product file/advanced options deferred to the Shop tab). **Onboarding tiers do NOT call Stripe** (`/api/stripe/create-price` requires a connected account) — the row is inserted with null Stripe ids and `backfillTierPrices()` in `/api/stripe/connect/status` creates the Stripe prices automatically once the artist connects Stripe and charges are enabled. Completion (`hasTier/hasMusic/hasProduct`) is DB-derived — after create, `refresh()` unlocks Continue. Ends on a **share screen** → "Enter CRWN" → dashboard + trimmed tour.
- **Source of truth:** `src/hooks/useArtistSetup.ts` (now also exposes `onboardingCompleted` from `profiles.onboarding_completed` — a brand-new signup has no artist row yet and stays in the wizard on the identity screens; only an established fan, onboarding done + no artist row, is bounced to `/home`). Step completion is **DERIVED from live data, never stored per-step** — identity = `artist_profiles` row exists; profile = fresh `profiles.avatar_url`; music = ≥1 `tracks`; monetize = ≥1 active `subscription_tiers`; shop = ≥1 `products`. Everything is read straight from the DB, **NOT the `useAuth` context, which lags** — right after the identity save flips `fan→artist` the context `profile.role` is still `'fan'` until the next token refresh. So both the hook AND the `(main)` gate derive "is an artist" from the **`artist_profiles` row existing**, never from `profile.role` (a role check there would bounce a brand-new artist out of `/setup` into a redirect loop). Continue unlocks live off DB reads; Stripe status is cosmetic-only, fetched once.
- **The only stored flag** is `artist_profiles.setup_completed` (migration `supabase/schema-phase2-artist-setup-wizard.sql`, already applied). It just records "finished the wizard once." Existing artists were backfilled to `true`. The gate fails OPEN if the column is missing.
- **Hard gate:** `src/app/(main)/layout.tsx` redirects any user with `onboarding_completed = false` AND any artist with `setup_completed = false` to `/setup` (one enforcement point, one destination).
- **Focused profile:** the Profile group is name → link → photo. Photo is `OnboardingAvatarStep` (photo → `profiles.avatar_url`), autosaves on upload so `Continue` unlocks from live DB. **Tagline is NOT asked in the wizard** — tagline + everything else (banner, bio, socials, cal.com, location, genres) is done later in the full Profile tab. (`OnboardingTaglineStep` and `ArtistProfileForm`'s `mode="onboarding"` prop still exist but are unused by the wizard.)
- **Tour:** `getPostSetupTourSteps()` in `artistTourSteps.ts` is the trimmed dashboard tour (skips profile/tiers/music/shop that the wizard already covered). The old post-tour action-picker modal was removed.
- `/welcome` is a redirect to `/setup` (kept because sent emails link to it). `middleware.ts` protects `/setup` and excludes it from artist-slug visitor tracking.
- **If you change the publish/upload/tier/shop flows, keep `useArtistSetup` completion checks in sync**, and remember the daily onboarding canary (`/api/cron/onboarding-health`) still governs the underlying publish RLS path.

### Workflow

- **Always run `npm run build` after changes** — never push code that doesn't build clean.
- **Surgical, one-file-at-a-time fixes** — don't refactor adjacent code unless asked.
- SQL migrations go in `supabase/schema-phase2-[name].sql` — DO NOT auto-run. Josh applies them manually in the Supabase SQL Editor. **End every migration with a self-verify assertion block** (see Onboarding Safety Net above).
- Git workflow: `npm run build && git add -A && git commit -m "description" && git push`

### Domain & Infrastructure

- **Live domain:** thecrwn.app
- **Supabase project ref:** ecpqtuidtsncjfwtkvwc (US East)
- **Email:** Resend, `FROM_EMAIL='CRWN <hello@thecrwn.app>'`
- **Test artist:** slug `m3rcey`, Stripe Connect ID `acct_1T6BD7EAbi5c531A`

### Platform Plans (Artist SaaS) — pricing strategy 2026-07-31

- **Launch** (internal key `starter`, displayed "Launch"): free, 12% fee, 50 tracks, 250 members/contacts, 1 email campaign/mo, full 4-tier fan ladder (free + 3 paid). Purpose: prove the first direct-to-fan offer.
- **Pro**: $49/mo ($490/yr), 8% fee, unlimited tracks/members, live/DMs/scheduling/bundles/clipper, 20 email campaigns/mo. Beats Launch above $1,225/mo GMV.
- **Scale** (internal key `scale`, renamed from the old spec-only `label`): $199/mo ($1,990/yr), 5% fee, assisted migration, team permissions, 100 email campaigns/mo. Beats Pro above $5,000/mo GMV. Billable once its Stripe price env vars are set.
- A true multi-artist **Label** tier is custom-priced and does NOT exist until org accounts / cross-artist infra ship. `empire` is dead; `resolveTierKey()` aliases stray `label`/`empire` values to `scale`.
- Fee % is sourced from `TIER_LIMITS` in `platformTier.ts` (the single source of truth); prices from `TIER_PRICING` there. NEVER re-hardcode a fee or price. `platform-checkout` verifies the live Stripe price amount against `TIER_PRICING` before selling, so a stale price env var fails loudly instead of undercharging.
- **Deterministic plan recommendation**: every account starts on Launch; `src/lib/planRecommendation.ts` (`recommendPlan`, tested) derives the recommended operating plan (never an AI guess) and it is stored on `artist_profiles.recommended_plan` (migration `schema-phase2-platform-plan-recommendation.sql`), seeded from the claimed calculator in `/api/lead-results/auto-claim`.

### Fan Subscription Tiers (M3rcey test artist)

Live rows as of 2026-07-30 (verified against production, an older version of this note listed
$10/$50/$200, which was wrong). These predate the Bronze/Silver/Gold/Platinum rename and were
deliberately NOT rewritten, since renaming a tier a fan already pays for is a founder decision:

- The Wave: free (now built as Bronze)
- Inner Circle: $10/mo (now Silver)
- The Vault: $25/mo (now Gold)
- Throne: $100/mo (now Platinum)
- Benefits managed via `tier_benefits` table + `benefitCatalog.ts`.

## Completion Signal
When you finish a task, always run this as your final bash command:
powershell.exe '(New-Object Media.SoundPlayer "C:\Windows\Media\Ring05.wav").PlaySync()'