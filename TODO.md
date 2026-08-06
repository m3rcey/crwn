# TODO — Josh

Two lists. **Do Now** is one-shot work. **Ongoing** is never done.

A third list at the bottom, **On Claude's plate**, exists so you know what you are *not*
responsible for. Do not work those.

> **Done means DELETED.** Not ticked, not struck through, gone. Git remembers what was done and
> when; this file is only for what is still true. A list you have to read past is a list you
> stop reading.
>
> **Priority is not vibes.** P0 uses the definition from CLAUDE.md: *blocks artist acquisition
> or breaks money flows.* Everything else is P1 or P2.
>
> **Claude maintains this file.** Any time it creates work only you can do (a migration, an
> env var, a pricing call, a legal call), it must add it here in the same commit. If you find
> a founder-blocking task that is not in this file, that is a Claude bug, and say so.

---

## Do Now

### P0 — money flows or acquisition are blocked

Nothing. Cleared 2026-08-01: Stripe repricing live and verified, the Resend webhook exists
(both the main and outreach endpoints), and every migration is applied.

### P1 — real risk or real friction, but nothing is on fire

- [ ] **Run the launch-partner migration:**
      [`supabase/schema-phase2-launch-partner.sql`](supabase/schema-phase2-launch-partner.sql).
      Adds `artist_profiles.launch_partner` (the First Revenue Launch cohort flag, server-only
      reads, no client grants, no view rebuild). Until it runs, the First Paid Member Guarantee
      checklist stays invisible for everyone, which is the correct fail-soft. Self-verifies.

- [ ] **Pick the first THREE launch partners and flip their flag:**
      [`supabase/enable-launch-partner.sql`](supabase/enable-launch-partner.sql). Edit the slug
      list, run it, and the guarantee checklist appears on their command screen. Pick
      strategically (prior direct sales + an exportable list + will actually send the campaign),
      not whoever agrees first. Three, not five to ten: you are learning delivery hours, not
      scaling yet. Charge the implementation fee (0 to $500 for the founding cohort) by a
      MANUAL Stripe invoice from the dashboard; there is deliberately no checkout for it.

- [ ] **Run the sub-avatar migration:**
      [`supabase/schema-phase2-sub-avatar.sql`](supabase/schema-phase2-sub-avatar.sql).
      Adds `artist_profiles.sub_avatar_override` (manual override of the four-avatar
      assignment) and the `sub_avatar_audit` history table. Everything else about the avatar
      system is derived on read and already live: the four avatar funnels, the admin Avatars
      cohort tab, and the avatar-aware onboarding all work without it. Until it runs, only
      setting a manual override reports "migration not applied yet". Self-verifies.
      **If you already ran an earlier copy of this file, run it again**: the avatar names
      changed the day after they shipped, and the file now DROPS and recreates its CHECK
      constraint so a re-run is safe and a stale constraint cannot reject every valid value.
      The override column deliberately has NO client grants (server-only reads), so no
      `select('*')` breakage and no view rebuild is needed; the migration says so inline.

- [ ] **Launch content for the four avatar funnels. These are the exact links.** All four
      sub-avatars now point at the ALL-IN-ONE calculator, which leads with that avatar's
      questions and framing (spec: [`docs/SUB_AVATARS.md`](docs/SUB_AVATARS.md)). Paste these
      wherever that avatar's video, ad or bio link lives:
      - Empire builder (big audience, already sells direct)
        thecrwn.app/tools/opportunity-calculator?from=highest_priority_empire_builder
      - Established independent operator (years in, runs it themselves)
        thecrwn.app/tools/opportunity-calculator?from=established_independent_operator
      - Brand-led hip-hop artist (content engine, attention they do not own)
        thecrwn.app/tools/opportunity-calculator?from=brand_led_hip_hop_artist
      - R&B empire builder (devoted fans with nowhere to go deeper)
        thecrwn.app/tools/opportunity-calculator?from=rnb_empire_builder

      A typo in `?from=` is harmless: the calculator just asks in its normal order. Add
      `&utm_content=<video-label>` on each so the admin Avatars tab can compare creatives;
      both the avatar and first-touch UTMs now persist across the whole visit.

