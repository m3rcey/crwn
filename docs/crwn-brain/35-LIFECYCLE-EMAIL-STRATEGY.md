# 35. Lifecycle email strategy: one gap, one email, re-decided at send time

> Written 2026-10-02 from a production audit (what actually sent, from `platform_sequence_sends`
> and `fulfillment_events.metadata.reminded_offsets`), a code trace of every artist and fan
> sender, and the reference books in `videos/reference books/`. Companion to doc 30 (the
> inventory of every sender). This doc is the STRATEGY those senders follow.

## The rule everything below hangs on

**An email is about the reader's situation right now, or it does not send.** An enrollment is
a snapshot of one moment and the reader keeps moving, so every lifecycle email is decided twice:
once when the person is enrolled and again, against current canonical facts, at the moment of
sending. A queued email that describes a gap the reader already closed, or a gap that is not
their real blocker yet, is cancelled instead of sent.

Sources (quotes and page refs were extracted by a research pass; treat the mapping as applied
judgement, not as what the books literally say):
- Slootman, *Amp It Up*: "The moment you have many priorities, you actually have none." One
  email, one gap.
- Hormozi, *$100M Offers*: list the obstacles "in the sequence that the customer will experience
  each of these obstacles", and "we want clients to have a big emotional win early". Order the
  artist emails the way the business is actually built, and point every pre-revenue email at the
  first paid fan.
- Hormozi, *$100M Money Models*: "Focus on the bonus, not the membership." A fan upgrade email
  names the concrete thing, never "upgrade".
- Hormozi, *$100M Leads*: give until they ask, at least 3:1, and "reach out up to three times".
  Three touches per gap, then stop until the state changes.
- Christensen, *Competing Against Luck*: the purchase is the Big Hire, consumption is the Little
  Hire. The first email after a join must contain something to consume.
- Krug, *Don't Make Me Think*: one obvious action, scannable, half the words.
- Torres, *Continuous Discovery*: early churn came from customers not understanding what they
  bought. The paid welcome states what the tier includes in the card's own words.

## A. CRWN to artist

### What production showed (2026-10-02)
- **"you are ready for Pro" went to 10 artists in one week, all with zero fans and zero revenue,
  three with no music.** `platform-crm` mapped the `free` pipeline stage (a Connect id exists,
  which is written when an artist STARTS Stripe onboarding) to `starter_upgrade_nudge`.
- **The Stripe nudge kept sending after Stripe connected** (nothing cancelled it) and said "you've
  uploaded music" without checking.
- **Several sequences ran against one artist at once** (an upsell and a Stripe nudge in the same
  week, contradicting each other).
- **Promise reminders reached artists with no members** in August ("Monthly Vault unlock",
  "Private group listening event", plus Revenue Ramp steps worded as promises). The ramp leak and
  the empty-room case were already fixed; the remaining holes were prize members and
  squad/campaign/unknown audiences.
- **Every new artist got two welcome emails** within seconds, and the first was written for fans.

### The design (shipped 2026-10-02)
`src/lib/lifecycle/artistEmailGate.ts` (pure, tested) is the one rule.
1. **One current gap**, in the order the setup wizard builds the business: music, a PAID tier
   (the free Bronze rung never counts), payouts (`stripe_connected`, written only by the live
   `charges_enabled` check), the first paying fan. Before the wizard is finished nothing here
   applies (the wizard and the onboarding reminder own that stretch).
2. **Enrollment** (`activation-nudges`) only for the current gap, after its stall, measured from
   the moment it BECAME current, inside the 30-day freshness window.
3. **Send time** (`platform-sequences`): every step re-decided. Gap closed: `completed`. Not the
   current gap: `canceled` (re-enrollable when it becomes current). Unknown triggers pass through
   unchanged.
4. **One lifecycle email per artist per run**, activation gaps first.
5. **The Pro upsell is sold only on real trailing 30-day GMV at or above the Pro break-even**, the
   break-even pop-up's own rule. Unknown revenue never sells a plan.
