# 29 — Complete Feature Inventory (for a delete/keep review)

> Written 2026-08-13 against the repo at branch `claude/rise-mode-full-journey`, with production row
> counts read live the same day using the service-role key. Every feature CRWN ships is listed once,
> with why it exists, the benefit it claims, how it works, and the production evidence for whether
> anyone uses it.
>
> **This file exists to be fed to a reviewer (human or model) who will recommend what to cut FOR NOW.**
> Read the brief in section 0 before the inventory.

---

## 0. Brief for the reviewer

### 0.1 What CRWN is

A music monetization platform. Artists publish a page, sell fan memberships (recurring), tracks,
products, live tickets and sessions, and CRWN takes 5 to 12 percent depending on the artist's plan.
Next.js 16 + Supabase + Stripe Connect, one founder writing the code, deployed on Vercel Hobby.

### 0.2 The honest scale (production, read live 2026-08-13)

| Fact | Number |
|---|---|
| User accounts (`profiles`) | 69 |
| Artist accounts (`artist_profiles`) | 9 (includes the founder's test artist `m3rcey` and synthetic canary users) |
| Artists on a paid CRWN plan | 0. All 9 are on the free Launch plan |
| Fan subscription rows | 19 total, 11 active |
| Active subscriptions on a PAID tier | 7, at $5 to $10 per month |
| One-time purchases ever (`purchases`) | **0** |
| Live ticket purchases | 0 |
| Live tips | 0 |
| Earnings ledger rows | 55 |
| Tracks uploaded | 72 |
| Albums | 9 |
| Products listed | 8 |
| Community posts | 10 |
| DM conversations | 0 |
| Public artist page visits | 1,690 |
| Calculator results captured (`lead_magnet_results`) | 41 |
| Funnel events | 496 |
| Acquisition events (Instagram/ManyChat) | 411 |

So: the money loop works, and it has carried roughly **$50 per month of fan subscriptions across
about 7 paying fans**. Nothing else has ever taken money. This is a pre-product-market-fit product.

### 0.3 The code surface built on top of that

| Surface | Count |
|---|---|
| Pages (`page.tsx`) | 119 |
| API routes | 265 |
| Cron jobs (Vercel, all daily or slower) | 26 |
| SQL migrations | 170 |
| React components | 217 |
| Lines of TypeScript/TSX in `src/` | ~208,000 |
| Guided product tours (driver.js step files) | 23 |
| Public acquisition calculators | 20 |
| Quests in the Rise Mode catalog | 71 |
| Distinct pop-up definitions | 19 |

**That is the problem to review: about 110 features and 208k lines serving 9 artists and 7 paying fans.**

### 0.4 What "delete FOR NOW" means here

Rank each recommendation by how reversible it is. Prefer the cheapest reversible action that removes
the cost:

1. **Hide** the surface (remove the nav entry / tile / card). Code stays, zero risk, instantly reversible.
2. **Flag off** (CRWN has an `admin_settings` flag system, one row per feature). Reversible in one SQL update.
3. **Delete the code**, keep the database tables and their data.
4. **Delete the code and drop the tables.** Only for things that have never held a row.

Say which of the four you mean for every item. "Delete" without a level is not actionable.

### 0.5 Rules the reviewer must respect

These are not preferences, they are constraints that make a recommendation valid or invalid:

- **Never recommend deleting anything on the money path** unless it has zero rows AND zero code
  dependents: Stripe checkout, webhook, Connect, the earnings ledger, entitlement gating, subscription
  lifecycle. A wrong cut here takes money from a real person.
- **Never recommend deleting a security or safety control** (RLS policies, column privileges, the
  onboarding canary, the RLS canary, rate limits, the drift-prevention suite). Those exist because the
  matching outage already happened.
- **Deleting a surface is not the same as deleting the concept.** Several features are pure derived
  reads of tables the money loop already owns. Cutting the surface costs nothing and loses no data.
- **Judge by evidence, not by how good the idea sounds.** Every feature below sounded good.
- **The cost you are cutting is founder attention**, not compute. The question is "which of these will
  the founder have to think about, fix, explain, or keep in sync this quarter", not "which is slow".

### 0.6 The output that is wanted back

For each feature, one line: `ID | KEEP | HIDE | FLAG OFF | DELETE CODE | DELETE ALL` plus a one
sentence reason. Then:

1. **The cut list, ordered by attention saved** (biggest relief first), each with the reversal cost.
2. **The keep list**, with what specifically makes it earn its place at 9 artists.
3. **The duplication clusters**: where two or more features answer the same question, and which single
   one should survive.
4. **The single riskiest cut** you are recommending and what evidence would prove it wrong.
5. **What you would NOT cut even though it looks unused**, and why.

---

## 1. Legend

Each block reads:

- **Does:** what the feature actually does, mechanically.
- **Why:** the problem it was built to solve.
- **Benefit:** the value claimed for the user.
- **How:** implementation, in enough detail to judge coupling.
- **Evidence:** production usage as of 2026-08-13. "0 rows" is a measured fact. "unknown" means CRWN
  does not record it.
- **Coupling:** what breaks if it goes.

Status vocabulary: **LIVE** (reachable in production now), **DORMANT** (built, deliberately not
running), **DEAD** (present in the repo, nothing reaches it).

---

## 2. Group A: Identity, onboarding, account

### A-01 Authentication · LIVE
- **Does:** email/password and magic-link login, PKCE code exchange, session middleware, route protection.
- **Why:** every other feature needs an identity.
- **Benefit:** an account fans and artists own.
- **How:** Supabase Auth, `src/middleware.ts` (which deliberately excludes `/api/`, so every API route establishes its own authority), `AuthProvider` context.
- **Evidence:** 69 accounts.
- **Coupling:** everything. Not cuttable.

### A-02 Artist setup wizard (`/setup`) · LIVE
- **Does:** 12 single-field screens taking a new artist from signup to a published page: artist name, link, photo, tier ladder, promises, Stripe, content plan, track audio, track title, product type, title, price. Ends on a launch review screen.
- **Why:** the old dashboard dumped a new artist into 16 tabs and they did nothing. This is the one linear path to a page that can take money.
- **Benefit:** an artist reaches a sellable page in one sitting.
- **How:** flat `SCREENS` list in `src/app/setup/page.tsx`; completion is DERIVED from live database reads (`useArtistSetup`), never stored per step; a hard gate in `(main)/layout.tsx` redirects any incomplete artist back; identity and avatar writes go through service-role routes because RLS blocks the browser writes.
- **Evidence:** 9 artists exist, so it has run about 9 times. `setup_completed` is the only stored flag.
- **Coupling:** the single funnel entry for every artist. Not cuttable. Individual SCREENS are cuttable.

### A-03 Post-signup journey resolver · LIVE
- **Does:** decides where a user lands after signup: account gate, then setup gate, then a prefilled builder if they came from a calculator, then the dashboard.
- **Why:** four different entry points were each guessing a destination and two of them skipped the setup gate.
- **Benefit:** a calculator lead resumes exactly where they left off.
- **How:** `src/lib/journey/resolveJourneyDestination.ts`, pure, one resolver, validated `returnTo`.
- **Evidence:** 41 calculator results, 17 of them claimed by accounts.
- **Coupling:** signup, verify, the calculators.

### A-04 Onboarding health canary (cron) · LIVE
- **Does:** daily, creates a throwaway user, performs the real RLS artist-page insert, checks role promotion, exercises upload validation, deletes the user, emails the founder on any failure.
- **Why:** artist publishing broke silently for months because a migration half-applied.
- **Benefit:** the founder learns within 24 hours that signup is broken, instead of from a user.
- **How:** `/api/cron/onboarding-health`, `0 7 * * *`.
- **Evidence:** runs daily; no incident since.
- **Coupling:** none. **Do not cut. This is insurance against the exact outage that already happened.**

### A-05 Account management · LIVE
- **Does:** `/account/profile`, `/account/tiers`, `/account/payouts`, `/account/billing`, `/account/referrals`, `/profile`, `/profile/notifications`, plus deactivate/reactivate.
- **Why:** artists need to change what setup created.
- **Benefit:** self-service instead of founder support.
- **Evidence:** unknown (no per-screen telemetry).
- **Coupling:** billing and payouts are money-adjacent; profile is not.

### A-06 Roles and the artist gate · LIVE
- **Does:** fan / artist / admin. Publishing a page promotes fan to artist via a database trigger; a user cannot change their own role.
- **Why:** a client-side role write failed silently and left artists stuck as fans.
- **Benefit:** correct permissions without a manual step.
- **How:** `trg_promote_to_artist`, column-level RLS freeze on `profiles.role`.
- **Coupling:** everything artist-facing. Not cuttable.

---

## 3. Group B: The artist page and catalog (the actual product)

### B-01 Public artist page `/[slug]` · LIVE
- **Does:** the artist's storefront: bio, banner, music, shop, tiers, community, testimonials, live.
- **Why:** the thing an artist sends their audience to. This is the product.
- **Benefit:** one owned destination replacing a link-in-bio plus five services.
- **How:** `src/app/[slug]/page.tsx` plus sections. Owner checks are `session.user.id === artist.user_id` (an earlier version treated "is any artist" as owner and leaked owner controls onto other artists' pages).
- **Evidence:** 1,690 recorded page visits. The most used surface CRWN has after the app shell.
- **Coupling:** the center of the product. Not cuttable.

### B-02 Owner preview mode · LIVE
- **Does:** lets the owner view their own page as a visitor or as any tier.
- **Why:** artists could not tell what a fan actually sees, and mis-gated their own content.
- **Benefit:** confidence that the paywall is set correctly before promoting.
- **How:** `useSubscription` is the single injection point, and the override may only ever REMOVE access, which is what makes it safe.
- **Evidence:** unknown.
- **Coupling:** 13 gated consumers read through the one hook.

### B-03 Share / OG pages · LIVE
- **Does:** dedicated pages for a track, album, post or playlist so a shared link previews correctly.
- **Why:** a shared link to a tab inside a page previews as the page, not the song.
- **Benefit:** shares look like the content.
- **Evidence:** unknown.
- **Coupling:** low. Note there is a **duplicate dead copy** at `/artist/[slug]/*` (see K-02).

### B-04 Embed player · LIVE
- **Does:** `/embed/[trackId]`, free tracks only, signed audio.
- **Why:** artists want a player on their own site.
- **Benefit:** reach off-platform.
- **Evidence:** unknown, likely zero.
- **Coupling:** none. Standalone route.

### B-05 Music manager and upload · LIVE
- **Does:** upload, edit, order, delete tracks. Dual bitrate audio (128/320) in Cloudflare R2, private bucket, signed URLs only where entitlement is proven.
- **Why:** the catalog is the reason a fan subscribes.
- **Benefit:** hosting the artist would otherwise pay for.
- **How:** `MusicManager`, `TrackUploadForm`, `src/lib/r2/*`, `tracks.audio_url_*` are locators with SELECT revoked from browser clients.
- **Evidence:** 72 tracks.
- **Coupling:** albums, playlists, gating, the player, the waterfall. Core.

### B-06 Albums / projects · LIVE
- **Does:** group tracks into an album or EP with one cover. `album_tracks.track_number`.
- **Evidence:** 9 albums.
- **Coupling:** the setup wizard's project path builds one.

### B-07 Artist playlists · LIVE
- **Does:** artist-curated playlists (`playlist_tracks.position`).
- **Evidence:** 1 playlist across the whole platform.
- **Coupling:** low. A strong hide candidate.

### B-08 Fan library, favorites, fan playlists · LIVE
- **Does:** a fan's saved music, purchases and playlists.
- **Evidence:** 6 favorites, 1 playlist total.
- **Coupling:** low.

### B-09 Persistent audio player · LIVE
- **Does:** playback that survives navigation (which is why the codebase forbids `window.location.href` for internal links).
- **Why:** a music product where playback stops on navigation is not a music product.
- **Coupling:** global provider. Not cuttable.

### B-10 Scheduled releases (cron) · LIVE
- **Does:** daily job publishing tracks whose release date has arrived, and opening waterfall tiers.
- **Evidence:** runs daily; usage of scheduling unknown.
- **Coupling:** also carries promise reminders. Read the cron before cutting.

### B-11 Content classes · LIVE
- **Does:** ONE dropdown deciding access: free forever / members first, public later / members only.
- **Why:** the previous two independent toggles could produce a future date with an empty tier list, which the gate read as locked for everyone, members included.
- **Benefit:** an artist cannot accidentally lock out the people paying them.
- **How:** `fieldsForClass()` derives `is_free` / `allowed_tier_ids` / `public_release_date`; `classifyTrack()` reads them back.
- **Coupling:** the entitlement gate. Do not reintroduce independent toggles.

### B-12 Release waterfall · LIVE (migration PENDING, fails soft)
- **Does:** stagger a release so higher paying tiers get it first, opening lower tiers on a schedule.
- **Why:** a reason to be on the top rung.
- **How:** a schedule on `tracks.waterfall`, opened ADDITIVELY by the daily cron. The entitlement gate is never touched, so a scheduler bug can open a tier early, never lock a paying member out.
- **Evidence:** the migration is not applied in production, so this is currently inert and falls back to all-at-once.
- **Coupling:** self-contained. **An honest delete candidate: it is unapplied, unused, and adds a concept to the release flow.**

### B-13 Track cap enforcement · LIVE
- **Does:** a database trigger refusing track 51 on the free Launch plan.
- **Why:** tracks are inserted straight from the browser, so no API guard could cover it.
- **Benefit:** the advertised limit is real.
- **Evidence:** 72 tracks across 9 artists, so no one is near it.

---

## 4. Group C: Money

### C-01 Fan subscription tiers · LIVE
- **Does:** an artist defines paid membership rungs; fans subscribe monthly through Stripe.
- **Why:** the whole business.
- **Benefit:** recurring income the artist owns.
- **How:** prices created on the PLATFORM Stripe account, checkout uses `transfer_data.destination` to the connected account, `application_fee_percent` from the artist's plan.
- **Evidence:** 18 tier rows, 11 active subscriptions, 7 of them paid. **This is the only rail that has ever produced recurring revenue.**
- **Coupling:** everything monetization. Not cuttable.

### C-02 Tier benefits catalog · LIVE
- **Does:** structured benefits attached to a rung (early access, monthly vault unlock, listening event, and so on), some marked "coming soon" and unavailable.
- **Why:** "support me" does not convert; a named list of what you get does.
- **Benefit:** the fan knows what they bought.
- **Evidence:** 52 benefit rows.
- **Coupling:** benefits seed Promise Calendar obligations, so cutting benefits cuts the calendar's input.

### C-03 Recommended tier ladder (Bronze / Silver / Gold / Platinum) · LIVE
- **Does:** one-click application of a four-rung ladder at $0/$10/$25/$100.
- **Why:** artists asked to design pricing froze.
- **How:** `src/lib/tierTemplate.ts` is the single source of truth; `applyTierTemplate.ts` is the one apply path shared by the wizard and Rise Mode; legacy names are matched so an artist is never offered a duplicate rung.
- **Evidence:** live tier rows show both the new names (Bronze/Silver/Gold/Platinum) and the pre-rename ones (The Wave, Inner Circle, The Vault, The Throne), so it has been applied.

### C-04 Founder window · LIVE
- **Does:** a capped, time-limited founding-member price on a tier.
- **Why:** urgency and scarcity at launch.
- **How:** cap and deadline enforced in checkout on both the free and paid paths.
- **Evidence:** unknown, likely unused. Grandfathered founder PRICING is deliberately NOT built.

### C-05 One-time products (shop) · LIVE
- **Does:** sell digital or physical products from the artist page.
- **Evidence:** 8 products listed, **0 purchases ever**.
- **Coupling:** the setup wizard's shop group, checkout, the offers aggregator.
- **Note for the reviewer:** built, advertised, and has never taken a dollar.

### C-06 Track sales · LIVE
- **Does:** sell an individual track.
- **Evidence:** 0 purchases ever.

### C-07 Live tickets (pre-sale) · LIVE
- **Does:** sell a ticket to a livestream.
- **How:** `src/lib/live/access.ts` is the ONE resolver for "ticket equals access", after an incident where six gates decided access and only three honored a ticket.
- **Evidence:** 0 ticket purchases ever.

### C-08 Live tips and tip goals · LIVE (flag ON)
- **Does:** fans tip during a stream against a visible goal.
- **Evidence:** 0 tips ever.

### C-09 Booking tokens · LIVE
- **Does:** a purchased session grants a token the fan redeems.
- **Evidence:** 0 booking tokens.
- **Coupling:** supersedes the dead Calendly components (K-04).

### C-10 Discount codes · LIVE
- **Does:** percentage or fixed discounts, Pro-gated.
- **Evidence:** could not read the table under its expected name; usage effectively zero given 0 purchases.

### C-11 Stripe Connect onboarding, status, payouts, cashout · LIVE
- **Does:** artist connects a Stripe Express account; CRWN reads status, backfills tier prices on connect, shows balance, supports on-demand cashout.
- **Why:** money must reach the artist's bank.
- **How:** connect ids are read ONLY through `src/lib/stripe/connectAccount.ts` with the service role, because naming a revoked column from a browser client fails the entire query and silently killed every checkout once.
- **Evidence:** 7 connected accounts, on Stripe's own daily automatic payout schedule.
- **Coupling:** the money path. Not cuttable.

### C-12 Stripe webhook · LIVE
- **Does:** the one place earnings, subscriptions, purchases, refunds and disputes are written.
- **How:** signed, idempotent, and it REFUSES any test-mode event when the live key or production database is configured (a test-mode checkout once wrote a fake Pro plan into production).
- **Evidence:** 55 earnings rows.
- **Coupling:** everything money. Not cuttable.

### C-13 Platform plans: Launch / Pro / Scale · LIVE
- **Does:** what the artist pays CRWN. Launch free at 12 percent, Pro $49 at 8 percent, Scale $199 at 5 percent.
- **How:** `TIER_LIMITS` and `TIER_PRICING` are the single source; checkout verifies the live Stripe price amount before selling; a plan change may never open a second checkout (a second subscription orphans the first and bills forever).
- **Evidence:** **0 artists on a paid plan.** All 9 are Launch.
- **Note for the reviewer:** every Pro-gated feature (DMs, live, scheduling, bundles, clipper, discount codes) is therefore reachable by zero artists today.

### C-14 Platform plan reconciler · LIVE
- **Does:** asks Stripe whether a stored plan is real and downgrades only when Stripe positively reports no live subscription.
- **Why:** a stored plan is a claim; several paths could set `pro` with nothing billing.
- **Coupling:** the billing screen self-heals on load.

### C-15 Subscription lifecycle: pause, cancel, tier change, transitions · LIVE
- **Does:** fan-side subscription management, plus recorded tier transitions.
- **Evidence:** 19 subscription rows include 8 canceled, so cancellation has been exercised.
- **Known gap:** downgrade scheduling writes a pending change to the database, and no Stripe-side schedule call was found in that route.

### C-16 Earnings ledger and payout dashboard · LIVE
- **Does:** the artist's record of what they earned, net of fees.
- **How:** `earningsNet.ts` is the one net formula; all earnings writes live in `webhookHandlers.ts` or need a registered exception.
- **Evidence:** 55 rows.

### C-17 Team Splits · LIVE (funding and cashout deliberately disabled, 503)
- **Does:** an artist splits revenue with collaborators using a capped hybrid model: percentage sets the rate, a cap sets the total. Deliverables, disputes, release, accrual cron, separate cashout ledger, atomic cap reservations.
- **Why:** producers and features get paid, so the artist can actually release the record.
- **Benefit:** replaces a spreadsheet and a promise.
- **How:** `src/lib/teamSplits/*`, artist-funded only (CRWN platform revenue never subsidizes a collaborator share), collaborator authority is the authenticated user id and never a mutable email.
- **Evidence:** **0 deals, 0 team split earnings.** Carefully engineered, heavily tested, never used.
- **Coupling:** own tables and routes, an accrual cron, a self-check cron, an admin tab. Self-contained.
- **Note for the reviewer:** this is the largest single body of unused engineering in the product.

### C-18 Free subscribe path · LIVE
- **Does:** joining a free tier without Stripe.
- **Evidence:** 4 active free subscriptions.
- **Known limitation:** it writes no referral row, so free joins are UNMEASURABLE for attribution and must be reported as missing rather than zero.

---

## 5. Group D: Fan-facing engagement

### D-01 Home feed · LIVE
- **Does:** posts and tracks from artists the fan follows, plus Supporter Mode if the quest flag is on.
- **Evidence:** 10 community posts platform-wide, so the feed is nearly empty.

### D-02 Explore / discovery · LIVE
- **Does:** browse artists and tracks.
- **Evidence:** unknown. With 9 artists, discovery has almost nothing to discover.
- **Note:** at this scale, a discovery surface implies a marketplace CRWN does not have.

### D-03 Community feed and posts · LIVE
- **Does:** artist posts, fan comments, tier-gated posts.
- **Evidence:** 10 posts.
- **Coupling:** the artist page Community tab, notifications.

### D-04 Community channels · LIVE
- **Does:** persistent tier-gated chat channels with realtime.
- **Evidence:** **0 channels ever created.**

### D-05 Direct messages and voice notes · LIVE (Pro-gated)
- **Does:** artist to fan DMs, including recorded voice notes, private bucket with signed audio.
- **Evidence:** **0 conversations, 0 messages.** Also gated to Pro, which zero artists have.

### D-06 DM broadcast · LIVE
- **Does:** message a targeted audience segment at once, with hourly and daily caps.
- **Evidence:** 0 messages.

### D-07 Notifications · LIVE
- **Does:** in-app bell with realtime, 12 producing modules, one chokepoint (`createNotification`).
- **Evidence:** 184 rows, with a recorded burst of 41 in a single day, mostly quest and level-up celebrations.
- **Known gap:** no web push. Some legacy notification rows link to `/community`, a route that does not exist.

### D-08 Fan leaderboard · LIVE
- **Does:** ranks an artist's top supporters.
- **How:** publishes no score, because the points total was exactly invertible back to a fan's lifetime spend.
- **Evidence:** unknown.

### D-09 My Calendar (fan) · LIVE
- **Does:** read-only aggregation of what a fan is owed and what is coming (streams, drops, promises).
- **Evidence:** derived, no own table.

### D-10 Command centre / Supporter Mode / Earn / Impact · LIVE
- **Does:** the fan-side equivalent of Rise Mode: quests, earnings from referrals and clips, impact stats.
- **Evidence:** quest instances exist (326 across both roles); fan referral rows are **0**.

### D-11 Fan badges · LIVE
- **Does:** non-cash recognition (for example the `promoter` badge).
- **Coupling:** the only reward Fan Drives can grant.

### D-12 Fan referrals (fan brings fan) · LIVE
- **Does:** `/[slug]/r/[code]`, a cookie, a referral row, a commission.
- **Evidence:** **0 referral rows ever.**
- **Coupling:** Fan Drives derives its entire outcome measurement from this table. If referrals stay at zero, Fan Drives can never report anything.

### D-13 Clipper program and clip-to-earn · LIVE
- **Does:** fans clip the artist's content and earn a rate per view; `clip-controls` turns VOD markers into clip missions; a cron drops the rate.
- **Evidence:** 1 VOD marker, 0 clip bounties, 0 referral conversions.

### D-14 Live streaming and VOD · LIVE (Pro-gated)
- **Does:** LiveKit broadcast, tier or ticket gated watch room, chat, egress recording to R2, signed VOD playback, a signed live agreement.
- **Why:** the highest-value thing a membership can promise.
- **Evidence:** 8 live sessions created, 0 tickets sold, 0 tips.

### D-15 Executive Producer Sessions · LIVE (flag ON, Phase 1)
- **Does:** during a paid session, fans submit beats, vocals, ideas or references; the artist reviews them in a queue; advisory polls run in session.
- **Why:** a lead magnet sold this before it existed, and the founder chose to build it rather than retract it.
- **How:** not a new stream type, it is a `live_session` with submissions and polls bolted on, gated through the same live access resolver. A final, enforced fan submission agreement (version `2026-07-24.v1`) means a submission transfers nothing.
- **Evidence:** **0 submissions, 0 polls.**
- **Not built:** stage/mic (needs a likeness release), moderation, seat types.

### D-16 Fan testimonials · LIVE (migration applied 2026-08-12)
- **Does:** after a fan experiences value (a promise delivered plus 3 days, or 30 days paid and still active), asks one contextual question, stores their words with a permission scope in the artist's private library, and lets the artist publish chosen ones.
- **Why:** an artist page has no social proof, and asking manually is awkward.
- **How:** two triggers only, read from canonical tables. No email, no AI, no rewards, no star ratings. Authorship is immutable at the database.
- **Evidence:** 7 asks created by the live generator, **0 testimonials collected.** Too new to judge.

### D-17 Surveys · LIVE
- **Does:** a 1-to-5 plus free text survey delivered as a pop-up kind; low scores email the founder.
- **Evidence:** **0 survey responses.**

---

## 6. Group E: The artist growth toolkit (the largest cluster of parallel surfaces)

Every item in this group is a separate route, separate table, separate tour and separate hub entry.
They were built as parallel "movement mechanics". Usage is the reason this group is listed together.

### E-01 Fan Missions · LIVE
- **Does:** the artist sets a task ("share this", "stream on day one"), fans join and complete it.
- **Why:** "please support me" produces nothing; one clear instruction produces action.
- **Evidence:** 3 missions ever, **0 participants.**

### E-02 Fan mission suggestions · LIVE
- **Does:** fans propose missions from the artist page; the artist reviews.
- **Evidence:** **0 suggestions ever.** It also feeds one of the three Needs You event rules, which therefore never fires.

### E-03 Fan Squads · LIVE
- **Does:** fans group into named squads with shared mission goals.
- **Evidence:** 1 squad ever.

### E-04 Clip Bounties · LIVE
- **Does:** the artist posts a clipping bounty with a non-cash reward; fans submit clips.
- **Evidence:** **0 bounties ever.** It also feeds a Needs You rule (`clip-window-closing`) that therefore never fires.

### E-05 City Unlocks · LIVE
- **Does:** fans in a city contribute toward unlocking a show there.
- **Evidence:** **0 unlocks, 0 contributions.**

### E-06 Road To campaigns · LIVE
- **Does:** a public fan-facing goal ("Road to 1,000 members") with contribution tracking.
- **Evidence:** 1 campaign ever.

### E-07 Proof of Demand · LIVE
- **Does:** test whether an offer would sell before building it; fans respond on a public page.
- **Evidence:** 1 test, 1 response.

### E-08 Fan Drives (Virality Engine V1) · LIVE
- **Does:** a campaign wrapper that recruits fans as promoters, with an archetype registry and a server-side gate that only serves REACH and FIRST_PAID diagnoses.
- **Why:** turn the referral rail into an organized, time-boxed drive.
- **How:** deliberately thin. The campaign is a DIMENSION over existing evidence: outcomes are derived by asking the referral rail a narrower question. No new attribution, no money column (non-cash is CHECK-constrained at the database), no leaderboard.
- **Evidence:** **0 campaigns, 0 participants.** Its measurement source (`referrals`) is also 0.

### E-09 Offer builder (aggregator) · LIVE
- **Does:** a read-only view over tiers and products framed as "your offers", with a guided creation flow.
- **Evidence:** no own table. Wraps things that exist.

### E-10 Campaign Hub · LIVE
- **Does:** an overview across promotion, missions and campaigns.
- **Evidence:** its Overview duplicates `/campaigns`, and its per-campaign breakdown is a "coming soon" placeholder.

### E-11 Smart links and pre-save · LIVE
- **Does:** a public link page that captures an email or a pre-save before release.
- **Evidence:** **0 smart links ever.**

### E-12 Playbooks · LIVE
- **Does:** multi-step guided runs of a growth play.
- **Evidence:** the run engine is thin; no runs found.

---

## 7. Group F: Artist marketing, email and CRM

### F-01 Email campaigns · LIVE
- **Does:** compose, target by audience segment, test-send, schedule, send through Resend; open, click and unsubscribe tracking.
- **Why:** email is the one channel an artist owns.
- **How:** quota enforced at CREATE and authoritatively at SEND (`emailQuota.ts`), because a draft costs nothing and only a send spends the plan allowance.
- **Evidence:** 1 campaign ever created.

### F-02 Email sequences · LIVE
- **Does:** multi-step automated sequences (welcome, win-back, inactive subscriber), driven by a daily cron.
- **Evidence:** 42 sequence rows, largely the seeded defaults; 7 active `inactive_subscriber` sequences exist.

### F-03 Saved segments · LIVE
- **Does:** reusable audience definitions.
- **Evidence:** **0 segments ever.**

### F-04 Artist CRM · LIVE
- **Does:** a fan table with detail drawers, notes, actions and suggestions.
- **Evidence:** unknown; the fan base is 69 accounts platform-wide.

### F-05 Fan contact import (including Patreon) · LIVE
- **Does:** CSV import of an existing audience, with automatic recognition of a Patreon Relationship Manager export and tier suggestion.
- **Why:** the ideal customer already sells direct somewhere else, and switching costs are the objection.
- **How:** import requires a versioned permission attestation stored per row; import never sends anything, invites go through the campaign sender.
- **Evidence:** **0 contacts imported ever.**

### F-06 Launch Kit · LIVE
- **Does:** generates announcement and follow-up email copy plus social, story and DM copy from the artist's real page, as DRAFTS. It never sends.
- **Evidence:** 1 campaign exists platform-wide, so at most one use.

### F-07 Fan digest (cron) · LIVE
- **Does:** weekly digest email to fans.
- **Evidence:** runs weekly; open rates unknown.

### F-08 Inactive subscriber re-engagement (cron) · LIVE
- **Does:** enrolls 14-day-inactive fans into a re-engagement sequence, daily.
- **Note:** the dormant autonomous Manager has an action that duplicates this exactly. If autonomy ever returns, that action should be dropped rather than restored.

---

## 8. Group G: The guidance layer (the densest overlap in the product)

Five separate systems can tell an artist what to do next. A formal ownership contract exists
(`src/lib/constraint/ownership.test.ts`) precisely because they kept contradicting each other. That
contract is evidence the layer is too big for its stage, and it is the first place the reviewer
should look for cuts.

| Role | Owner | Answers |
|---|---|---|
| Diagnosis and priority | **Constraint Engine** | What matters most right now, and the one corrective action |
| Launch readiness | **Roadmap** | What must exist before any of that means anything |
| Fan obligations | **Promise Calendar** | What this artist owes a fan, and when |
| Coaching on the chosen action | **AI Manager** | Why it matters and how to do it |
| Events and deadlines | **Needs You** | What happened, what is due, what fans are waiting on |

Everything else (Rise Mode, quests, playbooks, builders) is execution and may not select priority.

### G-01 Quest Engine / Rise Mode · LIVE (flag ON)
- **Does:** the artist's progression game. 71 quests across a tutorial plus Levels 1 to 10 plus Empire Mode, XP, levels, side quests, an opt-in full quest map, a victory banner.
- **Why:** artists stall after signup; a next step with a reward was the answer chosen.
- **How:** completion is authoritative (`DomainCheck`s over live database state), not self-reported, except for explicitly `manual` coaching steps which go through a guarded route that refuses to complete any domain or financial quest.
- **Evidence:** **326 quest instances, the highest engagement number in the product outside page visits.**
- **Coupling:** the Rise Mode resume pop-up, the roadmap evaluator, notifications, the recap banner, `verify:quests`.
- **Known issue:** progress climbing does not prove engagement, because a domain check rises whenever the ACCOUNT changes, not when anyone opens a quest.

### G-02 Personalized roadmap · LIVE
- **Does:** 5 stages of launch readiness, shown above Rise Mode.
- **How:** a VIEW over the Quest Engine, evaluated on read, stored nowhere, never grants XP.
- **Evidence:** derived, no rows.

### G-03 Constraint Engine · LIVE
- **Does:** diagnoses the earliest blocking constraint (fulfillment, retention, reach, free capture, first paid, tier interest, checkout completion, depth) and returns exactly ONE action with its evidence.
- **Why:** CRWN's first closed artist feedback loop, and the answer to "everything tells me something different".
- **How:** deterministic, no AI provider involved. Reads, never writes. Renders nothing on insufficient evidence, so the default experience is unchanged. Every input is nullable and null means "cannot evaluate", never zero.
- **Evidence:** `constraint_recommendations` holds **1 row**. The engine has essentially never issued, because 9 artists do not generate enough evidence to cross a sample floor.

### G-04 Artist-observed rates · LIVE
- **Does:** derives this artist's own free-capture and checkout-completion rates from evidence already assembled, and falls back to the generic model when thin.
- **Evidence:** with 1,690 visits across 9 artists, most artists are below the sample floor.

### G-05 Needs You (`/action-plan`) · LIVE
- **Does:** events, deadlines and unfinished attention. Three deterministic rules: clip window closing, pending fan suggestions, proof of demand met.
- **Evidence:** all three inputs are at or near zero (0 bounties, 0 suggestions, 1 proof of demand), so this surface has almost nothing to say.

### G-06 AI Manager · LIVE (artist-requested only)
- **Does:** DeepSeek-generated insights and up to 4 approval-gated actions, under a canonical brief that outranks its own framework.
- **Why:** an artist wants the reasoning, not just the instruction.
- **How:** the model may PROPOSE and may never authorize itself. Actions expire after 14 days and are re-validated against current state at execution.
- **Evidence:** 7 actions and 7 insights, all time. Approval history across the entire dataset: 1 approved, 1 rejected, 3 abandoned for 130 days.

### G-07 Autonomous (scheduled) Manager · DORMANT by decision
- **Does:** nothing. Two gates hold it shut: an `is_active` filter on a column that does not exist, and an early return for artists on the free plan, which is all 9.
- **Note:** it re-arms itself the day one artist upgrades to Pro, with no code change. That is the real deadline on the decision.

### G-08 Promise Calendar and fulfillment · LIVE
- **Does:** turns tier benefits into dated obligations to fans, tracks delivery, marks misses, and reminds the artist on configurable lead times.
- **Why:** a membership is a promise, and a broken promise is the fastest churn there is.
- **How:** `promisePlan.ts` derives obligations from benefits with dedup and inheritance; one owner sends promise reminders after two systems were found emailing the same artist about the same obligation three hours apart.
- **Evidence:** 97 obligations and 97 fulfillment events, the largest artist-side dataset after quests. Note that most events measured during the reminder fix were Revenue Ramp steps, not fan promises.

### G-09 Revenue Ramp · LIVE
- **Does:** dates the calculator's 12-month number into a sequence of business steps.
- **Why:** an artist who sees "$4,000 a month" needs a month-by-month path.
- **Important boundary:** ramp steps are business progression and are NEVER fan promises. Confusing the two caused the reminder incident above.

### G-10 Membership strategy card · LIVE
- **Does:** deterministically picks Release Club or Vault Membership and explains it.
- **How:** derived on read; the only stored value is the artist's override, whose migration is still PENDING in production (so saving an override currently fails soft).

### G-11 Starter offer recommendation · LIVE
- **Does:** derives ONE recommended first offer on read; the tier row is the persistence.

### G-12 Operating flow resolver · LIVE
- **Does:** decides which single owner holds the primary CTA on the artist home, so two cards cannot both render a gold "Do it now" button pointing at different places (which happened).
- **How:** pure, reads back the `ConstraintResult` the page already fetched once.

### G-13 Milestones and activation milestones · LIVE
- **Does:** records first-track, first-tier, Stripe-connected, first-member, first-revenue milestones; drives lifecycle nudge emails that are gated on one milestone present and another absent.
- **Evidence:** verified across all 9 artists: no reachable stale-stage email exists.

### G-14 Pop-up engine · LIVE (flag ON)
- **Does:** the ONE governed interruption path. 19 pop-ups: feature announcements, Stripe nudge, upgrade prompts, Rise resume, fan first support, share your experience, terms notice, a survey.
- **How:** max one pop-up per user per calendar day on top of each pop-up's own frequency cap, priority-sorted single winner, and an announcement is skipped for accounts created after the change went live.
- **Evidence:** 16 pop-up events recorded.

### G-15 Communications governor · LIVE
- **Does:** classifies artist-facing CRWN notifications into 8 precedence classes and can DEFER a growth notification when the artist is launch-blocked or owes a paying fan.
- **Scope warning:** it governs artist-facing CRWN notifications only. Lifecycle email, pop-ups, artist-authored fan mail and receipts are explicitly NOT governed.
- **Evidence:** V1 emits no suppression at all, only deferral.

### G-16 Guided tours · LIVE
- **Does:** 23 separate driver.js tours, one per surface.
- **Evidence:** unknown. 23 tours is itself a signal about how many surfaces exist.

### G-17 Opportunity ledger and sync opportunities · LIVE
- **Does:** tracks revealed / activated / captured / remaining opportunity per artist per feature per month; a cron generates sync licensing listings with OpenAI.
- **Evidence:** 143 sync opportunity rows, all synthetic (model-generated, not real listings).
- **Note for the reviewer:** synthetic listings presented to artists as opportunities is a truthfulness risk, not just a cost.

---

## 9. Group H: Acquisition (the public funnel)

### H-01 The 20 public calculators · LIVE
- **Does:** free public tools that reveal what an artist is LOSING (vault revenue, own your fans, streaming loss, live experience, share to earn, clip to earn, team split, promise calendar, quest path, movement page, fan journey, leaderboard, founder window, proof of demand, fan mission, royalty readiness, producer session, fan stack, between tour, and the all-in-one Opportunity Calculator).
- **Why:** this is the top of the acquisition funnel and the reason anyone signs up.
- **How:** almost everything is shared (`PublicToolClient`, `ToolHero`, `LeadMagnetWizard`, `LeadMagnetResult`, `DeliverableBuilder`); per-tool differences are DATA in one registry. The result is never gated and always correctable.
- **Evidence:** 41 results captured, 496 funnel events, 1,690 page visits. **This is the busiest part of the product after the artist page.**
- **Coupling:** ManyChat keywords, campaign links and every historical funnel row are keyed to the slugs, so a slug may never be renamed.

### H-02 Unified Opportunity Calculator · LIVE
- **Does:** the only tool that models the whole business at once, and REFUSES to add the other tools together (their headlines sum to ~$550k/mo on one audience that the repo's own model says yields 2,250 payers).
- **Benefit:** one number an artist can believe.
- **Evidence:** 82 tests assert its invariants. Usage is inside the 41 results.

### H-03 Own Your Fans value-before-signup builder · LIVE
- **Does:** lets an anonymous visitor build a real fan page draft before creating an account, then claims it at signup.
- **How:** the draft is an unclaimed `lead_magnet_results` row, so no new table and no cookie.
- **Evidence:** it is the assigned experience of the one running experiment.

### H-04 Tokenized results, email delivery, recalculation · LIVE
- **Does:** a shareable result link, an emailed copy, and a "change an answer and recalculate" control that never counts as a second completion.

### H-05 Prospect nurture · LIVE
- **Does:** a 25-email, roughly 12-month sequence for leads who took a calculator, asked for the result by email, and did not sign up. Exits the moment they sign up.
- **Evidence:** **0 enrollments**, because `lead_magnet_leads` is 0: every captured result so far came with an account or without an email-only path.

### H-06 Qualified call requests and lead scoring · LIVE
- **Does:** a hand-raiser control under the calculator result; the server recomputes qualification with the canonical scorer and emails the founder for sales-priority leads only, deduplicated one per phone per day.
- **How:** a client-sent quality band is never trusted.
- **Evidence:** unknown count; the mechanism is live.

### H-07 Instagram / ManyChat acquisition engine · LIVE (flag ON)
- **Does:** a DM keyword resolves a tool, runs the same adapter, and returns a tokenized result link.
- **How:** ManyChat cannot HMAC-sign, so it uses a shared secret plus idempotency.
- **Evidence:** **411 acquisition events.** This is a genuinely active channel.

### H-08 Campaign attribution · LIVE
- **Does:** normalizes tagged links into eight allowlisted dimensions and persists them on the calculator result, so a video survives the anonymous-to-signup boundary.
- **How:** the client beacon is LAST touch; persisted attribution is FIRST touch and can never be erased by a later untagged visit. Attribution is a reporting dimension only and may never reach a price, a fee, or an authorization decision.

### H-09 Sub-avatars · LIVE (admin-only)
- **Does:** deterministically classifies a lead into one of four ideal-customer segments from their calculator answers, for cohort analysis.
- **Important:** internal evidence, not an artist-facing feature. The artist is never asked to self-select and the only artist-visible output is one sentence of setup copy that never names the segment.

### H-10 Experiments engine · LIVE (flag ON)
- **Does:** deterministic assignment to prebuilt code variants, with variant-attributed outcomes. An experiment can never change pricing, fees, ownership or RLS.
- **Evidence:** 1 experiment, **4 experiment events.** At 41 results the sample cannot decide anything.

### H-11 Opportunity funnel analytics layer · LIVE
- **Does:** a typed lifecycle and promotion view over the 20 tools, with 35 event names on the existing sink.
- **How:** the server allowlist is DERIVED from the event registry, after the two lists drifted and silently dropped events.

### H-12 Post-win referral · LIVE
- **Does:** asks an artist to refer another artist right after their first paid conversion.
- **Evidence:** correctly silent until a first paid conversion exists.

### H-13 Recruiter / partner program · LIVE
- **Does:** external recruiters bring artists to CRWN and get paid; dashboard, Stripe payouts, qualification crons.
- **Evidence:** 5 recruiter rows, 2 invite codes.

### H-14 Launch partner / First Revenue Launch offer · LIVE
- **Does:** a concierge offer layered ON TOP of the open funnel (it never gates it), with admin-side engagement, evidence and margin tracking.
- **Evidence:** admin-only; engagements exist in schema, usage low.

### H-15 Support centre, AI chat, bug widget · LIVE
- **Does:** `/support` searches 14 getting-started guides, offers an AI chat over real guide content, escalates to a human admin tab, and a global bug-report button captures page context.
- **How:** escalation splits JUDGMENT from FAULT, so an API error alerts the founder without permanently locking the thread to a human.
- **Evidence:** 5 conversations, 17 messages. Real, small usage.

### H-16 Public marketing and legal pages · LIVE
- **Does:** `/about`, `/tools`, `/worth`, `/getting-started` plus guides, terms, privacy, DMCA, artist agreement, live agreement, submission agreement.
- **Note:** legal pages are hand-kept and must match the code, not be rendered from limits.

---

## 10. Group I: Admin and internal

### I-01 Admin dashboard · LIVE
- **Does:** roughly 18 tabs: Metrics, Pipeline, Funnel, Sequences, CRM, Email health, Experiments, Avatars, Money Model, Support, Manager Ops, Approvals, Partners, Acquisition, Lead Magnets, Prospect Nurture, Platform Sequences, Settings (feature flags), Team Splits.
- **Why:** one founder needs to see the business without SQL.
- **Note for the reviewer:** at 9 artists, several of these tabs report on populations of zero.

### I-02 Admin autonomous business agent · LIVE but internal
- **Does:** CRWN's OWN business agent (funnel, pipeline, partners, CRM), whitelisted auto-execution plus human escalation, coordination lock.
- **Distinct from** the artist AI Manager. Two agents, two subjects.

### I-03 Money Model measurement · LIVE (admin only)
- **Does:** engagement terms, founder labor cost, guarantee evidence, revenue by source, 30-day contribution margin per artist.
- **How:** null is never rendered as zero.

### I-04 Cross-artist evidence · LIVE (admin only)
- **Does:** produces cohort benchmarks only when 8 distinct artists, 200 observations and no single artist over 50 percent of them are all satisfied.
- **Evidence:** with 9 artists, this can essentially never emit.
- **History:** a live leak was closed here, where a "cross-artist" benchmark carrying another artist's MRR in dollars was being injected into every Manager prompt.

### I-05 Analytics dashboard · LIVE
- **Does:** artist-facing analytics: plays, revenue, cohort retention, churn benchmark.

### I-06 Visitor analytics · LIVE
- **Does:** hashed-fingerprint, bot-filtered page visit recording.
- **Evidence:** 1,690 visits. This is the input the Constraint Engine's reach and capture stages depend on.

### I-07 Product drift prevention suite · LIVE
- **Does:** `npm run verify:architecture` runs a deterministic invariant registry (ownership boundaries, money rails, frozen identifiers, navigation parity, doc-to-code contracts) in about 2.5 seconds with no credentials.
- **Why:** documentation and code kept disagreeing, and a stale doc caused real wrong decisions.
- **Do not cut.** This is the mechanism that keeps this very file honest.

### I-08 Live probes · LIVE
- **Does:** `verify:migrations` (which migrations are actually applied in production), `verify:flags`, `verify:stripe`, `verify:quests`.
- **Why:** "a migration file exists" and "the migration is applied" are different facts, and confusing them has caused silent dead features more than once.

### I-09 Crons (26) · LIVE
- **Does:** the full daily schedule (Vercel Hobby allows daily at most): onboarding health, RLS canary, agent health, activation nudges, onboarding reminders, platform CRM, platform sequences, sequences, sequence conversions, prospect nurture, scheduled releases, scheduled campaigns, inactive subscribers, lead scoring, fan digest, testimonial requests, clipper rate drops, team split accruals, team split self-check, constraint outcomes, outcome measure, recruiter qualify, recruiter recurring, AI manager, sync opportunities, weekly report.
- **Known dead ones:** `ai-manager`, `weekly-report` and formerly `weekly-payout` all filter on `artist_profiles.is_active`, **a column that does not exist**, so they silently no-op while a heartbeat reported them healthy. `outcome-measure` keeps its name for history but its Manager measurement half is retired.

### I-10 PWA · LIVE
- **Does:** installable app shell and an aggressive service worker cache (bumped on every frontend change).
- **Missing:** no push notifications.

---

## 11. Group J: Cross-cutting rules that are features in their own right

### J-01 Entitlement gating
`is_free` plus `allowed_tier_ids`, read through one hook, with redacting database views. The single
most security-sensitive logic in the product. Six gates once drifted apart.

### J-02 Private media and signed URLs
Audio and voice notes live in a private bucket. The stored URL is a locator; a signed URL is minted
only where entitlement is proven.

### J-03 Column-privilege hardening
Stripe ids, audio locators and contact fields have SELECT revoked from browser roles. Naming one
revoked column fails the ENTIRE statement (embedded joins included), which reads to callers as "not
found", which once killed every checkout on the platform.

### J-04 Rate limits and abuse controls
On user-initiated actions. These are abuse limits, not attention governance, and must not be counted
as communication caps.

### J-05 Interruption governance
Every interrupting surface must pass a governor. New pop-ups go in the registry, never as ad-hoc modals.

---

## 12. Group K: Already dead, duplicated, or stale (free deletions)

These are not judgment calls. They are confirmed dead or duplicated in the repo today.

| ID | Item | State | Action |
|---|---|---|---|
| K-01 | `(auth)/onboarding` | static placeholder, unreferenced | delete |
| K-02 | `src/app/artist/[slug]/*` subroutes | near byte-identical duplicates of `[slug]/*`, already drifted one field | delete or shim |
| K-03 | `/welcome` | retired 2026-07-30, now a redirect kept only because sent emails link to it | keep the redirect, delete the rest |
| K-04 | Calendly booking components (`CalendlyBooking`, `SessionManager`, `BookingSettings`) | zero importers, superseded by booking tokens | delete |
| K-05 | `OnboardingTaglineStep`, `ArtistProfileForm mode="onboarding"` | zero call sites | delete |
| K-06 | `src/components/ui/index.ts`, `src/hooks/index.ts` | `export {}` placeholders | delete |
| K-07 | Legacy `access_level` column and types | **CORRECTED 2026-08-13: NOT dead.** Content classes replaced the TRACK model only; `access_level` is still the live access model for products and albums (ShopManager/AlbumManager write it). | keep |
| K-08 | `useContentAccess` | DELETED 2026-08-13: its one consumer (GatedCommunityPost) itself had zero importers, so the pair went together | done |
| K-09 | Legacy `posts` / `comments` / `likes` tables | **CORRECTED 2026-08-13: NOT superseded.** The live share page `/[slug]/post/[id]`, PostCard and PostCreator read AND write them (5/26/32 rows). Parallel systems with different jobs, not a duplicate. | keep |
| K-10 | `sms_*` tables | SMS feature removed 2026-07-31, tables kept for consent history | leave dormant |
| K-11 | Manager outcome scoring columns (`baseline_metrics`, `outcome_metrics`, `outcome_delta`) and the `artist_action_outcomes` view | retired, zero rows ever written | drop when convenient |
| K-12 | Crons filtering `artist_profiles.is_active` | that column does not exist; they no-op daily while reporting healthy | fix or delete the crons |
| K-13 | `bg-crwn-card` | undefined Tailwind v4 token used across many files, compiles to transparent | fix, it is a visual bug |
| K-14 | `notifyNewPost` / `notifyNewComment` link `/community` | that route does not exist, so the notification 404s on click | fix |

---

## 13. Duplication clusters (where the reviewer should force a choice)

1. **"What should I do next?" is answered by five systems**: Rise Mode quests (326 rows), the
   Roadmap, the Constraint Engine (1 row), Needs You (all three inputs near zero), and the AI Manager
   (7 actions, 1 ever approved). A written ownership contract and a test suite exist to keep them from
   contradicting each other. At 9 artists, one of these could carry the whole job.
2. **Four things called "campaign"**: email campaigns, Campaign Hub, Road To campaigns, and Fan
   Drives (fan campaigns). Plus sequences. Distinct concepts, confusingly named, three of them with
   about one row each.
3. **Six fan-mobilization mechanics**: missions, squads, bounties, city unlocks, road campaigns,
   proof of demand. Combined production usage: 3 missions, 1 squad, 0 bounties, 0 city unlocks,
   1 road campaign, 1 demand test, and 0 participants anywhere.
4. **Two referral systems using the same word**: fan referrals (fan brings fan, 0 rows) and
   recruiters/partners (artist brings artist, 5 rows).
5. **Three social layers**: legacy posts/comments/likes, community posts, community channels
   (0 channels).
6. **Two live monetization paths that have never taken money**: tickets (0) and tips (0), on top of
   8 sessions that did happen.
7. **Twenty calculators sharing one engine**, which is genuinely well-consolidated, but 20 public
   tools is 20 pages of copy to keep true. Every one makes product claims in six separate fields, and
   that convention has already failed once (a tool sold a feature that did not exist).

---

## 14. Things the reviewer should NOT cut, with the reason

| Item | Why it stays even though usage looks thin |
|---|---|
| Onboarding canary, RLS canary | They exist because the matching silent outage already happened and ran for months |
| Drift prevention suite and live probes | They are what keeps documentation from lying, which has caused real wrong decisions |
| Column privilege and RLS hardening | Removing one is a data breach, not a simplification |
| Stripe webhook, Connect, earnings ledger, entitlement gating | Real money, real people |
| Track cap trigger | Tracks insert straight from the browser, so no API guard can replace it |
| Content classes | Its predecessor could lock a track for every paying member for the whole release window |
| Promise Calendar | 97 obligations is real artist-side usage, and a broken promise is the fastest churn |
| Rise Mode | 326 instances is the highest engagement number in the product outside page visits |
| The calculators and the ManyChat engine | 411 acquisition events and 41 results: this is the only working top of funnel |
| Live access resolver | It was written to end an incident where six gates disagreed about one ticket |

---

## 15. Open questions the reviewer may need answered

1. **Are the 7 paying subscriptions real fans or founder tests?** This decides whether the money loop
   is validated or only exercised. CRWN cannot answer it from data alone.
2. **Why has nothing ever sold one-time?** 8 products exist and 0 have sold. Is it demand, placement,
   or that no artist ever promoted the shop?
3. **Should Pro-gated features exist at all while 0 artists are on Pro?** DMs, live, scheduling,
   bundles, clipper and discount codes are all built, maintained, and reachable by nobody.
4. **Is a marketplace implied by Explore that CRWN does not intend to be?** 9 artists is not a
   catalogue.
5. **Which single guidance system should own "what next" at this stage?**

---

## 16. Provenance

- Feature list assembled from `src/app` (119 pages, 265 API routes), `src/lib`, `src/components`,
  `vercel.json`, `src/lib/architecture/invariants.ts` (the ratified feature and migration registry),
  and the existing Brain docs 02 (Feature Map) and 13 (Current State).
- Row counts read live from the production Supabase project with the service-role key on 2026-08-13,
  read-only, via PostgREST `count=exact`.
- "unknown" means CRWN records no telemetry for that question. It is never a stand-in for zero.
- Where a count could not be read because a table name differs from the guess, the entry says so
  rather than reporting zero.

---

*See also: [02-FEATURE-MAP.md](02-FEATURE-MAP.md) (architecture and rules per feature) ·
[13-CURRENT-STATE.md](13-CURRENT-STATE.md) (what is live, dark or dormant) ·
[26-PRODUCT-DRIFT-PREVENTION.md](26-PRODUCT-DRIFT-PREVENTION.md) (why the claims here are testable)*