- [ ] **When you read the Avatars tab, read the genre rows, not just the cohort totals.**
      Nothing to do today; this is a one-time "how to not misread your own report". The
      qualification bar means every big seller lands in Highest Priority whatever their genre,
      so that cohort will always look richest: it is defined as your biggest artists. The
      comparison that actually tells you where to spend is the **"Who this funnel brought"** rows
      inside each cohort card (hip-hop vs R&B vs other, with the first-paid rate per genre), plus
      the genre filter at the top. And it only compares CONTENT if your links carry `?from=`;
      untagged traffic falls back to scoring, which compares artist size instead.

- [ ] **Run the membership-strategy migration:**
      [`supabase/schema-phase2-membership-strategy.sql`](supabase/schema-phase2-membership-strategy.sql).
      Adds `artist_profiles.membership_strategy` (the explicit Release Club vs Vault override)
      plus the two declared facts the strategy card asks for (`declared_unreleased_tracks`,
      `declared_releases_per_year`), all WITH the per-column SELECT grants that keep
      `select('*')` from 42501-ing. **If you already ran an earlier version of this file,
      run it again: it is idempotent** (ADD COLUMN IF NOT EXISTS) and the later columns are new.
      Until it runs, everything works on the derived recommendation; only saving answers or
      switching strategy reports it cannot save yet. Self-verifies, including the grants.

- [ ] **Run the tier-events migration:**
      [`supabase/schema-phase2-tier-events.sql`](supabase/schema-phase2-tier-events.sql).
      Adds `tier_events`, the first per-rung measurement CRWN has ever had: which of your four
      tiers fans actually look at, and which ones they start paying for. Without it the product
      cannot tell "nobody came" apart from "they came and did not click", which is the fork every
      future recommendation depends on.
      Server-write only (no client INSERT grant), owner-only reads, self-verifying including a
      check that no client write grant survived. Until it runs, nothing breaks: the recorder
      no-ops and `/api/artist/tier-evidence` returns real member counts with null view rates and
      says why.

- [ ] **Run the track-waterfall migration:**
      [`supabase/schema-phase2-track-waterfall.sql`](supabase/schema-phase2-track-waterfall.sql).
      Adds `tracks.waterfall` (the staggered tier-by-tier rollout schedule) with its SELECT
      grant. The entitlement gate is untouched: the daily cron just ADDS tiers to
      `allowed_tier_ids` as their window opens, so nothing here can lock a paying member out.
      Until it runs, choosing "Higher tiers first" on an upload falls back to all-at-once and
      says so. Self-verifies.

- [ ] **Two one-click confirmations only you can do (both need a logged-in session), then tell me
      and I will delete this.**

      **1. Top up the DeepSeek balance. DIAGNOSED 2026-08-01: `HTTP 402 Insufficient Balance`.**
      The `DEEPSEEK_API_KEY` is valid and is reaching production. The account simply has no
      credit, which is the standard failure on a new DeepSeek key. There is nothing to fix in
      code.

      1. Log in at `platform.deepseek.com` with the account that owns the key.
      2. Billing (or "Top up"), add credit. Their minimum is a few dollars and the support
         assistant uses `deepseek-chat` with an 800-token cap per reply, so a small balance lasts
         a long time at CRWN's current volume.
      3. Send a message at `/support`. A real answer means it is working. As an admin you would
         see any remaining fault printed inline as `[admin only] ...`.

      Not urgent, because the chat is NOT dead: on any assistant fault it answers from the
      getting-started guides (no key, no balance, no network), and it still notifies you. You now
      get at most ONE "assistant is down" email per hour no matter how many people chat.

      **2. Stripe env wiring.** First just OPEN `/account/billing`. You are not actually on Pro:
      the row says `pro`/`active` but Stripe has no subscription behind it, and the SQL migration
      could not catch it because your `platform_stripe_subscription_id` is not null, it points at
      a subscription that no longer exists. The page now asks Stripe on load and corrects itself,
      so it should flip you to Launch and make Pro clickable.

      Then Pro → Upgrade. I verified the four live prices exist at the right amounts on the right
      products (CRWN Pro $49/$490, CRWN Scale $199/$1,990) and that ZERO artists sit on the old
      $9.99 price, so grandfathering is a closed question. What I cannot check is which price id
      each Vercel variable holds, because Sensitive vars are unreadable to me. If Stripe opens
      showing **$49.00 / month**, the wiring is right and I will delete this. If it errors, the
      wiring is wrong and the error is deliberate: checkout compares the live price to the code's
      $49 and refuses rather than charging the stale $9.99. Nothing can silently undercharge.