6. **Promise reminder emails start at the first PAYING member** (`countsAsPaying`). The Promise
   Calendar still shows every promise; only the email waits. This is a channel rule, not a change
   to `obligationHasNoEligibleRecipient`, which the Constraint Engine also reads.
7. **One welcome per artist**: the founder welcome. The fan-copy welcome now goes to supporters
   only. The onboarding reminder now honours `email_suppressions`.

Copy claims are now true by construction: an activation email only sends once every earlier gap
is closed, so "your music is up" / "your tiers are live" cannot be false when it arrives.

### Next (not built yet)
- **The middle of the funnel is silent by email.** Rise Mode's roadmap has nine First Revenue
  steps (offer, magnet, sales page, follow-up, Stripe, turn on, test, launch, first paid); email
  covers only Stripe and first paid. The right extension is code-owned copy keyed by roadmap step
  key (so `npm test` can see it, unlike the DB-stored platform copy that drifted for months),
  driven by the same next move Rise Mode shows, not a second ordering. Needs a server loader for
  the roadmap (today it is inline in the session-bound `/api/artist/roadmap` GET).
- **Touch 3 should be founder help** ("reply and I will set it up with you"), sent from
  `FOUNDER_FROM` with reply-to Josh, the done-with-you escalation the books argue for.
- **Measure by the action, not the open.** The ledger records sends and opens; whether the gap
  closed after the email is derivable from milestones and should be the admin metric.

## B. Artist to fan

### What the code showed (2026-10-02)
- **The artist-page "Join Free" bypassed the canonical free-join writer**: no artist
  notification, no free-member nurture, no fan email, and it could overwrite a PAID row down to
  the free tier.
- **The paid welcome listed three hard-coded perks** unrelated to the tier and linked to CRWN's
  `/home`, not the artist.
- **Downgraders got "You just upgraded"** (`decidePendingApply` enrolled `tier_upgrade` on the
  only path that sets `pending_tier_id`, a scheduled downgrade); real upgraders got nothing.
- **The artist was never told a member left**: `notifySubscriptionCanceled` received an
  `artist_profiles.id` where `notifications.user_id` needs a `profiles.id`, and the FK failure was
  never read.
- **Sequences outlived their premise**: free-member nurture continued after the fan left; "You
  left something behind" continued after the fan paid on another session; win-back continued
  after the fan came back.
- **The vote email promised a result notification** no code sends.