- [ ] **Wind down Twilio: the SMS feature is REMOVED from CRWN (your call, 2026-07-31, for
      compliance cost).** Code, routes, cron, tier copy, legal SMS program section: all gone.
      Hot-lead alerts now arrive by EMAIL always (plus the carrier-gateway text if
      `FOUNDER_ALERT_SMS_EMAIL` is set; that path is just email and needs no Twilio). In Twilio:
      release the number (+1 314 557 3549) and close or downgrade the account so it stops
      billing, and abandon the A2P campaign (no action needed, it just lapses). In Vercel you
      can delete `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`; nothing
      reads them anymore. KEEP `FOUNDER_ALERT_SMS_EMAIL` if you want hot-lead texts.
      The old `sms_*` tables keep their consent history; they are simply unused.

- [ ] **Promote the all-in-one calculator to PRIMARY when `oyf-signup-timing-v1` concludes.**
      Decision made 2026-07-30 (you delegated it): do NOT promote while the experiment runs,
      because Own Your Fans is its assigned experience and swapping traffic mid-flight burns the
      readout we are paying for. The moment you conclude the experiment in `/admin` →
      Experiments, tell Claude "promote the opportunity calculator" and it will flip the two
      lines in [`src/lib/opportunityFunnels/registry.ts`](src/lib/opportunityFunnels/registry.ts)
      (opportunity-calculator to `primary`/rank 0, Own Your Fans to `secondary`).

- [ ] **Point your video funnels at the all-in-one calculator (here is exactly where and how).**
      This is only about the LINKS you paste places, nothing inside CRWN or ManyChat flows
      changes. Wherever you currently paste a single tool's link (a video caption, your
      Instagram bio, a Linktree/link-in-bio button, a YouTube description), replace it with the
      matching line below. The calculator then opens leading with that video's topic before
      asking the rest:
      - Vault video → `thecrwn.app/tools/opportunity-calculator?from=vault-revenue-planner`
      - Streaming-pays-nothing video → `thecrwn.app/tools/opportunity-calculator?from=worth`
      - Share-to-Earn video → `thecrwn.app/tools/opportunity-calculator?from=share-to-earn-planner`
      - Clip-to-Earn video → `thecrwn.app/tools/opportunity-calculator?from=clip-to-earn-campaign-planner`
      - Own Your Fans video → `thecrwn.app/tools/opportunity-calculator?from=own-your-fans-calculator`
      - Producer session video → `thecrwn.app/tools/opportunity-calculator?from=executive-producer-session`
      - Live show video → `thecrwn.app/tools/opportunity-calculator?from=live-experience-calculator`
      A typo in `?from=` is harmless (the calculator just asks in its normal order). The old
      per-tool links keep working, so you can switch one video at a time. Do NOT touch the
      ManyChat keyword flows; those are separate and already live.

- [ ] **(Optional, low priority) Per-video attribution for "Highest Converting Video."** CONFIRMED
      2026-07-26: ManyChat's "any post or reel" comment trigger does NOT expose the triggering post id
      (the External Request field picker has no post/media field), so the catch-all flows CANNOT carry
      the video. CRWN accepts `source_post_id` (any string) and records it as the funnel's video
      dimension; without it, video just groups under "unknown" and the funnel still works by source /
      campaign / calculator. The ONLY way to get per-video data is a **per-post** automation (trigger on
      one specific post), where you hardcode a readable label in the External Request body, e.g.
      `,"source_post_id":"kendrick-producer-reel"` right before `,"contact":`. Not worth doing broadly
      (one automation per video, forever). Do it ONLY for a hero video you want to measure.

### P2 — worth doing, nothing breaks if you never do it

- [ ] **Add the FREE keyword to ManyChat before posting the Akeem Ali all-in video.** The
      script ([videos/scripts/lead-magnets/free-akeem-ali.md](videos/scripts/lead-magnets/free-akeem-ali.md))
      says "Comment FREE and I'll DM you the link", and ManyChat keywords are pills configured
      in its UI, so only you can add the trigger (point it at the same flow as the other
      calculator keywords; the tool link is `/tools/opportunity-calculator`). The code side is
      done: `free` is in the opportunity-calculator `dmKeywords`, live once the branch lands
      on master.

- [ ] **Quest Engine: LEAVE IT DARK until the release-strategy build lands.** My recommendation,
      2026-08-01, so this is a "do not do it yet" item rather than a decision waiting on you.
      Quest progress is STORED (`quest_instances`, `xp_ledger`, `user_progression`); the roadmap
      is DERIVED on read and stores nothing. `CRWN_UPDATED_RELEASE_STRATEGY.md` rewrites what the
      right next action is (membership strategy presets, content classes, release waterfalls,
      free-to-paid live progression), so flipping the engine first means artists accumulate real
      progress against a catalog we are about to rewrite, and rewritten templates leave completed
      instances pointing at dead keys. When that build lands I will ship the flip as a migration
      file alongside it, so there is nothing for you to hand-copy. Nothing to do today.

      Quests are guidance, never access control, so turning it on cannot gate a feature an artist
      already had. Meanwhile the roadmap covers the activation loop (first visit, first dollar,
      first delivered promise) and I can change it freely.

---

## Ongoing

Things that are never finished. Cadence, then the thing.

### Every time Claude ships

- **Apply any new SQL migration.** Claude cannot. It will always hand you the exact file path.
  If it shipped code that needs a migration and did not tell you, that is a bug.
- **Set any new env var** it names. It cannot touch Vercel.

### After every sales call

- **Mark whether they showed up.** `/admin` → **Acquisition** → **Calls**: **Showed up** or
  **No-show**. The buttons only appear once the call has actually finished, so there is nothing
  to mis-click beforehand. You can also tick **No-show** on the booking in Cal.com itself: same
  effect, same idempotency key, so using both places cannot double-send.

  **Nothing infers a no-show.** It fires only when *you* say so, because "sorry we missed you"
  sent to the artist who *was* on the call, and had a good conversation with you, is
  humiliating and unrecoverable. An unsent message costs nothing. A wrong one costs the artist.

  Mark it and the automation takes over: a warm no-guilt DM within the day, a second two days
  later naming the money, then a clean breakup on day five that offers to take her off the
  list. After that CRWN stops for good. Un-marking it (in either place) cancels the ladder, so
  a mis-click is recoverable until 5am, when the dispatcher runs.

### Daily-ish, now that the Instagram engine is LIVE

- **Answer high-intent lead alerts.** The engine emails you (once per lead, ever) when a lead
  scores into `sales_priority`. It deliberately stops automating at that point because the lead
  is too warm for a robot. Go talk to them.

- **Work the "Needs you" queue.** `/admin` → **Acquisition** → **Needs you**. When CRWN cannot
  understand a lead's answers, it stops asking rather than looping, and hands them to a person.
  That person is you. Reply on Instagram, then hit **Handled** (or **Not a lead**, which stops
  every channel for them immediately).

- **Sanity-check the lead scores as real leads arrive.** The bands in `leadScoring.ts` were
  calibrated with zero data and have already been wrong once: the very first real lead (100k
  monthly listeners, opened her result, edited the assumptions) scored **20** and was filed
  **"unqualified"**, so no alert fired.

  Two bugs caused it, both fixed, and the model was rewritten to your customer avatar on
  2026-07-28 ([`docs/ICP.md`](docs/ICP.md)): proven direct sales is now 40% of the score and big
  reach with no sales history is a penalty rather than a bonus. **Keep watching.** The loss
  tools now ask whether they have ever sold to fans, but the `worth` funnel still cannot learn
  goal or blocker, so it must recognise a hot lead from reach, sales history and behavior alone.
  If a lead you would personally chase is banded `nurture` or `unqualified`, that is a scoring
  bug, not a bad lead. Tell Claude.