### The design (shipped 2026-10-02)
- **One member welcome** (`src/lib/emails/memberWelcome.ts` + `memberWelcomeServer.ts`) for free
  joins (artist page and share pages), paid joins (webhook) and immediate upgrades. From
  "<Artist> via CRWN". Order: one thing to play now (`pickStartHereTrack`: the newest track the
  rung unlocks on day one, never one the member drip still holds, never a members-first window
  for a free fan; null rather than a locked guess), then the rung's lines from
  `tierCardBenefitLines` (the card's own words, so the email cannot promise what the card did
  not), then for free members ONE concrete thing the next rung adds, with no deadline or
  scarcity. Transactional (answers the fan's own join), so no unsubscribe. The receipt stays
  separate.
- **The artist-page Join Free goes through `joinFreeTier`** (Founder Window flag carried through),
  then notifies the artist and sends the welcome. A paying member pressing Join Free now writes
  nothing.
- **Upgrades** (`subscription-update`) end any converted nurture, enroll `tier_upgrade`, and send
  the welcome for the new rung. Scheduled downgrades never enroll the upgrade nurture.
- **`sequenceStillApplies`** (`src/lib/sequences/stillApplies.ts`) re-decides every fan sequence
  step: member sequences need a membership; free-member nurture completes on a paid rung; cart and
  win-back complete when the fan is paying.
- **Cancel notice** resolves the artist's user id first. Vote email says the artist CAN reach the
  fan with what fans picked, not that CRWN will.

### Free-member follow-up for founder-assisted launches (shipped 2026-10-02)
- Production that day: Prince Dre had about 20 live funnels (drops, both poster QR links) and NO
  follow-up; only GB had one. A fan got the song, then silence.
- `LaunchPartnerConfig.nurture` + step 7d of `scripts/onboard-launch-partner.mjs` write the
  artist's ONE active `free_join` sequence from founder-approved copy; the dry run prints every
  message as the approval read. `checkLaunchPartner` enforces the copy rules (see the
  onboard-icp-artist skill). `DRE_NURTURE` is the worked example: days 1, 3, 6, 10, 16, 24; two
  gives, then Silver (the JB tape), Gold (the drip), the cancel answer, a last word; stops at Silver.
- **Fixed in the same pass: every artist sequence ran on a stretched clock.** Builders label
  `delay_days` "day N" and every stored sequence is increasing, but the cron added the whole delay
  after each send, so 0/2/5/9/14 sent on 0/2/7/16/30. `stepGapDays` now waits the gap.
- **"Hey Fan," and "Hey tasha@gmail.com,"**: the cron greeted by display_name (which defaults to
  the signup email) or the literal "Fan". Both now greet "there".

### Next (not built yet)
- **A default free-member nurture for artists who build their own launch.** Only an artist who finishes `/build/followup` has one, so
  most free members still hear nothing after the welcome. Shape from the books: day 0 welcome
  (shipped), two gives with no ask (day 2-3, day 5-7, the second naming one paid item as the
  bonus), a direct offer with a real reason (day 10-14), then a plain-text question to the silent
  (day 21-30). Copy in code, goal tier set so it stops the moment they buy.
- **The paid non-starter nudge.** A paid member who has played nothing by day 3 is the churn
  risk. Needs per-fan play evidence the cron can read.
- **The cancel step-down SHIPPED** (founder decision 2026-10-02, "a fan who cancels should be
  offered a cheaper tier instead"); see the next section.

### Cancel: offer the next cheaper paid tier first (shipped 2026-10-02)
- `CancelModal` (fan context) shows "Stay on <tier> for $X/mo instead?" ABOVE the reasons, before
  the pause offer and the cancel button. `stepDownOffer` (`src/lib/subscriptions/stepDown.ts`,
  pure) picks the NEXT cheaper rung that is paid and can bill; never the free tier (a paid-to-free
  move is a cancel plus a free join, a different flow) and nothing when no such rung exists.
- **Building it exposed a money bug, fixed first.** `/api/stripe/subscription-update` recorded a
  downgrade only as `pending_tier_id` and changed nothing in Stripe; the webhook applies a pending
  tier only when Stripe bills its price, so a fan who stepped down kept paying the higher price
  forever. Production had 0 pending rows (2 paid subscriptions), so nobody was overcharged.
- The downgrade is now a Stripe subscription schedule (`downgradeSchedule.ts` pure,
  `downgradeServer.ts`): `from_subscription`, phase 0 re-sent unchanged, the lower price for one
  month, `end_behavior: 'release'`, tagged `crwn_tier_downgrade`. A foreign schedule (a prize) is
  refused. Upgrade and cancel release a pending step-down first.
- **Proven on a Stripe test clock**, 17/17: `node scripts/verify-downgrade-schedule.mjs` (needs
  `STRIPE_TEST_SECRET_KEY`). The paid period is not shortened, the next invoice is the lower price
  with no proration, the charge still routes to the artist with the platform fee, nothing is
  refunded, it releases to an ordinary subscription, and a fan who changes their mind can still
  upgrade or cancel. The harness imports the route's own construction.
- **Recognition at 3, 6 and 12 months**, self-visible only, fits Recognition V1.
- **Sequence emails say "just reply"** with no reply-to; replies land at `hello@`. Do not set the
  artist's account email as reply-to (that exposes it). Either route replies or drop the line.