- **Sanity-check the Constraint Engine's verdicts as real artists accumulate data.** Live since
  2026-08-03. Rise Mode now shows ONE corrective action above the roadmap when the engine has
  enough evidence, and nothing at all when it does not. Every threshold is a first guess made
  with zero cohort data, in one file:
  [`src/lib/constraint/thresholds.ts`](src/lib/constraint/thresholds.ts). Same situation as the
  lead score bands, and they were wrong once.

  **If you see an artist told to fix something you would not have told them to fix, that is a
  threshold bug, not a bad artist. Tell Claude.** The likeliest first offenders: the free-capture
  floor (2% of visitors joining) and the retention multiplier (1.5x the platform average) will
  both behave oddly while the platform has few artists, because the benchmark is computed from
  everyone. Nothing here can change an artist's tiers, prices, promises or campaigns; it only
  recommends.

### Weekly

- **Check the "Failed" tab.** `/admin` → **Acquisition** → **Failed**. Should be empty. Each
  row has a **Retry** button. A pile of `dm_rejected` means the ManyChat token is wrong.

- **Watch for the onboarding canary email.** `/api/cron/onboarding-health` runs daily at 07:00
  and emails joshn.wms@gmail.com **the moment the artist signup path breaks.** It exists
  because that path once broke silently for months. **If it emails you, drop everything.**
  Silence is good news; the alarm is the whole product.

### Monthly

- **Rotate `MANYCHAT_WEBHOOK_SECRET`** (Vercel + the ManyChat header). Cheap, and the webhook
  is an unsigned shared-secret endpoint by necessity: ManyChat cannot HMAC-sign.

- **Skim the lead score bands.** The thresholds in `leadScoring.ts` are conservative first
  guesses made with zero real leads. Once you have 50, they are tunable with evidence. One
  file, one place.

### Whenever you add a cron

- **Never more frequent than daily.** Vercel Hobby blocks *all* deployments if you do.
  `vercel.json` already has 25 entries and nearly every hour slot is taken. The house pattern
  is to **piggyback** an existing cron, not add one.

---

## On Claude's plate (not yours)

Listed so you know what you are not carrying. Ask for any of these to jump the queue.

- **Bespoke hero photos for the two single-opportunity calculators.** `fan-stack-calculator` and
  `between-tour-calculator` reuse the own-your-fans and live-experience photos (the registry's
  documented placeholder pattern). They are no longer avatar front doors, so this is cosmetic.
  Generate on-brand charcoal+gold images (artist 18-32 rule) and swap the two `hero.image` paths.

- **Avatar follow-ups, in order:** per-avatar hero copy on the all-in-one calculator page (today
  the entry context reorders the questions and shows its note, but the hero headline is still
  one shared line); per-avatar experiment experience keys in `src/lib/experiments/registry.ts`
  once there is a message variant worth testing; artist 30/60/90-day retention at cohort grain
  in the admin Avatars tab (needs a per-artist activity definition first, see the tab's "not
  measured" list).

- **Pre-signup live preview (the half of the preview ask that is still open).** The live fan
  preview now runs from the artist-link screen through launch, showing their real page in an
  iframe. It does NOT run on the calculator or builder pages, because before signup there is no
  page, no name, no photo and no music: the only fan-visible thing that exists is the tier ladder,
  and `TierCards` is wired to auth, router and live checkout, so reusing it there is not a small
  change. Showing a near-empty page at the moment of peak excitement is also a conversion risk
  worth measuring before building. The honest version is a ladder-only "what fans will see"
  card in `DeliverableBuilder`, reusing the tier presentation only. Mine, not urgent.

- **v2 interface redesign, remaining screens.** Landed 2026-08-02: tokens + the
  `.neu-raised`/`.neu-inset` surface treatment (75+ call sites upgraded through two classes), the
  nav rail marker (no more filled gold block), the spring motion vocabulary on every shared
  pressable class, `src/lib/contrast.ts` (tested) / `palette.ts` / `useLivingPhoto.ts`, the Home
  next-action card (the one structural change), and Rise Mode progressive disclosure. Landed
  2026-08-03: the whole artist page (accent wash, banner media card, tier cards, self-healing
  palette backfill, drag-to-reframe banner, measured-ink fixes, the contrast sweep dev tool,
  the sampler hue fix). All its migrations are applied and probe-verified. Still mine, in
  order: setup wizard composition (85KB file, one decision per screen with the desktop step
  rail), Studio Music + Fan CRM layout, the shared calculator-intro pattern, the homepage
  ambient layer (WebGL tier; the CSS pool shipped), the living-photo heroes, the player
  accent, and wiring the contrast sweep into CI. Each is its own session per the handoff's
  PR plan (`IMPLEMENTATION.md` in the design handoff).

- **NEXT UP: realign the quest catalog to the membership strategies, then flip the Quest Engine
  on.** The release strategy (`CRWN_UPDATED_RELEASE_STRATEGY.md`) is otherwise implemented end
  to end (2026-08-01): brain, content classes, declared facts, live templates, waterfall. The
  74-quest catalog still describes the pre-strategy journey, and quest progress is STORED, so
  the catalog must be rewritten BEFORE the engine goes live or artists accumulate XP against
  content about to change. The plan, so the next session starts cold: (1) rewrite
  `src/lib/quests/templates.ts` levels 5-10 around the strategy vocabulary (launch the monthly
  promise, first waterfall release, first live from a template, first vault unlock), reusing
  the existing DomainChecks plus `artist_promise_fulfilled`/`artist_first_visit`; (2) keep
  every existing template KEY that still fits (stored instances reference keys); (3)
  `npm run verify:quests` + tests; (4) ship the flag flip as a migration file in the same
  commit. One session, no migrations for Josh beyond the flip file.

- **Launch-spec remainders (each its own session, in this order).** Done this round: ladder
  prefill from the artist's own draft, per-tag segment targeting for imported contacts, the
  richer plan intro, cadence changes propagating to existing obligations, Share-to-Earn config
  restored at ladder create, the purchase-level obligation engine (shipped products and
  scheduled experiences create their fulfillment task at purchase; digital creates nothing),
  promise reminder delivery (daily digest, piggybacked on the 6am cron), per-promise prep
  time + delivery method + reminder schedule on the review screen, and staggered default
  first-due dates (no two promises default to the same day). Still mine:
  1. the quarterly live experience as a confirmable wizard component;
  2. OAuth import connectors (Mailchimp, Google, Shopify, Gumroad); CSV covers them today;
  3. warn-before-deleting future obligations in the Promise Calendar UI.

- **Rise Mode per-task dollar estimates (from your live-test list, deferred on purpose).** Each
  quest card should show the estimated extra $/month completing it unlocks, derived only from
  numbers CRWN really has (calculator payload, tier prices, member counts). Deferred rather than
  rushed because a per-quest estimate model done sloppily invents figures, and the house rule is
  show nothing over showing a made-up number. Its own session.

- **Full tour audit (the rest of your tour feedback).** Fixed this round: one auto-tour per
  session (no more tour chaining across tabs), community step mentions channels, home tour's
  dead final anchor. Still mine: audit all ~20 per-page tours against current selectors and
  features, and decide whether the artist-page tour should stop clicking through its own
  Music/Tiers/Community tabs (kept for now because each tab's content only mounts when active).

- **Make the roadmap fully adaptive, and wire it to the Quest Engine.** The ramp already re-plans
  from real pace and real MRR, shows one milestone at a time, and promotes the step the artist's
  entry calculator was about ([`docs/REVENUE_RAMP.md`](docs/REVENUE_RAMP.md)). What is still
  static: the milestone percentages are assumed rather than measured, and nothing weights release
  cadence, content output or hours available per week, because CRWN does not collect those yet.
  Mine to build, in that order. The levelling itself belongs to the Quest Engine, which is built
  and dark: a ramp step completing should award XP there rather than the ramp growing its own
  badges, or there will be two progression systems telling an artist different things.

- **Retarget the rest of the funnel to the customer avatar.** The scoring model, the homepage
  calculator, the loss tools' qualifying question, the nurture sequence and the brain doc are done
  (2026-07-28, [`docs/ICP.md`](docs/ICP.md)). Still mine to finish: the setup wizard assumes an
  artist with nothing (one free tier, first track free, no bulk catalog import) which is the wrong
  first run for someone with 40 to 300 released songs, and the loss engine still applies a flat
  1% to 3% conversion regardless of whether the artist has ever sold anything, which under-sells a
  proven seller. Neither blocks anything today.

- **The Artist Launch Wizard (your 10-phase spec, 2026-07-30) is COMPLETE: all nine stages
  are live.** The full record is [`docs/ARTIST_LAUNCH_WIZARD.md`](docs/ARTIST_LAUNCH_WIZARD.md).
  The journey now runs end to end: a signup with a claimed calculator result opens on "Your
  CRWN plan is saved" with their number; the wizard confirms the full ladder (with estimated
  buyers per tier from their own calculator); the promise-review screen shows the recurring
  workload before anything is created (one shared generator, dedup + inheritance, so
  "Everything in Gold" is real for Platinum members); Stripe connects in-wizard with exact-step
  return; the music step offers the full-catalog bulk path; every artist has a 5-stage roadmap
  derived through the Quest Engine's own checks; the fan import hub (with the Patreon on-ramp)
  and the Launch Kit (drafts only) cover the audience; and the wizard ends on the launch review
  (checklist with fix-it jumps, previews, "Launch my CRWN") with Rise Mode's roadmap card as
  the post-launch command screen (real members/paying/MRR-vs-goal numbers plus upcoming
  promises). No migrations, no env vars, nothing for you to run. Deliberately not built yet:
  OAuth import integrations, page-visit/checkout-start metrics on the command screen, and
  moving import/campaign into the wizard proper. Ask when you want any of those.

The Instagram acquisition engine is feature-complete and verified in production: ingress,
identity, Claude extraction with a complete deterministic fallback, the calculator handoff,
secure result links, claiming, the gated in-window email capture, follow-up automation with a
compliant unsubscribe, the tool-education drip, booking detection, the no-show ladder, retention,
and the admin panel. The privacy policy now discloses the funnel (live).

- **Announcement pop-ups: the Pop-up Engine is ON (you flipped it 2026-07-24).** Announcements now
  fire, each gated on its own feature flag: `announce_live_tips` and `announce_producer_sessions`
  are live (both features are on); `announce_royalty_readiness` waits on the royalty flag (still
  off, see the royalty migration item); `announce_hub_navigation` is live. When you add a new
  dark-launched feature's announcement, add its flag to `ANNOUNCEABLE_FLAGS` in
  `src/app/api/popups/route.ts` or the gate reads `false` forever. Remaining gap I can fix any
  time: `PopupContext` carries no account-creation date, so "existing users only" is approximated
  with a once-ever cap; say the word and I add `accountAgeDays`.

- **Artist dashboard is now 15 real screens, not a 16-tab strip.** `/profile/artist` is Rise Mode
  only; management lives in the hamburger (`/account/*`), tools live in Studio (`/studio/*`), and
  every screen wears `HubPage` (X in the top left, returns to the menu when it carries
  `?from=hub`). Nothing for you to run: no migration, no env var, no flag. (The
  `announce_hub_navigation` pop-up is now live: the Pop-up Engine flag is on. The seven Studio
  tiles that were emoji placeholders now carry real gold product photos, done 2026-07-26.)

- **Royalty / publishing intelligence, phase 1 shipped (the diagnostic).** The Royalty Readiness
  Check is built. The score-only **Royalty lead magnet** (keyword `ROYALTY`) is now LIVE (web tool
  + ManyChat DM flow, verified end to end 2026-07-27). What is deliberately NOT built, in the order
  I would build it: a **per-song registration tracker** (the check is artist-level today, tracks
  already carry an ISRC); a **composition record** separate from the recording, which is the real
  prerequisite for anything split-sheet shaped. CRWN should not become a publisher or administrator,
  and none of the above moves it toward being one.

- **Executive Producer Sessions: LIVE (2026-07-24).** The migration ran, the flag is on, and the
  fan submission agreement is final (`/submission-agreement`). Shipped and live: fan submissions
  (beats/vocals/ideas/references, private upload, deadline), the artist review queue, advisory
  polls, a public per-session sales page (`ProducerSessionOffer`), per-session stats
  (`/api/producer/analytics`), one-tap **Run it again** recurrence, free-entry seat count, a
  loss-framed announcement (`announce_producer_sessions`), and a live-ticket refund clause in the
  Terms.

  **Only two things are left, and I recommend NOT building either until you have run a real paid
  session.** Both are your decision, not more spec:
  - **Premium seat types** (a cheap viewer ticket + a few high-price producer seats sold
    separately). Lower risk, no legal, no moderation. My advice: build it the day a single-price
    session sells out, not before. Then: viewer ticket at the calculator's band price + 3 to 5
    premium seats at ~4x.
  - **Fans on mic/stage.** The bigger differentiator but the heaviest: needs a fan likeness release
    AND real-time moderation. The `stage` LiveKit role is scaffolded (types + grants + DB CHECK,
    nothing mints it). My advice: build it **invite-only, one fan at a time** (you pull up a
    specific fan), which sidesteps almost all the moderation surface. Blocked on your
    likeness-release call, and I would only start it after a session or two have run.

- **Automated lead deletion (erasure requests).** Ask me to build this when you want it. Today a
  "delete my data" request from a lead is MANUAL: `DELETE FROM lead_identities WHERE ...` in
  Supabase (it cascades). The privacy policy honestly describes this manual path, but a proper
  self-serve or one-command deletion is not built (it is Phase 2 in the checklist). Low volume
  today, so not urgent, but it is the one real gap behind the privacy disclosure.

- **Loss-revelation lead magnets: live, and one of them was NOT honest.** The house rule is that
  every tool's `fix` must point to a CRWN feature that actually exists. It is enforced by
  convention, not by code, and the **Executive Producer Session Calculator broke it**: its fix
  ended with "Fans pitch beats, vocals, and topics live", which nothing in the codebase does.
  Corrected and live on 2026-07-24, along with the hero, the cause paragraph and the email
  run-of-show, which all made the same promise. **I want to add a real check rather than trusting
  the convention a second time**, and I will unless you would rather I spent that time elsewhere.
  Every tool otherwise has a DM flow, a web page, a recovery-flow diagram, and the CRWN showcase.
  The 11th, **Own Your Fans** (keyword `OWN`, the DistroKid/independence angle), ships on today's
  owned-CRM features and reuses existing profile fields (no migration). Founder Window is a real
  feature now (cap + deadline + founder marking; migration run). The only deferred piece is
  **grandfathered/locked pricing** for founders, left out because it touches Stripe subscription
  pricing. Ask if you want it. (The ManyChat flows for the new tool keywords are now built and live.)


- **Prospect nurture (email-only calculator leads): LIVE (migrations run 2026-07-30).** A lead
  who runs a calculator, asks for the result by email, but does not sign up now enters a versioned,
  calculator-aware, consent-gated sequence (v2: 25 emails over ~12 months), and exits the instant
  they create an account. It reuses the existing Resend sender, the global suppression gate, the daily
  cron scheduler, and the lead tables (no parallel system). The Instagram unsubscribe route's
  suppression write also works properly now (the `reason='unsubscribe'` CHECK is in place).
  Deliberately NOT built yet, in the order I would build them: **Phases 4-9** (objections → mechanism →
  proof → re-engagement → authority → evergreen), which slot into the same code array with no schema
  change; and wiring the external **`/worth`** (Streaming Loss) tool to enroll (only registry wizard
  tools enroll today). Full spec + admin controls: [`docs/PROSPECT_NURTURE.md`](docs/PROSPECT_NURTURE.md).

One known limitation, and it is deliberate: **`/signup` ignores `?next`.** Auto-claim through
signup works via `ClaimRedeemer` instead. (`/welcome` was retired 2026-07-30; onboarding identity
now lives in the setup wizard's first screens. `useAuth` remains a file that broke onboarding
silently for months, and a claim feature does not justify touching it.)
